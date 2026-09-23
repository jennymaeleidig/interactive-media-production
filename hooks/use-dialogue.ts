'use client';

// The one CC0 hook replacing the template's `useChat` (ticket 02, ticket 11).
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
// A reply is withheld behind a typing beat read at `WORDS_PER_MINUTE` (the
// export above), so the transcript shows the typing dots for as long as the
// reply would take to compose and lands short replies quickly. What a reply
// weighs is declared per block type in the inventory's contract terms
// (`CHAT_BLOCK_TERMS`); this hook owns only the clock.
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_BLOCK_TERMS } from '@/lib/chat-blocks.mjs';
import type { ChatOption, ChatResponse } from '@/lib/chat-turn.mjs';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import { groupBlocks, type ChatMessage } from '@/lib/types';

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
  /** Forget the conversation and open a fresh one at the greeting. */
  reset: () => void;
}

type Engine = NonNullable<Window['__flockChatEngine']>;

/** The pace the typing beat is sized to, in words per minute: the delay is
 * the reply's word count read off this clock, so a short reply lands fast and
 * a long one holds the dots proportionally longer. Tune this one number to
 * retune every beat in the piece. */
export const WORDS_PER_MINUTE = 2400;

/** Milliseconds one word takes at the pace above. */
const MS_PER_WORD = 60_000 / WORDS_PER_MINUTE;

/** The composing weight of a block sequence, in characters: every block
 * contributes what its type declares in the inventory's contract terms. A type
 * with no declared weight is an inventory defect the inventory tests catch —
 * this hook has no type switch of its own to silently default. */
function composingChars(blocks: readonly ChatBlock[]): number {
  return blocks.reduce((sum, block) => sum + CHAT_BLOCK_TERMS[block.type].beat(block), 0);
}

/** The typing beat: the sequence's composing weight (five characters to the
 * word) read at `WORDS_PER_MINUTE`, with a floor so even a one-word reply
 * reads as a turn rather than a flicker. Used for the whole reply's hold and,
 * per message, for the figure its own landing freezes. */
function typingDelay(blocks: readonly ChatBlock[]): number {
  return Math.max(400, Math.round((composingChars(blocks) / 5) * MS_PER_WORD));
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
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** The engine's answer, applied as the shell's next state. It returns the
   * whole block sequence, so this replaces rather than merges — reusing, from
   * the ledger, every message the transcript already holds. A turn lands
   * behind a typing beat proportional to its size (`beat`, the default); the
   * opening turn lands at once, under the page's loading spinner instead. */
  const apply = useCallback((res: ChatResponse, beat = true) => {
    const started = performance.now();
    const land = () => {
      // The turn's real engine time, measured once per land; each newly
      // landing bubble adds its own beat — its declared content weight at the
      // piece's pace — so every figure is a measure of that one message
      // alone, frozen at its first landing.
      const engineMs = Math.round(performance.now() - started);
      pending.current = false;
      setMessages(
        groupBlocks(res.turn.blocks).map((run) => {
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
      setOptions(res.turn.options ?? []);
      setIsTyping(false);
      setIsLoading(false);
    };
    if (!beat) {
      land();
      return;
    }
    setIsTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(land, typingDelay(res.turn.blocks));
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
    // ledger — objects and stamps alike — is dropped with the transcript it
    // belonged to.
    stamps.current.clear();
    api
      .reset()
      .then((res) => apply(res, false))
      .catch(() => {
        // As above: nothing in-frame can act on it.
      });
  }, [apply]);

  return { messages, options, sendOption, isTyping, isLoading, reset };
}
