'use client';

// The one CC0 hook replacing the template's `useChat`.
//
// It keeps the `useChat`-shaped surface the vendored components expect
// (`messages`, `options`, `sendMessage`-shaped `sendOption`) but its only caller
// is the client-side engine at `window.__flockChatEngine`, which
// `/chat/runtime.js` installs. It maps `bot`/`me` to `assistant`/`user` and
// groups a turn's blocks into one message per speaker-run, so the renderer never
// sees a `who`. A message's id comes out of that grouping as the log position
// of the run's first block, and this hook's ledger reuses the message object
// for every run the transcript already holds — so a memoized bubble bails, the
// DOM element survives the turn, and the per-turn price is the new bubble
// alone. The engine still answers with the whole block sequence every time
// (the turn contract); the sharing lives entirely in this one mapping.
//
// A reply is withheld behind a typing beat read at `TYPING_WORDS_PER_MINUTE`
// (`lib/pacing`, the piece's one tuning surface), so the transcript shows the
// typing dots for as long as the reply would take to compose and lands short replies quickly. A reply
// authored as several bubbles lands as several messages — one speaker-run at
// a time, the dots holding between them — so each beat is that one message's
// own. What a message weighs is declared per block type in the inventory's
// contract terms (`CHAT_BLOCK_TERMS`); this hook owns only the clock.
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_BLOCK_TERMS } from '@/lib/chat-blocks.mjs';
import { MIN_TYPING_BEAT_MS, msPerChar, TYPING_WORDS_PER_MINUTE } from '@/lib/pacing';
import type { ChatOption, ChatResponse } from '@/lib/chat-turn.mjs';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import { groupBlocks, type ChatMessage } from '@/lib/transcript';

/** The host page's one runtime script; the hook waits for it on a cold load. */
const RUNTIME_SRC = '/chat/runtime.js';

export interface Dialogue {
  messages: ChatMessage[];
  options: ChatOption[];
  /** Send the chip's authored choice as the next turn. */
  sendOption: (option: ChatOption) => void;
  /** True while a reply is held behind its typing beat. */
  isTyping: boolean;
  /** True until the opening turn lands: the page shows its loading spinner. */
  isLoading: boolean;
  /** True once the conversation has run out of content: the last landed turn
   * carried no pending choice set (`res.state.complete`). The shell has no
   * viewer-facing use for it yet — it is the mechanism a restart affordance
   * reads when the piece grows one (the engine's `reset` is the restart). */
  complete: boolean;
  /** Forget the conversation and open a fresh one at the greeting. */
  reset: () => void;
}

type Engine = NonNullable<Window['__flockChatEngine']>;

/** The composing weight of a block sequence, in characters: every block
 * contributes what its type declares in the inventory's contract terms. A type
 * with no declared weight is an inventory defect the inventory tests catch —
 * this hook has no type switch of its own to silently default. */
function composingChars(blocks: readonly ChatBlock[]): number {
  return blocks.reduce((sum, block) => sum + CHAT_BLOCK_TERMS[block.type].beat(block), 0);
}

/** The typing beat: the sequence's composing weight (five characters to the
 * word) read at `TYPING_WORDS_PER_MINUTE`, with a floor so even a one-word
 * message reads as a turn rather than a flicker. Applied per speaker-run, so
 * every bubble — and the figure its own landing freezes — is sized by its own
 * content alone. */
function typingDelay(blocks: readonly ChatBlock[]): number {
  return Math.max(MIN_TYPING_BEAT_MS, Math.round(composingChars(blocks) * msPerChar(TYPING_WORDS_PER_MINUTE)));
}

/** Whether the viewer has asked the system to reduce motion. Read live, at the
 * moment a reply would be held, so a changed setting is honored without making
 * `apply` unstable — and a stable `apply` keeps the opening turn to one run. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The engine global, if the runtime has run. */
