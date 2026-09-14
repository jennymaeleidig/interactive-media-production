// Ticket 03: the **copy projection** — the prose the Recreation reproduces —
// and the live-versus-served comparison built on it.
//
// The projection is a pure function of one page's HTML. Prose is the text of
// the block elements a reader reads as prose: `h1`–`h6`, `p`, `li`, and
// `blockquote`, in document order, one run per block. Everything else is not
// prose: a bare `<div>`'s text is layout (nav wrappers, buttons, badges), and
// `script`, `style`, `noscript`, `svg`, `template` and comment bodies are never
// read. Only the *outermost* prose element counts, so a `<li>` that wraps its
// text in a `<div>` (the nav's shape) is one run, not two, and a `<blockquote>`
// of paragraphs is one run, not one per paragraph. Text normalizes to what a
// reader sees: character references are decoded by the HTML5 parser and every
// run of whitespace — newlines, tabs, `&nbsp;`, the Capture's indent spaces —
// collapses to one space and trims.
//
// The HTML5 parser is not an implementation detail. The Capture is SingleFile's
// re-serialization of a live DOM and upstream is Webflow's output, so the same
// visible page arrives with different tag balance — the served homepage leaves
// `<li>` unclosed where live closes it, and the Capture froze a split-word
// heading as `<h2><div class=word>…</div></h2>` where live ships plain
// `<h2>text</h2>`. A tag-by-tag scanner reads those serialization differences
// as prose differences; the tree constructor applies the same implied end tags
// to both, so the projection depends on what renders, not on which serializer
// wrote it.
//
// The comparison is between two projections, NEVER between raw bytes. The tree
// is a deliberate lossy transform of the Capture: the strip pass removes the
// sign-in link, the chat launcher, the OneTrust stack and the Qualified offer;
// links are rewritten; stylesheet and script bodies are deduped; six layers are
// injected. Live bytes and served bytes therefore cannot match by construction,
// and a raw-byte diff would report the transform itself as drift.
//
// The worked false positive, on the record so nobody rediscovers it: the live
// nav's `users.flocksafety.com` "Sign In" link is absent from our tree because
// the strip pass removed it, not because we are stale. It is logged at 1,404
// bytes on the homepage in `served/build-log.json` under "account sign-in
// link". A raw-byte (or whole-page-text) diff fires on it on every page that
// carries the nav; the copy projection does not, because the link is a `<div>`
// inside layout (`button_group is-nav`), not the text of a heading, paragraph,
// list item or blockquote. Any future "live versus ours" idea must answer that
// case first.
//
// The fix, and the measurement that proves it (the hand-run measurement of
// 2026-09-13, recorded on ticket 03): the first run compared 1,181 served pages
// and reported 541 differing. The tree was not 541 pages stale — the projection
// was wrong: 539 of those 541 were runtime-filled regions the Capture froze
// populated and a raw live fetch carries as a template. The exclusions below
// remove them in three measured steps — excluding Webflow's table of contents
// left 11 findings, adding Finsweet's filter empty state left 5, and excluding
// the ATS-backed jobs list, the event speaker popup and the Wistia player left
// exactly 2. Both are real upstream copy edits: `/careers` ("We Aspire
// Fearlessly…" became "We Work Hard…") and `/products/license-plate-readers` (a
// paragraph added). That is the steady state the projection promises: an empty
// report means nothing moved, and a non-empty one is a page a human should
// read.
//
// What the copy projection is blind to, by design: chrome (nav/footer) text
// that lives in non-prose containers, which ticket 04's chrome projection and
// its allow-list own, and any change inside a runtime-filled region — the live
// side the watch can fetch never carries one. That is the price of a projection
// that does not fire on the transform or the fetch difference.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { parse } from 'parse5';

/**
 * The element types that count as prose, in the module's declared rule. The
 * projection's vocabulary, exported so a reader can see the rule rather than
 * infer it from the walk.
 * @type {readonly string[]}
 */
export const PROSE_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote'];

/** @type {Set<string>} */
const PROSE = new Set(PROSE_ELEMENTS);

/**
 * Elements whose text content is not prose and is never read: code (both
 * executable and data), vector graphics, the document title, and inert
 * `<template>` markup.
 * @type {Set<string>}
 */
export const SKIPPED = new Set(['script', 'style', 'noscript', 'svg', 'template', 'title', 'math']);

/** Void elements: no close tag exists, so their text is a separator. */
export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Block-level elements. A reader sees their text on separate lines, so they
 * contribute whitespace to a run; the Capture writes adjacent blocks with no
 * whitespace between the tags (`<div>Products</div><div>Back</div>`), which
 * would otherwise glue two words into one.
 */
export const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'details', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hgroup', 'hr', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video',
]);

/** @typedef {import('parse5').DefaultTreeAdapterTypes.Node} HtmlNode */
/** @typedef {import('parse5').DefaultTreeAdapterTypes.Element} HtmlElement */

