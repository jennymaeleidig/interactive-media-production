// The upstream watch's moving baseline (ticket 02): the state that lets a run
// report what moved *since we last looked* — including a path added and removed
// between two runs, which ticket 01's frozen Capture list cannot see.
//
// This module owns the baseline's whole life as a pure value: its text form
// (`readBaseline` / `serializeBaseline`), its derivation from one run
// (`baselineFromReport`), the arithmetic between two of them (`diffBaseline`),
// and the single write decision (`runWatch`'s `write`). Nothing here reads a
// file or reaches the network — the hand-run edge does the I/O — so the whole
// of ticket 02 is pinned offline in `test/upstream-baseline.test.ts`.
//
// The write rule: only an explicit `--accept` rewrites an existing baseline, so
// a check can never silently move its own reference point. The one exception is
// the **silent first run**: with no baseline present there is nothing to diff
// against, so the run records one and reports only the count, which is why the
// whole watched universe never registers as a change on the first run. There is
// one write path in the edge and it is the accept path; the first run takes it
// because it has nothing to check.
//
// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import { buildWatchReport } from './upstream-watch.mjs';
import { copyReport } from './upstream-copy.mjs';
import { chromeReport } from './upstream-chrome.mjs';
import { assetReport, byAssetUrl } from './upstream-assets.mjs';
import { mediaReport } from './upstream-media.mjs';
import { acceptanceEntries, byAcceptance, mediaSlotIdentity, partitionAccepted } from './upstream-accept.mjs';

/**
 * The schema of the committed baseline. Later tickets add per-row projection
 * digests, and a reader must never guess which row shape it holds, so a version
 * it does not know is an error rather than a silent misread.
 * @type {number}
 */
export const BASELINE_VERSION = 1;

/**
 * One watched URL's state when the baseline was accepted. `location` is the
 * redirect target of a 3xx (a same-origin path), null otherwise. The later
 * tickets' projection digests join this row.
 * @typedef {Object} BaselineRow
 * @property {string} path
 * @property {boolean} inSitemap
 * @property {number} status
 * @property {string|null} location
 * @property {string} [copy]  the **copy projection** digest ticket 03 records
 * @property {string} [chrome]  the live **chrome projection** digest ticket 05 records
 */

/**
 * The committed state: one row per watched URL, the shared asset set's digests
 * (ticket 05), and the date the run verified. `assets` is absent on a baseline
 * recorded before ticket 05; a v1 reader preserves it when present.
 * @typedef {Object} Baseline
 * @property {number} version
 * @property {string} verified  the **verified-in-sync date**, `YYYY-MM-DD`
 * @property {import('./upstream-assets.mjs').AssetRecord[]} [assets]
 * @property {import('./upstream-accept.mjs').AcceptanceEntry[]} [accepted]  ticket 08's known-drift set
 * @property {BaselineRow[]} rows
 */

/**
 * Ticket 01's report inputs plus ticket 02's baseline state, ticket 03's copy
 * pages, ticket 04's chrome pages, ticket 05's shared asset bytes and ticket
 * 06's media pages and probe results.
 * @typedef {import('./upstream-watch.mjs').ReportInputs & {previous?: Baseline|null, accept?: boolean, acceptDrift?: boolean, verified: string, copyPages?: import('./upstream-copy.mjs').CopyPage[], chromePages?: import('./upstream-copy.mjs').CopyPage[], assets?: import('./upstream-assets.mjs').FetchedAsset[], mediaPages?: import('./upstream-media.mjs').MediaPage[], mediaProbes?: Record<string, import('./upstream-media.mjs').MediaProbe>}} RunInputs
 */

/**
 * One run, as a value: the report to print and the baseline to record. `write`
 * is the edge's only write decision — true on the silent first run and on
 * `--accept`, false on a plain run that has a previous baseline.
 * @typedef {Object} WatchRun
 * @property {import('./upstream-watch.mjs').WatchReport} report
 * @property {Baseline} baseline
 * @property {boolean} write
 */

