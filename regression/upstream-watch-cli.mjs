// The upstream watch's network edge (ticket 01): fetch the sitemap and homepage,
// probe every path in the watched universe once, hand the bytes to the pure core,
// and print what it decides. This file decides nothing itself — it adds only the
// network and the process exit code.
//
// It is deliberately outside the test suite: the suite must stay green on a fresh
// clone with no network, so the core is pinned by fixtures and this edge is run
// by hand (`npm run upstream`). Its entire filesystem surface is the single
// `readFileSync` named import below — it cannot write to `served/` or any tree
// record because it has no write function in scope. The baseline is the frozen
// Capture list; there is no flag to point the run at another list or origin.
//
// Usage: npm run upstream [-- --json]
//
// Exit codes: 0 no findings, 1 findings, 2 operational failure (an incomplete
// measurement — a failed fetch, an unparsable sitemap, a failed probe — is never
// reported as a clean one).
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_LIST } from '../pipeline/config.mjs';
import { invokedDirectly, mapLimit } from '../pipeline/cli.mjs';
import { buildWatchReport, exitCode, formatWatchReport, watchedUniverse } from './upstream-watch.mjs';

const ORIGIN = 'https://www.flocksafety.com';
const CONCURRENCY = 8;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CAPTURE_FILE = path.resolve(ROOT, CAPTURE_LIST);

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

/** Probe one URL without following redirects, so the raw 3xx and Location show. */
async function probe(url) {
  const res = await fetch(url, { redirect: 'manual' });
  res.body?.cancel().catch(() => {});
  return { status: res.status, location: res.headers.get('location') };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const captureList = readFileSync(CAPTURE_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  let sitemapXml;
  let homepageHtml;
  try {
    [sitemapXml, homepageHtml] = await Promise.all([fetchText(`${ORIGIN}/sitemap.xml`), fetchText(`${ORIGIN}/`)]);
  } catch (err) {
    return fail(`upstream watch could not measure upstream: ${message(err)}`);
  }

  const inputs = { origin: ORIGIN, sitemapXml, homepageHtml, captureList };

  /** @type {string[]} */
  let universe;
  try {
    universe = watchedUniverse(inputs);
  } catch (err) {
    return fail(`upstream watch could not read upstream's sitemap: ${message(err)}`);
  }
  if (universe.length === 0) {
    return fail('upstream watch found no URLs to probe — the sitemap, homepage, and Capture list were all empty');
  }

  const results = await mapLimit(universe, CONCURRENCY, async (/** @type {string} */ watched) => {
    try {
      return { path: watched, probe: await probe(ORIGIN + watched) };
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
  for (const result of results) probes[result.path] = { status: result.probe.status, location: result.probe.location };

  let report;
  try {
    report = buildWatchReport({ ...inputs, probes });
  } catch (err) {
    return fail(`upstream watch could not build the report: ${message(err)}`);
  }
  console.log(asJson ? JSON.stringify(report, null, 2) : formatWatchReport(report));
  process.exitCode = exitCode(report);
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });
}
