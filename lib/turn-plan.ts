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
import { MIN_TYPING_BEAT_MS, msPerChar, TYPING_WORDS_PER_MINUTE } from '@/lib/pacing';
import { groupBlocks } from '@/lib/transcript';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

/** One land: everything up to and including the absolute log offset `through`
 * is shown, after a hold of `beatMs`. A zero beat lands at once. */
export interface TurnStep {
  through: number;
  beatMs: number;
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

/** The typing beat: the sequence's composing weight (five characters to the
 * word) read at `TYPING_WORDS_PER_MINUTE`, with a floor so even a one-word
 * message reads as a turn rather than a flicker. Applied per message, so every
 * bubble — and the figure its own landing freezes — is sized by its own content
 * alone. */
export function typingDelay(blocks: readonly ChatBlock[]): number {
  return Math.max(MIN_TYPING_BEAT_MS, Math.round(composingChars(blocks) * msPerChar(TYPING_WORDS_PER_MINUTE)));
}

/** Plan one turn. `hold` is whether replies are withheld behind their beat at
 * all — the opening turn and a reset are not. When `hold` is false, or the turn
 * appends no reply, the plan is a single immediate step over the whole log, so
 * the caller lands it synchronously. */
export function planTurn(
  prevLogLength: number,
  blocks: readonly ChatBlock[],
  { hold }: { hold: boolean },
): TurnPlan {
  const appended = blocks.slice(prevLogLength);
  let echo = 0;
  while (echo < appended.length && appended[echo].who === 'me') echo += 1;
  const reply = appended.slice(echo);

  if (!hold || reply.length === 0) {
    return { echoEnd: null, steps: [{ through: blocks.length, beatMs: 0 }] };
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
    steps: ends.map((through, index) => ({
      through,
      beatMs: typingDelay(blocks.slice(index === 0 ? base : ends[index - 1], through)),
    })),
  };
}
