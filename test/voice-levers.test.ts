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
import {
  ANIMALESE_WORDS_PER_MINUTE,
  FRAME_MS,
  msPerChar,
  PACE_PRESETS,
  PACE_PRESET_CHARS,
  PACE_PRESET_MULTIPLIERS,
  REVEAL_CEILING_WORDS_PER_MINUTE,
  REVEAL_FLOOR_WORDS_PER_MINUTE,
  revealCharsPerStep,
  revealMsPerChar,
  revealWordsForPreset,
  splitIntoSteps,
} from '@/lib/pacing';

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

  it('is bounded by the typing, because the typing is the turn clock', () => {
    // The reveal's end is an event, not a forecast: the line stops its own voice
    // the moment its typing ends (`lib/reveal.ts`, `lib/voice.ts`), so a voice
    // slower than the reveal cannot talk over the next message. The only thing
    // left to pin is that the voice really is the slower clock, which is why it
    // has to be cut by the reveal rather than by its own length.
    const chars = 40;
    const spokenMs = chars * letterSeconds(ANIMALESE_WORDS_PER_MINUTE) * 1000;
    const typedMs = chars * revealMsPerChar(revealWordsForPreset(400, 'normal'), revealCharsPerStep('normal'));
    expect(typedMs).toBeLessThan(spokenMs);
  });
});

describe('the pace presets', () => {
  /** The wall time one character really takes at a preset, for a resting pace. */
  const paceOf = (base: number, preset: string): number =>
    revealMsPerChar(revealWordsForPreset(base, preset), revealCharsPerStep(preset));

  it('names three presets, slow to fast, and every one changes the reveal', () => {
    expect(PACE_PRESETS).toEqual(['slow', 'normal', 'fast']);
    for (const preset of PACE_PRESETS) {
      expect(PACE_PRESET_MULTIPLIERS[preset], preset).toBeGreaterThan(0);
      expect(revealCharsPerStep(preset), preset).toBeGreaterThanOrEqual(1);
    }
    // `normal` is the character's own pace; `fast` is quicker by riding more
    // characters on each step, which is the only lever that can outrun it.
    expect(PACE_PRESET_MULTIPLIERS.normal).toBe(1);
    expect(PACE_PRESET_CHARS.fast).toBeGreaterThan(PACE_PRESET_CHARS.normal);
  });

  it('lands every preset inside the readable band, so none is inert or a crawl', () => {
    for (const preset of PACE_PRESETS) {
      const pace = revealWordsForPreset(400, preset);
      expect(pace, preset).toBeGreaterThanOrEqual(REVEAL_FLOOR_WORDS_PER_MINUTE);
      expect(pace, preset).toBeLessThanOrEqual(REVEAL_CEILING_WORDS_PER_MINUTE);
      expect(paceOf(400, preset), preset).toBeGreaterThan(0);
    }
  });

  it('makes slow slower, normal the resting pace, and fast genuinely faster', () => {
    // Both characters, because the point of the vocabulary is that each name is
    // real on whoever speaks the line, not just on the brisker one.
    for (const base of [400, 300]) {
      const slow = paceOf(base, 'slow');
      const normal = paceOf(base, 'normal');
      const fast = paceOf(base, 'fast');
      expect(slow, `slow > normal at ${base} wpm`).toBeGreaterThan(normal);
      expect(fast, `fast < normal at ${base} wpm`).toBeLessThan(normal);
    }
  });

  it('treats an unknown or absent preset as normal', () => {
    expect(revealWordsForPreset(400)).toBe(400);
    expect(revealWordsForPreset(400, 'nonsense')).toBe(400);
    expect(revealCharsPerStep(undefined)).toBe(revealCharsPerStep('normal'));
    expect(revealCharsPerStep('nonsense')).toBe(1);
  });

  it('splits a run into whole steps without ever breaking a character', () => {
    // A step is a unit of rendering, so it must never cut an astral character in
    // two. Joining the steps back is the property that matters; the shape of the
    // split is the implementation's business.
    for (const text of ['abcdef', 'abcde', 'abc', '', 'a\u{1F600}b', '\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}']) {
      const steps = splitIntoSteps(text, 2);
      expect(steps.join(''), text).toBe(text);
      for (const step of steps) {
        expect(step, `${text} step is whole code points`).toBe(Array.from(step).join(''));
        expect(Array.from(step).length, `${text} step width`).toBeLessThanOrEqual(2);
      }
    }
    expect(splitIntoSteps('a\u{1F600}b', 2)).toEqual(['a\u{1F600}', 'b']);
    expect(splitIntoSteps('abc', 2)).toEqual(['ab', 'c']);
  });
});
