// The capture HTML's source text: one home for the rules that read it.
//
// Three passes grew their own way of reading the Capture's markup — the write
// pass (`build.mjs`), the embed pass (`embeds.mjs`), and the dedupe pass
// (`dedupe.mjs`) — and the three disagree in ways that have each cost a bug
// (ticket 12: a scanner that let an unquoted `&quot;` open a quoted section
// swallowed 83KB of one page and rewrote a *nested* document's stylesheets;
// ticket 12 again: the regex alternation for the same job overflowed the
// engine's stack on a multi-megabyte unquoted `data:` URI). This module keeps
// every rule in one place so a new pass imports a view instead of deriving a
// fourth scanner.
//
// The dialects are kept, not merged. Each is a property of the bytes the frozen
// tree was built from (ADR 0004 — the Captures are gone, so a dialect cannot be
// re-validated against them and a silent change would break the recipe):
//
//   tag end      `bodySlots` tokenizes attributes the way the HTML parser does
//                (`tagEnd`, the careful rule); `openTags(html, 'guarded')`
//                scans to the first `>` outside quotes; `openTags(html,
//                'backtracking')` reproduces the `(?:[^<>"]|"[^"]*"|'[^']*')*`
//                alternation the write pass has always used, backtracking
//                semantics included.
//   attr name    `attrValue` is the write pass's `\b` rule; `attrOf` is the
//                embed pass's `(?<![\w-])` guard; `rawAttr` is the dedupe pass's
//                `(?:^|\s)` rule. They are NOT interchangeable even though all
//                three usually agree: a real page carries
//                `<div class=grecaptcha-badge data-style=bottomright style=…>`
//                (145 times across the frozen tree), where the `\b` rule reads
//                `data-style` as `style` and the guarded rule reads the real
//                attribute. The frozen bytes were produced under the loose
//                rule, so the loose rule is what stays.
//   skip zones   `contentSegments` (the write pass) holds `<style>`/`<script>`
//                bodies, comments, and `srcdoc` payloads out of the DOM scan;
//                `bodySlots` additionally steps over comments, bogus markup,
//                and whole `<svg>` subtrees. `openTags` steps over nothing —
//                it is a scanner, and its callers decide.
//
// SPDX-License-Identifier: CC0-1.0

/** A tag name as it appears in the source, sticky at a `<`. */
const TAG_NAME = /[a-z][a-z0-9-]*/iy;
/** The write pass's open-tag pattern: no hyphen in the name, so the scanner built on it sees `<wistia-player>` as `wistia` + attrs `-player …` (harmless — see `openTags`). */
const LOOSE_TAG = /<([a-z][a-z0-9]*)/gi;
/** The embed pass's open-tag pattern: names may carry hyphens (custom elements). */
const GUARDED_TAG = /<([a-z][a-z0-9-]*)/gi;
/** Close tags for the two elements whose body is not markup. */
const CLOSE_TAG = { style: /<\/style\s*>/gi, script: /<\/script\s*>/gi };

// ---- tag ends ----------------------------------------------------------------

/**
 * The end of the open tag that starts at `lt`: the `>` that closes it, found by
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
export function tagEnd(html, lt) {
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
 * The end of the open tag at `lt` under the `backtracking` dialect: the
 * write pass's `(?:[^<>"]|"[^"]*"|'[^']*')*` alternation, reproduced as a walk
 * with its backtracking semantics intact — a `"` opens a run only if a closing
 * `"` exists (anywhere, `>` or not), a `'` that finds no partner is consumed as
 * an ordinary character, and `<` always ends the attempt.
 * @returns {number} index of the `>`, or -1 when this `<` starts no tag
 */
function looseTagEnd(html, lt) {
  let i = lt;
  while (i < html.length) {
    const c = html[i];
    if (c === '"') {
      const close = html.indexOf('"', i + 1);
      if (close === -1) return -1;
      i = close + 1;
    } else if (c === "'") {
      const close = html.indexOf("'", i + 1);
      i = close === -1 ? i + 1 : close + 1;
    } else if (c === '>') {
      return i;
    } else if (c === '<') {
      return -1;
    } else {
      i += 1;
    }
  }
  return -1;
}

