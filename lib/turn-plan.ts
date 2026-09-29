// The turn plan: what lands at once and what holds, as data.
//
// The engine answers every turn with the whole block log (`lib/chat-turn.mjs`).
// Applying one turn means landing the viewer's echo immediately — their own
// choice, nothing to compose — then releasing the reply one message at a time,
// each held behind a typing beat read off its own content. That schedule is
// pure: given the log length the transcript already holds and the turn's blocks,
// it returns the absolute offsets to land and the hold before each. It can be
// tested without a timer or a DOM. `hooks/use-dialogue.ts` executes it.
//
// The beat weights are declared per block type in the inventory's contract terms
// (`CHAT_BLOCK_TERMS`); this module owns only the clock, read at the piece's pace
// (`lib/pacing.ts`).
//
// SPDX-License-Identifier: CC0-1.0
import { CHAT_BLOCK_TERMS } from '@/lib/chat-blocks.mjs';
import { characterFor } from '@/lib/chat-characters.mjs';
import {
  DEFAULT_PACING,
  FRAME_MS,
  COMPOSING_EXIT_MS,
  msPerChar,
  revealCharsPerStep,
  revealDelayMs,
  revealMsPerChar,
  revealWordsForPreset,
  stepsFor,
  typewriterStepMs,
  type Pacing,
} from '@/lib/pacing';
import { groupBlocks } from '@/lib/transcript';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

/** One land: everything up to and including the absolute log offset `through`
 * is shown, after a hold of `beatMs`. A zero beat lands at once. `revealMs` is
 * how long the message that lands here takes to type itself out, so the caller
 * can keep the next message's composing dots down until it is done. */
export interface TurnStep {
  through: number;
  beatMs: number;
  revealMs: number;
  /** The pause after the previous land, before this step's dots go up. It is
   * charged to the turn's first step when the turn echoed the viewer's own line,
   * so the dots wait a beat behind it rather than arriving on top of it; later
   * steps already wait out the line above through `revealMs`. */
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

/** The reveal pace a bot block types at: the speaker's own resting pace
 * (`lib/chat-characters.mjs`), or the piece default for a character that declares
 * none. The viewer's own blocks never type, so they read the piece default too. */
export function revealWordsPerMinuteFor(block: ChatBlock, pacing: Pacing = DEFAULT_PACING): number {
  if (block.who === 'bot') {
    const character = characterFor(block.speaker);
    if (character.paceWordsPerMinute !== undefined) return character.paceWordsPerMinute;
  }
  return pacing.revealWordsPerMinute;
}

/** One stretch of a line's reveal: the text, the per-step delay to hand the
 * typewriter (`delayMs`), and how many characters ride one step
 * (`charsPerStep`). The delay is what the typewriter is *requested*; what it
 * achieves is derived (`typewriterStepMs`), because the step — not the requested
 * delay — is what really elapses. A caller driving the typewriter uses these two
 * fields; the schedule derives the step. */
export interface RevealRun {
  text: string;
  delayMs: number;
  charsPerStep: number;
}

/** A landed block's typed runs. A text block is split at its parse-time
 * `[pace=...]` boundaries (`lib/chat-engine.mjs`), so each stretch types at its
 * own pace; a block with no segments — the whole line unmarked — is one run. A
 * non-text block types in whole and has no runs. */
export function revealRuns(block: ChatBlock, pacing: Pacing = DEFAULT_PACING): RevealRun[] {
  if (block.type !== 'text') return [];
  const base = revealWordsPerMinuteFor(block, pacing);
  const segments = block.segments && block.segments.length > 0 ? block.segments : [{ text: block.text }];
  return segments.map((segment) => {
    const pace = revealWordsForPreset(base, segment.pace);
    return {
      text: segment.text,
      delayMs: revealDelayMs(pace),
      charsPerStep: revealCharsPerStep(segment.pace),
    };
  });
}

/** The wall time a landed message holds before the next one may start. The
 * typing is the turn's clock — the next message must not land until this line has
 * finished, and the voice is bounded by the same moment — so this is an upper
 * bound on the typewriter's real run: the two opening events (clear, then cursor)
 * at the first run's step, each run boundary's `changeDelay` event at the
 * previous run's step, and each run's characters in whole steps of `charsPerStep`
 * at its own step. A non-text block types in whole at the speaker's resting
 * pace. */
export function revealDelay(blocks: readonly ChatBlock[], pacing: Pacing = DEFAULT_PACING): number {
  let total = 0;
  for (const block of blocks) {
    const runs = revealRuns(block, pacing);
    if (runs.length === 0) {
      total += CHAT_BLOCK_TERMS[block.type].beat(block) * revealMsPerChar(revealWordsPerMinuteFor(block, pacing));
      continue;
    }
    // The typewriter's queue opens with its own two events before the first
    // character, and each later run prepends a `changeDelay` that itself costs a
    // step at the previous run's pace.
    total += 2 * typewriterStepMs(runs[0].delayMs);
    runs.forEach((run, index) => {
      if (index > 0) total += typewriterStepMs(runs[index - 1].delayMs);
      total += typewriterStepMs(run.delayMs) * stepsFor(run.text, run.charsPerStep);
    });
  }
  return Math.ceil(total) + FRAME_MS;
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
    return { echoEnd: null, steps: [{ through: blocks.length, beatMs: 0, revealMs: 0, leadMs: 0, exitMs: 0 }] };
  }

  // The reply lands one message at a time: a reply authored as several
  // `#newmessage` bubbles arrives as several messages, the dots holding between
  // them. The offsets are absolute log positions, so each land hands the
  // grouping the prefix it expects.
  const base = prevLogLength + echo;
  const ends: number[] = [];
  for (const run of groupBlocks(reply)) ends.push((ends.at(-1) ?? base) + run.parts.length);

  // Each message holds for its own composing weight, then types itself out; the
  // caller keeps the next message's dots down until that reveal is done, so the
  // dots always follow the line above and only one typewriter runs at a time.
  return {
    echoEnd: echo > 0 ? base : null,
    steps: ends.map((through, index) => {
      const start = index === 0 ? base : ends[index - 1];
      return {
        through,
        beatMs: composingDelay(blocks.slice(start, through), pacing),
        revealMs: revealDelay(blocks.slice(start, through), pacing),
        // The lead belongs to the turn's first land, and only when the viewer's
        // own line landed with it.
        leadMs: index === 0 && echo > 0 ? pacing.composingLeadMs : 0,
        exitMs: COMPOSING_EXIT_MS + FRAME_MS,
      };
    }),
  };
}
