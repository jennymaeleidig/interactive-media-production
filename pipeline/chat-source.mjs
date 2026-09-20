// The chat's no-network rule: its shipped bytes touch the document and nothing
// else.
//
// The dialogue engine runs in the page, so the chat has no server to reach and
// no reason to name a network primitive. This rule is what keeps that true — it
// is the piece's privacy contract, and it is deliberately conservative. A bare
// identifier anywhere counts, whether it is called, stored or merely mentioned
// in a comment, and there is no allowance for a same-origin call: a rule that
// cannot see through a variable costs a reviewer a minute when it is wrong,
// while the alternative ships a page that phones home.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * The primitives a source may not name. `import(` is among them because a
 * dynamic import is a fetch with syntax sugar; a static `import` is not,
 * because the shipped runtime is a classic script with no module graph.
 */
const PRIMITIVES = ['XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'];

/** Exported so a caller can say *what* a source reached for. */
export const NETWORK_PRIMITIVES = new RegExp(`\\b(?:fetch|${PRIMITIVES.join('|')})\\b|\\bimport\\s*\\(`);

/**
 * Whether a source touches the document and nothing else.
 * @param {string} source
 * @returns {boolean}
 */
export function isInertSource(source) {
  return !NETWORK_PRIMITIVES.test(source);
}
