// The closed pace vocabulary: the named presets an authored `[pace=...]`
// marker may carry, and how each changes the speaking character's own default
// reveal pace.
//
// Three names, and each one is real on every character:
//
//   slow    widens the per-character delay, so fewer characters land per second.
//   normal  the character's resting pace, one character per step.
//   fast    keeps the resting pace's clock but rides TWO characters on each
//           step, so it types at twice the characters per second.
//
// `fast` is a step size, not a shorter delay, because the reveal is drawn by a
// requestAnimationFrame typewriter that processes at most ONE queued event per
// frame and only on a frame strictly past the delay. A delay of less than one
// frame therefore still costs two frames, so the delay can never buy a step
// faster than two frames, and any "faster" preset written as a shorter delay
// collapses into the normal one. Packing characters into one queue entry is what
// a frame can actually carry more of; the library's `stringSplitter` is the seam
// that makes one entry type several characters.
//
// A plain `.mjs` on purpose: the build's freshness gate
// (`scripts/build-chat-runtime.mjs`) runs in Node and must reject a preset that
// is not in this table before the runtime is written, and Node cannot import the
// pace levers' TypeScript. The levers themselves (`lib/pacing.ts`) re-export
// this table, so the piece's feel is still tuned from one place.
//
// `pace`, deliberately not Yarn's own `speed`: the runtime treats every marker
// name as opaque, and the name keeps the piece's closed vocabulary from reading
// as the engine's numeric semantics.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * The preset names, slowest first. A preset is a name, never a number: the
 * author writes the name and the tables below do the arithmetic, so no two
 * dramatic beats are secretly different.
 * @type {readonly string[]}
 */
export const PACE_PRESETS = ['slow', 'normal', 'fast'];

/**
 * What each preset multiplies the character's own default reveal pace by.
 * `normal` and `fast` both rest on the character's own pace; `fast` is quicker
 * because it rides two characters on each step (`PACE_PRESET_CHARS`), not
 * because it asks for a shorter delay — a shorter delay cannot beat one frame
 * (see the note above). All three are positive and the pace levers clamp the
 * product, so no preset can produce a pace that is unreadable or already inert
 * (`lib/pacing.ts`).
 * @type {Readonly<Record<string, number>>}
 */
export const PACE_PRESET_MULTIPLIERS = {
  slow: 0.7,
  normal: 1,
  fast: 1,
};

/**
 * How many characters each typewriter step reveals. The reveal's clock is one
 * queue entry per frame, so a step that carries two characters types twice as
 * fast — this is the only lever that can outrun `normal`, and it is the whole
 * of what `fast` means.
 * @type {Readonly<Record<string, number>>}
 */
export const PACE_PRESET_CHARS = {
  slow: 1,
  normal: 1,
  fast: 2,
};

/** The marker name the presets are read from, shared by the engine and the gate. */
export const PACE_MARKER = 'pace';
