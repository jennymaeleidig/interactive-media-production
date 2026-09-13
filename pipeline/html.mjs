// The capture HTML's source text: the rules that read it, in one place.
//
// The strip audit (`audit.mjs`) is the only reader. It needs three views of a
// page's markup: its open tags, one attribute of one of them, and its `srcdoc`
// payloads — a nested document that must never be read as page markup.
//
// Two of these rules are regressions, not descriptions. Each is a failure mode a
// pass hit when it owned its own scanner (ticket 12):
//
//   1. A multi-megabyte *unquoted* attribute value. SingleFile writes a video's
//      `src=data:video/mp4;base64,…` unquoted; the regex alternation for the same
//      job recursed once per scanned unit of the value and overflowed the
//      engine's stack. `openTags` is a scanner, and walks it.
//   2. A nested document in `srcdoc`. A scanner that lets any `"` open a quoted
//      section swallows the nested `<iframe srcdoc=…>` whole and reads the inner
//      document's markup as the page's. `srcdocSpans` reads the escaped payload
//      for what it is, and the tag-end walk below ends a tag at its own `>`.
//
// The third rule is why `attrOf` is exact: the frozen tree carries
// `<div class=grecaptcha-badge data-style=bottomright style="…">` (145 times),
// where a loose name rule reads the *suffixed* `data-style` as `style`. The audit
// needs the real attribute — a blocked URL's `data-src` must not read as `src`.
//
// SPDX-License-Identifier: CC0-1.0

/** An open tag. Names may carry hyphens — custom elements like `<wistia-player>`. */
const OPEN_TAG = /<([a-z][a-z0-9-]*)/gi;

/**
 * The end of the open tag at `lt`: a quote runs to its partner with `indexOf`,
 * and either `<` or `>` outside one ends the attempt.
 *
 * The quote walk is the point. The captures are full of UNQUOTED values whose
 * text contains quotes — `style=background-image:url(&quot;/assets/x.png&quot;)`
 * — and a rule that let the first `"` open a quoted section ran past the tag's
 * own `>` into the next tag entirely (and made a rewrite disagree with itself on
 * a second run). A tag with no quote in it ends at its first `>`.
 *
 * @param {string} html
 * @param {number} lt index of the `<`
 * @returns {number} index of the `>`, or -1 when this `<` starts no tag
 */
function tagEnd(html, lt) {
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

/**
 * Iterate the open tags of an HTML string: the tag name, the raw attribute text,
 * and where the tag sits. Steps over nothing — a caller that needs script bodies
 * left alone strips them first.
 *
 * @param {string} html
 * @returns {Generator<{name: string, attrs: string, index: number, tag: string}>}
 */
export function* openTags(html) {
  const start = new RegExp(OPEN_TAG.source, 'gi');
  let m;
  while ((m = start.exec(html)) !== null) {
    const end = tagEnd(html, m.index + m[0].length);
    if (end < 0) {
      start.lastIndex = m.index + 1;
      continue;
    }
    yield { name: m[1], attrs: html.slice(m.index + m[0].length, end), index: m.index, tag: html.slice(m.index, end + 1) };
    start.lastIndex = end + 1;
  }
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

/**
 * Read an attribute's value, requiring the name to be complete: the
 * `(?<![\w-])` guard keeps `data-src` from reading as `src`, and keeps the
 * corpus's `data-style` from reading as `style`. This is the exact reader; a
 * caller that wants the loose `\b` reading has to ask for it deliberately,
 * because the frozen bytes carry both shapes.
 * @param {string} attrs
 * @param {string} name
 * @returns {string|null} the value, or null when absent
 */
export function attrOf(attrs, name) {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}
