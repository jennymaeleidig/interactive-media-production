// The **restyle signal** seam: the site's shared stylesheet and
// script set, discovered from a live page's own references, fetched in the same
// pass, and digested over their *bytes*. A changed digest is a chrome-tier
// finding that names the changed asset and its size; a changed filename with
// the same bytes is not a finding, which is the whole reason the digest is over
// the bytes and not the URL.
//
// Everything the tier decides is a pure function of a live page's HTML (the
// discovery), a list of fetched asset bytes (the digest), and the previous
// baseline's asset set (the comparison), so the whole restyle signal is pinned
// here — offline — beside the index seam. The network edge
// (`regression/upstream-watch-cli.mjs`) is the only place an asset is fetched.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { assetDigest, assetRefs, assetReport } from '../regression/upstream-assets.mjs';
import { buildWatchReport, exitCode, formatWatchReport } from '../regression/upstream-watch.mjs';
import { runWatch } from '../regression/upstream-baseline.mjs';

const ORIGIN = 'https://www.flocksafety.com';
const SITE = '6821cc9ecc966b7f252b372e';
const WF = `https://cdn.prod.website-files.com/${SITE}`;
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

const steady = () => run(['/a', '/b'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 } });

const bytes = (text: string) => new Uint8Array(Buffer.from(text));
const asset = (name: string, url: string, content: string) => ({ name, url, bytes: bytes(content) });

/** The live page a discovery fixture parses: one site-owned stylesheet and
 * script, plus third-party, local and irrelevant references to reject. */
const HOME = `
<html data-wf-site="${SITE}">
<head>
  <link rel="stylesheet" href="${WF}/css/flocksafety-staging.shared.5697e783c.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link rel="stylesheet" href="/assets/local.css">
  <link rel="icon" href="${WF}/img/favicon.png">
  <script src="${WF}/js/flocksafety-staging.schunk.36b8fb49256177c8.js"></script>
  <script src="https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js"></script>
  <script>window.inline = true;</script>
</head>
<body></body>
</html>
`;

describe('assetRefs — the shared set from a live page’s own references', () => {
  it('keeps only the page’s own Webflow site-directory stylesheets and scripts', () => {
    expect(assetRefs(HOME, `${ORIGIN}/`)).toEqual([
      { name: 'flocksafety-staging.shared.5697e783c.min.css', url: `${WF}/css/flocksafety-staging.shared.5697e783c.min.css` },
      { name: 'flocksafety-staging.schunk.36b8fb49256177c8.js', url: `${WF}/js/flocksafety-staging.schunk.36b8fb49256177c8.js` },
    ]);
  });

  it('discovers nothing when the page names no site', () => {
    expect(assetRefs('<html><head><link rel="stylesheet" href="https://example.com/a.css"></head></html>', `${ORIGIN}/`)).toEqual([]);
  });

  it('resolves relative references and dedupes the same asset named twice', () => {
    const html = `<html data-wf-site="${SITE}"><link rel="stylesheet" href="${WF}/css/a.css"><link rel="stylesheet" href="//cdn.prod.website-files.com/${SITE}/css/a.css"></html>`;
    expect(assetRefs(html, `${ORIGIN}/`)).toEqual([{ name: 'a.css', url: `${WF}/css/a.css` }]);
  });

  it('is a pure function: the same page discovers the same set', () => {
    expect(assetRefs(HOME, `${ORIGIN}/`)).toEqual(assetRefs(HOME, `${ORIGIN}/`));
  });
});

