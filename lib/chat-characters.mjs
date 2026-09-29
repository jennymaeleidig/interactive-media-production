// The cast: one hand-reviewed declaration of every character the piece has, its
// mark, its voice pitch, and its resting reveal pace.
//
// A character is declared here once and nowhere else (the spec's "one file is
// the only place a character is declared"). The script attributes a line by
// writing the character's name before the colon; the dialogue runtime parses
// that prefix into a `speaker`, and the engine lowercases it into the id this
// inventory is keyed by. Adding a character is one entry here, one mark file
// under `public/marks/`, and one Yarn name — no turn-contract change, because
// the contract carries a `speaker` string, not a cast.
//
// The pacing half is deliberately a plain `.mjs`: the build's freshness gate runs
// in Node and must reject a speaker that is not declared here before the runtime
// is written, and Node cannot import the TypeScript levers. The feel lives in
// `lib/pacing.ts`; this module only names a character's own resting pace, or
// leaves it undefined so the character inherits the piece default.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * One declared character. `id` is the Yarn speaker name lowercased — the engine
 * derives the same string from the runtime's parsed speaker, so the script and
 * the inventory agree by construction. `mark.alt` is the character's display
 * name, so the transcript's mark names its speaker to assistive tech. `voice`
 * is the animalese pitch pair (`lib/voice.ts`); the animalese pace stays a piece
 * constant. `paceWordsPerMinute` is this character's resting reveal pace, or
 * absent to inherit the piece default (`lib/pacing.ts`).
 * @typedef {{
 *   id: string,
 *   name: string,
 *   mark: { src: string, alt: string },
 *   voice: { basePitch: number, pitchRange: number },
 *   paceWordsPerMinute?: number,
 * }} Character
 */

/**
 * Every declared character, keyed by id. Cam, the main character, reads brisk;
 * Flock, the side character, reads unhurried — the two resting paces the spec
 * asks for. The resting pace is `normal`; `slow` widens its delay and `fast`
 * rides two characters on each typewriter step, so all three presets are real on
 * both characters (`lib/pace-presets.mjs`).
 * @type {Readonly<Record<string, Character>>}
 */
export const CHAT_CHARACTERS = {
  cam: {
    id: 'cam',
    name: 'Cam',
    mark: { src: '/marks/cam.svg', alt: 'Cam' },
    voice: { basePitch: 1, pitchRange: 0.25 },
    paceWordsPerMinute: 400,
  },
  flock: {
    id: 'flock',
    name: 'Flock',
    mark: { src: '/marks/flock.svg', alt: 'Flock' },
    voice: { basePitch: 0.78, pitchRange: 0.32 },
    paceWordsPerMinute: 300,
  },
};

/** The character a line with no speaker prefix falls back to, so a stray
 * stage-direction line does not blank the transcript. */
export const DEFAULT_CHARACTER_ID = 'cam';

/** Whether an id names a declared character. @param {string} id */
export function isCharacterId(id) {
  return Object.prototype.hasOwnProperty.call(CHAT_CHARACTERS, id);
}

/**
 * The character an id names, falling back to the piece's default for an
 * undeclared id. The build's freshness gate fails an undeclared speaker before
 * the runtime ships, so the fallback is a render-time safety net, not the
 * script's escape hatch.
 * @param {string | undefined} id
 * @returns {Character}
 */
export function characterFor(id) {
  return (id !== undefined && CHAT_CHARACTERS[id]) || CHAT_CHARACTERS[DEFAULT_CHARACTER_ID];
}
