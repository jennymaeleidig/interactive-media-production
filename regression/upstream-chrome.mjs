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
// Ticket 04b adds a second, chrome-only list beside the allow-list: the
// **runtime-fill exclusions**, the regions a rendered capture fills and a raw
// fetch does not. Those are stripped from *both* sides and are silent (no
// count), because they are not strip-pass targets and the removal fixtures are
// their record; the allow-list's counted rule above stays the allow-list's own.
//
// Ticket 07 adds one more shared rule, and it is not a list: a word/line reveal
// fragment is prose the copy projection reads, so chrome must never read it
// back. The fragments sit beside the paragraph they were split from when a
// re-serialization promotes them out of an invalid `<p>`, so the skip lives in
// the walker and the text collector, keyed on the animation's own class.
//
// SPDX-License-Identifier: CC0-1.0
import { parse } from 'parse5';
import { BLOCK, isGenerated, isSplitFragment, normalize, PROSE_ELEMENTS, SKIPPED, VOID } from './upstream-copy.mjs';
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
 * @property {string} [tag]  when absent, any element tag matches
 * @property {string} [id]
 * @property {string} [idPrefix]
 * @property {string[]} [classAny]  matches when the element carries any one
 * @property {string[]} [hrefHost]
 * @property {Record<string, string>} [attrs]  every named attribute must equal its value
 * @property {ChromeMatch} [within]  an ancestor element must match this match
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

/**
 * One runtime-fill entry: a region a page's own scripts populate at render time,
 * present in our rendered capture and absent (or in a different order) in the
 * raw fetch. It has a name and a matcher only — there is no `served/build-log.json`
 * measurement behind it, because the strip pass never removed it.
 * @typedef {Object} ChromeRuntimeFillEntry
 * @property {string} name
 * @property {ChromeMatch} match
 */

/** Either kind of entry: the allow-list and the runtime-fill list share matching. */
/** @typedef {ChromeAllowEntry | ChromeRuntimeFillEntry} ChromeEntry */

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

/**
 * Ticket 04b: the **runtime-fill exclusions** — the regions our rendered capture
 * fills and a raw live fetch does not. They are stripped from *both* sides of
 * the chrome comparison, because the served side is exactly where the runtime
 * fill lives; the allow-list above is live-only by contrast, because the strip
 * pass explains the live extras, not the served ones.
 *
 * Chrome-only by design, never folded into the copy tier's `isGenerated`: the
 * Finsweet CMS list carries the blog and FAQ prose the copy projection must keep
 * reading, so a shared exclusion would drop real prose from the copy tier. The
 * other markers carry no prose, but one chrome-only list keeps the boundary
 * legible and leaves ticket 03's copy digests untouched.
 *
 * The Finsweet entry is deliberately narrow. The artifact is the hidden
 * `div.hide` category-tag container *inside* the CMS list — Finsweet reorders
 * and re-templates it at runtime, so the capture and the raw fetch disagree on
 * its order while the visible card content is identical. Excluding the whole
 * `fs-cmsfilter-element="list"` region would also drop the cards' own chrome
 * (FAQ questions, event dates, CTA labels, press outlet names), none of which
 * the copy projection reads, so a real change to them would vanish from both
 * tiers. The `within` matcher confines the strip to `.hide` under the list,
 * which removes the reordered tags and keeps the visible card chrome in the
 * comparison. The Finsweet filters form is not here at all: `/press-center`,
 * `/resources` and `/upcoming-events` renamed their dropdown labels upstream
 * (a live `Location` where the capture holds `Region`), and the form wraps those
 * toggles; excluding it wholesale would mask real drift the strip does not
 * explain. `=clear` produces no unexplained difference either, and `=empty` is
 * already a shared `isGenerated` exclusion that the copy tier carries too.
 *
 * What each entry still cannot see, the deliberate blind spot: a chrome change
 * *inside* the region. A Marketo label, a pagination link, a job tag, a
 * calculator output, a player control, a podcast duration or a hidden Finsweet
 * category tag that moved upstream is not reported while its region stays
 * excluded. Visible card chrome and the list's prose stay in the comparison.
 * The removal fixtures in `test/upstream-chrome.test.ts` pin that an excluded
 * region re-reports the moment its entry leaves the list.
 *
 * The measured classes (2026-09-13 live run, 170 chrome findings, re-measured
 * 2026-09-14 with 5 remaining): Marketo form labels, the largest class, across
 * the `/book-a-demo*`, `/webinar/*`, `/ebooks/*` and `/resources/*` families;
 * Finsweet's reordered hidden category tags on the CMS-listing pages (`/blog`,
 * `/customers`, `/faq`, `/press-center`, `/upcoming-events`, the story pages);
 * Webflow pagination (`/partner-program`, `/resources`, `/press-center`); the
 * Ashby-backed jobs widget (`/careers/positions`); the reduce-guard-cost
 * calculator's computed outputs (`/reduce-guard-cost-calculator`); Wistia player
 * chrome (`/webinar/*`); and the Tmplayer podcast controls (`/podcast`,
 * discovered beyond the ticket's evidence).
 * @type {ChromeRuntimeFillEntry[]}
 */
