// SPDX-License-Identifier: CC0-1.0
//
// The piece's pacing levers, in one place so its whole feel is tuned from here:
// how long Cam's dots hold before a message lands, the floor under even the
// shortest hold, and how fast a landed line types itself out. Both clocks read
// the same shape — words per minute, five characters to the word — so the two
// speeds are directly comparable.

/** Five characters to the word: the one conversion both clocks read. */
const CHARS_PER_WORD = 5;

/** The composing clock, in words per minute: the dots hold for a run's own
 * weight read off this pace, so a short message holds briefly and a long one
 * proportionally longer. Tune this one number to retune every beat. */
export const TYPING_WORDS_PER_MINUTE = 400;

/** A floor under every composing beat, so even a one-word message reads as a
 * pause rather than a flicker. */
export const MIN_TYPING_BEAT_MS = 750;

/** The typewriter clock, in words per minute: the pace a landed line's own
 * characters appear at. Deliberately separate from the composing clock above,
 * so the reveal can be retuned without touching the hold. */
export const TYPEWRITER_WORDS_PER_MINUTE = 800;

/** One animation frame at 60Hz. The reveal advances at most one character per
 * frame (`typewriter-effect` is rAF-driven), so a per-character delay below
 * this is inert and the true reveal pace is the slower of the two. The
 * schedule reads the reveal through this floor, so it waits out a line that is
 * still typing rather than landing the next one on top of it. */
export const FRAME_MS = 1000 / 60;

/** Milliseconds one character takes on a clock read in words per minute. */
export function msPerChar(wordsPerMinute: number): number {
  return 60_000 / (wordsPerMinute * CHARS_PER_WORD);
}
