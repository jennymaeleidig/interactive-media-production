// The turn plan: what lands at once and what holds, as data.
//
// The engine answers every turn with the whole block log (`lib/chat-turn.mjs`).
// Applying one turn means landing the viewer's echo immediately — their own
// choice, nothing to compose — then releasing the reply one message at a time,
// each held behind a typing beat read off its own content. The plan is pure:
// given the log length the transcript already holds and the turn's blocks, it
// returns the absolute offsets to land and the holds before each. It can be
// tested without a timer or a DOM. `hooks/use-dialogue.ts` executes it.
//
// The plan no longer predicts how long a line takes to type itself out. A land
// that contains a typecapable block is awaited by the reveal's own end event
// (`lib/reveal.ts`); the step carries a zero hold for it. A land with nothing to
// type — a link, an image, a frame — is waited out for its declared content
// weight instead, which is the only reveal duration left here.
//
// The beat weights are declared per block type in the inventory's contract terms
// (`CHAT_BLOCK_TERMS`); this module owns only the clock, read at the piece's pace
// (`lib/pacing.ts`).
//
// SPDX-License-Identifier: CC0-1.0
import { CHAT_BLOCK_TERMS } from '@/lib/chat-blocks.mjs';
import { hasTypewriter, muteRevealHoldMs } from '@/lib/reveal';
import {
  DEFAULT_PACING,
  FRAME_MS,
  COMPOSING_EXIT_MS,
  msPerChar,
  type Pacing,
} from '@/lib/pacing';
import { groupBlocks } from '@/lib/transcript';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

/** One land: everything up to and including the absolute log offset `through`
 * is shown, after a hold of `beatMs`. A zero beat lands at once. `holdMs` is how
 * long the land is waited out when it has no typewriter — its content weight read
 * at the reveal pace — or zero when the land types itself out and is awaited by
 * the reveal's own end event. */
export interface TurnStep {
  through: number;
  beatMs: number;
  holdMs: number;
  /** The pause after the previous land, before this step's dots go up. It is
   * charged to the turn's first step when the turn echoed the viewer's own line,
   * so the dots wait a beat behind it rather than arriving on top of it; later
   * steps already wait the line above out before they begin. */
  leadMs: number;
  /** The wait after this step's dots come down, before its message lands: long
   * enough for the composing bubble's exit to finish and for the bubble to leave
   * the transcript, so the reply never pops in under a fading placeholder. It is
   * read from `COMPOSING_EXIT_MS`, the same constant the indicator builds its exit
   * transition from, plus a frame of slack — the exit does not start until the
   * frame after the dots' dismissal commits. */
  exitMs: number;
}

/** A turn's schedule. `echoEnd` is the absolute offset after the viewer's echo,
 * landed before the reply holds, or `null` when the plan lands everything at
 * once; `steps` are the reply's lands in order, the last one final. */
export interface TurnPlan {
  echoEnd: number | null;
  steps: TurnStep[];
}

/** The composing weight of a block sequence, in characters: every block
 * contributes what its type declares in the inventory's contract terms. A type
 * with no declared weight is an inventory defect the inventory tests catch —
 * there is no type switch here to silently default. */
export function composingChars(blocks: readonly ChatBlock[]): number {
  return blocks.reduce((sum, block) => sum + CHAT_BLOCK_TERMS[block.type].beat(block), 0);
}

/** The composing beat: the sequence's composing weight (five characters to the
 * word) read at `COMPOSING_WORDS_PER_MINUTE`, with a floor so even a one-word
 * message reads as a turn rather than a flicker. Applied per message, so every
 * bubble — and the figure its own landing freezes — is sized by its own content
 * alone. */
export function composingDelay(blocks: readonly ChatBlock[], pacing: Pacing = DEFAULT_PACING): number {
  return Math.max(pacing.minimumBeatMs, Math.round(composingChars(blocks) * msPerChar(pacing.composingWordsPerMinute)));
}

/** Plan one turn. `hold` is whether replies are withheld behind their beat at
 * all — the opening turn and a reset are not. When `hold` is false, or the turn
 * appends no reply, the plan is a single immediate step over the whole log, so
 * the caller lands it synchronously. */
export function planTurn(
  prevLogLength: number,
  blocks: readonly ChatBlock[],
  { hold, pacing = DEFAULT_PACING }: { hold: boolean; pacing?: Pacing },
): TurnPlan {
  const appended = blocks.slice(prevLogLength);
  let echo = 0;
  while (echo < appended.length && appended[echo].who === 'me') echo += 1;
  const reply = appended.slice(echo);

  if (!hold || reply.length === 0) {
    return { echoEnd: null, steps: [{ through: blocks.length, beatMs: 0, holdMs: 0, leadMs: 0, exitMs: 0 }] };
  }

  // The reply lands one message at a time: a reply authored as several
  // `#newmessage` bubbles arrives as several messages, the dots holding between
  // them. The offsets are absolute log positions, so each land hands the
  // grouping the prefix it expects.
  const base = prevLogLength + echo;
  const ends: number[] = [];
  for (const run of groupBlocks(reply)) ends.push((ends.at(-1) ?? base) + run.parts.length);

  return {
    echoEnd: echo > 0 ? base : null,
    steps: ends.map((through, index) => {
      const start = index === 0 ? base : ends[index - 1];
      const run = blocks.slice(start, through);
      return {
        through,
        beatMs: composingDelay(run, pacing),
        // A land that types itself out is awaited by its reveal's end; one with
        // nothing to type is waited out for its own content weight so a link or
        // an image does not land instantly.
        holdMs: hasTypewriter(run) ? 0 : muteRevealHoldMs(run, pacing),
        // The lead belongs to the turn's first land, and only when the viewer's
        // own line landed with it.
        leadMs: index === 0 && echo > 0 ? pacing.composingLeadMs : 0,
        exitMs: COMPOSING_EXIT_MS + FRAME_MS,
      };
    }),
  };
}
