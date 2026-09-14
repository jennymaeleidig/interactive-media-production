// Ticket 04: the **chrome projection** — nav, footer and global chrome text —
// and the allow-list that absorbs exactly the regions our strip pass removed.
//
// The copy projection (ticket 03) is the prose and stays a hard finding. This
// projection is its complement: the text in non-prose containers — nav
// wrappers, footer links, buttons, badges — which the copy projection is blind
// to by design. A raw chrome diff is permanently non-empty: the strip pass
// removed the sign-in link, the chat launcher, the OneTrust stack and the
// Qualified offer, so live always carries text the tree does not. The
// allow-list is the measurement of that delta, named after the strip table's
// eleven targets — the same vocabulary `served/build-log.json` logs per page —
// and a region one of its entries masks is *counted*, never silently dropped,
// so an entry masking real drift shows up as a growing count rather than as
// silence.
//
// The motivating false positive, on the record so nobody rediscovers it: the
// live nav's `users.flocksafety.com` "Sign In" link is absent from our tree
// because the strip pass removed it by class, not because we are stale. It is
// logged at 1,404 bytes on the homepage under "account sign-in link".
//
// Two rules keep the allow-list honest:
//
//   * The served side is never masked. A strip target accidentally left in our
//     tree must surface as a served-only finding, not be hidden by the
//     allow-list that explains the live side.
//   * The entries are data with their measurement attached, in the spirit of
//     `pipeline/audit.mjs`'s media allow-list, and a test cross-checks each
//     measurement against `served/build-log.json` so the literal cannot drift
//     from the log it came from.
//
// SPDX-License-Identifier: CC0-1.0
import { parse } from 'parse5';
import { BLOCK, isGenerated, normalize, PROSE_ELEMENTS, SKIPPED, VOID } from './upstream-copy.mjs';
import { copyDiff, projectionDigest } from './upstream-copy.mjs';

/** @typedef {import('parse5').DefaultTreeAdapterTypes.Node} HtmlNode */

/** @type {Set<string>} */
const PROSE = new Set(PROSE_ELEMENTS);

const SITE_ORIGIN = 'https://www.flocksafety.com';

/**
 * How an allow-list entry recognizes the DOM the retired strip pass removed.
 * Every field present must hold (AND semantics). `contentRe` is tested against
 * the element's whole text content, the way the retired `contentRe`-keyed
 * targets were; `hrefHost` resolves the anchor's href against the site origin
 * so protocol-relative and absolute references match alike.
 * @typedef {Object} ChromeMatch
 * @property {string} tag
 * @property {string} [id]
 * @property {string} [idPrefix]
 * @property {string[]} [classAny]  matches when the element carries any one
 * @property {string[]} [hrefHost]
 * @property {RegExp} [contentRe]
 */

/**
 * One allow-list entry: the strip target's name, the measurement that put it
 * there (`pages` carrying the target and the homepage's stripped `bytes`), and
 * the matcher. `measured.bytes` is 0 for a target the retired build named but
 * never observed, because the strip pass logged only nonzero removals.
 * @typedef {Object} ChromeAllowEntry
 * @property {string} name
 * @property {{pages: number, bytes: number}} measured
 * @property {ChromeMatch} match
 */

/** One entry's masked regions in a run: how many, and how many chrome-text
 * characters they carried. @typedef {Object} ChromeHit @property {number} regions @property {number} chars */

/**
 * One page whose chrome differs, naming the path and the differing runs. Reuses
 * the copy projection's hunk shape so the two tiers cannot disagree on what a
 * difference is.
 * @typedef {import('./upstream-copy.mjs').CopyFinding} ChromeFinding
 */

/**
 * The chrome tier as the run report carries it: the counts, the findings and
 * the allow-list hits. The per-page digest state lives on the baseline row
 * (ticket 05); `chromeReport` also returns it so the run can record it.
 * @typedef {Object} ChromeTier
 * @property {number} compared
 * @property {number} differed
 * @property {ChromeFinding[]} findings
 * @property {Array<{name: string} & ChromeHit>} hits
 */

