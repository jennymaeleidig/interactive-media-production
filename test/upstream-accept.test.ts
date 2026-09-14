// Ticket 08's seam: known-drift acceptance. The accepted set is a pure value —
// an entry's identity, whether a run's difference matches one, and the
// partition into accepted and active — so the whole of ticket 08 is pinned here
// offline, beside the baseline and watch seams it joins. The network edge
// (`regression/upstream-watch-cli.mjs`) stays hand-run and outside the suite.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { acceptanceEntries, acceptanceIdentity, partitionAccepted } from '../regression/upstream-accept.mjs';
import { BASELINE_VERSION, readBaseline, runWatch, serializeBaseline } from '../regression/upstream-baseline.mjs';
import { exitCode, formatWatchReport } from '../regression/upstream-watch.mjs';
import { copyDigest, copyRuns } from '../regression/upstream-copy.mjs';

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

/** The steady state: two live pages we already serve, both in the sitemap. */
const steady = () => run(['/a', '/b'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 } });

/** The copy tier's two pages: `/a` differs from served, `/b` matches. */
const copyPages = (liveA: string) => [
  { path: '/a', served: '<p>Old</p>', live: liveA },
  { path: '/b', served: '<p>Same</p>', live: '<p>Same</p>' },
];

/** A served page carrying one Wistia slot, for the media tier. */
const MEDIA_HTML = '<iframe src="https://fast.wistia.net/embed/iframe/abc123"></iframe>';
const mediaPages = [{ path: '/a', html: MEDIA_HTML }];
const mediaProbes = { 'wistia:abc123': { status: 404 } };

/** One shared asset with a chosen byte body, for the restyle tier. */
const assets = (label: string) => [{ name: 'shared.css', url: 'https://cdn.example/shared.css', bytes: new TextEncoder().encode(label) }];

const copyEntry = (path: string, fingerprint: string) => ({ tier: 'copy' as const, path, fingerprint });

describe('partitionAccepted', () => {
  it('accepts a difference whose identity and live fingerprint both match', () => {
    const difference = copyEntry('/a', 'live-1');
    expect(partitionAccepted([difference], [copyEntry('/a', 'live-1')])).toEqual({ accepted: [difference], active: [] });
  });

  it('keeps a difference with no recorded entry active', () => {
    const difference = copyEntry('/a', 'live-1');
    expect(partitionAccepted([difference], [])).toEqual({ accepted: [], active: [difference] });
  });

  it('re-activates a recorded difference whose live side changed again', () => {
    const difference = copyEntry('/a', 'live-2');
    expect(partitionAccepted([difference], [copyEntry('/a', 'live-1')])).toEqual({ accepted: [], active: [difference] });
  });

  it('distinguishes a media entry by slot, so one slot cannot vouch for another', () => {
    const first = { tier: 'media', path: '/a', slot: 'wistia:1', fingerprint: 'gone' } as const;
    const second = { tier: 'media', path: '/a', slot: 'wistia:2', fingerprint: 'gone' } as const;
    expect(acceptanceIdentity(first)).not.toBe(acceptanceIdentity(second));
    expect(partitionAccepted([first, second], [first])).toEqual({ accepted: [first], active: [second] });
  });

  it('distinguishes a restyle entry by asset URL', () => {
    const first = { tier: 'restyle', url: 'https://cdn/x.css', fingerprint: 'd1' } as const;
    const second = { tier: 'restyle', url: 'https://cdn/y.css', fingerprint: 'd1' } as const;
    expect(acceptanceIdentity(first)).not.toBe(acceptanceIdentity(second));
  });
});

describe('acceptanceEntries', () => {
  it('normalizes to the committed shape and sorts tier then identity', () => {
    expect(
      acceptanceEntries([
        { tier: 'media' as const, path: '/b', slot: 'wistia:1', fingerprint: 'gone' },
        copyEntry('/b', 'x'),
        copyEntry('/a', 'y'),
        { tier: 'restyle' as const, url: 'https://cdn/z.css', fingerprint: 'd1' },
      ]),
    ).toEqual([
      copyEntry('/a', 'y'),
      copyEntry('/b', 'x'),
      { tier: 'restyle' as const, url: 'https://cdn/z.css', fingerprint: 'd1' },
      { tier: 'media' as const, path: '/b', slot: 'wistia:1', fingerprint: 'gone' },
    ]);
  });
});

