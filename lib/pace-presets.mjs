// The closed pace vocabulary: the five named presets an authored `[pace=...]`
// marker may carry, and the multiplier each applies to the speaking character's
// own default reveal pace.
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
 * dramatic beats are secretly different.
 * @type {readonly string[]}
 */
export const PACE_PRESETS = ['slowest', 'slow', 'normal', 'fast', 'fastest'];

/**
 * What each preset multiplies the character's own default reveal pace by. All
 * five are distinct and positive; the pace levers clamp the product, so no preset
 * can produce a pace that is unreadable or already inert (`lib/pacing.ts`).
 * @type {Readonly<Record<string, number>>}
 */
export const PACE_PRESET_MULTIPLIERS = {
  slowest: 0.5,
  slow: 0.7,
  normal: 1,
  fast: 1.3,
  fastest: 1.6,
};

/** The marker name the presets are read from, shared by the engine and the gate. */
export const PACE_MARKER = 'pace';
