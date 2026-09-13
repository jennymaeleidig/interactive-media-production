// Ticket 02's seam: the upstream watch's moving baseline. Reading it, writing
// it, deriving it from a run, diffing two of them, and the one write decision
// are all pure functions of a baseline's text and a run's fetched bytes, so the
// whole of ticket 02 is pinned here — offline — beside ticket 01's index seam.
// The network edge (`regression/upstream-watch-cli.mjs`) is hand-run and
// deliberately outside the suite; it is the only place a baseline is read from
// or written to disk.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWatchReport, exitCode, formatWatchReport, livenessClass } from '../regression/upstream-watch.mjs';
import { BASELINE_VERSION, baselineFromReport, diffBaseline, outsideServedTree, readBaseline, runWatch, serializeBaseline } from '../regression/upstream-baseline.mjs';

const ORIGIN = 'https://www.flocksafety.com';
const VERIFIED = '2026-09-13';

/** One run's fetched inputs: the universe is the union of these three sources. */
function run(sitemap: string[], capture: string[], probes: Record<string, { status: number; location?: string }>, homepage: string[] = []) {
  return {
    origin: ORIGIN,
    sitemapXml: `<urlset>${sitemap.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`,
    homepageHtml: homepage.map((p) => `<a href="${p}">nav</a>`).join(''),
    captureList: capture.map((p) => `${ORIGIN}${p}`),
    probes,
  };
}

/** The steady state: two live pages we already serve, both in the sitemap, so a
 * run is silent against the frozen Capture list and against the baseline. */
const steady = () => run(['/a', '/b'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 } });

const row = (path: string, status: number, inSitemap = true, location: string | null = null) => ({ path, inSitemap, status, location });

describe('readBaseline / serializeBaseline', () => {
  it('round-trips a baseline through its text form', () => {
    const baseline = { version: BASELINE_VERSION, verified: VERIFIED, rows: [row('/a', 200), row('/b', 301, true, '/c')] };
    const text = serializeBaseline(baseline);
    expect(text.endsWith('\n')).toBe(true);
    expect(readBaseline(text)).toEqual(baseline);
  });

  it('writes rows in path order, so the committed file is stable', () => {
    const text = serializeBaseline({ version: BASELINE_VERSION, verified: VERIFIED, rows: [row('/z', 200), row('/a', 200)] });
    expect(readBaseline(text).rows.map((r) => r.path)).toEqual(['/a', '/z']);
  });

  it('preserves a row field from a later ticket, so a read/accept cannot erase it', () => {
    const text = JSON.stringify({ version: BASELINE_VERSION, verified: VERIFIED, rows: [{ ...row('/a', 200), copy: 'prose-digest' }] });
    const baseline = readBaseline(text);
    expect(baseline.rows[0]).toMatchObject({ path: '/a', copy: 'prose-digest' });
    expect(readBaseline(serializeBaseline(baseline)).rows[0]).toMatchObject({ copy: 'prose-digest' });
  });

  it('throws on text that is not a baseline, so a run exits 2 rather than guessing', () => {
    expect(() => readBaseline('not json')).toThrow(/baseline/);
    expect(() => readBaseline('{}')).toThrow(/baseline/);
    expect(() => readBaseline(JSON.stringify({ version: 99, verified: VERIFIED, rows: [] }))).toThrow(/baseline/);
    expect(() => readBaseline(JSON.stringify({ version: BASELINE_VERSION, verified: 'yesterday', rows: [] }))).toThrow(/baseline/);
    expect(() => readBaseline(JSON.stringify({ version: BASELINE_VERSION, verified: VERIFIED, rows: 'none' }))).toThrow(/baseline/);
    expect(() => readBaseline(JSON.stringify({ version: BASELINE_VERSION, verified: VERIFIED, rows: [{ path: '/a' }] }))).toThrow(/baseline/);
    expect(() => readBaseline(JSON.stringify({ version: BASELINE_VERSION, verified: VERIFIED, rows: [row('/a', 200), { path: '/b' }] }))).toThrow(/baseline/);
  });
});