describe('the accepted set in the committed baseline', () => {
  it('round-trips through the text form', () => {
    const accepted = [
      copyEntry('/a', 'live-1'),
      { tier: 'restyle' as const, url: 'https://cdn/x.css', fingerprint: 'd1' },
      { tier: 'media' as const, path: '/b', slot: 'wistia:2', fingerprint: 'gone' },
    ];
    const baseline = { version: BASELINE_VERSION, verified: VERIFIED, rows: [], accepted };
    expect(readBaseline(serializeBaseline(baseline)).accepted).toEqual(accepted);
  });

  it('throws on a malformed entry, so a run exits 2 rather than reading an empty set', () => {
    const body = (accepted: unknown) => JSON.stringify({ version: BASELINE_VERSION, verified: VERIFIED, rows: [], accepted });
    expect(() => readBaseline(body('none'))).toThrow(/baseline/);
    expect(() => readBaseline(body([{ tier: 'copy', path: '/a' }]))).toThrow(/baseline/);
    expect(() => readBaseline(body([{ tier: 'media', path: '/a', fingerprint: 'gone' }]))).toThrow(/baseline/);
    expect(() => readBaseline(body([{ tier: 'nope', path: '/a', fingerprint: 'x' }]))).toThrow(/baseline/);
  });
});

