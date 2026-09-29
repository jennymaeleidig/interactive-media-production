// SPDX-License-Identifier: CC0-1.0
//
// The piece's pacing levers, in one place so its whole feel is tuned from here:
// how long the dots hold before a message lands, the floor under even the
// shortest hold, how fast a landed line types itself out, the closed vocabulary
// of authored pace overrides, and the voice that speaks as it does. Every clock
// reads the same shape — words per minute, five characters to the word — so the
// speeds are directly comparable. The typing is the turn's clock: a line's
// reveal reports its own end (`lib/reveal.ts`), and its voice is stopped when the
// typing stops (`lib/voice.ts`).
//
// The dialog's two clocks are deliberately separate. The composing clock decides
// how long the dots hold before a reply lands, and belongs to the viewer's
// settings; the reveal clock decides how fast a landed line types itself out, and
// belongs to the speaking character (`lib/chat-characters.mjs`), scaled by an
// authored `[pace=...]` preset. Retune one without touching the other.

/** Five characters to the word: the one conversion both clocks read. */
const CHARS_PER_WORD = 5;

/** The composing clock, in words per minute: the dots hold for a run's own
 * weight read off this pace, so a short message holds briefly and a long one
 * proportionally longer. Tune this one number to retune every beat. */
export const COMPOSING_WORDS_PER_MINUTE = 400;

/** A floor under every composing beat, so even a one-word message reads as a
 * pause rather than a flicker. */
export const MIN_COMPOSING_BEAT_MS = 750;

/** The pause between the viewer's own line landing and the composing dots
 * appearing. Long enough that the turn reads as a reply forming rather than the
 * echo and the wait arriving as one event. It is charged only to a turn that
 * actually echoed a viewer block, so a turn with nothing to wait behind raises
 * its dots at once. */
export const COMPOSING_LEAD_MS = 750;

/** How long the composing dots take to leave. The schedule holds the reply back
 * for this long after the dots come down, so the composing bubble's exit is
 * finished — and the bubble is gone from the transcript — before the reply pops
 * in. The typing indicator builds its exit transition from this same number, so
 * the animation and the wait cannot drift apart. It is not a `Pacing` field: the
 * length of the dots' own exit is the component's business, and a lever the
 * schedule honoured while the animation ignored it would be a trap. */
export const COMPOSING_EXIT_MS = 200;

/** One animation frame at 60Hz. The reveal advances at most one character per
 * frame, and only on a frame strictly past the requested delay, so a delay of
 * *less than* one frame still takes two frames and the reveal's true pace is the
 * requested delay rounded **up** to the next frame — not the slower of the clock
 * and one frame. `revealMsPerChar` reads a line through that step, so the hold a
 * mute land is waited out for and the queue's own step size stay in step with
 * what the typewriter really achieves. */
export const FRAME_MS = 1000 / 60;

/** The piece's own reveal clock, in words per minute: the resting pace a landed
 * line types itself out at, and the default a character without a
 * `paceWordsPerMinute` of its own inherits (`lib/chat-characters.mjs`). Cam sits
 * near this and Flock below it, so the two read as different people. Retune it
 * down to slow the piece. */
export const REVEAL_WORDS_PER_MINUTE = 400;

/** The floor under any character's reveal pace, preset included: below this the
 * line crawls. It sits under the slowest pace either character can reach, so it
 * is a guard on the arithmetic rather than a pace either one is meant to hit. */
export const REVEAL_FLOOR_WORDS_PER_MINUTE = 120;

/** The ceiling on the pace a character's *delay* can ask for. It is the frame
 * bound read as a clock: a delay of one frame is the fastest any positive delay
 * can be before the strict `>` comparison costs a second frame, so this is where
 * a shorter delay stops changing the step. It is not the ceiling on the reveal
 * itself — a preset that packs several characters per step (`fast`) reaches it
 * exactly, because the queue entry, not the clock, is what grows. Derived from
 * `FRAME_MS`, so it is a consequence of the frame and not an independent knob;
 * `round`, not `floor`, so floating-point noise in the frame cannot shave a word
 * off the bound. */
export const REVEAL_CEILING_WORDS_PER_MINUTE = Math.round(60_000 / (FRAME_MS * CHARS_PER_WORD));

// The closed pace vocabulary — the three authored preset names and what each
// multiplies a character's resting pace by — lives in `lib/pace-presets.mjs`,
// because the build's freshness gate runs in Node and cannot import this
// TypeScript. Re-exported here so the levers read as one table.
export { PACE_MARKER, PACE_PRESETS, PACE_PRESET_CHARS, PACE_PRESET_MULTIPLIERS } from '@/lib/pace-presets.mjs';
import { PACE_PRESET_CHARS, PACE_PRESET_MULTIPLIERS } from '@/lib/pace-presets.mjs';

/** A pace override's preset name: one of `PACE_PRESETS`. */
export type PacePreset = 'slow' | 'normal' | 'fast';

/** The pacing levers a turn schedule reads, as a value: the composing clock, the
 * reveal clock, the floor under a beat, and the lead the dots wait out behind the
 * viewer's own line. `lib/turn-plan.ts` takes this rather than reaching for the
 * module constants, so the piece's tuning is one substitution; the reveal
 * override per character and per `[pace=...]` marker layers on top of
 * `revealWordsPerMinute` (`lib/reveal.ts`). */
export interface Pacing {
  composingWordsPerMinute: number;
  revealWordsPerMinute: number;
  minimumBeatMs: number;
  composingLeadMs: number;
}