describe('baselineFromReport', () => {
  it('derives one row per watched URL: path, sitemap membership, status, redirect target', () => {
    const report = buildWatchReport(run(['/a', '/b'], ['/a'], { '/a': { status: 200 }, '/b': { status: 301, location: `${ORIGIN}/c` } }));
    expect(baselineFromReport(report, VERIFIED)).toEqual({
      version: BASELINE_VERSION,
      verified: VERIFIED,
      rows: [row('/a', 200), row('/b', 301, true, '/c')],
    });
  });
});

describe('runWatch — the silent first run', () => {
  it('records a baseline and reports only the count, with no findings', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(result.write).toBe(true);
    expect(result.report.since).toEqual({ from: null, added: [], removed: [], changed: [] });
    expect(result.report.findings.added).toEqual([]);
    expect(result.report.findings.removed).toEqual([]);
    expect(result.report.counts.universe).toBe(2);
    expect(result.baseline).toEqual({ version: BASELINE_VERSION, verified: VERIFIED, rows: [row('/a', 200), row('/b', 200)] });
  });

  it('a second run against the same upstream reports nothing', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    const second = runWatch({ ...steady(), previous: first.baseline, accept: false, verified: '2026-09-14' });
    expect(second.write).toBe(false);
    expect(second.report.since).toEqual({ from: VERIFIED, added: [], removed: [], changed: [] });
    expect(exitCode(second.report)).toBe(0);
  });

  it('states the date the committed baseline carries, not today\u2019s, on a plain run', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(first.report.verified).toBe(VERIFIED);
    const later = runWatch({ ...steady(), previous: first.baseline, accept: false, verified: '2026-09-20' });
    expect(later.report.verified).toBe(VERIFIED);
  });
});

describe('runWatch — the delta since the last run', () => {
  // Run 1 holds /gone-later as a sitemap-only page; run 2 drops it, adds /new,
  // and moves /b from 200 to 404. The frozen Capture list still holds /a and /b,
  // so the index tier is unaffected by /gone-later's removal — only the moving
  // baseline can see it, which is the ticket's whole point.
  const before = () => runWatch({ ...run(['/a', '/b', '/gone-later'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 }, '/gone-later': { status: 200 } }), previous: null, accept: false, verified: VERIFIED });
  const after = (previous: ReturnType<typeof before>['baseline']) =>
    runWatch({ ...run(['/a', '/b', '/new'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 404 }, '/new': { status: 200 } }), previous, accept: false, verified: '2026-09-14' });

  it('reports exactly one added, one removed and one changed path, grouped by class', () => {
    const { report } = after(before().baseline);
    expect(report.since?.added).toEqual(['/new']);
    expect(report.since?.removed).toEqual(['/gone-later']);
    expect(report.since?.changed).toEqual([{ path: '/b', fields: [{ field: 'status', from: 200, to: 404 }] }]);
  });

  it('reports a sitemap-membership move as a changed row', () => {
    const listed = runWatch({ ...run(['/a'], [], { '/a': { status: 200 } }), previous: null, accept: false, verified: VERIFIED });
    const unlisted = runWatch({ ...run([], [], { '/a': { status: 200 } }, ['/a']), previous: listed.baseline, accept: false, verified: '2026-09-14' });
    expect(unlisted.report.since?.changed).toEqual([{ path: '/a', fields: [{ field: 'inSitemap', from: true, to: false }] }]);
  });

  it('reports a moved redirect target as a changed row', () => {
    const first = runWatch({ ...run(['/a'], [], { '/a': { status: 301, location: `${ORIGIN}/x` } }), previous: null, accept: false, verified: VERIFIED });
    const moved = runWatch({ ...run(['/a'], [], { '/a': { status: 301, location: `${ORIGIN}/y` } }), previous: first.baseline, accept: false, verified: '2026-09-14' });
    expect(moved.report.since?.changed).toEqual([{ path: '/a', fields: [{ field: 'location', from: '/x', to: '/y' }] }]);
  });

  it('diffs every carried row field, so a later ticket’s digest needs no new case here', () => {
    const base = { version: BASELINE_VERSION, verified: VERIFIED, rows: [{ ...row('/a', 200), copy: 'one' }] };
    const moved = { ...base, rows: [{ ...base.rows[0], copy: 'two' }] };
    expect(diffBaseline(base, moved).changed).toEqual([{ path: '/a', fields: [{ field: 'copy', from: 'one', to: 'two' }] }]);
  });

  it('exits 1 when the baseline moved and 0 when it did not', () => {
    expect(exitCode(after(before().baseline).report)).toBe(1);
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(exitCode(runWatch({ ...steady(), previous: first.baseline, accept: false, verified: VERIFIED }).report)).toBe(0);
  });

  it('prints the delta the JSON report carries', () => {
    const { report } = after(before().baseline);
    const human = formatWatchReport(report);
    for (const p of report.since?.added ?? []) expect(human).toContain(p);
    for (const p of report.since?.removed ?? []) expect(human).toContain(p);
    for (const c of report.since?.changed ?? []) expect(human).toContain(c.path);
  });
});