/**
 * The end of the open tag at `lt` under the `guarded` dialect (the embed
 * pass's scanner): a quote runs to its partner with `indexOf`, and either `<`
 * or `>` outside one ends the attempt.
 * @returns {number} index of the `>`, or -1 when this `<` starts no tag
 */
function guardedTagEnd(html, lt) {
  let i = lt;
  while (i < html.length) {
    const c = html[i];
    if (c === '"' || c === "'") {
      const close = html.indexOf(c, i + 1);
      if (close === -1) return -1;
      i = close + 1;
    } else if (c === '>' || c === '<') {
      break;
    } else {
      i += 1;
    }
  }
  return html[i] === '>' ? i : -1;
}

// ---- the views ---------------------------------------------------------------

/**
 * Iterate the open tags of an HTML string: the tag name, the raw attribute
 * text, and where the tag sits.
 *
 * Two dialects, named for the pass that has always used them:
 *   `guarded` (default) — the embed pass's scanner. A scanner, not a regex,
 *     because the equivalent alternation overflows the regex engine's stack on
 *     a multi-megabyte *unquoted* attribute value: SingleFile writes a video's
 *     `src=data:video/mp4;base64,…` unquoted, and the engine recurses once per
 *     scanned unit of the value (ticket 12). Steps over nothing — callers that
 *     need script bodies ignored strip them first.
 *   `backtracking` — the write pass's `openTagRe()`. Same yield shape, so a
 *     caller can move between them without rewriting its body.
 *
 * @param {string} html
 * @param {'guarded'|'backtracking'} [dialect]
 * @returns {Generator<{name: string, attrs: string, index: number, tag: string}>}
 */
export function* openTags(html, dialect = 'guarded') {
  if (dialect === 'backtracking') {
    const start = new RegExp(LOOSE_TAG.source, 'gi');
    let m;
    while ((m = start.exec(html)) !== null) {
      const end = looseTagEnd(html, m.index + m[0].length);
      if (end < 0) {
        start.lastIndex = m.index + 1;
        continue;
      }
      yield { name: m[1], attrs: html.slice(m.index + m[0].length, end), index: m.index, tag: html.slice(m.index, end + 1) };
      start.lastIndex = end + 1;
    }
    return;
  }
  const start = new RegExp(GUARDED_TAG.source, 'gi');
  let m;
  while ((m = start.exec(html)) !== null) {
    const end = guardedTagEnd(html, m.index + m[0].length);
    if (end < 0) {
      start.lastIndex = m.index + 1;
      continue;
    }
    yield { name: m[1], attrs: html.slice(m.index + m[0].length, end), index: m.index, tag: html.slice(m.index, end + 1) };
    start.lastIndex = end + 1;
  }
}

/**
 * Rewrite every open tag of `html` through `map(tag, name, attrs) → tag`, in
 * document order, leaving quoted values and skip zones to the tokenizer.
 * The `backtracking` dialect (see `openTags`).
 * @param {string} html
 * @param {(tag: string, name: string, attrs: string) => string} map
 * @returns {string}
 */
export function replaceTags(html, map) {
  let out = '';
  let pos = 0;
  for (const tag of openTags(html, 'backtracking')) {
    out += html.slice(pos, tag.index) + map(tag.tag, tag.name, tag.attrs);
    pos = tag.index + tag.tag.length;
  }
  return out + html.slice(pos);
}

// Zones whose contents are never page DOM: <style>/<script> bodies (the
// inlined site CSS is full of `opacity:0` declarations — corpus scan: 15 on
// one post), comments, and srcdoc-embedded documents (the frozen scheduler
// iframe). Mutations apply to content segments only.
const SKIP_ZONE = /(<style[^>]*>[\s\S]*?<\/style\s*>|<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->|\bsrcdoc\s*=\s*"[^"]*")/gi;

/**
 * Apply `map` to the content segments of `html` (odd split indexes are skip
 * zones). The write pass's view: everything that is page DOM, and nothing that
 * is code, comment, or a nested document.
 * @param {string} html
 * @param {(segment: string) => string} map
 * @returns {string}
 */
