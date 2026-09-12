// The scoped re-capture driver (ticket 11, step 3): a fresh dated run folder
// under `research/flocksafety/<run-date>/` with the ticket-03 artifacts, and
// the corrected-flags SingleFile defaults ticket 15 made mandatory.
//
// The driver never overwrites an earlier run: `assertFreshRunDir` refuses an
// occupied run folder, so a refresh is always a new dated folder the build's
// capture pointer can move to when the drift has been processed.
//
// The Docker walk is injected (`capture`), so the bookkeeping — list, manifest,
// per-page status, title repair — is unit-tested without the daemon or network.
//
// Ops tool — NOT part of the build; it needs the network and Docker and reads
// the wall clock, which the pipeline purity rule forbids, so it is the
// documented exception (like `pipeline/video-probe.mjs`), run by hand and never
// by `npm test`: a live-site or registry outage must not fail the suite.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeArg, invokedDirectly } from './cli.mjs';
import { SITE_ORIGIN, extractTitle, localDate, mapLimit, parseCsvLine, parseInventoryCsv, toCsv } from './inventory.mjs';

/**
 * @typedef {import('./inventory.mjs').InventoryRow} InventoryRow
 * @typedef {{ exit: number, bytes: number, secs: number, verdict: 'saved' | 'empty' | 'failed' | 'skipped-existing', stderr?: string }} CaptureResult
 * @typedef {{ url: string, rel: string, exit: number, bytes: number, secs: number, verdict: string }} StatusRow
 */

/** The manifest columns the build's route classes read (pipeline/run-manifest.mjs). */
export const MANIFEST_COLUMNS = ['path', 'url', 'type', 'status', 'redirect_target', 'capture'];

/** The per-page status columns ticket 03's run folder established. */
export const STATUS_COLUMNS = ['url', 'rel', 'exit', 'bytes', 'secs', 'verdict'];

/** Where dated capture runs live: heavy HTML gitignored, CSVs/MD tracked. */
export function captureRunDir(runDate) {
  return `.scratch/flock-parody/research/flocksafety/${runDate}`;
}

/**
 * Refuse to write into a run folder that already holds an earlier run. An empty
 * (or absent) directory is fresh; any entry means a run is already there.
 * @param {string} dir
 */
export function assertFreshRunDir(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    throw new Error(`run folder already exists and is not empty: ${dir}`);
  }
}

/**
 * URL → capture path, URL hierarchy preserved (`/` → `index.html`), matching
 * the 2026-09-09 run's layout.
 * @param {string} url
 * @returns {string}
 */
export function urlToRel(url) {
  const pathname = new URL(url, SITE_ORIGIN).pathname;
  if (pathname === '/' || pathname === '') return 'index.html';
  return `${pathname.replace(/^\/+|\/+$/g, '')}.html`;
}

/**
 * The pages a run captures: live pages only, in inventory order, filtered to
 * the scope when one is given.
 * @param {InventoryRow[]} rows
 * @param {string[]} [scope]  paths to restrict to
 * @returns {string[]} absolute URLs
 */
export function buildCaptureList(rows, scope) {
  const wanted = scope ? new Set(scope) : null;
  return rows.filter((r) => r.status === '200' && (!wanted || wanted.has(r.path))).map((r) => r.url);
}

/**
 * The run's uncaptured manifest: redirect stubs, dead roots, and auth-gated
 * stubs, sorted by path — the build's route classes. Pages that never answered
 * are returned separately as `unreachable` (they are neither captured nor a
 * route class, so the caller surfaces them).
 * @param {InventoryRow[]} rows
 * @returns {{ rows: Record<string, string>[], csv: string, unreachable: string[] }}
 */