/**
 * The digest of one page's **live** chrome, over the allow-list-masked runs —
 * the projection the chrome comparison actually compares. Recorded on the
 * baseline row so `since.changed` can report that the live page's chrome moved
 * since the last accepted baseline, independently of whether the frozen tree
 * still matches. Sixteen hex characters, matching the copy and asset digests.
 * @param {string[]} runs
 * @returns {string}
 */
export function chromeDigest(runs) {
  return projectionDigest(runs);
}

/**
 * The allow-list, in the strip table's order. Nine of the eleven targets are the
 * ones `served/build-log.json` logs per page; `onetrust-banner-sdk` and
 * `onetrust-pc-sdk` are named by the strip table but never observed in the log
 * (they were stripped before the log sampled, and stripPass logged only nonzero
 * removals), so their measured bytes are 0. The two `qualified header-*` keys
 * the homepage log carries are attribute cleanups, not strip targets, and are
 * deliberately not entries.
 * @type {ChromeAllowEntry[]}
 */
export const CHROME_ALLOW_LIST = [
  {
    name: 'qualified-offer-host',
    measured: { pages: 1181, bytes: 125744 },
    match: { tag: 'div', idPrefix: '_qualified-offer-host-' },
  },
  {
    name: 'q-root (chat launcher)',
    measured: { pages: 1181, bytes: 2289589 },
    match: { tag: 'q-root' },
  },
  {
    name: 'q-focus-sentinel',
    measured: { pages: 1181, bytes: 428 },
    match: { tag: 'q-focus-sentinel' },
  },
  {
    name: 'qualified-offer-style-element',
    measured: { pages: 1181, bytes: 93362 },
    match: { tag: 'style', idPrefix: 'qualified-offer-' },
  },
  {
    name: 'qualified-offer CSS (bare style)',
    measured: { pages: 1181, bytes: 2218 },
    match: { tag: 'style', contentRe: /qualified-offer-/ },
  },
  {
    name: 'onetrust-pc-dark-filter',
    measured: { pages: 1181, bytes: 106 },
    match: { tag: 'div', classAny: ['onetrust-pc-dark-filter'] },
  },
  {
    name: 'onetrust-consent-sdk (empty root)',
    measured: { pages: 1181, bytes: 48684 },
    match: { tag: 'div', id: 'onetrust-consent-sdk' },
  },
  {
    name: 'onetrust-banner-sdk',
    measured: { pages: 0, bytes: 0 },
    match: { tag: 'div', id: 'onetrust-banner-sdk' },
  },
  {
    name: 'onetrust-pc-sdk',
    measured: { pages: 0, bytes: 0 },
    match: { tag: 'div', id: 'onetrust-pc-sdk' },
  },
  {
    name: 'onetrust-style',
    measured: { pages: 1181, bytes: 112176 },
    match: { tag: 'style', id: 'onetrust-style' },
  },
  {
    name: 'account sign-in link',
    measured: { pages: 1180, bytes: 1404 },
    match: { tag: 'a', hrefHost: ['users.flocksafety.com', 'login.flocksafety.com'], classAny: ['button', 'footer-5_link', 'sign-in'] },
  },
];

/** @param {HtmlNode} node @param {string} name @returns {string|undefined} */
function attr(node, name) {
  if (!('attrs' in node)) return undefined;
  return node.attrs.find((a) => a.name === name)?.value;
}

/** Every text node under `node`, in document order. @param {HtmlNode} node @returns {string} */
function textContent(node) {
  if ('value' in node) return node.value;
  if (!('childNodes' in node)) return '';
  let text = '';
  for (const child of node.childNodes) text += textContent(child);
  return text;
}

