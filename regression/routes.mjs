// The full-scale serving check (tickets 06–07): every route class the serving
// layer answers, plus byte-identity of every served page, asserted over HTTP
// against the running production server.
//
//   200  every live page from the build log serves its captured page, and the
//        response body is byte-identical to the file the build wrote — same
//        bytes ⇒ same pixels, so this is the serving layer's whole guarantee
//        (the retired pixel gate compared those same bytes twice)
//   301  every legacy redirect stub answers its permanent redirect, to the
//        local target the run manifest named
//   404  every dead collection root, every auth-gated stub, and every dropped
//        scaffold/test page
//
// Plus the whole-site invariants: served + dropped + errors accounts for every
// page the frozen listing holds (`CAPTURE_LIST` — the page listing the
// 2026-09-12 capture run recorded, kept after the captures were scrapped), the
// site-wide strip audit (no
// tracker residue, no capture-derived executable script) holds on every page,
// and every extracted asset in the build's manifest answers at its
// content-addressed path with the content type its extension declares and a
// byte-identical body — a page's images can silently 404 while its
// page bytes stay identical, so assets need the same guarantee the pages get.
//
// The pure cores — `routeExpectations`, `countFailures`, `auditFailures`,
// `byteMismatch`, `formatRouteCounts` — are unit-tested in `test/routes.test.ts`;
// the served-tree path rules they read live in `pipeline/served-tree.mjs`,
// unit-tested in `test/served-tree.test.ts`.
// The check itself is environmental (it needs the built app and the served
// tree), so it is not a test-suite member: the suite must stay green on a
// fresh clone.
//
// Usage: node regression/routes.mjs [--served served]
//        [--base http://host:port]   (--base skips starting its own server)
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROPPED_PAGES } from '../pipeline/config.mjs';
import { audit, scriptCensus } from '../pipeline/audit.mjs';
import { mimeForExt, pageCandidates } from '../pipeline/served-tree.mjs';
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
 * The strip audit, as a site-wide invariant, re-evaluated on the served bytes
 * themselves rather than trusted from the build log: the residue classes are
 * all zero and the script census shows no capture-derived executable script.
 * The classes and the census are `pipeline/audit.mjs`'s — this only folds its
 * findings into the check's own failure messages, so the log's key names stop
 * being an interface between the build that wrote them and the check that reads
 * them.
 * @param {string} page
 * @param {string} html  the served page's bytes, decoded
 * @returns {string[]}
 */
export function auditFailures(page, html) {
  const failures = [];
  const residue = Object.entries(audit(html)).filter(([, n]) => n > 0);
  if (residue.length > 0) {
    failures.push(`${page}: tracker residue ${residue.map(([k, n]) => `${k}=${n}`).join(' ')}`);
  }
  const executable = scriptCensus(html).executable;
  if (executable > 0) {
    failures.push(`${page}: ${executable} executable script(s) in served bytes`);
  }
  return failures;
}

/** First differing byte offset of two buffers, or min length when one is a prefix. */
function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}

/**
 * A served page's HTTP body must be exactly the file the build wrote — the
 * serving layer's whole guarantee (same bytes ⇒ same pixels). Pure: buffers
 * in → a failure message or null.
 * @param {string} page
 * @param {Buffer} body   the response body bytes
 * @param {Buffer} file   the served file's bytes
 * @returns {string | null}
 */