export function buildUncapturedManifest(rows) {
  const captureLabel = { redirect: 'redirect-stub', dead: 'dead-not-captured', 'auth-gated': 'auth-gated' };
  const manifest = rows
    .filter((r) => r.status !== '200' && r.status !== 'unreachable')
    .map((r) => ({
      path: r.path,
      url: r.url,
      type: r.type,
      status: r.status,
      redirect_target: r.redirect_target,
      capture: captureLabel[r.type] ?? r.type,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    rows: manifest,
    csv: toCsv(MANIFEST_COLUMNS, manifest),
    unreachable: rows.filter((r) => r.status === 'unreachable').map((r) => r.path),
  };
}

/**
 * Merge a retry's status rows into an existing status CSV: one row per URL,
 * the retry winning, first-seen order preserved (the 2026-09-11 run folded
 * transient retries back this way).
 * @param {string} existingCsv
 * @param {StatusRow[]} newRows
 * @returns {StatusRow[]}
 */
export function mergeStatusRows(existingCsv, newRows) {
  /** @type {Map<string, StatusRow>} */
  const byUrl = new Map();
  const lines = existingCsv.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length > 0) {
    const cols = parseCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const fields = parseCsvLine(line);
      /** @type {Record<string, string>} */
      const row = {};
      cols.forEach((c, i) => { row[c] = fields[i] ?? ''; });
      if (row.url) byUrl.set(row.url, /** @type {StatusRow} */ (row));
    }
  }
  for (const row of newRows) byUrl.set(row.url, row);
  return [...byUrl.values()];
}

/**
 * Restore the inventory's static title when the site's runtime script swapped
 * it to the announcement title before capture.
 * @param {string} html
 * @param {string} title
 * @returns {{ html: string, changed: boolean }}
 */
export function repairTitle(html, title) {
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /<title([^>]*)>[\s\S]*?<\/title>/i;
  const m = re.exec(html);
  if (!m) return { html, changed: false };
  const next = `<title${m[1]}>${escaped}</title>`;
  if (m[0] === next) return { html, changed: false };
  return { html: html.replace(re, next), changed: true };
}

/**
 * A run's full per-page status: every live page in inventory order, the
 * captured rows kept and every page outside the scope marked
 * `skipped-stale-capture` (its capture comes from the previous run). A scoped
 * run still records the whole live set so the run folder is self-describing.
 * @param {InventoryRow[]} rows
 * @param {StatusRow[]} statusRows
 * @returns {StatusRow[]}
 */
export function fullStatusRows(rows, statusRows) {
  const byUrl = new Map(statusRows.map((r) => [r.url, r]));
  return rows
    .filter((r) => r.status === '200')
    .map((r) => byUrl.get(r.url) ?? { url: r.url, rel: urlToRel(r.url), exit: 0, bytes: 0, secs: 0, verdict: 'skipped-stale-capture' });
}

/**
 * Run a scoped (or full) re-capture into a fresh dated run folder.
 *
 * @param {Object} options
 * @param {InventoryRow[]} options.rows
 * @param {string} options.runDate
 * @param {string} options.runDir
 * @param {string[]} [options.scope]
 * @param {(url: string, rel: string) => Promise<CaptureResult>} options.capture
 * @param {number} [options.concurrency]
 * @param {boolean} [options.resume]  continue a partial run in place (retries)
 * @param {InventoryRow[]} [options.fallbackRows]  prior inventory used when the
 *   fresh one serves an empty title (a live-site regression must not blank a title)
 * @param {(message: string) => void} [options.log]
 */