const VERIFIED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Path order: code-unit, not `localeCompare`, because the baseline is a
 * committed file whose order must not depend on the machine's locale.
 * @param {{path: string}} a
 * @param {{path: string}} b
 * @returns {number}
 */
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** @param {string} why @returns {never} */
function bad(why) {
  throw new Error(`baseline: ${why}`);
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {BaselineRow}
 */
function readRow(value, index) {
  if (value === null || typeof value !== 'object') return bad(`row ${index} is not an object`);
  const { path: p, inSitemap, status, location } = /** @type {Record<string, unknown>} */ (value);
  if (typeof p !== 'string') return bad(`row ${index} has no path`);
  if (typeof inSitemap !== 'boolean') return bad(`row ${index} has no sitemap membership`);
  if (typeof status !== 'number') return bad(`row ${index} has no numeric status`);
  if (location !== undefined && location !== null && typeof location !== 'string') return bad(`row ${index} has a non-string redirect target`);
  // Preserve any other field rather than dropping it: the projection digests a
  // later ticket adds ride here, and a read-then-accept must not erase state it
  // does not yet understand. `diffBaseline` compares whatever fields it finds.
  return { ...value, path: p, inSitemap, status, location: location ?? null };
}

/**
 * Read the ticket 05 shared-asset section. Each record is checked so a
 * malformed baseline is an error (exit 2), never a silently shrunken asset set
 * that would report the whole set as newly changed.
 * @param {unknown} value
 * @returns {import('./upstream-assets.mjs').AssetRecord[]}
 */
function readAssets(value) {
  if (!Array.isArray(value)) return bad('assets is not an array');
  return value.map((asset, index) => {
    if (asset === null || typeof asset !== 'object') return bad(`asset ${index} is not an object`);
    const { name, url, digest, bytes } = /** @type {Record<string, unknown>} */ (asset);
    if (typeof name !== 'string') return bad(`asset ${index} has no name`);
    if (typeof url !== 'string') return bad(`asset ${index} has no url`);
    if (typeof digest !== 'string') return bad(`asset ${index} has no digest`);
    if (typeof bytes !== 'number') return bad(`asset ${index} has no byte size`);
    return { name, url, digest, bytes };
  });
}

/**
 * Read ticket 08's accepted-drift section. Each entry is checked so a malformed
 * baseline is an error (exit 2), never a silently empty accepted set that would
 * re-alarm every recorded difference.
 * @param {unknown} value
 * @returns {import('./upstream-accept.mjs').AcceptanceEntry[]}
 */
function readAccepted(value) {
  if (!Array.isArray(value)) return bad('accepted is not an array');
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') return bad(`accepted entry ${index} is not an object`);
    const { tier, path: p, url, slot, fingerprint } = /** @type {Record<string, unknown>} */ (entry);
    if (typeof fingerprint !== 'string') return bad(`accepted entry ${index} has no fingerprint`);
    if (tier === 'copy' || tier === 'chrome') {
      if (typeof p !== 'string') return bad(`accepted entry ${index} has no path`);
      return { tier, path: p, fingerprint };
    }
    if (tier === 'restyle') {
      if (typeof url !== 'string') return bad(`accepted entry ${index} has no url`);
      return { tier, url, fingerprint };
    }
    if (tier === 'media') {
      if (typeof p !== 'string') return bad(`accepted entry ${index} has no path`);
      if (typeof slot !== 'string') return bad(`accepted entry ${index} has no slot`);
      return { tier, path: p, slot, fingerprint };
    }
    return bad(`accepted entry ${index} has an unknown tier`);
  });
}

/**
 * Parse a committed baseline from its text. Everything wrong with the text is
 * an error the edge turns into exit 2: a malformed or future-schema baseline
 * must never be read as an empty one, which would report the whole universe as
 * newly added. A version a reader does not know is an error; an unknown *row*
 * field within a known version is preserved instead, because Version 1 rows are
 * additive — a later ticket's digest must survive a read/accept round-trip.
 * @param {string} text
 * @returns {Baseline}
 */
export function readBaseline(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return bad('not JSON');
  }
  if (parsed === null || typeof parsed !== 'object') return bad('not an object');
  const { version, verified, rows, assets, accepted } = /** @type {Record<string, unknown>} */ (parsed);
  if (version !== BASELINE_VERSION) return bad(`unknown version ${String(version)}`);
  if (typeof verified !== 'string' || !VERIFIED_DATE_PATTERN.test(verified)) return bad('missing or malformed verified date');
  if (!Array.isArray(rows)) return bad('rows is not an array');
  /** @type {Baseline} */
  const baseline = { version, verified, rows: rows.map(readRow) };
  if (assets !== undefined) baseline.assets = readAssets(assets);
  if (accepted !== undefined) baseline.accepted = readAccepted(accepted);
  return baseline;
}