export const CHROME_RUNTIME_FILL = [
  { name: 'marketo-form', match: { classAny: ['mktoForm'] } },
  { name: 'finsweet-cms-hidden-tags', match: { classAny: ['hide'], within: { attrs: { 'fs-cmsfilter-element': 'list' } } } },
  { name: 'webflow-pagination', match: { classAny: ['w-pagination-wrapper'] } },
  { name: 'ashby-jobs', match: { classAny: ['careers_filter', 'careers__listing'] } },
  { name: 'calculator-output', match: { classAny: ['rc-output', 'rc-result'] } },
  { name: 'wistia-player-chrome', match: { classAny: ['wistia_popover_embed', 'wistia_embed'] } },
  { name: 'podcast-player', match: { classAny: ['ep-player'] } },
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
  if (!('tagName' in node)) return false;
  if (match.tag !== undefined && node.tagName !== match.tag) return false;
  if (match.attrs !== undefined) {
    for (const [name, value] of Object.entries(match.attrs)) {
      if (attr(node, name) !== value) return false;
    }
  }
  if (match.within !== undefined && !hasAncestorMatching(node, match.within)) return false;
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

/** Whether an ancestor element of `node` matches `match`, so a rule can be
 * scoped to a region (the hidden category tags live only under the Finsweet
 * list). @param {HtmlNode} node @param {ChromeMatch} match @returns {boolean} */
function hasAncestorMatching(node, match) {
  let parent = 'parentNode' in node ? node.parentNode : null;
  while (parent !== undefined && parent !== null) {
    if ('tagName' in parent && matches(parent, match)) return true;
    parent = 'parentNode' in parent ? parent.parentNode : null;
  }
  return false;
}

/** The first entry that matches, so entry order is the tie-break.
 * @param {HtmlNode} node @param {ChromeEntry[]} entries @returns {ChromeEntry|undefined} */
function entryFor(node, entries) {
  return entries.find((entry) => matches(node, entry.match));
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
 * block becomes its own run) — and a word/line reveal fragment is prose only the
 * block run leaves aside; a masked hit still measures the whole region. One
 * walker, two flags.
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
    if ((isSplitFragment(child) || BLOCK.has(child.tagName)) && !intoBlocks) {
      parts.push(' ');
      continue;
    }
    collectText(child, parts, intoBlocks);
  }
}

/**
 * Remove every matching subtree, outermost match first and no descent into a
 * match. With `hits` the removal is a counted allow-list mask; without it, a
 * silent runtime-fill strip (still named in the list, and pinned by the removal
 * fixtures). Mutates the parsed document in place: the projection runs on what
 * is left.
 * @param {HtmlNode} node @param {ChromeEntry[]} entries @param {Record<string, ChromeHit>} [hits] @returns {void}
 */
function stripRegions(node, entries, hits) {
  if (!('childNodes' in node)) return;
  for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
    const child = node.childNodes[i];
    if ('tagName' in child) {
      const entry = entryFor(child, entries);
      if (entry !== undefined) {
        if (hits !== undefined) {
          const chars = regionText(child).length;
          const hit = hits[entry.name] ?? { regions: 0, chars: 0 };
          hit.regions += 1;
          hit.chars += chars;
          hits[entry.name] = hit;
        }
        node.childNodes.splice(i, 1);
        continue;
      }
    }
    stripRegions(child, entries, hits);
  }
}

