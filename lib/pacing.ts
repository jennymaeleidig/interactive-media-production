// SPDX-License-Identifier: CC0-1.0
//
// The piece's pacing levers, in one place so its whole feel is tuned from here:
// how long Cam's dots hold before a message lands, the floor under even the
// shortest hold, how fast a landed line types itself out, and the voice that
// speaks as it does. Every clock reads the same shape — words per minute, five
// characters to the word — so the speeds are directly comparable. The typing is
// the turn's clock: a line is held for exactly as long as it takes to type, and
// its voice is stopped when the typing stops (`lib/turn-plan.ts`, `lib/voice.ts`).

/** Five characters to the word: the one conversion both clocks read. */
const CHARS_PER_WORD = 5;

/** The composing clock, in words per minute: the dots hold for a run's own
 * weight read off this pace, so a short message holds briefly and a long one
 * proportionally longer. Tune this one number to retune every beat. */
export const COMPOSING_WORDS_PER_MINUTE = 400;

/** A floor under every composing beat, so even a one-word message reads as a
 * pause rather than a flicker. */
export const MIN_COMPOSING_BEAT_MS = 750;

/** One animation frame at 60Hz. The reveal advances at most one character per
 * frame (`typewriter-effect` is rAF-driven), so a per-character delay below
 * this is inert and the true reveal pace is the slower of the clock and a frame.
 * The schedule reads the reveal through this floor, so it waits out a line that
 * is still typing rather than landing the next one on top of it. */
export const FRAME_MS = 1000 / 60;

/** The reveal clock, in words per minute: the pace a landed line's own
 * characters appear at, at its fastest. The requested delay sits just under a
 * frame, so the rAF-driven typewriter advances one character per frame and no
 * faster — a value at or above the frame is the same speed, so this is also the
 * reveal lever's ceiling (`lib/settings`) and the control has no dead zone.
 * Deliberately separate from the composing clock above, so the reveal can be
 * retuned without touching the hold; retune it down to slow the reveal. */
export const REVEAL_WORDS_PER_MINUTE = 800;

/** The pacing levers a turn schedule reads, as a value: the composing clock, the
 * reveal clock, and the floor under a beat. `lib/turn-plan.ts` takes this rather
 * than reaching for the module constants, so a viewer's settings (`lib/settings`)
 * tune a turn without the schedule owning global state. */
export interface Pacing {
  composingWordsPerMinute: number;
  revealWordsPerMinute: number;
  minimumBeatMs: number;
}

/** Milliseconds one character takes on a clock read in words per minute. */
export function msPerChar(wordsPerMinute: number): number {
  return 60_000 / (wordsPerMinute * CHARS_PER_WORD);
}

/** The reveal's true pace, in milliseconds per character: the typewriter
 * advances at most one character per frame, so a per-character delay below a
 * frame is inert and the real pace is the slower of `REVEAL_WORDS_PER_MINUTE`
 * and a frame. The turn schedule (`lib/turn-plan.ts`) waits a still-typing line
 * out on it rather than landing the next one on top of it. */
export function revealMsPerChar(wordsPerMinute: number = REVEAL_WORDS_PER_MINUTE): number {
  return Math.max(msPerChar(wordsPerMinute), FRAME_MS);
}

/** The voice's base pitch lever (`animalese-web`): the sample-pitch multiplier,
 * 1.0 the library's own, above it higher and below it lower. Tune here. */
export const ANIMALESE_BASE_PITCH = 1;

/** The voice's pitch-spread lever: the range each letter's pitch jitters over,
 * so the speech is not a monotone. The library reads a range `r` as ±`r`/2 per
 * letter; its own default is 0.25. Tune here. */
export const ANIMALESE_PITCH_RANGE = 0.25;

/** The voice's volume lever, 0 silent to 1 full. Read live through a gain node
 * (`lib/voice.ts`), so a change is heard on the next letter, not the next line. */
export const ANIMALESE_VOLUME = 1;

/** The voice's speed lever, in words per minute: the pace the animalese voice
 * speaks a line at. Its own clock, deliberately separate from the typewriter's,
 * so either can be retuned without the other. Its default is the library's own
 * ~75 ms per letter (160 wpm): a letter sample is about 150 ms long and the
 * library never cuts one short, so each rings over the next. At 75 ms two
 * letters overlap — the classic warble; at the typewriter's frame-bound pace
 * about nine would, and the speech turns to a wash. */
export const ANIMALESE_WORDS_PER_MINUTE = 160;

/** The piece's own pacing — the settings' defaults (`lib/settings`). The typing
 * is the turn's clock; the voice is its own and is stopped when the typing
 * stops, so a voice slower than the reveal simply does not finish every letter. */
export const DEFAULT_PACING: Pacing = {
  composingWordsPerMinute: COMPOSING_WORDS_PER_MINUTE,
  minimumBeatMs: MIN_COMPOSING_BEAT_MS,
  revealWordsPerMinute: REVEAL_WORDS_PER_MINUTE,
};