export function contentSegments(html, map) {
  const parts = html.split(SKIP_ZONE);
  for (let i = 0; i < parts.length; i += 2) parts[i] = map(parts[i]);
  return parts.join('');
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
 * Steps over what cannot hold a page element: comments and bogus markup, and a
 * whole `<svg>` subtree — an SVG holds SVG CSS (`<style>`) and no valid
 * `<link>`, so the region is left alone rather than rewritten.
 *
 * @param {string} html
 * @returns {{kind: 'style'|'script', start: number, end: number, openTag: string, body: string}[]}
 */
export function bodySlots(html) {
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
 * Every `srcdoc` attribute span in the page: the tag that carries it, the
 * attribute value, and where the tag ends. `srcdoc` values are HTML-escaped, so
 * a raw `"` cannot appear inside one and the first quote ends the value.
 * @param {string} html
 * @returns {Array<{tagStart: number, tagEnd: number, tag: string, value: string}>}
 */
export function srcdocSpans(html) {
  const spans = [];
  const re = /\bsrcdoc\s*=\s*"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const valueStart = m.index + m[0].length;
    const valueEnd = html.indexOf('"', valueStart);
    if (valueEnd === -1) continue;
    const tagStart = html.lastIndexOf('<', m.index);
    const tagEnd = html.indexOf('>', valueEnd);
    if (tagStart === -1 || tagEnd === -1) continue;
    spans.push({ tagStart, tagEnd: tagEnd + 1, tag: html.slice(tagStart, tagEnd + 1), value: html.slice(valueStart, valueEnd) });
  }
  return spans;
}

// ---- attributes --------------------------------------------------------------

/**
 * Read an attribute's value from an open tag's attribute string, honoring
 * quoting. The write pass's rule (`\b`), kept because the frozen bytes were
 * produced with it: it also matches a *suffixed* attribute, so
 * `attrValue(attrs, 'style')` returns `bottomright` for
 * `<div data-style=bottomright style="…">`. Use `attrOf` when the name must
 * match exactly.
 * @param {string} attrs
 * @param {string} name
 * @returns {string|null} the value, or null when absent
 */
export function attrValue(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

/**
 * Read an attribute's value, requiring the name to be complete: the
 * `(?<![\w-])` guard keeps `data-src` from reading as `src`. The embed pass's
 * rule — the exact one. See `attrValue` for the loose rule and why both exist.
 * @param {string} attrs
 * @param {string} name
 * @returns {string|null} the value, or null when absent
 */
export function attrOf(attrs, name) {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

/**
 * The raw value of one attribute of an open tag, **quotes kept**, or null. Pass
 * 14's rule: the attribute must start the tag or follow whitespace, so a
 * suffixed name never matches. Pair with `unquote` to get the value text.
 * @param {string} openTag
 * @param {string} name
 * @returns {string|null}
 */
export function rawAttr(openTag, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i').exec(openTag);
  return m === null ? null : m[1];
}

/** An attribute value with its delimiters stripped, or null. */
export function unquote(value) {
  if (value === undefined || value === null) return null;
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

/** Presence of an attribute, bare (`data-split-title`) or valued (`data-x=v`). */
export function hasAttr(attrs, name) {
  return new RegExp(`\\b${name}(?=\\s*=|[\\s/>]|$)`, 'i').test(attrs);
}

/**
 * Rewrite attribute `name` of an open `tag` through `edit(value) → value`.
 * An empty result drops the attribute whole; an unchanged result returns the
 * tag untouched; a missing attribute returns null.
 */
export function editAttr(tag, name, edit) {
  const m = new RegExp(`(\\b${name}\\s*=\\s*)("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return null;
  const quote = m[2][0] === '"' || m[2][0] === "'" ? m[2][0] : '';
  const raw = quote ? m[2].slice(1, -1) : m[2];
  const next = edit(raw);
  if (next === raw) return tag;
  if (next === '') {
    let start = m.index;
    while (start > 0 && /\s/.test(tag[start - 1])) start -= 1;
    return tag.slice(0, start) + tag.slice(m.index + m[0].length);
  }
  const value = quote ? quote + next + quote : next;
  return tag.slice(0, m.index) + m[1] + value + tag.slice(m.index + m[0].length);
}

/** Append an attribute (full `name` or `name=value` text) before an open tag's closing `>` (slash-aware). */
export function addAttr(tag, attr) {
  const m = /\s*\/?>$/.exec(tag);
  return tag.slice(0, m.index) + ` ${attr}` + m[0];
}
