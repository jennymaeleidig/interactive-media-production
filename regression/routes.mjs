// The full-scale route check (ticket 07): every route class the serving layer
// answers, asserted over HTTP against the running production server.
//
//   200  every live page from the build log serves its captured page
//   301  every legacy redirect stub answers its permanent redirect, to the
//        local target the run manifest named
//   404  every dead collection root, every auth-gated stub, and every dropped
//        scaffold/test page
//
// Plus the whole-site count invariant: served + dropped + errors accounts for
// every page the capture run listed (the inventory's live-page count).
//
// The expectation builder (`routeExpectations`) and the count check are pure —
// unit-tested in `test/routes.test.ts`. The check itself is environmental (it
// needs Docker? no — just the built app and the served tree), so it is not a
// test-suite member: the suite must stay green on a fresh clone.
//
// Usage: node regression/routes.mjs [--served served] [--run <captureRunDir>]
//        [--base http://host:port]   (--base skips starting its own server)
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROPPED_PAGES } from '../pipeline/config.mjs';
import { startServer } from './server.mjs';
import { makeArg, invokedDirectly } from '../pipeline/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/**
 * One expected response: a path and the status (and, for redirects, the
 * Location) the serving layer must answer it with.
 * @typedef {{path: string, status: number, location?: string}} RouteExpectation
 */

/**
 * The route classes a build produces — the shape `routeExpectations` consumes
 * and `checkRoutes` counts (a `RouteClasses` born from `UncapturedManifest`
 * plus the build's served/dropped sets).
 * @typedef {Object} RouteClasses
 * @property {string[]} served
 * @property {string[]} dropped
 * @property {Record<string,string>} redirects
 * @property {string[]} dead
 * @property {string[]} authGated
 */

/**
 * The one-line route-class summary both the gate preflight and the standalone
 * route check print (kept here so the two can never drift).
 * @param {{served: number, redirects: number, dropped: number, dead: number, authGated: number}} counts
 * @returns {string}
 */
export function formatRouteCounts(counts) {
  return `${counts.served} served 200 · ${counts.redirects} stub 301 · ${counts.dropped} dropped/test 404 · ${counts.dead} dead 404 · ${counts.authGated} auth-gated 404`;
}

/**
 * Build the expected route classes. A path may appear in more than one class
 * only by a build mistake; the more specific expectation wins (a served page
 * over a redirect over a 404) and the conflict is reported.
 *
 * @param {RouteClasses} routes
 * @returns {{expectations: RouteExpectation[], conflicts: string[]}}
 */
export function routeExpectations({ served, dropped, redirects, dead, authGated }) {
  /** @type {Map<string, RouteExpectation>} */
  const byPath = new Map();
  const conflicts = [];
  const add = (e) => {
    const prev = byPath.get(e.path);
    if (!prev) {
      byPath.set(e.path, e);
      return;
    }
    if (prev.status === e.status && prev.location === e.location) return;
    conflicts.push(`${e.path}: ${prev.status} vs ${e.status}`);
    if (e.status < prev.status) byPath.set(e.path, e); // 200 beats 301 beats 404
  };
  for (const p of served) add({ path: p, status: 200 });
  for (const [p, target] of Object.entries(redirects)) add({ path: p, status: 301, location: target });
  for (const p of dropped) add({ path: p, status: 404 });
  for (const p of dead) add({ path: p, status: 404 });
  for (const p of authGated) add({ path: p, status: 404 });
  return { expectations: [...byPath.values()], conflicts };
}

/** Count invariant: served + dropped + errors == the inventory listing. */
export function countFailures({ served, dropped, errors, listing }) {
  const failures = [];
  if (served + dropped + errors !== listing) {
    failures.push(`count mismatch: ${served} served + ${dropped} dropped + ${errors} errors = ${served + dropped + errors}, but the inventory lists ${listing}`);
  }
  return failures;
}

/**
 * The strip audit, as a site-wide invariant: every page's post-strip tracker
 * residue counts are zero and its served bytes carry no capture-derived
 * executable script — only inert ld+json and the Recreation's own marked
 * runtimes.
 * @param {{page: string, error?: string, audit?: Record<string, number>, scripts?: {executable: number}}[]} buildLog
 * @returns {string[]}
 */