/** Milliseconds one character takes on a clock read in words per minute. */
export function msPerChar(wordsPerMinute: number): number {
  return 60_000 / (wordsPerMinute * CHARS_PER_WORD);
}

/** A reveal pace held inside the readable band: no faster than a frame can draw
 * (`REVEAL_CEILING_WORDS_PER_MINUTE`) and no slower than the floor. */
export function clampRevealWordsPerMinute(wordsPerMinute: number): number {
  return Math.min(REVEAL_CEILING_WORDS_PER_MINUTE, Math.max(REVEAL_FLOOR_WORDS_PER_MINUTE, wordsPerMinute));
}

/** A character's resting pace (or the piece default) scaled by an authored
 * preset, then clamped to the readable band. An absent or unknown preset is
 * `normal`: the build's freshness gate rejects an unknown preset before the
 * runtime ships, so this is the render-time safety net, not the script's escape
 * hatch. */
export function revealWordsForPreset(
  baseWordsPerMinute: number,
  preset?: string,
): number {
  const multiplier =
    preset !== undefined && Object.prototype.hasOwnProperty.call(PACE_PRESET_MULTIPLIERS, preset)
      ? PACE_PRESET_MULTIPLIERS[preset]
      : 1;
  return clampRevealWordsPerMinute(baseWordsPerMinute * multiplier);
}

/** How many characters one typewriter step reveals at this preset: `fast` rides
 * two, everything else one. The step is the reveal's true lever — the delay can
 * never beat two frames (`REVEAL_CEILING_WORDS_PER_MINUTE`), so a preset only
 * types faster than `normal` by putting more characters on each step. An absent
 * or unknown preset is one character, matching `normal`. */
export function revealCharsPerStep(preset?: string): number {
  return preset !== undefined && Object.prototype.hasOwnProperty.call(PACE_PRESET_CHARS, preset)
    ? PACE_PRESET_CHARS[preset]
    : 1;
}

/** A step size held to at least one whole character, so a bad value can never
 * make a step of zero and loop the splitter forever. */
function stepSize(charsPerStep: number): number {
  return Number.isFinite(charsPerStep) && charsPerStep >= 1 ? Math.floor(charsPerStep) : 1;
}

/** One line's text in the pieces one typewriter step reveals: a run types as
 * whole steps of `charsPerStep` characters, and a tail shorter than a step types
 * as its own step. The renderer hands each piece to `typewriter-effect` through
 * its `stringSplitter`, so one queue entry (one frame's work) types a whole
 * step. Steps are cut by code point, never by UTF-16 code unit, so a `fast` step
 * cannot split an astral character into two lone surrogates. */
export function splitIntoSteps(text: string, charsPerStep: number): string[] {
  const size = stepSize(charsPerStep);
  if (size <= 1) return Array.from(text);
  const characters = Array.from(text);
  const steps: string[] = [];
  for (let index = 0; index < characters.length; index += size) {
    steps.push(characters.slice(index, index + size).join(''));
  }
  return steps;
}

/** The per-character delay asked of `typewriter-effect`, in milliseconds: the
 * reveal clock read off `wordsPerMinute`, clamped to the readable band. This is
 * what the typewriter is *requested*; what it achieves is `revealMsPerChar`. */
export function revealDelayMs(wordsPerMinute: number = REVEAL_WORDS_PER_MINUTE): number {
  return msPerChar(clampRevealWordsPerMinute(wordsPerMinute));
}

/** The wall time one typed character actually takes at a requested delay: the
 * rAF typewriter advances at most one queued character per animation frame, and
 * only on a frame whose elapsed time is strictly past the delay, so a character
 * lands on the first frame boundary strictly after `delayMs`. At a delay that is
 * exactly a frame multiple that is the *next* multiple (a one-frame delay costs
 * two frames), which is why this is `floor(delay / frame) + 1` and not
 * `ceil(delay / frame)` — the two differ at exactly that boundary. */
export function typewriterStepMs(delayMs: number): number {
  return (Math.floor(delayMs / FRAME_MS + 1e-9) + 1) * FRAME_MS;
}

/** The reveal's true pace, in milliseconds per character: what the rAF
 * typewriter achieves at `revealDelayMs` (the requested delay carried to the next
 * whole animation frame, strictly next, so one frame of delay is two frames of
 * wall time), divided by how many characters one step carries. One step takes the
 * same wall time whatever it holds, so a two-character step is twice the pace.
 * The turn plan reads it to wait a mute land out for its content weight
 * (`lib/turn-plan.ts`), and the voice — stopped by its line's own reveal end
 * (`lib/voice.ts`) — is never cut early. */
export function revealMsPerChar(
  wordsPerMinute: number = REVEAL_WORDS_PER_MINUTE,
  charsPerStep: number = 1,
): number {
  const perStep = stepSize(charsPerStep);
  return typewriterStepMs(revealDelayMs(wordsPerMinute)) / perStep;
}

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

/** The piece's own pacing — a first visit's reveal clock before any character
 * has a say (`lib/settings.ts`). */
export const DEFAULT_PACING: Pacing = {
  composingWordsPerMinute: COMPOSING_WORDS_PER_MINUTE,
  minimumBeatMs: MIN_COMPOSING_BEAT_MS,
  composingLeadMs: COMPOSING_LEAD_MS,
  revealWordsPerMinute: REVEAL_WORDS_PER_MINUTE,
};
