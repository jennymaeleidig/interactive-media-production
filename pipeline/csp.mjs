// The captured policy: the page's `content-security-policy` meta, and the
// grants the build makes to it.
//
// Every served page carries the Capture's own policy (`default-src 'none'`,
// ADR 0001). Three passes have to widen it, and each one does so for its own
// reason:
//
//   the chat mount     appends `connect-src 'self'` — the capture has no
//                      `connect-src` at all, so the widget's same-origin POST
//                      to /api/chat is refused by `default-src 'none'` until it
//                      exists (ticket 10; jsdom does not enforce CSP, so no DOM
//                      seam can see this).
//   the embed pass     widens `frame-src` with the media hosts it used — the
//                      captured directive is `'self' data:`, so the live
//                      players stay blocked until their hosts are named there
//                      (ADR 0002, enforced by the audit rather than by
//                      construction).
//   pass 14            widens `style-src` / `script-src` with `'self'` — a
//                      body that moves to /assets/<sha> is blocked until the
//                      directive that governs it allows the origin (ADR 0003).
//
// The rule all three share, and the reason this is one module: **a directive is
// replaced, never appended to.** A second `frame-src` (or `style-src`) would
// intersect with the captured one and keep the resource blocked — the failure
// looks exactly like the grant having never been made. One grant operation, so
// a fourth caller cannot get that wrong; `test/csp.test.ts` pins the invariant
// by granting twice and counting directives.
//
// Measured on the frozen tree (ADR 0004), which is why the branches are known:
// 1,181 served pages, 22 with no CSP meta at all (the append-a-warning path),
// none with a content attribute missing, and no page with a duplicate directive
// — every one of the six distinct policy values the tree carries ends in the
// appended `connect-src 'self';`, and each names frame-src exactly once.
//
// SPDX-License-Identifier: CC0-1.0
import { unquote } from './html.mjs';

/** The first CSP meta tag of a document. */
const CSP_META_RE = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;
const CONTENT_ATTR_RE = /(\bcontent\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i;

/**
 * Read a document's captured policy.
 * @param {string} html
 * @returns {{tag: string, index: number, raw: string|null, value: string|null}|null}
 *   null when the document carries no CSP meta; `value` is null when the meta
 *   has no `content` attribute to read.
 */
export function readCsp(html) {
  const meta = CSP_META_RE.exec(html);
  if (!meta) return null;
  const raw = (CONTENT_ATTR_RE.exec(meta[0]) ?? [])[2];
  return { tag: meta[0], index: meta.index, raw: raw ?? null, value: raw === undefined ? null : unquote(raw) };
}

/**
 * The meta tag with its `content` value replaced, keeping the captured quote
 * style. Callers that must express their edit in the *original* document's
 * offsets (pass 14 applies a whole list back-to-front) need the tag text.
 * @param {{tag: string, raw: string|null}} read
 * @param {string} value
 * @returns {string}
 */
export function writeCspTag(read, value) {
  if (read.raw === null) return read.tag;
  const open = read.raw[0] === '"' || read.raw[0] === "'" ? read.raw[0] : '';
  return read.tag.replace(CONTENT_ATTR_RE, (_m, prefix) => `${prefix}${open}${value}${open}`);
}

/**
 * The document with its captured policy's `content` value replaced.
 * @param {string} html
 * @param {{tag: string, index: number, raw: string|null}} read  from `readCsp`
 * @param {string} value
 * @returns {string}
 */
export function writeCsp(html, read, value) {
  return html.slice(0, read.index) + writeCspTag(read, value) + html.slice(read.index + read.tag.length);
}

/**
 * Add `sources` to `directive` in a policy value.
 *
 * The directive is found once and *replaced* with itself plus the sources it
 * does not already name, so a second call adds nothing and never produces a
 * second directive. When the directive is absent the behaviour is the caller's
 * choice: `append` (the default) writes one, seeded with `defaults`; pass 14
 * sets `append: false` because a page with no `style-src` is governed by
 * `default-src 'none'` and the caller keeps that kind inline instead of
 * shipping a stylesheet that can never load.
 *
 * @param {string} value  a CSP `content` value
 * @param {string} directive  e.g. `frame-src`
 * @param {string[]} sources  the sources to grant
 * @param {{defaults?: string[], append?: boolean}} [options]
 *   `defaults` — sources for the appended directive (default: `sources`)
 * @returns {{value: string, existed: boolean, added: string[]}}
 *   `existed` — the directive was already in the policy
 *   `added` — the sources this call actually added (`[]` when none)
 */
export function grantSources(value, directive, sources, { defaults = sources, append = true } = {}) {
  const found = new RegExp(`(?:^|;)\\s*${directive}\\s+[^;]*`, 'i').exec(value);
  if (found === null) {
    if (!append) return { value, existed: false, added: [] };
    return { value: `${value.replace(/[;\s]+$/, '')}; ${directive} ${defaults.join(' ')};`, existed: false, added: [...defaults] };
  }
  const added = sources.filter((s) => !found[0].includes(s));
  if (added.length === 0) return { value, existed: true, added: [] };
  return { value: value.replace(found[0], `${found[0].trimEnd()} ${added.join(' ')}`), existed: true, added };
}
