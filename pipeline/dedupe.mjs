// Inline-body deduplication: the `<style>`/`<script>` bodies a page carries
// become one content-addressed file each, linked by URL from the position the
// body held.
//
// A Capture re-encodes the page's stylesheets once per page, so the served tree
// pays for the same sheet 1,181 times: 29,686 `<style>` elements hold 1,642 MB
// of CSS for 1,476 distinct bodies, and the six injected runtimes are inlined
// on every page (7,086 copies of six files). GitHub Pages caps a published site
// at 1 GB, and the tree is 2.36 GB, so this pass is what makes the site
// publishable at all (docs/adr/0003-bodies-ship-as-files.md).
//
// The trade the pass makes: a body moves from the document to a second request,
// which is worth it above KEEP_INLINE_BYTES (a sub-kilobyte body saved three
// bytes of HTML and cost a request) and free below the browser's per-origin
// connection budget once the file is cached — the URL is the hash of the bytes,
// so it is immutable and shared by every page that carried the body.
//
// Two things the pass must not get wrong:
//
//   1. **Where a body is.** A `<style>` or `<script>` inside an attribute value
//      (`srcdoc="<style …>"` — the captured player documents are full of them)
//      is *text*, not an element, and a `<style>` inside `<svg>` is SVG CSS
//      where a `<link>` is not valid. So the scan is a real tokenizer: it reads
//      a tag's name, skips quoted attribute values, jumps over comments and SVG
//      subtrees, and skips script bodies. A regex sweep here would corrupt the
//      srcdoc payloads (the failure mode the ticket-12 bookkeeping strip hit).
//   2. **Whether the page may load it.** The captured CSP is `style-src
//      'unsafe-inline'` and `script-src 'unsafe-inline' data:` — no `'self'` —
//      so an external file is *blocked* until the pass grants `'self'` in the
//      directive that governs it. The directive is REPLACED, never appended: a
//      second one intersects with the captured one and keeps the file blocked
//      (same mechanism as the embed pass's `frame-src` grant, ADR 0002). When
//      the grant cannot be made (no CSP meta, or no such directive to widen)
//      the pass leaves that kind inline and says so, rather than shipping a
//      page whose stylesheet never loads.
//
// Pure: HTML in, rewritten HTML + the files to write out. The caller writes the
// files, so the same core runs in the build and in the tests.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';

/** Bodies smaller than this stay inline: a request costs more than the bytes. */
export const KEEP_INLINE_BYTES = 1024;

/** The content types the two kinds are written and served as. */
export const BODY_MIME = { style: 'text/css', script: 'text/javascript' };

// A `<script>` whose `type` is one of these carries DATA or a template, not
// code: it must not become an external file (a `<script src>` of that type is
// fetched and ignored, so the page would silently lose its JSON-LD). Anything
// else — an absent type, `text/javascript`, `module` — is code and is portable.
const DATA_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'application/manifest+json',
  'importmap',
  'speculationrules',
  'text/template',
  'text/x-handlebars-template',
  'text/x-jquery-tmpl',
]);

