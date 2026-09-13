// The upstream watch's pure core (ticket 01): does the live site still match the
// index we hold? Everything this module decides is a function of three fetched
// bodies plus a map of probe results — the sitemap, the homepage, and the frozen
// Capture list — so the whole comparison is pinned in `test/upstream-watch.test.ts`
// with no network and no new state.
//
// The watched universe is a union rather than the sitemap alone because each
// source is blind in a different direction: the sitemap is what upstream wants
// indexed, the homepage carries live pages the sitemap omits, and only our own
// frozen list can see a deletion. "In the sitemap" therefore rides on each row
// as a field, never as the universe's boundary.
//
// Liveness is the coarse signal — an HTTP status per path. It sees a page that
// vanished, 404s, is auth-gated (401, its own class because the tree 404s
// auth-gated stubs by rule and an upstream 401 is expected divergence), or
// redirects. It cannot see a page whose status is unchanged but whose content,
// chrome, or assets moved; those are later tiers, and `lastmod` is explicitly
// not a signal for them (it is a Webflow publish stamp that fires in bulk
// cohorts). The driver (`upstream-watch-cli.mjs`) is a separate edge that
// fetches and prints; it decides nothing.
//
// SPDX-License-Identifier: CC0-1.0
import { attrOf, openTags } from '../pipeline/html.mjs';

/**
 * The liveness classes the ticket asks for, in report order. 200 is a live
 * page; 3xx a redirect (kept with its target); 401 its own class because the
 * tree 404s auth-gated stubs by rule; 4xx and 5xx the client/server error
 * buckets, split so a server error is never reported as a client one.
 * @type {readonly ['200', '3xx', '401', '4xx', '5xx']}
 */
export const LIVENESS_CLASSES = ['200', '3xx', '401', '4xx', '5xx'];

/**
 * One probe result: the status an HTTP request answered, plus the redirect
 * target for a 3xx. The core's probe map must cover every watched path; a
 * missing entry is a contract violation, not a class.
 * @typedef {Object} Probe
 * @property {number} status
 * @property {string|null} [location]
 */

/**
 * The three fetched bodies the watch decides from, plus the origin they belong
 * to. Shared by `watchedUniverse` and `buildWatchReport` so both resolve the
 * same union.
 * @typedef {Object} WatchInputs
 * @property {string} origin
 * @property {string} sitemapXml
 * @property {string} homepageHtml
 * @property {string[]} captureList
 */

/**
 * `WatchInputs` plus one probe result per watched path.
 * @typedef {WatchInputs & {probes: Record<string, Probe>}} ReportInputs
 */

/**
 * One row of the inventory: what we know about a single watched URL.
 * @typedef {Object} InventoryRow
 * @property {string} path
 * @property {boolean} inSitemap
 * @property {boolean} inCapture
 * @property {number} status
 * @property {string|null} location
 * @property {'200'|'3xx'|'401'|'4xx'|'5xx'} statusClass
 * @property {string|null} lastmod
 */

/**
 * One field of a baseline row that moved since the previous verified run.
 * `field` is a baseline row's own field name (`inSitemap`, `status`,
 * `location`), so a report never invents vocabulary the baseline does not use.
 * @typedef {Object} FieldDelta
 * @property {string} field
 * @property {string|number|boolean|null} from
 * @property {string|number|boolean|null} to
 */

/**
 * One path present in both baselines whose carried fields moved.
 * @typedef {Object} ChangedRow
 * @property {string} path
 * @property {FieldDelta[]} fields
 */

/**
 * What moved since the previous baseline: the difference between the previous
 * run's rows and this run's, by path. `from` is the previous
 * **verified-in-sync date**; it is null on the **silent baseline**, which has
 * no previous state to diff against. Ticket 02.
 * @typedef {Object} BaselineDelta
 * @property {string|null} from
 * @property {string[]} added
 * @property {string[]} removed
 * @property {ChangedRow[]} changed
 */

/**
 * One page whose prose differs from the live page it reproduces, as ticket 03
 * reports it: the path and the differing runs, never a page-level boolean.
 * @typedef {import('./upstream-copy.mjs').CopyFinding} CopyFinding
 */