/**
 * One live-versus-served comparison: the run(s) the served page carried and the
 * run(s) live carries in their place. An insertion has no `served` runs, a
 * deletion no `live` runs, and a changed paragraph both.
 * @typedef {Object} CopyHunk
 * @property {string[]} served
 * @property {string[]} live
 */

/**
 * One page whose prose differs, naming the path and the differing runs — never
 * a page-level boolean.
 * @typedef {Object} CopyFinding
 * @property {string} path
 * @property {CopyHunk[]} hunks
 */

/**
 * The copy tier as the run report carries it: the counts and the findings, with
 * no digests — those are baseline state, not report state.
 * @typedef {Object} CopyTier
 * @property {number} compared
 * @property {number} differed
 * @property {CopyFinding[]} findings
 */

/**
 * One page fed to the comparison: the served bytes and the live bytes for the
 * same URL. The two sides are projected independently; no raw byte ever crosses
 * the comparison.
 * @typedef {Object} CopyPage
 * @property {string} path
 * @property {string} served
 * @property {string} live
 */

/**
 * One run's text as a reader sees it: the parser has already decoded character
 * references, so this only collapses whitespace and trims. `\s` covers
 * `\u00a0`, so `&nbsp;` and a literal non-breaking space normalize alike; the
 * zero-width characters (`\u200b`–`\u200d`, `\ufeff`) collapse too, because
 * this corpus writes them as empty paragraphs and a reader sees nothing.
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text.replace(/[\s\u200b\u200c\u200d\ufeff]+/g, ' ').trim();
}

/**
 * Whether a node is a region the live page fills at runtime, or a third-party
 * widget's own text. The Capture is a post-script DOM; a raw live fetch is
 * pre-script, so it carries the template rather than the populated result. Such
 * a region is chrome the projection must not read, or the generator is reported
 * as drift on every page that carries it.
 *
 * The measured cases (2026-09-13, over the committed tree):
 *
 *   `data-toc`                     Webflow's table of contents — one template
 *                                  `<li>` in raw HTML, the page's headings in
 *                                  the Capture. 430-odd pages.
 *   `fs-cmsfilter-element="empty"` Finsweet's CMS filter empty state — moved
 *                                  relative to the list by script. 6 pages.
 *   `data-user`                    the event popup template (`/gsx`) — Lorem
 *                                  ipsum in raw HTML, speaker bios in the
 *                                  Capture. 1 page.
 *   `data-job-name`                the Ashby-backed jobs list
 *                                  (`/careers/positions`) — populated by script
 *                                  from the ATS, absent from raw HTML. 1 page.
 *   `wistia-player`                the Wistia player's own markup, including the
 *                                  transcript it preloads as visible text. 1
 *                                  page.
 *
 * Excluding these is a deliberate blind spot: the watch cannot see a change
 * inside a runtime-filled region, because the live side it can fetch never
 * carries one. Rendering live pages to compare them is out of scope (it needs a
 * browser, and the retired refresh workflow's Docker half is the reason).
 * @param {HtmlNode} node
 * @returns {boolean}
 */
const RUNTIME_FILLED_ATTRS = new Set(['data-toc', 'data-user', 'data-job-name']);

/** @param {HtmlNode} node @returns {boolean} */
export function isGenerated(node) {
  if ('tagName' in node && node.tagName === 'wistia-player') return true;
  if (!('attrs' in node)) return false;
  return node.attrs.some((attr) => RUNTIME_FILLED_ATTRS.has(attr.name) || (attr.name === 'fs-cmsfilter-element' && attr.value === 'empty'));
}

/**
 * Accumulate the text a prose run renders, skipping the subtrees whose text is
 * not prose. `<br>` splits words the reader sees apart, so void elements
 * contribute a space.
 * @param {HtmlNode} node
 * @param {string[]} parts
 * @returns {void}
 */
function collectText(node, parts) {
  if ('value' in node) {
    parts.push(node.value);
    return;
  }
  if (!('tagName' in node) || !('childNodes' in node)) return;
  if (SKIPPED.has(node.tagName) || isGenerated(node)) return;
  if (VOID.has(node.tagName)) {
    parts.push(' ');
    return;
  }
  const block = BLOCK.has(node.tagName);
  if (block) parts.push(' ');
  for (const child of node.childNodes) collectText(child, parts);
  if (block) parts.push(' ');
}

/**
 * The outermost prose elements in document order. A prose element's own run is
 * taken whole and its descendants are not descended into, so nested prose is
 * part of its parent's run rather than a second one.
 * @param {HtmlNode} node
 * @param {string[]} runs
 * @returns {void}
 */
function collectRuns(node, runs) {
  if (!('childNodes' in node)) return;
  for (const child of node.childNodes) {
    if ('tagName' in child && isGenerated(child)) continue;
    if ('tagName' in child && PROSE.has(child.tagName)) {
      /** @type {string[]} */
      const parts = [];
      collectText(child, parts);
      const text = normalize(parts.join(''));
      if (text !== '') runs.push(text);
      continue;
    }
    collectRuns(child, runs);
  }
}

/**
 * The copy projection of one page: its prose, in document order, one run per
 * heading, paragraph, list item or blockquote. Pure — same HTML in, same runs
 * out, and nothing but the HTML decides.
 * @param {string} html
 * @returns {string[]}
 */
