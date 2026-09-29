// The pace and voice levers, read from the piece's one tuning surface.
//
// The typing is the turn's clock: the voice starts with the reveal and is
// stopped when the typing stops, so a voice slower than the reveal does not
// finish every letter. What also has to hold is that the reveal is bounded — no
// preset crawls past the floor and none is faster than a frame can draw — and
// that the voice's pace keeps its letter samples from piling up: a sample is
// about 150 ms long and the library never cuts one short. These pin those
// invariants, not the tunings: retune the levers freely.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import {
  ANIMALESE_WORDS_PER_MINUTE,
  FRAME_MS,
  msPerChar,
  PACE_PRESETS,
  PACE_PRESET_MULTIPLIERS,
  REVEAL_CEILING_WORDS_PER_MINUTE,
  REVEAL_FLOOR_WORDS_PER_MINUTE,
  revealMsPerChar,
  revealWordsForPreset,
} from '@/lib/pacing';
import { revealDelay } from '@/lib/turn-plan';

const line = (chars: number): ChatBlock[] => [{ who: 'bot', speaker: 'cam', type: 'text', text: 'x'.repeat(chars) }];

/** One letter's wall time at a pace, in seconds — the library's own slot. */
const letterSeconds = (wordsPerMinute: number): number => msPerChar(wordsPerMinute) / 1000;

describe('the voice lever', () => {
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
    // The reveal holds for the typing's own pace, well under the voice's slower
    // one — so the line ends with the typing and the voice is cut with it.
    expect(revealDelay(line(chars))).toBeLessThan(spokenMs);
  });
});

describe('the pace presets', () => {
  it('names five ascending presets, each with its own multiplier', () => {
    expect(PACE_PRESETS).toEqual(['slowest', 'slow', 'normal', 'fast', 'fastest']);
    const multipliers = PACE_PRESETS.map((preset) => PACE_PRESET_MULTIPLIERS[preset]);
    // Five names, five distinct values: no two dramatic beats are secretly the
    // same, and the order is the speed order.
    expect(new Set(multipliers).size).toBe(PACE_PRESETS.length);
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
    expect(PACE_PRESET_MULTIPLIERS.normal).toBe(1);
  });

  it('lands every preset inside the readable band, so none is inert or a crawl', () => {
    for (const preset of PACE_PRESETS) {
      const pace = revealWordsForPreset(400, preset);
      expect(pace, preset).toBeGreaterThanOrEqual(REVEAL_FLOOR_WORDS_PER_MINUTE);
      expect(pace, preset).toBeLessThanOrEqual(REVEAL_CEILING_WORDS_PER_MINUTE);
      expect(revealMsPerChar(pace), preset).toBeGreaterThanOrEqual(FRAME_MS);
    }
  });

  it('scales a slower preset to a longer per-character time than a faster one', () => {
    const slowest = revealMsPerChar(revealWordsForPreset(400, 'slowest'));
    const fastest = revealMsPerChar(revealWordsForPreset(400, 'fastest'));
    expect(slowest).toBeGreaterThan(fastest);
  });

  it('treats an unknown or absent preset as normal', () => {
    expect(revealWordsForPreset(400)).toBe(400);
    expect(revealWordsForPreset(400, 'nonsense')).toBe(400);
  });
});
