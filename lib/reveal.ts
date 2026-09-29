// The reveal: one fresh line's step queue and its exactly-once end.
//
// A fresh message's arrival is a reveal: the line types itself out one step at a
// time at the speaking character's own resting pace, scaled by any authored
// `[pace=...]` override. This module owns the two things the rest of the piece
// builds on. The step queue — the text, the per-step delay, and the characters
// per step — is data: the typewriter adapter consumes it and it knows nothing
// about the typewriter. The end-of-reveal event is a handle the adapter wires:
// it fires exactly once per line, when the typewriter finishes, when the adapter
// unmounts before it has, or immediately for a line that never types at all.
// There is deliberately no fallback timer: keeping a forecast as insurance would
// let a broken completion path pass silently and would reintroduce the second
// clock this module exists to remove.
//
// The reveal never imports the audio engine or React. The adapter attaches the
// voice to the events, and the dialogue hook attaches the turn's advance to the
// end, so the module's only job is the queue and the event.
//
// SPDX-License-Identifier: CC0-1.0
import { CHAT_BLOCK_TERMS } from '@/lib/chat-blocks.mjs';
import { characterFor } from '@/lib/chat-characters.mjs';
import {
  DEFAULT_PACING,
  revealCharsPerStep,
  revealDelayMs,
  revealMsPerChar,
  revealWordsForPreset,
  type Pacing,
} from '@/lib/pacing';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

/** One stretch of a line's reveal: the text, the per-step delay to hand the
 * typewriter (`delayMs`), and how many characters ride one step (`charsPerStep`).
 * The delay is what the typewriter is *requested*; what it achieves is the
 * adapter's business. */
export interface RevealRun {
  text: string;
  delayMs: number;
  charsPerStep: number;
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

/** A landed block's typed runs. A text block is split at its parse-time
 * `[pace=...]` boundaries (`scripts/chat-engine.mjs`), so each stretch types at
 * its own pace; a block with no segments — the whole line unmarked — is one run. A
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

/** Whether a block types itself out when it lands fresh: only a bot's own text.
 * The viewer's line lands whole, and every other block type is built in one
 * piece, so neither is awaited by the reveal's end. */
export function typesItself(block: ChatBlock): boolean {
  return block.type === 'text' && block.who === 'bot';
}

/** Whether any block in a land types itself out, so the land is awaited by its
 * reveal's end rather than waited out for a hold. */
export function hasTypewriter(blocks: readonly ChatBlock[]): boolean {
  return blocks.some(typesItself);
}

/** The hold a land with nothing to type is waited out for: its declared
 * content-weight (`CHAT_BLOCK_TERMS`), read at the speaker's reveal pace, so a
 * link or an image does not land instantly. A land with a typecapable block is
 * awaited by event instead and carries a zero hold. */
export function muteRevealHoldMs(blocks: readonly ChatBlock[], pacing: Pacing = DEFAULT_PACING): number {
  return blocks.reduce((total, block) => {
    const weight = CHAT_BLOCK_TERMS[block.type].beat(block);
    return total + weight * revealMsPerChar(revealWordsPerMinuteFor(block, pacing));
  }, 0);
}

/** The two events one line's reveal raises. The adapter wires them: `onStart`
 * begins the voice, `onEnd` stops it and releases the turn. Both are optional,
 * because a restored line and the viewer's own line are never revealed. */
export interface RevealEvents {
  onStart?: () => void;
  onEnd?: () => void;
}

/** One line's reveal, as a handle. The adapter calls `start` when the
 * typewriter begins and `end` when it finishes or unmounts; `end` fires the
 * end event exactly once whatever path reaches it. `runs` is the queue the
 * adapter feeds the typewriter. */
export interface Reveal {
  runs: RevealRun[];
  start(): void;
  end(): void;
}

/** Build one line's reveal. The queue is derived here; the events fire exactly
 * once — `start` at most once, `end` exactly once — so a completion that
 * arrives late cannot fire a second time. */
export function createReveal(
  block: ChatBlock,
  events: RevealEvents = {},
  pacing: Pacing = DEFAULT_PACING,
): Reveal {
  let started = false;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    events.onEnd?.();
  };
  return {
    runs: revealRuns(block, pacing),
    start() {
      if (started || ended) return;
      started = true;
      events.onStart?.();
    },
    end,
  };
}