export async function runRecapture({ rows, runDate, runDir, scope, capture, concurrency = 4, resume = false, fallbackRows = [], log = console.log }) {
  if (!resume) assertFreshRunDir(runDir);
  fs.mkdirSync(runDir, { recursive: true });

  const urls = buildCaptureList(rows, scope);

  // capture-list.txt is append-only: on resume, only URLs not already listed
  // are appended, so a retry never duplicates the list.
  const listFile = path.join(runDir, 'capture-list.txt');
  const existingList = resume && fs.existsSync(listFile) ? fs.readFileSync(listFile, 'utf8') : '';
  const listed = new Set(existingList.split(/\r?\n/).filter((l) => l.trim() !== ''));
  fs.writeFileSync(listFile, existingList + urls.filter((u) => !listed.has(u)).map((u) => `${u}\n`).join(''));

  // errors.log is a run artifact even when every page succeeded (wayfinding
  // step 3 lists it unconditionally), so it always exists.
  const errorsFile = path.join(runDir, 'errors.log');
  if (!fs.existsSync(errorsFile)) fs.writeFileSync(errorsFile, '');

  const manifest = buildUncapturedManifest(rows);
  fs.writeFileSync(path.join(runDir, 'manifest-uncaptured.csv'), manifest.csv);
  if (manifest.unreachable.length > 0) log(`⚠ ${manifest.unreachable.length} unreachable URL(s) not captured and not in the manifest: ${manifest.unreachable.join(', ')}`);

  const statusFile = path.join(runDir, 'capture-status.csv');
  const started = Date.now();
  let done = 0;
  const statusRows = await mapLimit(urls, concurrency, async (url) => {
    const rel = urlToRel(url);
    let result;
    try {
      result = await capture(url, rel);
    } catch (error) {
      result = { exit: 1, bytes: 0, secs: 0, verdict: 'failed', stderr: error instanceof Error ? error.message : String(error) };
    }
    done += 1;
    if (done % 10 === 0 || done === urls.length) {
      const rate = done / Math.max((Date.now() - started) / 1000, 1);
      log(`[${done}/${urls.length}] ${rate.toFixed(2)} pages/s, ~${Math.round((urls.length - done) / Math.max(rate, 0.01) / 60)} min left`);
    }
    if (result.verdict === 'failed' && result.stderr) {
      fs.appendFileSync(errorsFile, `--- ${url} (exit ${result.exit})\n${result.stderr.trim().split('\n').slice(-8).join('\n')}\n`);
    }
    return { url, rel, exit: result.exit, bytes: result.bytes, secs: result.secs, verdict: result.verdict };
  });

  const merged = resume && fs.existsSync(statusFile)
    ? mergeStatusRows(fs.readFileSync(statusFile, 'utf8'), fullStatusRows(rows, statusRows))
    : fullStatusRows(rows, statusRows);
  fs.writeFileSync(statusFile, toCsv(STATUS_COLUMNS, merged));

  // Title repair: restore each capture's static title from the fresh inventory.
  // The live site currently serves an empty `<title>` on a set of pages (a
  // Webflow republish regression), and the runtime swap still fires there; an
  // empty fresh title would blank such a page. When the fresh title is empty,
  // fall back to the prior inventory's title — that is the last known static
  // ground truth, and user story 7 wants the real static title, not a blank.
  const titleByRel = new Map(rows.filter((r) => r.status === '200').map((r) => [urlToRel(r.url), r.title]));
  const fallbackByRel = new Map(fallbackRows.filter((r) => r.status === '200' && r.title.trim() !== '').map((r) => [urlToRel(r.url), r.title]));
  const repairs = [];
  for (const row of statusRows) {
    if (row.verdict !== 'saved' && row.verdict !== 'skipped-existing') continue;
    const file = path.join(runDir, row.rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const fresh = (titleByRel.get(row.rel) ?? '').trim();
    const target = fresh !== '' ? fresh : (fallbackByRel.get(row.rel) ?? '');
    const { html: fixed, changed } = repairTitle(html, target);
    if (changed) {
      fs.writeFileSync(file, fixed);
      repairs.push({ url: row.url, rel: row.rel, from: extractTitle(html), to: target });
    }
  }
  fs.writeFileSync(path.join(runDir, 'title-repairs.csv'), toCsv(['url', 'rel', 'from', 'to'], repairs));

  const counts = { saved: 0, failed: 0, empty: 0, skipped: 0 };
  for (const row of statusRows) {
    if (row.verdict === 'saved') counts.saved += 1;
    else if (row.verdict === 'failed') counts.failed += 1;
    else if (row.verdict === 'empty') counts.empty += 1;
    else counts.skipped += 1;
  }
  log(`${runDate}: ${counts.saved} saved, ${counts.failed} failed, ${counts.empty} empty, ${counts.skipped} skipped · ${repairs.length} title repair(s) → ${runDir}`);
  return { ...counts, repairs: repairs.length, rows: statusRows };
}

// ---- the Docker capture (CLI) ------------------------------------------------

const IMAGE = 'capsulecode/singlefile:latest';

/**
 * SingleFile's arguments, with the corrected flags ticket 15 requires: keep
 * hidden subtrees (`--remove-hidden-elements=false`) and state CSS
 * (`--remove-unused-styles=false`). The defaults strip both site-wide.
 */
export function singleFileArgs(url, rel) {
  return [
    '--browser-executable-path', '/usr/bin/chromium-browser',
    '--browser-wait-until', 'networkIdle',
    '--browser-wait-delay', '2000',
    '--browser-load-max-time', '45000',
    '--browser-capture-max-time', '45000',
    '--remove-hidden-elements=false',
    '--remove-unused-styles=false',
    url, `/data/${rel}`,
  ];
}

/** The real capture: one `capsulecode/singlefile` container per page. */
export function dockerCapture(runDir) {
  return async (url, rel) => {
    const out = path.join(runDir, rel);
    if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
      return { exit: 0, bytes: fs.statSync(out).size, secs: 0, verdict: 'skipped-existing' };
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const started = Date.now();
    const proc = spawnSync('docker', [
      'run', '--rm', '--entrypoint', 'npx',
      '-v', `${path.resolve(runDir)}:/data`,
      IMAGE,
      'single-file', ...singleFileArgs(url, rel),
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const secs = (Date.now() - started) / 1000;
    const bytes = fs.existsSync(out) ? fs.statSync(out).size : 0;
    const verdict = proc.status === 0 && bytes > 1000 ? 'saved' : proc.status === 0 ? 'empty' : 'failed';
    return { exit: proc.status ?? 1, bytes, secs, verdict, stderr: proc.stderr ?? '' };
  };
}

// ---- CLI ---------------------------------------------------------------------

/** Accept a scope line that is a path, an absolute URL, or a capture rel path. */
function scopePath(line) {
  const s = line.trim().replace(/\.html$/, '').replace(/\/index$/, '');
  if (!s) return '';
  return new URL(s.startsWith('http') ? s : `${SITE_ORIGIN}${s.startsWith('/') ? '' : '/'}${s}`, SITE_ORIGIN).pathname;
}

async function main() {
  const arg = makeArg(process.argv.slice(2));
  const inventoryFile = arg('--inventory');
  const scopeFile = arg('--scope');
  const runDate = arg('--date') ?? localDate();
  if (!inventoryFile) {
    console.error('usage: node pipeline/recapture.mjs --inventory <fresh.csv> [--scope <recapture.txt>] [--fallback-inventory <prior.csv>] [--date YYYY-MM-DD] [--parallel 4] [--resume] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const rows = parseInventoryCsv(fs.readFileSync(inventoryFile, 'utf8'));
  const fallbackFile = arg('--fallback-inventory');
  const fallbackRows = fallbackFile ? parseInventoryCsv(fs.readFileSync(fallbackFile, 'utf8')) : [];
  const scope = scopeFile
    ? fs.readFileSync(scopeFile, 'utf8').split(/\r?\n/).map(scopePath).filter(Boolean)
    : undefined;
  const runDir = captureRunDir(runDate);
  const urls = buildCaptureList(rows, scope);
  const manifest = buildUncapturedManifest(rows);

  if (arg('--dry-run')) {
    console.log(`dry run — ${urls.length} page(s) to capture → ${runDir}`);
    console.log(`manifest: ${manifest.rows.length} uncaptured, ${manifest.unreachable.length} unreachable`);
    for (const url of urls) console.log(`  ${url}`);
    return;
  }

  const result = await runRecapture({
    rows,
    runDate,
    runDir,
    scope,
    capture: dockerCapture(runDir),
    concurrency: Number(arg('--parallel') ?? 4),
    resume: process.argv.includes('--resume'),
    fallbackRows,
  });
  if (result.failed > 0) {
    console.error(`${result.failed} page(s) failed — re-run with --resume after the transient cause clears`);
    process.exitCode = 1;
  }
}

if (invokedDirectly(import.meta.url)) await main();