/**
 * The chrome projection of one page: the inline text of every non-prose block
 * element, in document order. A block's own run stops at a nested block (which
 * becomes its own run), at a prose element or a word/line reveal fragment (the
 * copy projection owns both), and at a skipped or generated region; text
 * directly under a wrapper with no block around it is not chrome and is
 * dropped. The runtime-fill regions are stripped first, from the same side,
 * because a rendered capture carries them and a raw fetch does not. Pure — same
 * HTML in, same runs out.
 * @param {string} html
 * @param {ChromeRuntimeFillEntry[]} [runtimeFill]
 * @returns {string[]}
 */
export function chromeRuns(html, runtimeFill = CHROME_RUNTIME_FILL) {
  const root = strippedRoot(html, runtimeFill);
  /** @type {string[]} */
  const runs = [];
  walkChrome(root, runs);
  return runs;
}

/** Parse `html` and strip the runtime-fill regions — the shared first step of
 * both the served and the live projection. @param {string} html @param {ChromeRuntimeFillEntry[]} runtimeFill @returns {HtmlNode} */
function strippedRoot(html, runtimeFill) {
  const root = parse(String(html));
  stripRegions(root, runtimeFill);
  return root;
}

/** @param {HtmlNode} node @param {string[]} runs @returns {void} */
function walkChrome(node, runs) {
  if (!('childNodes' in node)) return;
  for (const child of node.childNodes) {
    if (!('tagName' in child)) continue;
    if (SKIPPED.has(child.tagName) || isGenerated(child) || isSplitFragment(child) || PROSE.has(child.tagName)) continue;
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
 * Project one page's chrome, stripping the runtime-fill regions from the same
 * side and masking the allow-listed regions, counting the latter. The served
 * side is deliberately not projected here — a caller with a served page
 * projects it with the plain `chromeRuns`.
 * @param {string} html
 * @param {ChromeAllowEntry[]} [allowList]
 * @param {ChromeRuntimeFillEntry[]} [runtimeFill]
 * @returns {{runs: string[], hits: Record<string, ChromeHit>}}
 */
export function chromeMaskedRuns(html, allowList = CHROME_ALLOW_LIST, runtimeFill = CHROME_RUNTIME_FILL) {
  const root = strippedRoot(html, runtimeFill);
  /** @type {Record<string, ChromeHit>} */
  const hits = {};
  stripRegions(root, allowList, hits);
  /** @type {string[]} */
  const runs = [];
  walkChrome(root, runs);
  return { runs, hits };
}

/**
 * One page's chrome finding, or null when the runtime-fill strip and the
 * allow-list account for every difference. The served page is projected with the
 * same runtime-fill strip (the fill is on the served side), but is never
 * allow-list masked, so a strip target retained in our tree surfaces rather than
 * being explained away.
 * @param {string} path
 * @param {string} servedHtml
 * @param {string} liveHtml
 * @param {ChromeAllowEntry[]} [allowList]
 * @param {ChromeRuntimeFillEntry[]} [runtimeFill]
 * @returns {ChromeFinding|null}
 */
export function chromeFinding(path, servedHtml, liveHtml, allowList = CHROME_ALLOW_LIST, runtimeFill = CHROME_RUNTIME_FILL) {
  return compare(path, servedHtml, liveHtml, allowList, runtimeFill).finding;
}

/** @param {string} path @param {string} servedHtml @param {string} liveHtml @param {ChromeAllowEntry[]} allowList @param {ChromeRuntimeFillEntry[]} runtimeFill @returns {{finding: ChromeFinding|null, hits: Record<string, ChromeHit>, liveRuns: string[]}} */
function compare(path, servedHtml, liveHtml, allowList, runtimeFill) {
  const servedRuns = chromeRuns(servedHtml, runtimeFill);
  const { runs: liveRuns, hits } = chromeMaskedRuns(liveHtml, allowList, runtimeFill);
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
 * @param {ChromeRuntimeFillEntry[]} [runtimeFill]
 * @returns {ChromeTier & {digests: Record<string, string>}}
 */
export function chromeReport(pages, allowList = CHROME_ALLOW_LIST, runtimeFill = CHROME_RUNTIME_FILL) {
  /** @type {ChromeFinding[]} */
  const findings = [];
  /** @type {Record<string, ChromeHit>} */
  const totals = {};
  /** @type {Record<string, string>} */
  const digests = {};
  for (const page of pages) {
    const { finding, hits, liveRuns } = compare(page.path, page.served, page.live, allowList, runtimeFill);
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