export function copyRuns(html) {
  /** @type {string[]} */
  const runs = [];
  collectRuns(parse(String(html)), runs);
  return runs;
}

/**
 * A stable digest of one page's copy projection, for the baseline row. Over the
 * normalized runs — the projection, not the bytes — so a link rewrite or an
 * injected layer cannot move it, and truncated to 16 hex characters because it
 * detects change, it does not secure anything.
 * @param {string[]} runs
 * @returns {string}
 */
export function copyDigest(runs) {
  return createHash('sha256').update(JSON.stringify(runs)).digest('hex').slice(0, 16);
}

/**
 * One page's finding, or null when the two projections agree. The two sides
 * are runs, not bytes, so a projection made once can be diffed against itself.
 * @param {string} path
 * @param {string[]} servedRuns
 * @param {string[]} liveRuns
 * @returns {CopyFinding|null}
 */
function findingFor(path, servedRuns, liveRuns) {
  const hunks = copyDiff(servedRuns, liveRuns);
  return hunks.length === 0 ? null : { path, hunks };
}

/**
 * One page's finding from the two pages' HTML, or null when they agree.
 * Projects each side independently — the served bytes and the live bytes never
 * touch.
 * @param {string} path
 * @param {string} servedHtml
 * @param {string} liveHtml
 * @returns {CopyFinding|null}
 */
export function copyFinding(path, servedHtml, liveHtml) {
  return findingFor(path, copyRuns(servedHtml), copyRuns(liveHtml));
}

/**
 * The difference between two projections: the served runs live no longer
 * carries and the live runs it carries in their place, grouped into hunks.
 * An identical pair diffs to an empty list. Order is preserved — a run that
 * moved is a deletion plus an insertion, not silence — via a longest-common-
 * subsequence walk, so an inserted paragraph does not shift every run after it
 * into a spurious difference.
 * @param {string[]} servedRuns
 * @param {string[]} liveRuns
 * @returns {CopyHunk[]}
 */
export function copyDiff(servedRuns, liveRuns) {
  const n = servedRuns.length;
  const m = liveRuns.length;
  if (n * m > 4_000_000) {
    const hunk = coarseHunk(servedRuns, liveRuns);
    return hunk.served.length + hunk.live.length > 0 ? [hunk] : [];
  }

  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = servedRuns[i] === liveRuns[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  /** @type {CopyHunk[]} */
  const hunks = [];
  /** @type {CopyHunk|null} */
  let hunk = null;
  const endHunk = () => {
    if (hunk !== null) hunks.push(hunk);
    hunk = null;
  };
  const push = (/** @type {'served'|'live'} */ side, /** @type {string} */ run) => {
    if (hunk === null) hunk = { served: [], live: [] };
    hunk[side].push(run);
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (servedRuns[i] === liveRuns[j]) {
      endHunk();
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      push('served', servedRuns[i]);
      i += 1;
    } else {
      push('live', liveRuns[j]);
      j += 1;
    }
  }
  while (i < n) {
    push('served', servedRuns[i]);
    i += 1;
  }
  while (j < m) {
    push('live', liveRuns[j]);
    j += 1;
  }
  endHunk();
  return hunks;
}

/**
 * The one-hunk fallback for a page too large for the LCS table: the shared
 * prefix and suffix are trimmed and everything between them is one hunk. Less
 * precise than the LCS walk, never wrong about which page differed.
 * @param {string[]} servedRuns
 * @param {string[]} liveRuns
 * @returns {CopyHunk}
 */
function coarseHunk(servedRuns, liveRuns) {
  let head = 0;
  const shortest = Math.min(servedRuns.length, liveRuns.length);
  while (head < shortest && servedRuns[head] === liveRuns[head]) head += 1;
  let servedEnd = servedRuns.length;
  let liveEnd = liveRuns.length;
  while (servedEnd > head && liveEnd > head && servedRuns[servedEnd - 1] === liveRuns[liveEnd - 1]) {
    servedEnd -= 1;
    liveEnd -= 1;
  }
  return { served: servedRuns.slice(head, servedEnd), live: liveRuns.slice(head, liveEnd) };
}

/**
 * The whole run's copy comparison: how many pages were compared, how many
 * differed, the findings, and — for the baseline row — each live page's
 * projection digest. Pure: every finding is a function of the pages handed in,
 * and each side is projected exactly once.
 * @param {CopyPage[]} pages
 * @returns {CopyTier & {digests: Record<string, string>}}
 */
export function copyReport(pages) {
  /** @type {CopyFinding[]} */
  const findings = [];
  /** @type {Record<string, string>} */
  const digests = {};
  for (const page of pages) {
    const servedRuns = copyRuns(page.served);
    const liveRuns = copyRuns(page.live);
    const finding = findingFor(page.path, servedRuns, liveRuns);
    if (finding !== null) findings.push(finding);
    digests[page.path] = copyDigest(liveRuns);
  }
  return { compared: pages.length, differed: findings.length, findings, digests };
}
