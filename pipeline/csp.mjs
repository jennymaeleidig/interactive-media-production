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
//   the dedupe pass    widens `style-src` / `script-src` with `'self'` — a
//                      body that moves to /assets/<sha> is blocked until the
//                      directive that governs it allows the origin (ADR 0003).
//
// The rule all three share, and the reason this is one module: **a directive is
// replaced, never appended to.** A second `frame-src` (or `style-src`) would
// intersect with the captured one and keep the resource blocked — the failure
// looks exactly like the grant having never been made. `grantSources` is the
// only function that edits a policy value: the layer grants (chat) and the
// embed pass both go through `applyGrant` here, and the dedupe pass calls
// `grantSources` directly because it tracks per-kind grant status against an
// offset-preserving edit list and owns that bookkeeping. `test/csp.test.ts`
// pins the invariant by granting twice and counting directives.
//
// Measured on the frozen tree (ADR 0004): 1,181 served pages, none without a
// CSP meta and none with a content attribute missing, and no page with a
// duplicate directive — every one of the six distinct policy values the tree
// carries ends in the appended `connect-src 'self';`, and each names frame-src
// exactly once. The no-meta / no-content branches are defensive: the frozen
// corpus never reaches them, but an unfrozen capture may.
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
 * offsets (the dedupe pass applies a whole list back-to-front) need the tag text.
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
 * choice: `append` (the default) writes one, seeded with `defaults`; the dedupe
 * pass sets `append: false` because a page with no `style-src` is governed by
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

/**
 * Apply one grant to a document's captured policy and record it: read, warn if
 * the page carries no policy, widen (replace, never append), write, and append
 * the mutation-log note. This is the one grant operation the layer records and
 * the embed pass share; the dedupe pass calls `grantSources` directly because
 * its per-kind status and offset-preserving edit list are its own.
 * @param {string} html
 * @param {{warnings: string[], csp?: string}} entry
 * @param {{directive: string, sources: string[], defaults?: string[], append?: boolean, note: string, missing: string, noContent: string}} grant
 * @returns {string}
 */
export function applyGrant(html, entry, grant) {
  const csp = readCsp(html);
  if (csp === null) {
    entry.warnings.push(grant.missing);
    return html;
  }
  if (csp.value === null) {
    entry.warnings.push(grant.noContent);
    return html;
  }
  const granted = grantSources(csp.value, grant.directive, grant.sources, {
    defaults: grant.defaults ?? grant.sources,
    append: grant.append ?? true,
  });
  if (granted.value === csp.value) return html;
  const note = `${grant.directive} ${grant.sources.join(' ')} (${grant.note})`;
  entry.csp = entry.csp ? `${entry.csp}; ${note}` : note;
  return writeCsp(html, csp, granted.value);
}
