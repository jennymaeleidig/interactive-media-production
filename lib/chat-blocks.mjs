// The block inventory: the one hand-reviewed declaration of every block the
// piece can render, every remote source it may reach, and each type's contract
// terms — the typing-beat weight its content holds and the frugality rules its
// render must follow.
//
// A block is authored in `dialogue/flock.yarn` by id (`<<block "flock-home">>`),
// and the id resolves here, at the engine's single block-shaping point. Payloads
// live only here, so a remote URL never enters the generated program
// (`scripts/chat-program.json`) — the compiler sees an id, not a target.
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
 * One inventory entry's payload: a block with its speaker and bubble boundary
 * removed, since the engine supplies `who` and the authored command decides
 * `newMessage`. Derived from the one block declaration
 * (`lib/chat-turn.mjs`), so a field rename or addition is one edit there
 * and this cannot drift.
 * @typedef {Exclude<ChatBlock, { type: 'me' | 'unknown' }> extends infer Block
 *   ? Block extends unknown
 *     ? Omit<Block, 'who' | 'newMessage'>
 *     : never
 *   : never} BlockPayload
 */

/**
 * One block type's contract terms. `beat` is the typing-beat weight the type's
 * content contributes, in characters — the composing clock in the shell's
 * dialogue hook (`WORDS_PER_MINUTE`, five characters to the word, floor
 * included) turns the sum of a reply's weights into the hold. `lazy` and
 * `asyncDecode` are the frugality rules a render must follow when it reaches a
 * remote source: load only near the viewport, decode off the main thread — the
 * viewer opted into a conversation, not a download (the no-ask rule,
 * `CODING_STANDARDS.md`).
 * @typedef {{
 *   beat: (block: ChatBlock) => number,
 *   lazy?: boolean,
 *   asyncDecode?: boolean,
 * }} BlockTerms
 */

/**
 * One entry per block id. `type` must be in the locked vocabulary
 * (`lib/chat-turn.mjs`); every other field is that type's payload.
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
 * The contract terms per renderable type. Every type in the locked vocabulary
 * declares a `beat` — a type with no declared weight is an inventory defect the
 * inventory tests catch, not a silent zero. The text and link weights are the
 * compatibility term: exactly the characters the composing clock read when it
 * lived in the hook, so today's pacing is unchanged. The image and frame
 * weights are declared ground for the adapters this effort does not build: a
 * visual block composes as the words around it — its textual payload at the
 * same clock, retunable when the adapter ships. The rules are declarations,
 * not enforcement: an adapter shipping a type that declares the frugality
 * rules is held to them by the adapter tests as it lands.
 * @type {Readonly<Record<ChatBlock['type'], BlockTerms>>}
 */
export const CHAT_BLOCK_TERMS = {
  text: {
    beat: (block) => /** @type {Extract<ChatBlock, { type: 'text' }>} */ (block).text.length,
  },
  link: {
    beat: (block) => /** @type {Extract<ChatBlock, { type: 'link' }>} */ (block).label.length,
  },
  me: {
    // The viewer's own turn lands instantly by construction.
    beat: () => 0,
  },
  image: {
    beat: (block) => {
      const payload = /** @type {Extract<ChatBlock, { type: 'image' }>} */ (block);
      return payload.alt.length + (payload.caption?.length ?? 0);
    },
    lazy: true,
    asyncDecode: true,
  },
  frame: {
    // A frame loads only near the viewport; `decoding` is an img attribute no
    // iframe has, so the frame's frugality is its laziness alone.
    beat: (block) => {
      const payload = /** @type {Extract<ChatBlock, { type: 'frame' }>} */ (block);
      return payload.title.length + (payload.caption?.length ?? 0);
    },
    lazy: true,
  },
  unknown: {
    // The designed fallback is chrome, not authored content.
    beat: () => 0,
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
