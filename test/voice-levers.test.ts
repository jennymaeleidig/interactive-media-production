// The voice's levers, read from the piece's one tuning surface.
//
// The typing is the turn's clock: the voice starts with the reveal and is
// stopped when the typing stops, so a voice slower than the reveal does not
// finish every letter and the next message is never held for it. What also has
// to hold is that the voice's pace keeps its letter samples from piling up: a
// sample is about 150 ms long and the library never cuts one short. These pin
// those invariants, not the tunings: retune the levers freely.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import {
  ANIMALESE_BASE_PITCH,
  ANIMALESE_PITCH_RANGE,
  ANIMALESE_WORDS_PER_MINUTE,
  FRAME_MS,
  msPerChar,
} from '@/lib/pacing';
import { revealDelay } from '@/lib/turn-plan';

const line = (chars: number): ChatBlock[] => [{ who: 'bot', type: 'text', text: 'x'.repeat(chars) }];

/** One letter's wall time at a pace, in seconds — the library's own slot. */
const letterSeconds = (wordsPerMinute: number): number => msPerChar(wordsPerMinute) / 1000;

describe('the voice levers', () => {
  it("runs at the library's natural pace, so letter samples do not pile up", () => {
    // A sample is about 150 ms long and the library never cuts one short, so the
    // spacing has to be a good fraction of that. At one frame (~17 ms) about
    // nine would overlap and the speech becomes a wash; at ~75 ms two do — the
    // classic animalese warble.
    expect(letterSeconds(ANIMALESE_WORDS_PER_MINUTE) * 1000).toBeGreaterThanOrEqual(FRAME_MS * 4);
  });

  it('is bounded by the typing, which is the turn clock', () => {
    const chars = 40;
    const spokenMs = chars * letterSeconds(ANIMALESE_WORDS_PER_MINUTE) * 1000;
    // The reveal holds for the typing's own fast pace, well under the voice's
    // slower one — so the line ends with the typing and the voice is cut with it.
    expect(revealDelay(line(chars))).toBeLessThan(spokenMs);
  });

  it('leaves pitch, pitch spread, and voice speed tunable, never inert', () => {
    expect(ANIMALESE_BASE_PITCH).toBeGreaterThan(0);
    expect(ANIMALESE_PITCH_RANGE).toBeGreaterThanOrEqual(0);
    expect(ANIMALESE_WORDS_PER_MINUTE).toBeGreaterThan(0);
    expect(letterSeconds(ANIMALESE_WORDS_PER_MINUTE)).toBeGreaterThan(0);
  });
});
