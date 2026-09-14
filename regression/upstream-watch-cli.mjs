// The upstream watch's network edge (tickets 01–06): fetch the sitemap and
// homepage, discover and fetch the site's shared asset set, probe every path in
// the watched universe once, fetch the body of every watched page the tree
// serves, ask each distinct media slot whether its media is alive, hand the
// bytes and the previous baseline to the pure cores, print what they decide, and
// record the baseline when the run is allowed to. This file
// decides nothing itself — it adds only the network, the filesystem, and the
// process exit code.
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
import { assetRefs } from './upstream-assets.mjs';
import { livenessUrl, mediaSlots } from './upstream-media.mjs';

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

/** Fetch one discovered shared asset's raw bytes; any non-2xx is an operational
 * failure, so an incomplete asset set can never be digested as a clean one.
 * @param {import('./upstream-assets.mjs').AssetRef} ref */
async function fetchAsset(ref) {
  const res = await fetch(ref.url);
  if (!res.ok) throw new Error(`${ref.url}: HTTP ${res.status}`);
  return { name: ref.name, url: ref.url, bytes: new Uint8Array(await res.arrayBuffer()) };
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

/** Probe one media slot's liveness URL. Every HTTP status is a completed
 * measurement — 404, 401 and 403 carry the class — so only a transport failure
 * throws; a status the rule cannot classify is thrown by the pure core and
 * becomes an operational failure. Only Wistia's metadata answers with a body,
 * so nothing else is read. @param {import('./upstream-media.mjs').MediaSlot} slot */
async function probeMedia(slot) {
  const res = await fetch(livenessUrl(slot), { redirect: 'manual' });
  if (slot.provider === 'wistia' && res.status === 200) return { status: res.status, body: await res.text() };
  res.body?.cancel().catch(() => {});
  return { status: res.status };
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

  // Ticket 05: the site's shared asset set, discovered from the live homepage's
  // own references. Fetched before the probe pass so a failure is an operational
  // error rather than a clean run with a partial asset set — and an empty
  // discovery is itself a failure, never a clean zero-asset measurement.
  /** @type {import('./upstream-assets.mjs').FetchedAsset[]} */
  let assets;
  try {
    const refs = assetRefs(homepageHtml, ORIGIN);
    if (refs.length === 0) {
      return fail('upstream watch discovered no shared assets on the live homepage — an empty asset set is a failed measurement, not a clean one');
    }
    assets = await mapLimit(refs, CONCURRENCY, fetchAsset);
  } catch (err) {
    return fail(`upstream watch could not fetch the shared asset set: ${message(err)}`);
  }

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

  // Read every served page the watched universe answers once. The copy
  // comparison needs the served bytes only where upstream answers 200, but the
  // media census needs every served page regardless of upstream status. The
  // census rides this map, so it is the whole tree only as long as every served
  // `.html` is reachable from the universe — true today (a served page outside
  // the universe would need its own tree walk; recorded in ticket 06).
  /** @type {Map<string, string>} */
  const servedHtml = new Map();
  for (const [watched, file] of servedFiles) servedHtml.set(watched, readFileSync(file, 'utf8'));
  /** @type {import('./upstream-media.mjs').MediaPage[]} */
  const mediaPages = [...servedHtml].map(([watched, html]) => ({ path: watched, html }));

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
    const served = servedHtml.get(result.path);
    if (body === undefined || served === undefined) continue;
    copyPages.push({ path: result.path, served, live: body });
  }

  // Media liveness: every allow-listed slot the served tree carries, asked once
  // per distinct media. An unclassifiable slot or a failed probe is an
  // operational failure, so the measurement is never silently partial.
  /** @type {Map<string, import('./upstream-media.mjs').MediaSlot>} */
  const slotsByKey = new Map();
  for (const page of mediaPages) {
    for (const slot of mediaSlots(page.html)) {
      if (slot.key === null) return fail(`upstream watch cannot classify an allow-listed media frame at ${page.path}: ${slot.url}`);
      if (!slotsByKey.has(slot.key)) slotsByKey.set(slot.key, slot);
    }
  }
  const mediaKeys = [...slotsByKey.keys()];
  const mediaResults = await mapLimit(mediaKeys, CONCURRENCY, async (/** @type {string} */ key) => {
    const slot = /** @type {import('./upstream-media.mjs').MediaSlot} */ (slotsByKey.get(key));
    try {
      return { key, probe: await probeMedia(slot) };
    } catch (err) {
      return { key, error: message(err) };
    }
  });
  /** @type {Array<{key: string, error: string}>} */
  const mediaFailed = mediaResults.filter((result) => 'error' in result);
  if (mediaFailed.length > 0) {
    console.error(`✗ ${mediaFailed.length} of ${mediaKeys.length} media probe(s) failed — the measurement is incomplete, so this is not a clean run:`);
    for (const f of mediaFailed.slice(0, 20)) console.error(`  ${f.key}: ${f.error}`);
    process.exitCode = 2;
    return;
  }
  /** @type {Record<string, import('./upstream-media.mjs').MediaProbe>} */
  const mediaProbes = {};
  for (const result of mediaResults) mediaProbes[result.key] = { status: result.probe.status, body: result.probe.body };

  let run;
  try {
    run = runWatch({ ...inputs, probes, previous, accept, verified, copyPages, chromePages: copyPages, assets, mediaPages, mediaProbes });
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