describe('assetDigest — over the bytes, not the URL', () => {
  it('gives the same digest to the same bytes and different digests to different bytes', () => {
    expect(assetDigest(bytes('body{}'))).toBe(assetDigest(bytes('body{}')));
    expect(assetDigest(bytes('body{}'))).not.toBe(assetDigest(bytes('body{color:red}')));
  });

  it('is a 16-character hex string, like the other projection digests', () => {
    expect(assetDigest(bytes('x'))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('assetReport — one run of the restyle tier', () => {
  const css = (name: string, content: string) => asset(name, `${WF}/css/${name}`, content);
  const js = (name: string, content: string) => asset(name, `${WF}/js/${name}`, content);

  it('records every asset’s digest and byte size, sorted by URL', () => {
    const report = assetReport([js('b.js', 'b'), css('a.css', 'a')]);
    expect(report.records.map((r) => r.url)).toEqual([`${WF}/css/a.css`, `${WF}/js/b.js`]);
    expect(report.records[0]).toEqual({ name: 'a.css', url: `${WF}/css/a.css`, digest: assetDigest(bytes('a')), bytes: 1 });
  });

  it('reports nothing when the bytes are unchanged, even though the filename hash moved', () => {
    const previous = [{ name: 'old.css', url: `${WF}/css/flocksafety-staging.shared.old.min.css`, digest: assetDigest(bytes('same')), bytes: 4 }];
    const report = assetReport([css('flocksafety-staging.shared.new.min.css', 'same')], previous);
    expect(report.compared).toBe(1);
    expect(report.differed).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('reports exactly one finding naming the stylesheet and its size when its bytes change', () => {
    const previous = [
      { name: 'flocksafety-staging.shared.old.min.css', url: `${WF}/css/flocksafety-staging.shared.old.min.css`, digest: assetDigest(bytes('old')), bytes: 3 },
      { name: 'flocksafety-staging.schunk.x.js', url: `${WF}/js/flocksafety-staging.schunk.x.js`, digest: assetDigest(bytes('chunk')), bytes: 5 },
    ];
    const report = assetReport(
      [css('flocksafety-staging.shared.new.min.css', 'new'), js('flocksafety-staging.schunk.y.js', 'chunk')],
      previous,
    );
    expect(report.differed).toBe(1);
    expect(report.findings).toEqual([
      { name: 'flocksafety-staging.shared.new.min.css', url: `${WF}/css/flocksafety-staging.shared.new.min.css`, bytes: 3 },
    ]);
  });

  it('treats an asset with no previous digest as a finding', () => {
    const report = assetReport([css('added.css', 'fresh')], []);
    expect(report.findings).toEqual([{ name: 'added.css', url: `${WF}/css/added.css`, bytes: 5 }]);
  });
});

describe('the restyle tier — the run report, exit code and baseline', () => {
  const shared = (content: string) => asset('shared.css', `${WF}/css/shared.css`, content);
  const script = (content: string) => asset('app.js', `${WF}/js/app.js`, content);

  it('records the asset set on the silent first run and reports no restyle finding', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: [shared('a'), script('b')] });
    expect(result.baseline.assets).toEqual([
      { name: 'shared.css', url: `${WF}/css/shared.css`, digest: assetDigest(bytes('a')), bytes: 1 },
      { name: 'app.js', url: `${WF}/js/app.js`, digest: assetDigest(bytes('b')), bytes: 1 },
    ]);
    expect(result.report.chrome?.restyle).toEqual({ compared: 2, differed: 0, findings: [] });
    expect(exitCode(result.report)).toBe(0);
  });

  it('reports a changed asset as one chrome-tier finding and sets exit 1', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: [shared('old'), script('b')] });
    const second = runWatch({ ...steady(), previous: first.baseline, accept: false, verified: '2026-09-14', assets: [shared('new'), script('b')] });
    expect(second.report.chrome?.restyle?.findings).toEqual([{ name: 'shared.css', url: `${WF}/css/shared.css`, bytes: 3 }]);
    expect(exitCode(second.report)).toBe(1);
  });

  it('keeps the restyle finding distinguishable from a per-page chrome finding', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: [shared('old')] });
    const result = runWatch({
      ...steady(),
      previous: first.baseline,
      accept: false,
      verified: '2026-09-14',
      assets: [shared('new')],
      chromePages: [
        { path: '/a', served: '<div class="nav">Old label</div>', live: '<div class="nav">New label</div>' },
        { path: '/b', served: '<div class="nav">Same</div>', live: '<div class="nav">Same</div>' },
      ],
    });
    // Per-page chrome: a path plus its run hunks. Restyle: an asset plus its size.
    expect(result.report.chrome?.findings).toEqual([{ path: '/a', hunks: [{ served: ['Old label'], live: ['New label'] }] }]);
    expect(result.report.chrome?.restyle?.findings).toEqual([{ name: 'shared.css', url: `${WF}/css/shared.css`, bytes: 3 }]);
  });

  it('prints the restyle block distinctly from the per-page chrome findings', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: [shared('old')] });
    const result = runWatch({
      ...steady(),
      previous: first.baseline,
      accept: false,
      verified: '2026-09-14',
      assets: [shared('new')],
      chromePages: [{ path: '/a', served: '<div class="nav">Old label</div>', live: '<div class="nav">New label</div>' }],
    });
    const human = formatWatchReport(result.report);
    expect(human).toContain('chrome findings');
    expect(human).toContain('restyle');
    expect(human).toContain('shared.css');
    expect(human).toContain('3 bytes');
  });

  it('stays silent when the asset bytes are unchanged', () => {
    const first = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, assets: [shared('same')] });
    const second = runWatch({ ...steady(), previous: first.baseline, accept: false, verified: '2026-09-14', assets: [shared('same')] });
    expect(second.report.chrome?.restyle?.differed).toBe(0);
    expect(exitCode(second.report)).toBe(0);
  });

  it('leaves a run with no asset input without a restyle tier', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(result.report.chrome).toBeUndefined();
    expect(result.baseline.assets).toBeUndefined();
  });
});

// A sanity guard for the fixtures above: `buildWatchReport` is the index seam
// the index tier already pins; the restyle tier must not have changed what a steady run
// reports there.
describe('the restyle tier leaves the index seam alone', () => {
  it('a steady run still has no index findings', () => {
    expect(buildWatchReport(steady()).findings).toEqual({ added: [], removed: [] });
  });
});