describe('the write decision', () => {
  it('a plain run never rewrites an existing baseline', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(runWatch({ ...steady(), previous: first.baseline, accept: false, verified: '2026-09-14' }).write).toBe(false);
  });

  it('an --accept run rewrites it, and the rewrite is what the next run reads', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    const drifted = run(['/a', '/b', '/new'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 }, '/new': { status: 200 } });
    const accepted = runWatch({ ...drifted, previous: first.baseline, accept: true, verified: '2026-09-14' });
    expect(accepted.write).toBe(true);

    // What the accept recorded is what a later run reads back as its previous state.
    const reread = readBaseline(serializeBaseline(accepted.baseline));
    expect(reread).toEqual(accepted.baseline);
    const next = runWatch({ ...drifted, previous: reread, accept: false, verified: '2026-09-15' });
    expect(next.report.since).toEqual({ from: '2026-09-14', added: [], removed: [], changed: [] });
    expect(next.write).toBe(false);
  });

  it('records the first baseline even without --accept — the silent first run', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(result.write).toBe(true);
  });
});

describe('the served-tree write guard', () => {
  it('refuses any target inside the served tree', () => {
    expect(outsideServedTree('served/x', 'served')).toBe(false);
    expect(outsideServedTree('served', 'served')).toBe(false);
    expect(outsideServedTree('./served/a', 'served')).toBe(false);
    expect(outsideServedTree('served/../served/a', 'served')).toBe(false);
  });

  it('allows targets outside it, including a sibling whose name merely starts the same', () => {
    expect(outsideServedTree('regression/upstream-baseline.json', 'served')).toBe(true);
    expect(outsideServedTree('served-notes/a', 'served')).toBe(true);
    expect(outsideServedTree('../outside.json', 'served')).toBe(true);
  });
});

describe('the committed baseline', () => {
  const committed = readBaseline(readFileSync(new URL('../regression/upstream-baseline.json', import.meta.url), 'utf8'));

  it('is the measured 2026-09-13 state of the watched universe', () => {
    expect(committed.version).toBe(BASELINE_VERSION);
    expect(committed.verified).toBe('2026-09-13');
    expect(committed.rows).toHaveLength(1220);
    expect(committed.rows.filter((r) => r.inSitemap)).toHaveLength(1209);
    const tally = (name: string) => committed.rows.filter((r) => livenessClass(r.status) === name).length;
    expect(tally('200')).toBe(1200);
    expect(tally('3xx')).toBe(10);
    expect(tally('401')).toBe(10);
    expect(tally('4xx')).toBe(0);
    expect(tally('5xx')).toBe(0);
  });

  it('carries the paths sorted and unique', () => {
    const paths = committed.rows.map((r) => r.path);
    expect(paths).toEqual([...paths].sort());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('carries redirect targets and the auth-gated class as measured', () => {
    expect(committed.rows.find((r) => r.path === '/')).toEqual(row('/', 200));
    expect(committed.rows.find((r) => r.path === '/webinar/you-asked-we-listened-q3-public-safety-product-updates')).toEqual(
      row('/webinar/you-asked-we-listened-q3-public-safety-product-updates', 301, true, '/resources'),
    );
    expect(committed.rows.find((r) => r.path === '/events/test-event')).toEqual(row('/events/test-event', 401));
  });

  it('diffs against itself to nothing: the steady state', () => {
    expect(diffBaseline(committed, committed)).toEqual({ from: '2026-09-13', added: [], removed: [], changed: [] });
  });
});