/** @param {HtmlNode} node @param {ChromeMatch} match @returns {boolean} */
function matches(node, match) {
  if (!('tagName' in node) || node.tagName !== match.tag) return false;
  if (match.id !== undefined && attr(node, 'id') !== match.id) return false;
  if (match.idPrefix !== undefined && !(attr(node, 'id') ?? '').startsWith(match.idPrefix)) return false;
  if (match.classAny !== undefined) {
    const classes = new Set((attr(node, 'class') ?? '').split(/\s+/).filter(Boolean));
    if (!match.classAny.some((name) => classes.has(name))) return false;
  }
  if (match.hrefHost !== undefined) {
    const href = attr(node, 'href');
    if (href === undefined) return false;
    let host;
    try {
      host = new URL(href, SITE_ORIGIN).host;
    } catch {
      return false;
    }
    if (!match.hrefHost.includes(host)) return false;
  }
  if (match.contentRe !== undefined && !match.contentRe.test(textContent(node))) return false;
  return true;
}

/** The first entry that matches, so entry order is the tie-break.
 * @param {HtmlNode} node @param {ChromeAllowEntry[]} allowList @returns {ChromeAllowEntry|undefined} */
function entryFor(node, allowList) {
  return allowList.find((entry) => matches(node, entry.match));
}

/**
 * The chrome text a removed subtree carried, for the hit count: normalized, and
 * descending into nested blocks but stopping at prose, skipped and generated
 * regions — the same blind spots the projection itself has. A `<style>` target
 * contributes nothing: its CSS is not chrome text.
 * @param {HtmlNode} node
 * @returns {string}
 */
function regionText(node) {
  if ('tagName' in node && SKIPPED.has(node.tagName)) return '';
  /** @type {string[]} */
  const parts = [];
  collectText(node, parts, true);
  return normalize(parts.join(''));
}

/** Collect text, stopping at prose, skipped, generated and void regions. The
 * two callers differ in one rule: a masked hit descends into nested blocks (the
 * whole subtree counts as chrome), while a block run stops at them (each nested
 * block becomes its own run). One walker, one flag.
 * @param {HtmlNode} node @param {string[]} parts @param {boolean} intoBlocks @returns {void} */
function collectText(node, parts, intoBlocks) {
  if (!('childNodes' in node)) return;
  for (const child of node.childNodes) {
    if ('value' in child) {
      parts.push(child.value);
      continue;
    }
    if (!('tagName' in child)) continue;
    if (SKIPPED.has(child.tagName) || isGenerated(child) || PROSE.has(child.tagName) || VOID.has(child.tagName)) {
      parts.push(' ');
      continue;
    }
    if (BLOCK.has(child.tagName) && !intoBlocks) {
      parts.push(' ');
      continue;
    }
    collectText(child, parts, intoBlocks);
  }
}

/**
 * Remove every allow-listed subtree, outermost match first and no descent into
 * a match, recording one hit per entry. Mutates the parsed document in place:
 * the projection runs on what is left, which is exactly the page a reader sees
 * once the strip pass has been accounted for.
 * @param {HtmlNode} node @param {ChromeAllowEntry[]} allowList @param {Record<string, ChromeHit>} hits @returns {void}
 */
function maskSubtree(node, allowList, hits) {
  if (!('childNodes' in node)) return;
  for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
    const child = node.childNodes[i];
    if ('tagName' in child) {
      const entry = entryFor(child, allowList);
      if (entry !== undefined) {
        const chars = regionText(child).length;
        const hit = hits[entry.name] ?? { regions: 0, chars: 0 };
        hit.regions += 1;
        hit.chars += chars;
        hits[entry.name] = hit;
        node.childNodes.splice(i, 1);
        continue;
      }
    }
    maskSubtree(child, allowList, hits);
  }
}

/**
 * The chrome projection of one page: the inline text of every non-prose block
 * element, in document order. A block's own run stops at a nested block (which
 * becomes its own run), at a prose element (the copy projection owns it), and
 * at a skipped or generated region; text directly under a wrapper with no block
 * around it is not chrome and is dropped. Pure — same HTML in, same runs out.
 * @param {string} html
 * @returns {string[]}
 */
export function chromeRuns(html) {
  /** @type {string[]} */
  const runs = [];
  walkChrome(parse(String(html)), runs);
  return runs;
}

