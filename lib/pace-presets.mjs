// The closed pace vocabulary: the named presets an authored `[pace=...]`
// marker may carry, and the multiplier each applies to the speaking character's
// own default reveal pace.
//
// Three names, not five: the reveal is drawn by a rAF typewriter that advances at
// most one character per frame and only on a frame strictly past the delay, so a
// positive delay below one frame still costs two frames. A character's effective
// pace therefore lands on whole-frame steps (2 frames = 360 wpm, 3 frames = 240,
// 4 = 180, 5 = 144), and the pace above which no clock can advance faster is the
// two-frame step, not the one-frame one. Cam rests at 400 wpm, already past that
// bound, so no preset faster than `normal` can be anything but identical to it;
// `fast` and `fastest` were dead labels on Cam and `fastest` was dead on Flock.
// The surviving three are distinct for both characters (see the pace levers in
// `lib/pacing.ts`): Cam 4/3/2 frames, Flock 5/4/3.
//
// A plain `.mjs` on purpose: the build's freshness gate
// (`scripts/build-chat-runtime.mjs`) runs in Node and must reject a preset that
// is not in this table before the runtime is written, and Node cannot import the
// pace levers' TypeScript. The levers themselves (`lib/pacing.ts`) re-export
// this table, so the piece's feel is still tuned from one place — the preset
// names beside the multipliers beside the default, floor, and ceiling.
//
// `pace`, deliberately not Yarn's own `speed`: the runtime treats every marker
// name as opaque, and the name keeps the piece's closed vocabulary from reading
// as the engine's numeric semantics.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * The preset names, slowest first. A preset is a name, never a number: the
 * author writes the name and the multiplier below does the arithmetic, so no two
 * dramatic beats are secretly different. `normal` is the character's resting
 * pace; there is deliberately no faster preset, because a character at or above
 * the frame bound has no faster pace to reach (`lib/chat-characters.mjs`).
 * @type {readonly string[]}
 */
export const PACE_PRESETS = ['slowest', 'slow', 'normal'];

/**
 * What each preset multiplies the character's own default reveal pace by. All
 * three are distinct and positive, and each lands on its own frame step for both
 * characters; the pace levers clamp the product, so no preset can produce a pace
 * that is unreadable or already inert (`lib/pacing.ts`).
 * @type {Readonly<Record<string, number>>}
 */
export const PACE_PRESET_MULTIPLIERS = {
  slowest: 0.5,
  slow: 0.7,
  normal: 1,
};

/** The marker name the presets are read from, shared by the engine and the gate. */
export const PACE_MARKER = 'pace';
