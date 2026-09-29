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
// A reply is withheld behind a composing beat read at
// `COMPOSING_WORDS_PER_MINUTE` (`lib/pacing`, the piece's one tuning surface),
// so the transcript shows the typing dots for as long as the reply would take to
// compose and lands short replies quickly. The dots wait a beat behind the
// viewer's own line before they appear (`COMPOSING_LEAD_MS`), so the turn reads
// as a reply forming rather than the echo and the wait arriving as one event. A
// reply
// authored as several bubbles lands as several messages — one speaker-run at
// a time, the dots holding between them — so each beat is that one message's
// own. What a message weighs is declared per block type in the inventory's
// contract terms (`CHAT_BLOCK_TERMS`); this hook owns only the clock.
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatOption, ChatResponse } from '@/lib/chat-turn.mjs';
import { acquireEngine, currentEngine } from '@/lib/engine-reach.mjs';
import { stopVoice } from '@/lib/voice';
import { groupBlocks, type ChatMessage } from '@/lib/transcript';
import { composingDelay, planTurn } from '@/lib/turn-plan';

export interface Dialogue {
  messages: ChatMessage[];
  options: ChatOption[];
  /** Send the chip's authored choice as the next turn. */
  sendOption: (option: ChatOption) => void;
  /** True while a reply is held behind its typing beat. */
  isTyping: boolean;
  /** The character composing the reply the dots wait on, or null when nothing
   * is composing: the typing bubble's mark and label name the right speaker. */
  typingSpeaker: string | null;
  /** True from the press until the reply's last line has finished typing: the
   * composer stays inert across the reveal, not only while the dots are up. */
  busy: boolean;
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

export function useDialogue(): Dialogue {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [options, setOptions] = useState<ChatOption[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingSpeaker, setTypingSpeaker] = useState<string | null>(null);
  // True from the press until the reply's last line has finished typing: the
  // composer stays inert across the reveal too, not only while the dots are up.
  const [busy, setBusy] = useState(false);
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
   * turn — and a reset — lands at once, under the page's loading spinner.
   * `engineMs` is the turn's own engine time, measured by the caller, so the
   * dev timer's figure is the same for every message in the turn. */
  const apply = useCallback((res: ChatResponse, hold = true, engineMs = 0) => {
    /** The turn is over: nothing is composing and the chips are live again. */
    const finish = () => {
      pending.current = false;
      setBusy(false);
      setIsTyping(false);
      setTypingSpeaker(null);
    };
    /** Land the log through `through` blocks. The final land takes the turn's
     * choice set in; the echo's land does not. */
    const land = (through: number, final: boolean) => {
      setMessages(
        groupBlocks(res.turn.blocks.slice(0, through)).map((run) => {
          const kept = stamps.current.get(run.id);
          // The reuse: same object, stamps and all. Runs cannot grow under the
          // append-only turn flow — the engine seam locks that contract ("the
          // append-only turn flow") — so the length check is a defect guard,
          // not a path: a same-length id hit is the same run.
          if (kept && kept.parts.length === run.parts.length) return kept;
          // The dev timer's two numbers, per message: its own composing weight
          // (the hold it would be given, read off its parts), and that weight
          // plus the turn's engine time. `engineMs` is the turn's, not this
          // land's, so a later message never inherits an earlier one's hold.
          const composingMs = composingDelay(run.parts);
          const fresh: ChatMessage = {
            ...run,
            at: new Date(),
            // Only a live turn's lands type themselves out; the opening turn
            // and a reset land `hold: false`, so a restored transcript renders
            // whole and a remount cannot replay the reveal.
            fresh: hold,
            timing: { composingMs, elapsedMs: engineMs + composingMs },
          };
          stamps.current.set(run.id, fresh);
          return fresh;
        }),
      );
      if (final) {
        logLength.current = res.turn.blocks.length;
        setOptions(res.turn.options ?? []);
        setIsLoading(false);
        setComplete(res.state.complete);
      }
    };

    // The schedule is pure (`lib/turn-plan.ts`); this executes it. A turn that
    // appends no reply, or is not held, collapses to one immediate step.
    const { echoEnd, steps } = planTurn(logLength.current, res.turn.blocks, { hold });
    const immediate = steps.length === 1 && steps[0].beatMs === 0;
    if (immediate) {
      land(steps[0].through, true);
      finish();
      return;
    }
    if (echoEnd !== null) land(echoEnd, false);

    if (timer.current) clearTimeout(timer.current);
    let index = 0;
    const next = () => {
      const step = steps[index];
      const last = index === steps.length - 1;
      // The dots hold for this message's composing weight, then it lands. The
      // line above must finish typing before the next dots appear, so a line
      // types itself out with no dots under it and only one typewriter runs.
      // The dots are attributed to the speaker of the message about to land.
      const landing = res.turn.blocks[step.through - 1];
      setTypingSpeaker(landing && landing.who === 'bot' ? landing.speaker : null);
      setIsTyping(true);
      timer.current = setTimeout(() => {
        land(step.through, last);
        // The line types with the dots down; the chips stay inert until it is
        // done, so a choice cannot cut the reveal off.
        setIsTyping(false);
        timer.current = setTimeout(() => {
          // The line has finished typing — the typewriter's own completion
          // stopped its voice (`components/chat/message.tsx`) — so the turn can
          // move on. Waiting on the schedule here would cut a voice whose line is
          // still typing, which is the bug this order avoids.
          if (last) {
            finish();
            return;
          }
          index += 1;
          next();
        }, step.revealMs);
      }, step.beatMs);
    };
    // The dots wait out the first step's lead — the beat the viewer's own line
    // gets to settle before the reply starts composing — and the steps then run
    // back to back. The lead is zero on a turn that echoed no viewer block, and
    // zero on every step after the first, which already waits out the line above
    // through its reveal.
    if (steps[0].leadMs > 0) timer.current = setTimeout(next, steps[0].leadMs);
    else next();
  }, []);

  useEffect(() => {
    let cancelled = false;
    acquireEngine()
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
      const api = currentEngine();
      // One turn at a time: a press while a reply is pending — whether the
      // typing dots are up or the answer is still in flight — is dropped.
      if (!api || pending.current) return;
      pending.current = true;
      // The chips go inert for the whole turn, reveal included, not just while
      // the dots are up.
      setBusy(true);
      const requestedAt = performance.now();
      api
        .turn({ type: 'option', optionIndex: option.index })
        .then((res) => apply(res, true, Math.round(performance.now() - requestedAt)))
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
    const api = currentEngine();
    if (!api) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // The reveal the timer was holding is abandoned, so its voice is too.
    stopVoice();
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

  return { messages, options, sendOption, isTyping, typingSpeaker, busy, isLoading, complete, reset };
}
