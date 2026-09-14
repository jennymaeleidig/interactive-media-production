// The outbound rule for the Recreation's own injected sources.
//
// The invariant has two halves, one owner each, because they guard different
// bytes. The Capture's own scripts may reach exactly the Media allow-list, and
// `audit.mjs` owns that half — it knows the hosts and counts what is off the
// list. Our injected layers are the Recreation's own code: they ship on every
// page, and they are the reason a served page makes no request of its own. That
// half had no owner, so it lived as four byte-identical regexes in the seam
// tests (`motion`, `interactions`, `story-hook`, serving), each free to drift
// from the others.
//
// One member used to be the exception, and pretending otherwise is how this rule
// stayed green for a year without being true: the Chat mimic's whole function
// was one POST per turn to the local message API (`fetch('/api/chat', …)`),
// which the captured CSP admits with `connect-src 'self'`. The mimic's dialogue
// engine now runs in the page (`pipeline/chat-runtime.js`), so no member reaches
// anything and the exception is gone. The roster can still declare
// `outbound: 'self'` if a same-origin call ever comes back, which is why there
// are two rules and a roster that says which member gets which:
//
//   isInertSource      — names no network primitive at all. Every member today.
//   isSelfBoundSource  — may name `fetch`, but only at a root-relative path.
//
// Both are deliberately conservative. A bare identifier anywhere — a string, a
// property name, a comment — counts as a reference, and a `fetch` whose target
// is a variable is refused because this rule cannot see through one. A false
// positive costs a reviewer a minute; a false negative ships a page that phones
// home.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * The primitives a source may not name, as one list: the strict rule uses them
 * all, the same-origin rule all but `fetch`. `import(` is among them because a
 * dynamic import is a fetch with syntax sugar; a static `import` is not, because
 * a served page's runtime is a classic script with no module graph.
 */
const PRIMITIVES = ['XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'];

/**
 * The primitives a document-only source may not name. Exported so a caller can
 * say *what* a source reached for.
 */
export const NETWORK_PRIMITIVES = new RegExp(`\\b(?:fetch|${PRIMITIVES.join('|')})\\b|\\bimport\\s*\\(`);

/** The primitives even a same-origin member may not name — there is no same-origin use for them. */
const NON_SELF_PRIMITIVES = new RegExp(`\\b(?:${PRIMITIVES.join('|')})\\b|\\bimport\\s*\\(`);

/** A `fetch` call, wherever it appears in a source. */
const FETCH_CALL = /\bfetch\s*\(/g;

/** Any mention of the `fetch` identifier, call or not — a bare one is still a reference. */
const FETCH_REF = /\bfetch\b/g;

/** A `fetch` called with a string literal, capturing the target. */
const FETCH_LITERAL = /\bfetch\s*\(\s*(?:'([^']*)'|"([^"]*)")/g;

/**
 * Whether a source touches the document and nothing else — the rule every
 * injected layer's bytes must satisfy, whether read from `pipeline/` (so a new
 * one cannot land) or from the tree (so one cannot have shipped).
 * @param {string} source
 * @returns {boolean}
 */
export function isInertSource(source) {
  return !NETWORK_PRIMITIVES.test(source);
}

/**
 * Whether a source is same-origin-bound: the only primitive it may name is
 * `fetch`, and every `fetch` in it is called with a root-relative path literal
 * (`'/api/chat'`), never an absolute or protocol-relative URL, never a
 * variable, and never a bare, uncalled mention. This is the rule for a member
 * the roster gives an `outbound` allowance — no member has one today, but the
 * vocabulary stays while a same-origin call is conceivable.
 * @param {string} source
 * @returns {boolean}
 */
export function isSelfBoundSource(source) {
  if (NON_SELF_PRIMITIVES.test(source)) return false;
  const refs = source.match(FETCH_REF) ?? [];
  const calls = source.match(FETCH_CALL) ?? [];
  const targets = [...source.matchAll(FETCH_LITERAL)];
  // every mention of `fetch` must be a call, every call one of the literals, and
  // every literal a local path
  return refs.length === calls.length && calls.length === targets.length && targets.every((m) => /^\/(?!\/)/.test(m[1] ?? m[2] ?? ''));
}

/**
 * Whether a source honours the outbound allowance the roster declares for it:
 * `'none'` (the default, and every member today) means inert; `'self'` means
 * same-origin-bound. Pass the member's declared allowance, never a guess.
 * @param {string} source
 * @param {'none'|'self'|undefined} outbound
 * @returns {boolean}
 */
export function honoursOutbound(source, outbound) {
  return outbound === 'self' ? isSelfBoundSource(source) : isInertSource(source);
}