export function auditFailures(buildLog) {
  const failures = [];
  for (const e of buildLog) {
    if (e.error) continue;
    const residue = Object.entries(e.audit ?? {}).filter(([, n]) => n > 0);
    if (residue.length > 0) {
      failures.push(`${e.page}: tracker residue ${residue.map(([k, n]) => `${k}=${n}`).join(' ')}`);
    }
    if ((e.scripts?.executable ?? 0) > 0) {
      failures.push(`${e.page}: ${e.scripts?.executable} executable script(s) in served bytes`);
    }
  }
  return failures;
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Check every route class against `base`. Reads the build's own artifacts, so
 * it measures exactly what the build produced, not what a caller believes.
 * @param {string} base  Origin of the running server.
 * @param {{servedDir: string, runDir: string}} opts
 * @returns {Promise<{failures: string[], checked: number, counts: Record<string, number>}>}
 */
export async function checkRoutes(base, { servedDir, runDir }) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(servedDir, name), 'utf8'));
  const buildLog = read('build-log.json');
  const summary = read('build-summary.json');
  const redirects = read('redirects.json');
  const served = buildLog.filter((e) => !e.error).map((e) => e.page);
  // the drop rule is build config, not the summary: assert every configured
  // scaffold/test page 404s, whether or not a scoped build requested it
  const dropped = DROPPED_PAGES;
  const droppedRequested = summary.dropped ?? [];
  const dead = summary.deadRoots ?? [];
  const authGated = summary.authGated ?? [];
  const failures = [];

  if (served.length !== summary.served) {
    failures.push(`build log has ${served.length} served page(s) but the summary says ${summary.served} — re-run \`npm run pipeline\``);
  }
  if (Object.keys(redirects).length !== summary.redirects?.count) {
    failures.push(`redirects.json has ${Object.keys(redirects).length} entries but the summary says ${summary.redirects?.count}`);
  }
  const listing = fs.readFileSync(path.join(runDir, 'capture-list.txt'), 'utf8').trim().split('\n').filter((l) => l.trim() !== '').length;
  if (summary.requested !== listing) {
    failures.push(`the build requested ${summary.requested} page(s) but the capture run lists ${listing} — served tree and capture run are out of sync`);
  }
  failures.push(...countFailures({ served: served.length, dropped: droppedRequested.length, errors: summary.errors?.length ?? 0, listing }));
  failures.push(...auditFailures(buildLog));

  const { expectations, conflicts } = routeExpectations({ served, dropped, redirects, dead, authGated });
  failures.push(...conflicts.map((c) => `route class conflict — ${c}`));

  const results = await mapLimit(expectations, 16, async (e) => {
    try {
      const res = await fetch(base + e.path, { redirect: 'manual' });
      res.body?.cancel().catch(() => {}); // status + headers only — never buffer a 3 MB page
      return { e, status: res.status, location: res.headers.get('location') };
    } catch (err) {
      return { e, error: err instanceof Error ? err.message : String(err) };
    }
  });
  for (const r of results) {
    if (r.error) {
      failures.push(`${r.e.path}: request failed (${r.error})`);
      continue;
    }
    if (r.status !== r.e.status) failures.push(`${r.e.path}: expected ${r.e.status}, got ${r.status}`);
    else if (r.e.location && r.location !== r.e.location) failures.push(`${r.e.path}: expected redirect to ${r.e.location}, got ${r.location ?? '(none)'}`);
  }

  return {
    failures,
    checked: expectations.length,
    counts: {
      served: served.length,
      redirects: Object.keys(redirects).length,
      dropped: dropped.length,
      droppedRequested: droppedRequested.length,
      dead: dead.length,
      authGated: authGated.length,
      inventory: listing,
    },
  };
}

// ---- CLI ----------------------------------------------------------------------

async function main() {
  const arg = makeArg(process.argv.slice(2));
  const servedDir = path.resolve(ROOT, arg('--served') ?? 'served');
  const { CAPTURE_RUN } = await import('../pipeline/config.mjs');
  const runDir = path.resolve(ROOT, arg('--run') ?? CAPTURE_RUN);

  for (const [label, file] of [['served tree', servedDir], ['build-summary.json', path.join(servedDir, 'build-summary.json')], ['capture run', runDir]]) {
    if (!fs.existsSync(file)) {
      console.error(`✗ ${label} missing at ${file} — run \`npm run pipeline\` first`);
      process.exit(1);
    }
  }

  const external = arg('--base');
  let server = null;
  try {
    server = external ? { base: external, stop: async () => {} } : await startServer();
    const r = await checkRoutes(server.base, { servedDir, runDir });
    console.log('Route check (ticket 07) — every route class over HTTP');
    console.log(`  ${r.checked} route(s): ${formatRouteCounts(r.counts)}`);
    console.log(`  count identity: served + dropped = ${r.counts.served} + ${r.counts.droppedRequested} = ${r.counts.served + r.counts.droppedRequested}, against ${r.counts.inventory} inventory page(s)`);
    if (r.failures.length > 0) {
      console.log(`\n✗ ${r.failures.length} failure(s):`);
      for (const f of r.failures) console.log(`  ${f}`);
      process.exitCode = 1;
    } else {
      console.log('\n✓ Route classes green.');
    }
  } finally {
    if (server) await server.stop();
  }
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