export function byteMismatch(page, body, file) {
  if (body.equals(file)) return null;
  return `${page}: HTTP body differs from the served file at byte ${firstDifference(body, file)} (body ${body.length} bytes, file ${file.length} bytes)`;
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
 * @param {{servedDir: string, listingFile: string}} opts
 * @returns {Promise<{failures: string[], checked: number, byteChecked: number, assetChecked: number, counts: Record<string, number>}>}
 */
export async function checkRoutes(base, { servedDir, listingFile }) {
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
    failures.push(`build log has ${served.length} served page(s) but the summary says ${summary.served} — the tree's own two records disagree`);
  }
  if (Object.keys(redirects).length !== summary.redirects?.count) {
    failures.push(`redirects.json has ${Object.keys(redirects).length} entries but the summary says ${summary.redirects?.count}`);
  }
  const listing = fs.readFileSync(listingFile, 'utf8').trim().split('\n').filter((l) => l.trim() !== '').length;
  if (summary.requested !== listing) {
    failures.push(`the build requested ${summary.requested} page(s) but the page listing holds ${listing} — served tree and listing are out of sync`);
  }
  failures.push(...countFailures({ served: served.length, dropped: droppedRequested.length, errors: summary.errors?.length ?? 0, listing }));

  const { expectations, conflicts } = routeExpectations({ served, dropped, redirects, dead, authGated });
  failures.push(...conflicts.map((c) => `route class conflict — ${c}`));

  const results = await mapLimit(expectations, 16, async (e) => {
    try {
      const res = await fetch(base + e.path, { redirect: 'manual' });
      // status + headers for every class; the body only for served pages — the
      // byte-identity check is the serving layer's guarantee, and buffering a
      // 3 MB page for a 301/404 would be waste
      let bytes = null;
      if (e.status === 200) {
        bytes = Buffer.from(await res.arrayBuffer());
      } else {
        res.body?.cancel().catch(() => {});
      }
      return { e, status: res.status, location: res.headers.get('location'), bytes };
    } catch (err) {
      return { e, error: err instanceof Error ? err.message : String(err) };
    }
  });
  let byteChecked = 0;
  for (const r of results) {
    if (r.error) {
      failures.push(`${r.e.path}: request failed (${r.error})`);
      continue;
    }
    if (r.status !== r.e.status) failures.push(`${r.e.path}: expected ${r.e.status}, got ${r.status}`);
    else if (r.e.location && r.location !== r.e.location) failures.push(`${r.e.path}: expected redirect to ${r.e.location}, got ${r.location ?? '(none)'}`);
    // byte-identity for the served page the build wrote
    if (r.e.status === 200 && r.status === 200 && r.bytes) {
      // the invariant is re-evaluated on the served bytes, not read back from
      // the log the build wrote — an independent check of the same rule
      failures.push(...auditFailures(r.e.path, r.bytes.toString('utf8')));
      const file = pageCandidates(servedDir, r.e.path).find((f) => fs.existsSync(f));
      if (!file) {
        failures.push(`${r.e.path}: 200 but no served file at served/${r.e.path.replace(/^\/+/, '')}.html`);
      } else {
        byteChecked++;
        const mismatch = byteMismatch(r.e.path, r.bytes, fs.readFileSync(file));
        if (mismatch) failures.push(mismatch);
      }
    }
  }

  // Extracted assets: the same byte-identity guarantee the served
  // pages get, over the build's manifest. Without it a missing or renamed
  // asset is invisible — the page's own bytes stay identical either way.
  let assetChecked = 0;
  const assetNames = fs.existsSync(path.join(servedDir, 'assets.json')) ? read('assets.json') : [];
  if (assetNames.length !== (summary.assets?.distinct ?? 0)) {
    failures.push(`assets.json lists ${assetNames.length} file(s) but the summary says ${summary.assets?.distinct ?? 0} — the tree's own two records disagree`);
  }
  const assetResults = await mapLimit(assetNames, 16, async (name) => {
    try {
      const res = await fetch(`${base}/assets/${name}`);
      const bytes = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : null;
      return { name, status: res.status, contentType: res.headers.get('content-type'), bytes };
    } catch (err) {
      return { name, error: err instanceof Error ? err.message : String(err) };
    }
  });
  for (const r of assetResults) {
    if (r.error) {
      failures.push(`/assets/${r.name}: request failed (${r.error})`);
      continue;
    }
    if (r.status !== 200) {
      failures.push(`/assets/${r.name}: expected 200, got ${r.status}`);
      continue;
    }
    const expectedType = mimeForExt(path.extname(r.name).slice(1));
    if (r.contentType !== expectedType) {
      failures.push(`/assets/${r.name}: expected content-type ${expectedType}, got ${r.contentType ?? '(none)'}`);
    }
    const file = path.join(servedDir, 'assets', r.name);
    if (!fs.existsSync(file)) {
      failures.push(`/assets/${r.name}: served 200 but no file at served/assets/${r.name}`);
      continue;
    }
    assetChecked++;
    const mismatch = byteMismatch(`/assets/${r.name}`, r.bytes, fs.readFileSync(file));
    if (mismatch) failures.push(mismatch);
  }

  return {
    failures,
    checked: expectations.length,
    byteChecked,
    assetChecked,
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
  const { CAPTURE_LIST } = await import('../pipeline/config.mjs');
  // The page listing the 2026-09-12 run recorded, frozen before the captures
  // were scrapped — the other side of the count invariant.
  const listingFile = path.resolve(ROOT, CAPTURE_LIST);

  for (const [label, file] of [['served tree', servedDir], ['build-summary.json', path.join(servedDir, 'build-summary.json')], ['page listing', listingFile]]) {
    if (!fs.existsSync(file)) {
      console.error(`✗ ${label} missing at ${file} — the served tree is committed; a missing file is a broken checkout`);
      process.exit(1);
    }
  }

  const external = arg('--base');
  let server = null;
  try {
    server = external ? { base: external, stop: async () => {} } : await startServer();
    const r = await checkRoutes(server.base, { servedDir, listingFile });
    console.log('Serving check (tickets 06–07) — every route class + byte-identity over HTTP');
    console.log(`  ${r.checked} route(s): ${formatRouteCounts(r.counts)}`);
    console.log(`  byte-identity: ${r.byteChecked} served page(s) returned bytes identical to the file in the tree`);
    console.log(`  asset-identity: ${r.assetChecked} extracted asset(s) returned their declared content type and identical bytes`);
    console.log(`  count identity: served + dropped = ${r.counts.served} + ${r.counts.droppedRequested} = ${r.counts.served + r.counts.droppedRequested}, against ${r.counts.inventory} inventory page(s)`);
    if (r.failures.length > 0) {
      console.log(`\n✗ ${r.failures.length} failure(s):`);
      for (const f of r.failures) console.log(`  ${f}`);
      process.exitCode = 1;
    } else {
      console.log('\n✓ Serving layer green.');
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