/**
 * The comparison a run produces. `inventory` is the whole measurement;
 * `findings` are the drift against the frozen Capture list, which ticket 01
 * alone can see. Ticket 02's `since` is the drift against the moving baseline;
 * ticket 03's `copy` is the live-versus-served prose comparison. Together they
 * are the only things that make the run exit 1.
 * @typedef {Object} WatchReport
 * @property {string} origin
 * @property {{sitemap: number, homepage: number, capture: number, universe: number}} counts
 * @property {Record<string, number>} liveness
 * @property {{added: string[], removed: Array<{path: string, status: number, location: string|null}>}} findings
 * @property {Array<{path: string, target: string|null}>} demotions
 * @property {InventoryRow[]} inventory
 * @property {string} [verified]  the date this run verified upstream; set by `runWatch`
 * @property {BaselineDelta} [since]  what moved since the previous run; set by `runWatch`
 * @property {{compared: number, differed: number, findings: CopyFinding[]}} [copy]  the served-versus-live prose comparison; set by `runWatch`
 */

/**
 * The path vocabulary of the watch: a same-origin HTTP reference normalized to a
 * path, with query, fragment, and trailing slash dropped. A bare fragment, a
 * non-http scheme, an empty value, or an off-origin URL is not a watched path.
 * @param {string} url
 * @param {string} origin
 * @returns {string|null}
 */
export function pathOf(url, origin) {
  const raw = String(url ?? '').trim();
  if (raw === '' || raw.startsWith('#')) return null;
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.origin !== new URL(origin).origin) return null;
  const path = parsed.pathname;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The coarse liveness class the ticket asks for: 200, 3xx, 4xx (and 5xx), with
 * 401 pulled out as its own class.
 * @param {number} status
 * @returns {'200'|'3xx'|'401'|'4xx'|'5xx'}
 */
export function livenessClass(status) {
  if (status === 200) return '200';
  if (status === 401) return '401';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 500) return '5xx';
  return '4xx';
}

/**
 * Decode the XML character references a sitemap loc can carry: the five named
 * entities and any numeric reference (`&#38;` or `&#x26;`), so a loc never stays
 * encoded and mismatches the same path from the Capture list.
 * @param {string} text
 * @returns {string}
 */
function decodeXml(text) {
  /** @type {Record<string, string>} */
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (/** @type {string} */ match, /** @type {string} */ name) => {
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = parseInt(hex ? name.slice(2) : name.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[name] ?? match;
  });
}

/**
 * The sitemap's locs, as paths, with each loc's lastmod kept only as context.
 * The body must be a flat `<urlset>`; a `<sitemapindex>`, an error page, or a
 * truncated body throws so the driver can exit 2 — an unparsable sitemap must
 * never be read as a clean, shrunken universe. Ticket 01 does not descend into
 * a sitemap index.
 * @param {string} sitemapXml
 * @param {string} origin
 * @returns {{paths: string[], lastmod: Record<string, string>}}
 * @throws {Error} when the body is not a `<urlset>` document
 */
export function sitemapLocs(sitemapXml, origin) {
  const xml = String(sitemapXml);
  if (!/<urlset\b/i.test(xml)) {
    throw new Error('sitemap is not a <urlset> document');
  }
  /** @type {string[]} */
  const paths = [];
  /** @type {Record<string, string>} */
  const lastmod = {};
  for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(block[1]);
    if (!loc) continue;
    const path = pathOf(decodeXml(loc[1].trim()), origin);
    if (path === null) continue;
    paths.push(path);
    const stamp = /<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i.exec(block[1]);
    if (stamp) lastmod[path] = decodeXml(stamp[1].trim());
  }
  return { paths, lastmod };
}

/**
 * Every same-origin anchor path on a page, duplicates kept — the homepage's
 * contribution to the universe. The whole page is scanned (not a header/footer
 * class slice): slicing by class marker is approximate by design and would
 * silently miss a nav variant, and a live page reachable only from another
 * homepage link is exactly the blind spot the homepage exists to cover.
 * @param {string} html
 * @param {string} origin
 * @returns {string[]}
 */
export function homepagePaths(html, origin) {
  /** @type {string[]} */
  const paths = [];
  for (const tag of openTags(html)) {
    if (tag.name.toLowerCase() !== 'a') continue;
    const href = attrOf(tag.attrs, 'href');
    if (href === null) continue;
    const path = pathOf(href, origin);
    if (path !== null) paths.push(path);
  }
  return paths;
}

/**
 * Resolve the three sources once — their union and each source's membership set
 * — so the probe list and the report can never be built from two different
 * universes.
 * @param {WatchInputs} inputs
 * @returns {{sitemapPaths: string[], sitemapSet: Set<string>, homepage: string[], capturePaths: string[], captureSet: Set<string>, lastmod: Record<string, string>, universe: string[]}}
 */