const TAG_NAME = /[a-z][a-z0-9-]*/iy;
const CSP_META_RE = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;
const CONTENT_ATTR_RE = /(\bcontent\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i;
const CLOSE_TAG = { style: /<\/style\s*>/gi, script: /<\/script\s*>/gi };

/** The `http-equiv`/`content` pair of the first CSP meta, or null. */
function cspMeta(html) {
  const meta = CSP_META_RE.exec(html);
  if (!meta) return null;
  return { tag: meta[0], index: meta.index };
}

/** The raw value of one attribute of an open tag (quotes kept), or null. */
function rawAttr(openTag, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i').exec(openTag);
  return m === null ? null : m[1];
}

/** An attribute value with its delimiters stripped, or null. */
function attrValue(value) {
  if (value === undefined || value === null) return null;
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

/** The end of the open tag that starts at `lt`: the `>` that closes it, found by
 * tokenizing its attributes the way the HTML parser does.
 *
 * A tag with no quote in it ends at its first `>` (`indexOf`), which is the
 * overwhelming majority — the captures leave most attributes unquoted. When a
 * quote *is* in the tag, the tag is walked attribute by attribute: a quoted
 * value runs to its closing quote, an unquoted one to the next space or `>`.
 * That distinction matters: `style=background-image:url(&quot;/assets/x.png&quot;)`
 * is an UNQUOTED value whose text happens to contain quotes (the captures are
 * full of them), and a scanner that let any `"` open a quoted section swallowed
 * 83KB of one page — the `<iframe srcdoc=…>` inside it included — and rewrote
 * the stylesheets of the *nested* document as if they were the page's, which
 * also made the pass disagree with itself on a second run.
 *
 * @param {string} html
 * @param {number} lt
 * @returns {number} index of the `>`, or `html.length` when unterminated
 */
function tagEnd(html, lt) {
  const gt = html.indexOf('>', lt);
  if (gt < 0) return html.length;
  const dq = html.indexOf('"', lt);
  const sq = html.indexOf("'", lt);
  if (!((dq >= 0 && dq < gt) || (sq >= 0 && sq < gt))) return gt;
  const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';
  let i = lt + 1;
  while (i < html.length) {
    while (i < html.length && isSpace(html[i])) i += 1;
    if (i >= html.length) return html.length;
    const c = html[i];
    if (c === '>') return i;
    if (c === '/') {
      i += 1;
      continue;
    }
    while (i < html.length) {
      const ch = html[i];
      if (isSpace(ch) || ch === '=' || ch === '>' || ch === '/') break;
      i += 1;
    }
    while (i < html.length && isSpace(html[i])) i += 1;
    if (html[i] === '=') {
      i += 1;
      while (i < html.length && isSpace(html[i])) i += 1;
      const quote = html[i];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, i + 1);
        if (close < 0) return html.length;
        i = close + 1;
      } else {
        while (i < html.length && !isSpace(html[i]) && html[i] !== '>') i += 1;
      }
    }
  }
  return html.length;
}

/**
 * Every `<style>`/`<script>` element the HTML really has, in document order.
 *
 * Each slot is `{kind, start, end, openTag, body}` where `start…end` covers the
 * whole element (open tag through close tag) so the caller can replace it
 * wholesale. Only elements with a close tag are returned: an unterminated body
 * would have to be rewritten to the end of the document, and a Capture never
 * leaves one (the build's write pass restores truncated closing tags first).
 *
 * @param {string} html
 * @returns {{kind: 'style'|'script', start: number, end: number, openTag: string, body: string}[]}
 */
export function scanBodies(html) {
  /** @type {{kind: 'style'|'script', start: number, end: number, openTag: string, body: string}[]} */
  const slots = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    // Comments (and `<!doctype`, CDATA, bogus markup) hold no elements.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    TAG_NAME.lastIndex = lt + 1;
    const name = TAG_NAME.exec(html)?.[0]?.toLowerCase();
    if (name === undefined) {
      i = lt + 1;
      continue;
    }
    const gt = tagEnd(html, lt);
    if (gt >= html.length) break;
    if (name === 'svg') {
      // An SVG subtree holds SVG CSS (`<style>`) and no valid `<link>` — leave
      // the whole region alone rather than rewrite the inside of an icon.
      const end = html.indexOf('</svg', gt + 1);
      i = end < 0 ? gt + 1 : end;
      continue;
    }
    if (name === 'style' || name === 'script') {
      const close = CLOSE_TAG[name];
      close.lastIndex = gt + 1;
      const m = close.exec(html);
      if (m === null) break;
      slots.push({ kind: name, start: lt, end: m.index + m[0].length, openTag: html.slice(lt, gt + 1), body: html.slice(gt + 1, m.index) });
      i = m.index + m[0].length;
      continue;
    }
    i = gt + 1;
  }
  return slots;
}

/**
 * Whether a slot can become a file: a body above the inline threshold, and a
 * `<script>` that is code rather than data.
 * @param {{kind: string, openTag: string, body: string}} slot
 * @param {number} minBytes
 * @returns {boolean}
 */
function isExternalizable(slot, minBytes) {
  if (slot.body.length < minBytes) return false;
  if (slot.kind === 'style') return true;
  if (attrValue(rawAttr(slot.openTag, 'src')) !== null) return false;
  const type = (attrValue(rawAttr(slot.openTag, 'type')) ?? '').trim().toLowerCase().split(';')[0].trim();
  return !DATA_TYPES.has(type);
}