describe('runWatch — accepting the current run’s differences', () => {
  it('a plain run whose only difference is recorded reports it as accepted and exits 0', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    expect(first.report.copy?.differed).toBe(1);
    expect(exitCode(first.report)).toBe(1);

    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: '2026-09-14', copyPages: copyPages('<p>New</p>') });
    expect(accepted.write).toBe(true);
    expect(accepted.report.copy?.differed).toBe(0);
    expect(accepted.report.accepted).toEqual({ count: 1, entries: [copyEntry('/a', copyDigest(copyRuns('<p>New</p>'))) ] });
    expect(exitCode(accepted.report)).toBe(0);
    expect(accepted.baseline.accepted).toEqual([copyEntry('/a', copyDigest(copyRuns('<p>New</p>'))) ]);

    const quiet = runWatch({ ...steady(), previous: accepted.baseline, accept: false, verified: '2026-09-15', copyPages: copyPages('<p>New</p>') });
    expect(quiet.write).toBe(false);
    expect(quiet.report.copy?.differed).toBe(0);
    expect(quiet.report.accepted).toMatchObject({ count: 1, entries: [{ tier: 'copy', path: '/a' }] });
    expect(exitCode(quiet.report)).toBe(0);
  });

  it('a difference matching no recorded entry is a finding and exits 1', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const quiet = runWatch({ ...steady(), previous: accepted.baseline, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    expect(quiet.report.accepted).toMatchObject({ count: 1 });
    // a copy difference on a page the baseline never recorded is new drift
    const grew = runWatch({
      ...steady(),
      previous: accepted.baseline,
      accept: false,
      verified: VERIFIED,
      copyPages: [...copyPages('<p>New</p>'), { path: '/c', served: '<p>Old</p>', live: '<p>New</p>' }],
    });
    expect(grew.report.copy?.differed).toBe(1);
    expect(grew.report.copy?.findings.map((f) => f.path)).toEqual(['/c']);
    expect(grew.report.accepted).toMatchObject({ count: 1, entries: [{ tier: 'copy', path: '/a' }] });
    expect(exitCode(grew.report)).toBe(1);
  });

  it('re-alarms when a recorded difference’s live side changes again', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const moved = runWatch({ ...steady(), previous: accepted.baseline, accept: false, verified: VERIFIED, copyPages: copyPages('<p>Newer</p>') });
    expect(moved.report.copy?.differed).toBe(1);
    expect(moved.report.accepted).toBeUndefined();
    expect(exitCode(moved.report)).toBe(1);
  });

  it('replaces the accepted set, so a stale entry cannot linger after --accept-drift', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    expect(accepted.baseline.accepted).toHaveLength(1);
    const cleared = runWatch({ ...steady(), previous: accepted.baseline, accept: false, acceptDrift: true, verified: VERIFIED, copyPages: copyPages('<p>Old</p>') });
    expect(cleared.baseline.accepted).toBeUndefined();
  });

  it('participates media liveness in the same acceptance despite it being report-only', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, mediaPages, mediaProbes });
    expect(first.report.media?.differed).toBe(1);
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, mediaPages, mediaProbes });
    expect(accepted.baseline.accepted).toEqual([{ tier: 'media', path: '/a', slot: 'wistia:abc123', fingerprint: 'gone' }]);
    expect(accepted.report.media?.differed).toBe(0);
    const quiet = runWatch({ ...steady(), previous: accepted.baseline, accept: false, verified: VERIFIED, mediaPages, mediaProbes });
    expect(quiet.report.media?.differed).toBe(0);
    expect(quiet.report.accepted).toMatchObject({ count: 1 });
    expect(exitCode(quiet.report)).toBe(0);
  });

  it('records a restyle difference and keeps it visible as accepted until its bytes move again', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: assets('one') });
    const restyled = runWatch({ ...steady(), previous: first.baseline, accept: false, verified: VERIFIED, assets: assets('two') });
    expect(restyled.report.chrome?.restyle?.differed).toBe(1);
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, assets: assets('two') });
    expect(accepted.baseline.accepted).toHaveLength(1);
    expect(accepted.baseline.accepted?.[0]).toMatchObject({ tier: 'restyle', url: 'https://cdn.example/shared.css' });
    expect(accepted.report.chrome?.restyle?.differed).toBe(0);

    const quiet = runWatch({ ...steady(), previous: accepted.baseline, accept: false, verified: VERIFIED, assets: assets('two') });
    expect(quiet.report.chrome?.restyle?.differed).toBe(0);
    expect(quiet.report.accepted).toMatchObject({ count: 1, entries: [{ tier: 'restyle' }] });
    expect(exitCode(quiet.report)).toBe(0);

    const moved = runWatch({ ...steady(), previous: quiet.baseline, accept: false, verified: VERIFIED, assets: assets('three') });
    expect(moved.report.chrome?.restyle?.differed).toBe(1);
    expect(moved.report.accepted).toBeUndefined();
    expect(exitCode(moved.report)).toBe(1);
  });

  it('names the refresh candidates: active findings plus the index added/removed set', () => {
    // /a carries an active copy finding; /gone is a Capture-list removal; /new
    // is a live 200 the Capture list never held.
    const inputs = run(
      ['/a', '/new'],
      ['/a', '/gone'],
      { '/a': { status: 200 }, '/new': { status: 200 }, '/gone': { status: 404 } },
    );
    const first = runWatch({ ...inputs, previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    expect(first.report.refreshCandidates).toEqual(['/a', '/gone', '/new']);
  });

  it('names a page whose baseline row moved, so baseline drift is never unnamed', () => {
    // /x is in the first run's universe and baseline, then drops out of both the
    // sitemap and the Capture list: no index finding fires, but the `since`
    // removal still exits 1, so the rollup must name it.
    const first = runWatch({ ...run(['/a', '/x'], ['/a', '/x'], { '/a': { status: 200 }, '/x': { status: 200 } }), previous: null, accept: false, verified: VERIFIED });
    const dropped = runWatch({ ...run(['/a'], ['/a'], { '/a': { status: 200 } }), previous: first.baseline, accept: false, verified: VERIFIED });
    expect(dropped.report.since?.removed).toEqual(['/x']);
    expect(exitCode(dropped.report)).toBe(1);
    expect(dropped.report.refreshCandidates).toEqual(['/x']);
  });
});

describe('formatWatchReport — accepted drift and refresh candidates', () => {
  it('shows the accepted count with its page and tier, and the refresh candidates', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const accepted = runWatch({ ...steady(), previous: first.baseline, accept: false, acceptDrift: true, verified: VERIFIED, copyPages: copyPages('<p>New</p>') });
    const active = formatWatchReport(first.report);
    expect(active).toContain('refresh candidates');
    expect(active).toContain('/a');
    const human = formatWatchReport(accepted.report);
    expect(human).toContain('accepted');
    expect(human).toContain('/a');
    expect(human).toContain('copy');
  });
});