function resolveSources({ origin, sitemapXml, homepageHtml, captureList }) {
  const { paths: sitemapPaths, lastmod } = sitemapLocs(sitemapXml, origin);
  const homepage = homepagePaths(homepageHtml, origin);
  const capturePaths = captureList.map((url) => pathOf(url, origin)).filter((path) => path !== null);
  const universe = [...new Set([...sitemapPaths, ...homepage, ...capturePaths])].sort();
  return {
    sitemapPaths,
    sitemapSet: new Set(sitemapPaths),
    homepage,
    capturePaths,
    captureSet: new Set(capturePaths),
    lastmod,
    universe,
  };
}

/**
 * The watched universe: the union of the sitemap's locs, the homepage's anchor
 * paths, and the frozen Capture list, deduplicated and sorted. Sitemap
 * membership is deliberately not part of the union's definition.
 * @param {WatchInputs} inputs
 * @returns {string[]}
 */
export function watchedUniverse(inputs) {
  return resolveSources(inputs).universe;
}

/**
 * Build the whole report from fetched bytes and probe results. Pure: the driver
 * hands it what it fetched, and this decides every finding. Throws when a
 * watched path has no probe result — an incomplete probe map is a contract
 * violation the driver turns into exit 2.
 * @param {ReportInputs} inputs
 * @returns {WatchReport}
 * @throws {Error} when `probes` does not cover the watched universe
 */
export function buildWatchReport(inputs) {
  const { origin, probes } = inputs;
  const { sitemapPaths, sitemapSet, homepage, captureSet, lastmod, universe } = resolveSources(inputs);

  /** @type {InventoryRow[]} */
  const inventory = universe.map((path) => {
    const probe = probes[path];
    if (!probe) throw new Error(`no probe result for ${path} — the probe map must cover the watched universe`);
    const rawLocation = probe.location ?? null;
    const location = rawLocation === null ? null : pathOf(rawLocation, origin) ?? rawLocation;
    return {
      path,
      inSitemap: sitemapSet.has(path),
      inCapture: captureSet.has(path),
      status: probe.status,
      location,
      statusClass: livenessClass(probe.status),
      lastmod: lastmod[path] ?? null,
    };
  });

  /** @type {Record<string, number>} */
  const liveness = {};
  for (const name of LIVENESS_CLASSES) liveness[name] = 0;
  for (const row of inventory) liveness[row.statusClass] = (liveness[row.statusClass] ?? 0) + 1;

  // Added and removed are the only findings: a live 200 the Capture list does
  // not hold, and a Capture-list path that no longer answers 200. A redirected
  // sitemap loc is a demotion — context that usually confirms our own redirect
  // table — and a 401 is expected divergence, so it is neither finding nor
  // demotion even when the path is on our Capture list.
  const added = inventory.filter((row) => row.statusClass === '200' && !row.inCapture).map((row) => row.path);
  const removed = inventory
    .filter((row) => row.inCapture && row.statusClass !== '200' && row.statusClass !== '401')
    .map((row) => ({ path: row.path, status: row.status, location: row.location }));
  const demotions = inventory.filter((row) => row.inSitemap && row.statusClass === '3xx').map((row) => ({ path: row.path, target: row.location }));

  return {
    origin,
    counts: { sitemap: sitemapPaths.length, homepage: new Set(homepage).size, capture: captureSet.size, universe: universe.length },
    liveness,
    findings: { added, removed },
    demotions,
    inventory,
  };
}

/**
 * Whether a baseline delta carries anything. The exit code and the printed
 * summary both ask this, so a clean print can never disagree with a nonzero
 * exit.
 * @param {BaselineDelta|undefined} since
 * @returns {boolean}
 */
function baselineMoved(since) {
  return since ? since.added.length + since.removed.length + since.changed.length > 0 : false;
}

/**
 * Whether the copy comparison carries anything.
 * @param {WatchReport['copy']} copy
 * @returns {boolean}
 */
function copyMoved(copy) {
  return copy !== undefined && copy.differed > 0;
}

/** One run's text for the human view, bounded so a whole-page rewrite cannot
 * bury the finding. @param {string[]} runs @returns {string} */
