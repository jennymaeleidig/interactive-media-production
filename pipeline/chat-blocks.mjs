// The block inventory: the one hand-reviewed declaration of every block the
// piece can render and every remote source it may reach.
//
// A block is authored in `dialogue/flock.yarn` by id (`<<block "flock-home">>`),
// and the id resolves here, at the engine's single block-shaping point. Payloads
// live only here, so a remote URL never enters the generated program
// (`pipeline/chat-program.json`) — the compiler sees an id, not a target.
//
// The no-ask rule's allowlist (`CODING_STANDARDS.md`) is the set of `src` values
// in this inventory, and it is **empty**: ticket 10 settled that the piece ships
// `text` and `link` blocks only, so the page embeds nothing and makes no
// subresource request. The `image` and `frame` adapters stay as seam capability:
// adding a framed or image target is one deliberate edit here, and until a human
// makes it the derived allowlist admits no URL.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * @typedef {object} TextPayload
 * @property {'text'} type
 * @property {string} text
 */
/**
 * @typedef {object} ImagePayload
 * @property {'image'} type
 * @property {string} src
 * @property {string} alt
 * @property {string} [caption]
 */
/**
 * @typedef {object} FramePayload
 * @property {'frame'} type
 * @property {string} src
 * @property {string} sandbox
 * @property {string} title
 * @property {string} [caption]
 */
/**
 * @typedef {object} LinkPayload
 * @property {'link'} type
 * @property {string} href
 * @property {string} label
 */
/**
 * A block payload: everything an inventory entry declares except the speaker,
 * which the engine supplies. @typedef {TextPayload | ImagePayload | FramePayload | LinkPayload} BlockPayload
 */

/**
 * One entry per block id. `type` must be in the locked vocabulary
 * (`pipeline/chat-turn.mjs`); every other field is that type's payload.
 * @type {Readonly<Record<string, BlockPayload>>}
 */
export const CHAT_BLOCKS = {
  'flock-home': {
    type: 'link',
    href: 'https://www.flocksafety.com/',
    label: 'Flock Safety',
  },
};

/**
 * The allowlist the frame and image adapters check a `src` against: every remote
 * source named in the inventory, and nothing else. Derived, so it cannot drift
 * from the declaration.
 * @returns {Set<string>}
 */
export function allowedSources() {
  /** @type {Set<string>} */
  const sources = new Set();
  for (const payload of Object.values(CHAT_BLOCKS)) {
    if (payload.type === 'image' || payload.type === 'frame') {
      sources.add(payload.src);
    }
  }
  return sources;
}