/** Grant `'self'` in the directives that govern the given kinds. */
function grantSelf(cspValue, kinds) {
  let out = cspValue;
  const granted = { style: false, script: false };
  for (const kind of ['style', 'script']) {
    if (!kinds[kind]) continue;
    const name = `${kind}-src`;
    const directive = new RegExp(`(?:^|;)\\s*${name}\\s+[^;]*`, 'i').exec(out);
    if (directive === null || /'self'/.test(directive[0])) {
      // Nothing to widen: a page with no such directive is governed by
      // `default-src 'none'`, and the caller keeps that kind inline.
      granted[kind] = directive !== null;
      continue;
    }
    out = out.replace(directive[0], `${directive[0].trimEnd()} 'self'`);
    granted[kind] = true;
  }
  return { value: out, granted };
}

/**
 * Rewrite every externalizable body into `/assets/<sha16>.css|.js` and point
 * the page at it, then widen the CSP so the browser will load it.
 *
 * The returned `files` map is keyed by file name, so a caller dedups across the
 * whole build by construction (identical bodies hash identically).
 *
 * @param {string} html
 * @param {{minBytes?: number}} [options]
 * @returns {{
 *   html: string,
 *   files: Map<string, {name: string, mime: string, bytes: Buffer}>,
 *   externalized: {style: number, script: number},
 *   kept: {style: number, script: number},
 *   blocked: string[],
 *   csp: string|null,
 *   bytesIn: number,
 *   bytesOut: number,
 * }}
 */
export function dedupeBodies(html, { minBytes = KEEP_INLINE_BYTES } = {}) {
  const externalized = { style: 0, script: 0 };
  const kept = { style: 0, script: 0 };
  const blocked = [];
  const files = new Map();

  const slots = scanBodies(html);
  const chosen = [];
  for (const slot of slots) {
    if (isExternalizable(slot, minBytes)) chosen.push(slot);
    else kept[slot.kind] += 1;
  }
  const wants = { style: chosen.some((s) => s.kind === 'style'), script: chosen.some((s) => s.kind === 'script') };
  if (!wants.style && !wants.script) {
    return { html, files, externalized, kept, blocked, csp: null, bytesIn: html.length, bytesOut: html.length };
  }

  // The CSP decides whether any of this is loadable; grant before rewriting.
  let csp = null;
  let granted = { style: false, script: false };
  /** @type {{start: number, end: number, text: string}[]} */
  const edits = [];
  const meta = cspMeta(html);
  if (meta === null) {
    blocked.push('no CSP meta — bodies left inline');
  } else {
    const raw = (CONTENT_ATTR_RE.exec(meta.tag) ?? [])[2];
    const value = attrValue(raw);
    if (value === null) {
      blocked.push('CSP meta has no content attribute — bodies left inline');
    } else {
      const result = grantSelf(value, wants);
      granted = result.granted;
      if (result.value !== value) {
        csp = result.value;
        const open = raw[0] === '"' || raw[0] === "'" ? raw[0] : '';
        const editedTag = meta.tag.replace(CONTENT_ATTR_RE, (_m, prefix) => `${prefix}${open}${result.value}${open}`);
        edits.push({ start: meta.index, end: meta.index + meta.tag.length, text: editedTag });
      }
      for (const kind of ['style', 'script']) {
        if (wants[kind] && !granted[kind]) blocked.push(`no ${kind}-src directive to grant — ${kind} bodies left inline`);
      }
    }
  }

  for (const slot of chosen) {
    if (!granted[slot.kind]) {
      kept[slot.kind] += 1;
      continue;
    }
    const mime = BODY_MIME[slot.kind];
    const ext = slot.kind === 'style' ? 'css' : 'js';
    const bytes = Buffer.from(slot.body, 'utf8');
    const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const name = `${sha}.${ext}`;
    if (!files.has(name)) files.set(name, { name, mime, bytes });
    externalized[slot.kind] += 1;
    const rest = slot.openTag.slice(1 + slot.kind.length, -1).replace(/\s*\/$/, '');
    edits.push({
      start: slot.start,
      end: slot.end,
      text: slot.kind === 'style'
        ? `<link rel=stylesheet href=/assets/${name}${rest}>`
        : `<script${rest} src=/assets/${name}></script>`,
    });
  }
  // Every edit is expressed in the ORIGINAL document's offsets — the CSP edit
  // changes the document's length, so applying them one at a time (as the first
  // version did) silently displaced every edit after the meta by the width of
  // the grant. One back-to-front pass over one edit list, or nothing.
  edits.sort((a, b) => a.start - b.start);
  let out = html;
  for (let i = edits.length - 1; i >= 0; i -= 1) {
    const edit = edits[i];
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return { html: out, files, externalized, kept, blocked, csp, bytesIn: html.length, bytesOut: out.length };
}