function engine(): Engine | undefined {
  return typeof window === 'undefined' ? undefined : window.__flockChatEngine;
}

/**
 * The runtime is a deferred script in the host page, so on a cold load the shell
 * can mount before it has run. Wait for that script rather than erroring on a
 * race the visitor cannot see or fix.
 */
function engineReady(): Promise<Engine | undefined> {
  const running = engine();
  if (running || typeof document === 'undefined') return Promise.resolve(running);
  const script = document.querySelector<HTMLScriptElement>(`script[src="${RUNTIME_SRC}"]`);
  if (!script) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const settle = () => resolve(engine());
    script.addEventListener('load', settle, { once: true });
    script.addEventListener('error', settle, { once: true });
    // It may have loaded between the lookup above and the listener attaching.
    if (engine()) settle();
  });
}

export function useDialogue(): Dialogue {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [options, setOptions] = useState<ChatOption[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  // True until the opening `start` turn lands: the page shows the loading
  // spinner for this, not the typing bubble — a session resuming or opening is
  // the page loading, not the character composing a reply.
  const [isLoading, setIsLoading] = useState(true);
  // Whether the conversation has run out of content: surfaced so a control can
  // tell a finished conversation from a live one (see `Dialogue.complete`).
  const [complete, setComplete] = useState(false);
  // The pending reply, held back until its typing beat has played.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from `sendOption` until the reply lands: the guard that makes the
  // chips inert even in the tick before `isTyping` flips — a fast double-click
  // must not queue a second turn behind the first.
  const pending = useRef(false);
  // The transcript's ledger, by message id, kept across turns. The engine
  // answers with the whole block sequence every time, so this ledger is what
  // makes replacing cheap — the structural sharing in the one mapping: a run
  // the transcript already holds is reused as the very same object, its
  // landing stamp (time, beat, load) frozen at first sight and its object
  // identity kept, so the memoized bubble bails out and the DOM element
  // survives the turn. Only a genuinely new run is built and stamped here.
  // The key is the log position of the run's first block, and the log is
  // append-only within a session, so an id hit is the same run by contract.
  const stamps = useRef(new Map<string, ChatMessage>());
  // The ledger's one number: how much of the engine's log the transcript
  // holds, so the next turn's appended blocks — the viewer's echo and the
  // reply — can be told from the log the transcript already shows. One turn
  // at a time (`pending`), so it never goes stale.
  const logLength = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** The engine's answer, applied as the shell's next state. It returns the
   * whole block sequence, so this replaces rather than merges — reusing, from
   * the ledger, every message the transcript already holds. The viewer's echo
   * lands at once; the reply lands one speaker-run at a time, each held behind
   * a typing beat proportional to that run's own declared weight. The opening
   * turn lands at once, under the page's loading spinner instead, and so does
   * every reply when the viewer prefers reduced motion. */
  const apply = useCallback((res: ChatResponse, beat = true) => {
    const started = performance.now();
    /** Land the log through `through` blocks. The final land takes the turn's
     * choice set in and brings the dots down; the echo's land does neither. */
    const land = (through: number, final: boolean) => {
      // The turn's real engine time, measured once per land; each newly
      // landing bubble adds its own beat — its declared content weight at the
      // piece's pace — so every figure is a measure of that one message
      // alone, frozen at its first landing.
      const engineMs = Math.round(performance.now() - started);
      setMessages(
        groupBlocks(res.turn.blocks.slice(0, through)).map((run) => {
          const kept = stamps.current.get(run.id);
          // The reuse: same object, stamps and all. Runs cannot grow under the
          // append-only turn flow — the engine seam locks that contract ("the
          // append-only turn flow") — so the length check is a defect guard,
          // not a path: a same-length id hit is the same run.
          if (kept && kept.parts.length === run.parts.length) return kept;
          const ownBeat = typingDelay(run.parts);
          const fresh: ChatMessage = { ...run, at: new Date(), beatMs: ownBeat, loadMs: engineMs + ownBeat };
          stamps.current.set(run.id, fresh);
          return fresh;
        }),
      );
      if (final) {
        pending.current = false;
        logLength.current = res.turn.blocks.length;
        setOptions(res.turn.options ?? []);
        setIsTyping(false);
        setIsLoading(false);
        setComplete(res.state.complete);
      }
    };

    // What this turn appends, split where the viewer's echo ends: the echo is
    // the viewer's own turn — nothing to compose — so it lands now, and only
    // the reply holds the dots. The reply's beat is the reply's weight alone,
    // never the conversation's.
    const appended = res.turn.blocks.slice(logLength.current);
    let echo = 0;
    while (echo < appended.length && appended[echo].who === 'me') echo += 1;
    const reply = appended.slice(echo);

    if (!beat || reply.length === 0 || prefersReducedMotion()) {
      land(res.turn.blocks.length, true);
      return;
    }
    if (echo > 0) land(logLength.current + echo, false);

    // The reply lands one speaker-run at a time, each behind its own typing
    // beat: a reply authored as several `#newmessage` bubbles arrives as
    // several messages, the dots holding between them — never as one block.
    // The runs are the grouping's own, so the boundary the renderer cuts a
    // bubble at is the boundary the clock pauses at. The end offsets are
    // absolute log positions, so each land hands `groupBlocks` the prefix it
    // expects and the ledger keeps every run already shown.
    const base = logLength.current + echo;
    const ends: number[] = [];
    for (const run of groupBlocks(reply)) ends.push((ends.at(-1) ?? base) + run.parts.length);

    setIsTyping(true);
    if (timer.current) clearTimeout(timer.current);
    let step = 0;
    const next = () => {
      const from = step === 0 ? base : ends[step - 1];
      const through = ends[step];
      const last = step === ends.length - 1;
      timer.current = setTimeout(() => {
        land(through, last);
        if (!last) {
          step += 1;
          next();
        }
      }, typingDelay(res.turn.blocks.slice(from, through)));
    };
    next();
  }, []);

  useEffect(() => {
    let cancelled = false;
    engineReady()
      .then((api) => {
        if (cancelled || !api) return;
        // `start` opens this page's session: the engine resumes the live one or
        // begins one, and either way answers with the whole block sequence.
        return api.turn({ type: 'start' }).then((res) => {
          if (cancelled) return;
          // The opening turn lands immediately: the spinner above covered the
          // wait, and a fresh or resumed session is not the character typing.
          apply(res, false);
        });
      })
      .catch(() => {
        // The engine is local; a rejection is a programming error with no
        // viewer-facing surface. The spinner must not spin forever over it.
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const sendOption = useCallback(
    (option: ChatOption) => {
      const api = engine();
      // One turn at a time: a press while a reply is pending — whether the
      // typing dots are up or the answer is still in flight — is dropped.
      if (!api || pending.current) return;
      pending.current = true;
      api
        .turn({ type: 'option', optionIndex: option.index })
        .then(apply)
        .catch(() => {
          // As above: nothing in-frame can act on it. The guard must lift,
          // or the piece would dead-end on a rejected turn.
          pending.current = false;
        });
    },
    [apply],
  );

  /** Start over: drop the session and land the fresh greeting at once, the
   * way the page's own opening turn lands. Any reply held behind a typing
   * beat is discarded with the conversation it belonged to. */
  const reset = useCallback(() => {
    const api = engine();
    if (!api) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = false;
    // A fresh conversation: every bubble is genuinely new again, so the old
    // ledger — objects, stamps, and the log length — is dropped with the
    // transcript it belonged to.
    stamps.current.clear();
    logLength.current = 0;
    api
      .reset()
      .then((res) => apply(res, false))
      .catch(() => {
        // As above: nothing in-frame can act on it.
      });
  }, [apply]);

  return { messages, options, sendOption, isTyping, isLoading, complete, reset };
}
