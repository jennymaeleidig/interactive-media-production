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
 */

/**
 * The committed state: one row per watched URL, plus the date the run verified.
 * @typedef {Object} Baseline
 * @property {number} version
 * @property {string} verified  the **verified-in-sync date**, `YYYY-MM-DD`
 * @property {BaselineRow[]} rows
 */

/**
 * Ticket 01's report inputs plus ticket 02's baseline state and ticket 03's
 * copy pages.
 * @typedef {import('./upstream-watch.mjs').ReportInputs & {previous?: Baseline|null, accept?: boolean, verified: string, copyPages?: import('./upstream-copy.mjs').CopyPage[]}} RunInputs
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
  const { version, verified, rows } = /** @type {Record<string, unknown>} */ (parsed);
  if (version !== BASELINE_VERSION) return bad(`unknown version ${String(version)}`);
  if (typeof verified !== 'string' || !VERIFIED_DATE_PATTERN.test(verified)) return bad('missing or malformed verified date');
  if (!Array.isArray(rows)) return bad('rows is not an array');
  return { version, verified, rows: rows.map(readRow) };
}

/**
 * The committed text form: rows in path order, two-space JSON, trailing
 * newline, so a re-accepted baseline only changes when its content does.
 * @param {Baseline} baseline
 * @returns {string}
 */
export function serializeBaseline(baseline) {
  const rows = [...baseline.rows].sort(byPath);
  return `${JSON.stringify({ version: baseline.version, verified: baseline.verified, rows }, null, 2)}\n`;
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
 * @param {Record<string, string>} [copyDigests]  path → live copy-projection digest
 * @returns {Baseline}
 */
export function baselineFromReport(report, verified, copyDigests = {}) {
  const rows = report.inventory
    .map((row) => {
      const carried = { path: row.path, inSitemap: row.inSitemap, status: row.status, location: row.location ?? null };
      const digest = copyDigests[row.path];
      return digest === undefined ? carried : { ...carried, copy: digest };
    })
    .sort(byPath);
  return { version: BASELINE_VERSION, verified, rows };
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
 * One run of the watch, as a value. Builds ticket 01's index report, compares
 * the copy projection live versus served when the edge hands it `copyPages`
 * (ticket 03), derives this run's baseline — carrying the copy digests — and diffs it
 * against the previous one. `write` is true only for the silent first run (no
 * previous baseline) or an explicit accept; a plain run with a previous
 * baseline never moves the reference point.
 * @param {RunInputs} inputs
 * @returns {WatchRun}
 */
export function runWatch(inputs) {
  const { previous = null, accept = false, verified, copyPages, ...rest } = inputs;
  const report = buildWatchReport(rest);
  const copy = copyPages === undefined ? null : copyReport(copyPages);
  const baseline = baselineFromReport(report, verified, copy?.digests ?? {});
  /** @type {import('./upstream-watch.mjs').BaselineDelta} */
  const since = previous === null ? { from: null, added: [], removed: [], changed: [] } : diffBaseline(previous, baseline);
  const write = previous === null || accept;
  // The report states the date the committed baseline carries *after* this run:
  // the new date when this run records one, the previous baseline's when a plain
  // run leaves the reference point alone — never today's date for a run that
  // recorded nothing.
  const recorded = previous === null || accept ? verified : previous.verified;
  return {
    report: {
      ...report,
      verified: recorded,
      since,
      ...(copy === null ? {} : { copy: { compared: copy.compared, differed: copy.differed, findings: copy.findings } }),
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