/**
 * The committed text form: rows in path order, two-space JSON, trailing
 * newline, so a re-accepted baseline only changes when its content does.
 * @param {Baseline} baseline
 * @returns {string}
 */
export function serializeBaseline(baseline) {
  const rows = [...baseline.rows].sort(byPath);
  /** @type {{version: number, verified: string, assets?: import('./upstream-assets.mjs').AssetRecord[], accepted?: import('./upstream-accept.mjs').AcceptanceEntry[], rows?: BaselineRow[]}} */
  const out = { version: baseline.version, verified: baseline.verified };
  if (baseline.assets !== undefined) out.assets = [...baseline.assets].sort(byAssetUrl);
  if (baseline.accepted !== undefined && baseline.accepted.length > 0) out.accepted = [...baseline.accepted].sort(byAcceptance);
  out.rows = rows;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * The state one run records: one row per watched URL, sorted by path. The row
 * is the inventory's durable facts — path, sitemap membership, status, redirect
 * target — plus, for a URL this run projected, the digest of the **live** page's
 * copy. `inCapture` comes from the frozen Capture list and `lastmod` is context
 * the baseline has no use for. A path with no digest keeps the plain v1 row, so
 * a baseline recorded before ticket 03 still reads.
 * @param {import('./upstream-watch.mjs').WatchReport} report
 * @param {string} verified
 * @param {{copyDigests?: Record<string, string>, chromeDigests?: Record<string, string>, assets?: import('./upstream-assets.mjs').AssetRecord[], accepted?: import('./upstream-accept.mjs').AcceptanceEntry[]}} [digests]
 *   the run's projection digests, shared asset set and accepted-drift set;
 *   bundled so the two same-shaped digest maps cannot be transposed at the
 *   call site
 * @returns {Baseline}
 */
export function baselineFromReport(report, verified, { copyDigests = {}, chromeDigests = {}, assets, accepted } = {}) {
  const rows = report.inventory
    .map((row) => {
      const carried = /** @type {BaselineRow} */ ({
        path: row.path,
        inSitemap: row.inSitemap,
        status: row.status,
        location: row.location ?? null,
      });
      const copy = copyDigests[row.path];
      if (copy !== undefined) carried.copy = copy;
      const chrome = chromeDigests[row.path];
      if (chrome !== undefined) carried.chrome = chrome;
      return carried;
    })
    .sort(byPath);
  /** @type {Baseline} */
  const baseline = { version: BASELINE_VERSION, verified, rows };
  if (assets !== undefined) baseline.assets = [...assets].sort(byAssetUrl);
  if (accepted !== undefined && accepted.length > 0) baseline.accepted = [...accepted].sort(byAcceptance);
  return baseline;
}

/**
 * What moved between two baselines, by path. A path only in this run is added;
 * a path only in the previous run is removed — the case the frozen Capture list
 * cannot see, because a path it does not hold can leave the watched universe
 * entirely; a path in both whose carried fields moved is changed, with the
 * fields that moved.
 *
 * Every carried field is compared generically, so a field a later ticket adds
 * to the row (a projection digest) is diffed the moment it is recorded — there
 * is no per-field list here for that ticket to forget to update.
 * @param {Baseline} previous
 * @param {Baseline} current
 * @returns {import('./upstream-watch.mjs').BaselineDelta}
 */
export function diffBaseline(previous, current) {
  const before = new Map(previous.rows.map((r) => [r.path, r]));
  const after = new Map(current.rows.map((r) => [r.path, r]));
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const removed = [];
  /** @type {import('./upstream-watch.mjs').ChangedRow[]} */
  const changed = [];
  for (const p of after.keys()) if (!before.has(p)) added.push(p);
  for (const p of before.keys()) if (!after.has(p)) removed.push(p);
  for (const [p, row] of after) {
    const was = before.get(p);
    if (!was) continue;
    const from = new Map(Object.entries(was));
    const to = new Map(Object.entries(row));
    /** @type {import('./upstream-watch.mjs').FieldDelta[]} */
    const fields = [];
    for (const key of [...new Set([...from.keys(), ...to.keys()])].sort()) {
      if (key === 'path') continue;
      const a = from.get(key) ?? null;
      const b = to.get(key) ?? null;
      if (a !== b) fields.push({ field: key, from: a, to: b });
    }
    if (fields.length > 0) changed.push({ path: p, fields });
  }
  added.sort();
  removed.sort();
  changed.sort(byPath);
  return { from: previous.verified, added, removed, changed };
}

/**
 * The live fingerprint a difference is matched by. Every current difference
 * carries one — a copy or chrome finding has a digest for its page, a restyle
 * finding has a record, media has its liveness class — so a missing one is a
 * broken measurement. Refusing it keeps an empty string from ever being
 * recorded, which would match a later missing digest and go quiet.
 * @param {string|undefined} fingerprint
 * @param {string} what
 * @returns {string}
 */
function liveFingerprint(fingerprint, what) {
  if (fingerprint === undefined) throw new Error(`no live fingerprint for ${what}`);
  return fingerprint;
}

/**
 * One run of the watch, as a value. Builds ticket 01's index report, compares
 * the copy projection live versus served when the edge hands it `copyPages`
 * (ticket 03) and the chrome projection when it hands it `chromePages` (ticket
 * 04), classifies every media slot when the edge hands it `mediaPages` and
 * `mediaProbes` (ticket 06), derives this run's baseline (carrying the copy and
 * chrome digests and the shared asset set) and diffs it against the previous
 * one. `write` is true only for the
 * silent first run (no previous baseline) or an explicit accept; a plain run
 * with a previous baseline never moves the reference point.
 * `--accept-drift` records the current run's copy, chrome, restyle and media
 * differences as known (ticket 08), so a later plain run reports them as
 * accepted rather than as findings and exits 0; a difference whose live side
 * moves again no longer matches and re-alarms. The accepted set is committed in
 * the baseline and only `--accept-drift` rewrites it.
 * @param {RunInputs} inputs
 * @returns {WatchRun}
 */
export function runWatch(inputs) {
  const { previous = null, accept = false, acceptDrift = false, verified, copyPages, chromePages, assets, mediaPages, mediaProbes, ...rest } = inputs;
  const report = buildWatchReport(rest);
  const copy = copyPages === undefined ? null : copyReport(copyPages);
  const chrome = chromePages === undefined ? null : chromeReport(chromePages);
  // Media liveness is an absolute measurement, not a comparison against the
  // previous baseline: a dead media is dead on the silent first run too, so its
  // findings are never suppressed. Unlike the restyle tier it needs no prior
  // state, and unlike a copy or chrome digest it cannot be a false positive.
  const media = mediaPages === undefined ? null : mediaReport(mediaPages, mediaProbes ?? {});
  // The restyle tier is a comparison against the previous baseline's asset set;
  // the silent first run has none, so its findings are suppressed below but the
  // run's own asset set is still recorded.
  const restyle = assets === undefined ? null : assetReport(assets, previous?.assets ?? []);

  // The current run's differences, each carrying the live fingerprint an
  // accepted entry must match. Index added/removed is deliberately absent:
  // --accept-drift records content drift, not the page set.
  /** @type {import('./upstream-accept.mjs').AcceptanceEntry[]} */
  const differences = [];
  for (const finding of copy?.findings ?? []) differences.push({ tier: 'copy', path: finding.path, fingerprint: liveFingerprint(copy?.digests[finding.path], `copy ${finding.path}`) });
  for (const finding of chrome?.findings ?? []) differences.push({ tier: 'chrome', path: finding.path, fingerprint: liveFingerprint(chrome?.digests[finding.path], `chrome ${finding.path}`) });
  if (previous !== null) {
    for (const finding of restyle?.findings ?? []) {
      const record = restyle?.records.find((r) => r.url === finding.url);
      differences.push({ tier: 'restyle', url: finding.url, fingerprint: liveFingerprint(record?.digest, `restyle ${finding.url}`) });
    }
  }
  for (const finding of media?.findings ?? []) differences.push({ tier: 'media', path: finding.path, slot: finding.slot, fingerprint: finding.liveness });

  // On --accept-drift every current difference is recorded, so none is a
  // finding on the run that accepts it; a plain run matches against the
  // committed set. The set is replaced, never merged.
  const partitioned = acceptDrift
    ? { accepted: differences, active: /** @type {import('./upstream-accept.mjs').AcceptanceEntry[]} */ ([]) }
    : partitionAccepted(differences, previous?.accepted ?? []);
  /** @type {Set<string>} */
  const copyActive = new Set();
  /** @type {Set<string>} */
  const chromeActive = new Set();
  /** @type {Set<string>} */
  const restyleActive = new Set();
  /** @type {Set<string>} */
  const mediaActive = new Set();
  for (const difference of partitioned.active) {
    if (difference.tier === 'copy') copyActive.add(difference.path);
    else if (difference.tier === 'chrome') chromeActive.add(difference.path);
    else if (difference.tier === 'restyle') restyleActive.add(difference.url);
    else if (difference.tier === 'media') mediaActive.add(mediaSlotIdentity(difference.path, difference.slot));
  }
  const copyFindings = (copy?.findings ?? []).filter((f) => copyActive.has(f.path));
  const chromeFindings = (chrome?.findings ?? []).filter((f) => chromeActive.has(f.path));
  const restyleFindings = previous === null || restyle === null ? [] : restyle.findings.filter((f) => restyleActive.has(f.url));
  const mediaFindings = (media?.findings ?? []).filter((f) => mediaActive.has(mediaSlotIdentity(f.path, f.slot)));

  // --accept-drift advances the moving reference exactly as --accept does,
  // except the shared asset set: the restyle finding *is* the comparison
  // against that set, so advancing it would absorb the difference and stop it
  // being shown as accepted. The accepted entry carries the new digest, and a
  // plain --accept is what advances the asset reference.
  const assetsForBaseline = acceptDrift && previous?.assets !== undefined ? previous.assets : restyle?.records;
  const baseline = baselineFromReport(report, verified, {
    copyDigests: copy?.digests,
    chromeDigests: chrome?.digests,
    assets: assetsForBaseline,
    accepted: acceptDrift ? acceptanceEntries(differences) : previous?.accepted,
  });
  /** @type {import('./upstream-watch.mjs').BaselineDelta} */
  const since = previous === null ? { from: null, added: [], removed: [], changed: [] } : diffBaseline(previous, baseline);
  const write = previous === null || accept || acceptDrift;
  // The report states the date the committed baseline carries *after* this run:
  // the new date when this run records one, the previous baseline's when a plain
  // run leaves the reference point alone — never today's date for a run that
  // recorded nothing.
  const recorded = write ? verified : previous.verified;
  // The chrome tier carries two distinguishable things: the per-page chrome
  // findings and, nested under `restyle`, the shared-asset findings. The silent
  // first run reports the asset count but no findings.
  const chromeTier =
    chrome === null && restyle === null
      ? null
      : {
          compared: chrome?.compared ?? 0,
          differed: chromeFindings.length,
          findings: chromeFindings,
          hits: chrome?.hits ?? [],
          ...(restyle === null
            ? {}
            : {
                restyle: {
                  compared: restyle.compared,
                  differed: restyleFindings.length,
                  findings: restyleFindings,
                },
              }),
        };

  // The pages a future re-capture would need: every page carrying any drift
  // this run still reports — a non-accepted per-page finding, the index tier's
  // added/removed set, or a row that moved against the baseline. Restyle
  // findings name an asset, not a page, so they contribute no page.
  const candidates = new Set();
  for (const difference of partitioned.active) {
    if (difference.tier !== 'restyle') candidates.add(difference.path);
  }
  for (const p of report.findings.added) candidates.add(p);
  for (const removed of report.findings.removed) candidates.add(removed.path);
  for (const p of since.added) candidates.add(p);
  for (const p of since.removed) candidates.add(p);
  for (const change of since.changed) candidates.add(change.path);

  return {
    report: {
      ...report,
      verified: recorded,
      since,
      refreshCandidates: [...candidates].sort(),
      ...(copy === null ? {} : { copy: { compared: copy.compared, differed: copyFindings.length, findings: copyFindings } }),
      ...(chromeTier === null ? {} : { chrome: chromeTier }),
      ...(media === null ? {} : { media: { compared: media.compared, differed: mediaFindings.length, findings: mediaFindings, liveness: media.liveness } }),
      ...(partitioned.accepted.length === 0 ? {} : { accepted: { count: partitioned.accepted.length, entries: partitioned.accepted } }),
    },
    baseline,
    write,
  };
}

/**
 * Whether a write target lies outside the served tree. The edge writes exactly
 * two files — the baseline and `--out` evidence — and ticket 02's rule is that
 * no run writes anywhere in `served/`; this is the pure test the edge applies
 * before it writes, so a mistyped `--out served/...` is refused rather than
 * becoming an unlogged edit of the artifact.
 * @param {string} target
 * @param {string} servedRoot
 * @returns {boolean}
 */
export function outsideServedTree(target, servedRoot) {
  const rel = path.relative(path.resolve(servedRoot), path.resolve(target));
  return rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel));
}