/** @param {HtmlNode} node @param {string[]} runs @returns {void} */
function walkChrome(node, runs) {
  if (!('childNodes' in node)) return;
  for (const child of node.childNodes) {
    if (!('tagName' in child)) continue;
    if (SKIPPED.has(child.tagName) || isGenerated(child) || PROSE.has(child.tagName)) continue;
    if (BLOCK.has(child.tagName)) {
      const text = blockText(child);
      if (text !== '') runs.push(text);
    }
    walkChrome(child, runs);
  }
}

/** The inline text of one block element, with nested blocks and prose left to
 * their own projections. @param {HtmlNode} node @returns {string} */
function blockText(node) {
  /** @type {string[]} */
  const parts = [];
  collectText(node, parts, false);
  return normalize(parts.join(''));
}

/**
 * Project one page's chrome, masking the live side's allow-listed regions and
 * counting them. The served side is deliberately not projected here — a caller
 * with a served page projects it with the plain `chromeRuns`.
 * @param {string} html
 * @param {ChromeAllowEntry[]} [allowList]
 * @returns {{runs: string[], hits: Record<string, ChromeHit>}}
 */
export function chromeMaskedRuns(html, allowList = CHROME_ALLOW_LIST) {
  const root = parse(String(html));
  /** @type {Record<string, ChromeHit>} */
  const hits = {};
  maskSubtree(root, allowList, hits);
  /** @type {string[]} */
  const runs = [];
  walkChrome(root, runs);
  return { runs, hits };
}

/**
 * One page's chrome finding, or null when the allow-list accounts for every
 * difference. The served page is projected unmasked, so a strip target retained
 * in our tree surfaces rather than being explained away.
 * @param {string} path
 * @param {string} servedHtml
 * @param {string} liveHtml
 * @param {ChromeAllowEntry[]} [allowList]
 * @returns {ChromeFinding|null}
 */
export function chromeFinding(path, servedHtml, liveHtml, allowList = CHROME_ALLOW_LIST) {
  return compare(path, servedHtml, liveHtml, allowList).finding;
}

/** @param {string} path @param {string} servedHtml @param {string} liveHtml @param {ChromeAllowEntry[]} allowList @returns {{finding: ChromeFinding|null, hits: Record<string, ChromeHit>, liveRuns: string[]}} */
function compare(path, servedHtml, liveHtml, allowList) {
  const servedRuns = chromeRuns(servedHtml);
  const { runs: liveRuns, hits } = chromeMaskedRuns(liveHtml, allowList);
  const hunks = copyDiff(servedRuns, liveRuns);
  return { finding: hunks.length === 0 ? null : { path, hunks }, hits, liveRuns };
}

/**
 * The whole run's chrome comparison: how many pages were compared, how many
 * differed, the findings, the allow-list hits totalled per entry, and each live
 * page's masked chrome digest for the baseline row. Pure: every finding is a
 * function of the pages handed in, and the served side is projected exactly
 * once.
 * @param {import('./upstream-copy.mjs').CopyPage[]} pages
 * @param {ChromeAllowEntry[]} [allowList]
 * @returns {ChromeTier & {digests: Record<string, string>}}
 */
export function chromeReport(pages, allowList = CHROME_ALLOW_LIST) {
  /** @type {ChromeFinding[]} */
  const findings = [];
  /** @type {Record<string, ChromeHit>} */
  const totals = {};
  /** @type {Record<string, string>} */
  const digests = {};
  for (const page of pages) {
    const { finding, hits, liveRuns } = compare(page.path, page.served, page.live, allowList);
    if (finding !== null) findings.push(finding);
    digests[page.path] = chromeDigest(liveRuns);
    for (const [name, hit] of Object.entries(hits)) {
      const total = totals[name] ?? { regions: 0, chars: 0 };
      total.regions += hit.regions;
      total.chars += hit.chars;
      totals[name] = total;
    }
  }
  const hits = Object.entries(totals)
    .map(([name, hit]) => ({ name, regions: hit.regions, chars: hit.chars }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { compared: pages.length, differed: findings.length, findings, hits, digests };
}
