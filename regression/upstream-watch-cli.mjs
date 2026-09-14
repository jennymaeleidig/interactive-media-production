// The upstream watch's network edge (tickets 01–04): fetch the sitemap and
// homepage, probe every path in the watched universe once, fetch the body of
// every watched page the tree serves, hand the bytes and the previous baseline
// to the pure cores, print what they decide, and record the baseline when the
// run is allowed to. This file decides nothing itself — it adds only the
// network, the filesystem, and the process exit code.
//
// It is deliberately outside the test suite: the suite must stay green on a
// fresh clone with no network, so the cores are pinned by fixtures and this edge
// is run by hand (`npm run upstream`). Since ticket 02 it writes exactly two
// files — the baseline and the optional `--out` evidence — and refuses any
// target inside `served/`, so a check can never become a second, unlogged editor
// of the artifact.
//
// Usage: npm run upstream [-- --accept] [--json] [--out <path>]
//
// The baseline is the moving reference point (regression/upstream-baseline.json):
// the first run records it silently, every later run diffs against it, and only
// `--accept` rewrites it.
//
// Exit codes: 0 no findings, 1 findings, 2 operational failure (an incomplete
// measurement — a failed fetch, an unparsable sitemap, a failed probe, an
// unreadable baseline — is never reported as a clean one).
//
// SPDX-License-Identifier: CC0-1.0
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_LIST } from '../pipeline/config.mjs';
import { invokedDirectly, makeArg, mapLimit } from '../pipeline/cli.mjs';
import { pageCandidates } from '../pipeline/served-tree.mjs';
import { exitCode, formatWatchReport, watchedUniverse } from './upstream-watch.mjs';
import { outsideServedTree, readBaseline, runWatch, serializeBaseline } from './upstream-baseline.mjs';

const ORIGIN = 'https://www.flocksafety.com';
const CONCURRENCY = 8;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CAPTURE_FILE = path.resolve(ROOT, CAPTURE_LIST);
const BASELINE_FILE = path.resolve(ROOT, 'regression', 'upstream-baseline.json');
const SERVED_ROOT = path.resolve(ROOT, 'served');

/** @param {unknown} err @returns {string} */
const message = (err) => (err instanceof Error ? err.message : String(err));

/** @param {string} detail */
function fail(detail) {
  console.error(`✗ ${detail}`);
  process.exitCode = 2;
}

/** Fetch a body as text; any non-2xx is an operational failure. */
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Probe one URL without following redirects, so the raw 3xx and Location show.
 * When the tree serves this path and upstream answers 200, read the body too —
 * it is the live side of the copy and chrome comparisons. A 3xx or 401 has no
 * page copy to compare, so its body is cancelled unread. */
async function probe(url, wantBody) {
  const res = await fetch(url, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (wantBody && res.status === 200) return { status: res.status, location, body: await res.text() };
  res.body?.cancel().catch(() => {});
  return { status: res.status, location };
}

/** The previous baseline, or null when there is none yet (the silent first run). */
function readPreviousBaseline() {
  let text;
  try {
    text = readFileSync(BASELINE_FILE, 'utf8');
  } catch (err) {
    if (err instanceof Error && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return null;
    throw err;
  }
  return readBaseline(text);
}

/**
 * The run's write targets, each checked against the served tree before any
 * write happens, so a refused target can never leave a half-written pair. The
 * resolved `--out` path is returned too, so the guard checks exactly the value
 * the write uses.
 * @param {string|null} out
 * @returns {{targets: string[], outPath: string|null}}
 */
function writeTargets(out) {
  const outPath = out === null ? null : path.resolve(process.cwd(), out);
  return { targets: outPath === null ? [BASELINE_FILE] : [BASELINE_FILE, outPath], outPath };
}

async function main() {
  const arg = makeArg(process.argv.slice(2));
  const asJson = process.argv.includes('--json');
  const accept = process.argv.includes('--accept');
  const out = arg('--out');
  const { targets, outPath } = writeTargets(out);
  const verified = new Date().toISOString().slice(0, 10);
  const captureList = readFileSync(CAPTURE_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  for (const target of targets) {
    if (!outsideServedTree(target, SERVED_ROOT)) {
      return fail(`upstream watch refuses to write inside the served tree: ${path.relative(ROOT, target) || target}`);
    }
  }

  let previous;
  try {
    previous = readPreviousBaseline();
  } catch (err) {
    return fail(`upstream watch could not read the baseline: ${message(err)}`);
  }

  let sitemapXml;
  let homepageHtml;
  try {
    [sitemapXml, homepageHtml] = await Promise.all([fetchText(`${ORIGIN}/sitemap.xml`), fetchText(`${ORIGIN}/`)]);
  } catch (err) {
    return fail(`upstream watch could not measure upstream: ${message(err)}`);
  }

  const inputs = { origin: ORIGIN, sitemapXml, homepageHtml, captureList };

  let universe;
  try {
    universe = watchedUniverse(inputs);
  } catch (err) {
    return fail(`upstream watch could not read upstream's sitemap: ${message(err)}`);
  }
  if (universe.length === 0) {
    return fail('upstream watch found no URLs to probe — the sitemap, homepage, and Capture list were all empty');
  }

  // The watched URLs the tree answers, resolved through the serving layer's own
  // rule, so the copy comparison runs on exactly the pages the server would
  // serve for those URLs.
  /** @type {Map<string, string>} */
  const servedFiles = new Map();
  for (const watched of universe) {
    const file = pageCandidates(SERVED_ROOT, watched).find((candidate) => existsSync(candidate));
    if (file !== undefined) servedFiles.set(watched, file);
  }

  const results = await mapLimit(universe, CONCURRENCY, async (/** @type {string} */ watched) => {
    try {
      return { path: watched, probe: await probe(ORIGIN + watched, servedFiles.has(watched)) };
    } catch (err) {
      return { path: watched, error: message(err) };
    }
  });
  /** @type {Array<{path: string, error: string}>} */
  const failed = results.filter((result) => 'error' in result);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} of ${universe.length} probe(s) failed — the measurement is incomplete, so this is not a clean run:`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.path}: ${f.error}`);
    process.exitCode = 2;
    return;
  }

  /** @type {Record<string, import('./upstream-watch.mjs').Probe>} */
  const probes = {};
  /** @type {import('./upstream-copy.mjs').CopyPage[]} */
  const copyPages = [];
  for (const result of results) {
    probes[result.path] = { status: result.probe.status, location: result.probe.location };
    const body = result.probe.body;
    const file = servedFiles.get(result.path);
    if (body === undefined || file === undefined) continue;
    copyPages.push({ path: result.path, served: readFileSync(file, 'utf8'), live: body });
  }

  let run;
  try {
    run = runWatch({ ...inputs, probes, previous, accept, verified, copyPages, chromePages: copyPages });
  } catch (err) {
    return fail(`upstream watch could not build the report: ${message(err)}`);
  }

  const text = asJson ? JSON.stringify(run.report, null, 2) : formatWatchReport(run.report);
  console.log(text);

  if (run.write) writeFileSync(BASELINE_FILE, serializeBaseline(run.baseline));
  if (outPath !== null) writeFileSync(outPath, `${text}\n`);

  process.exitCode = exitCode(run.report);
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });
}