function summarizeRuns(runs) {
  const shown = runs.map((run) => (run.length > 160 ? `${run.slice(0, 157)}…` : run));
  return shown.join(' / ');
}

/**
 * The human view of a report. It reads the same `findings`, `demotions`,
 * `liveness`, and ticket 02 `since` the `--json` form serializes, so the two
 * can never disagree. The ticket 01 lines and closing line are unchanged when
 * no baseline section is present.
 * @param {WatchReport} report
 * @returns {string}
 */
export function formatWatchReport(report) {
  const { counts, liveness, findings, demotions } = report;
  const lines = [];
  lines.push(`Upstream watch — live ${report.origin} vs the frozen 2026-09-12 Capture list`);
  lines.push(`  universe: ${counts.universe} URL(s) — ${counts.sitemap} sitemap · ${counts.homepage} homepage · ${counts.capture} capture`);
  lines.push(`  liveness: ${LIVENESS_CLASSES.map((name) => `${liveness[name] ?? 0} × ${name}`).join(' · ')}`);
  if (report.verified) lines.push(`  verified in sync as of: ${report.verified}`);
  lines.push(`  findings: ${findings.added.length} added · ${findings.removed.length} removed`);
  if (report.since) {
    const { from, added, removed, changed } = report.since;
    lines.push(`  since ${from ?? 'the first run'}: ${added.length} added · ${removed.length} removed · ${changed.length} changed`);
  }
  if (report.copy) {
    const { compared, differed } = report.copy;
    lines.push(`  copy: ${compared} page(s) compared · ${differed} differed`);
  }
  if (demotions.length > 0) {
    lines.push(`  demotions (context, not findings): ${demotions.length}`);
    for (const d of demotions) lines.push(`    ${d.path} → ${d.target ?? '(no target)'}`);
  }
  if (findings.added.length > 0) {
    lines.push('  added — live 200 the Capture list does not hold:');
    for (const p of findings.added) lines.push(`    + ${p}`);
  }
  if (findings.removed.length > 0) {
    lines.push('  removed — Capture-list paths that no longer answer 200:');
    for (const r of findings.removed) lines.push(`    - ${r.path} (${r.status}${r.location ? ` → ${r.location}` : ''})`);
  }
  if (report.since) {
    const { added, removed, changed } = report.since;
    if (added.length > 0) {
      lines.push('  added since the last run:');
      for (const p of added) lines.push(`    + ${p}`);
    }
    if (removed.length > 0) {
      lines.push('  removed since the last run:');
      for (const p of removed) lines.push(`    - ${p}`);
    }
    if (changed.length > 0) {
      lines.push('  changed since the last run:');
      for (const c of changed) lines.push(`    ~ ${c.path} (${c.fields.map((f) => `${f.field} ${f.from} → ${f.to}`).join(', ')})`);
    }
  }
  if (report.copy && report.copy.findings.length > 0) {
    lines.push('  copy findings — served prose that no longer matches live:');
    for (const finding of report.copy.findings) {
      lines.push(`    ~ ${finding.path} (${finding.hunks.length} differing run group(s))`);
      for (const hunk of finding.hunks) {
        if (hunk.served.length > 0) lines.push(`      served: ${summarizeRuns(hunk.served)}`);
        if (hunk.live.length > 0) lines.push(`      live:   ${summarizeRuns(hunk.live)}`);
      }
    }
  }
  const indexDrift = findings.added.length > 0 || findings.removed.length > 0;
  const baselineDrift = baselineMoved(report.since);
  const copyDrift = copyMoved(report.copy);
  if (report.since) {
    lines.push(indexDrift || baselineDrift || copyDrift ? '✗ Drift — see findings above.' : '✓ In sync with the Capture list and the baseline.');
  } else {
    lines.push(indexDrift || copyDrift ? '✗ Drift — see findings above.' : '✓ Index in sync with the Capture list.');
  }
  return lines.join('\n');
}

/**
 * The command's exit code: 1 when the index drifted (ticket 01), the baseline
 * moved (ticket 02), or the served prose no longer matches live (ticket 03), 0
 * otherwise. An operational failure (2) is the driver's, not the report's — an
 * incomplete measurement must never masquerade as a clean one.
 * @param {WatchReport} report
 * @returns {0|1}
 */
export function exitCode(report) {
  const indexDrift = report.findings.added.length > 0 || report.findings.removed.length > 0;
  return indexDrift || baselineMoved(report.since) || copyMoved(report.copy) ? 1 : 0;
}
