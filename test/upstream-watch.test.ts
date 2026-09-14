// The upstream watch's pure core (ticket 01): the watched universe, liveness
// classes, index findings, demotions, and the inventory — all a function of
// fetched bytes, so they are pinned here with fixtures and no network. The
// network driver (`regression/upstream-watch-cli.mjs`) is deliberately outside
// the suite; it is a hand-run edge that owns the network and filesystem, and
// the pure core it feeds never reaches either.
//
// The measured fixture is built from the committed Capture list plus the
// shapes measured on 2026-09-13 (research lane A): 1,209 sitemap locs of which
// 13 are not live 200 (10 x 401, 3 x 301), 4 live 200 paths absent from the
// sitemap, and a live 200-set identical to the Capture list.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWatchReport, exitCode, formatWatchReport, homepagePaths, livenessClass, pathOf, sitemapLocs, watchedUniverse } from '../regression/upstream-watch.mjs';

const ORIGIN = 'https://www.flocksafety.com';

/** The frozen 2026-09-12 listing, full URLs, one per line. */
const CAPTURE_LIST = readFileSync(new URL('../regression/capture-list-2026-09-12.txt', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '');

/** Same-origin path of a full capture URL, without touching the module under test. */
const asPath = (url: string) => url.replace(ORIGIN, '');

const capturePaths = CAPTURE_LIST.map(asPath);

// The 4 live-200 pages the sitemap omits.
const UNLISTED_LIVE = [
  '/blog/what-is-traffic-analytics',
  '/newsletter',
  '/reduce-guard-cost-calculator',
  '/supplier-registration',
].sort();

// The 3 sitemap URLs that now 301, with the targets live answers.
const STALE = [
  { path: '/customers/whitehall-pd-solves-gun-related-crime-with-flock-safety-raven', target: '/customers' },
  {
    path: '/webinar/uncover-and-connect-taking-human-trafficking-investigations-to-the-next-level',
    target: '/webinar/uncover-and-connect-taking-human-trafficking-investigations-to-the-next-level-on-demand',
  },
  { path: '/webinar/you-asked-we-listened-q3-public-safety-product-updates', target: '/resources' },
];

// The 10 sitemap locs behind Webflow's password gate — a 401, not drift.
const AUTH_GATED = [
  '/events/test-event',
  '/events/test-small-event',
  '/events/test-third-party-events',
  '/events/test-third-party-events-copy',
  '/events/test-third-party-events-copy-2',
  '/events/test-third-party-events-copy-3',
  '/events/test-third-party-events-copy-4',
  '/events/test-third-party-events-copy-5',
  '/events/test-third-party-events-copy-6',
  '/events/test-third-party-events-past',
];

// The 7 homepage links the sitemap omits because they redirect.
const HOME_REDIRECTS = [
  { path: '/legal/privacy-notice', target: '/legal/privacy-policy' },
  { path: '/legal/terms-of-service', target: '/legal/terms-and-conditions' },
  { path: '/privacy-ethics', target: '/trust' },
  { path: '/products/freeform-search', target: '/products/flock-freeform' },
  { path: '/products/investigations-manager', target: '/products/license-plate-readers' },
  { path: '/products/lpr-cameras', target: '/products/license-plate-readers' },
  { path: '/products/national-lpr-network', target: '/products/license-plate-readers' },
];

const sitemapCapture = capturePaths.filter((p) => !UNLISTED_LIVE.includes(p));
const KNOWN = sitemapCapture.find((p) => p !== '/');

function urlBlock(path: string, lastmod = '2026-08-20T15:00:00.000Z') {
  return `  <url><loc>${ORIGIN}${path}</loc><lastmod>${lastmod}</lastmod></url>`;
}

/** The sitemap shape measured on 2026-09-13: 1,209 locs, 13 not live 200. */
const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
  ...sitemapCapture.map((p) => urlBlock(p)),
  ...STALE.map((s) => urlBlock(s.path, '2026-08-13')),
  ...AUTH_GATED.map((p) => urlBlock(p, '2025-09-21')),
].join('\n')}\n</urlset>\n`;

/** The homepage shape: the 11 sitemap-absent nav paths, plus filtering noise. */
const HOMEPAGE_HTML = `<html><body><header>
  ${UNLISTED_LIVE.map((p) => `<a href="${p}">live</a>`).join('\n')}
  ${HOME_REDIRECTS.map((r) => `<a href="${r.path}">moved</a>`).join('\n')}
  <a href="${KNOWN}">already indexed</a>
  <a href="${KNOWN}/">trailing slash</a>
  <a href="${KNOWN}?utm_source=nav">query string</a>
  <a href="#main">fragment only</a>
  <a href="https://twitter.com/flocksafety">external</a>
  <a href="mailto:hello@flocksafety.com">mail</a>
  <a href="tel:+18669011781">phone</a>
</header></body></html>`;

/** One probe per universe path: 200 / 301 / 401 exactly as measured. */
const PROBES: Record<string, { status: number; location?: string }> = {};
for (const p of sitemapCapture) PROBES[p] = { status: 200 };
for (const p of UNLISTED_LIVE) PROBES[p] = { status: 200 };
for (const s of STALE) PROBES[s.path] = { status: 301, location: s.target };
for (const p of AUTH_GATED) PROBES[p] = { status: 401 };
for (const r of HOME_REDIRECTS) PROBES[r.path] = { status: 301, location: r.target };

const measured = () => buildWatchReport({ origin: ORIGIN, sitemapXml: SITEMAP_XML, homepageHtml: HOMEPAGE_HTML, captureList: CAPTURE_LIST, probes: PROBES });

describe('pathOf', () => {
  it('normalizes a same-origin URL to a path and drops query, fragment and trailing slash', () => {
    expect(pathOf(`${ORIGIN}/a/b`, ORIGIN)).toBe('/a/b');
    expect(pathOf('/a/b/', ORIGIN)).toBe('/a/b');
    expect(pathOf('/a/b?utm=x#top', ORIGIN)).toBe('/a/b');
    expect(pathOf(`${ORIGIN}/`, ORIGIN)).toBe('/');
  });

  it('rejects off-origin and non-http references', () => {
    expect(pathOf('https://twitter.com/flocksafety', ORIGIN)).toBeNull();
    expect(pathOf('mailto:hello@flocksafety.com', ORIGIN)).toBeNull();
    expect(pathOf('tel:+18669011781', ORIGIN)).toBeNull();
    expect(pathOf('#main', ORIGIN)).toBeNull();
    expect(pathOf('', ORIGIN)).toBeNull();
  });
});

describe('livenessClass', () => {
  it('gives 200, 3xx and 4xx their classes and pulls 401 out', () => {
    expect(livenessClass(200)).toBe('200');
    expect(livenessClass(301)).toBe('3xx');
    expect(livenessClass(308)).toBe('3xx');
    expect(livenessClass(401)).toBe('401');
    expect(livenessClass(404)).toBe('4xx');
  });

  it('treats every other 2xx as live, never as a removal', () => {
    expect(livenessClass(201)).toBe('200');
    expect(livenessClass(204)).toBe('200');
    expect(livenessClass(206)).toBe('200');
  });

  it('gives a server error its own class, never the client-error bucket', () => {
    expect(livenessClass(500)).toBe('5xx');
    expect(livenessClass(503)).toBe('5xx');
  });
});

describe('sitemapLocs', () => {
  it('reads each loc and its lastmod as context', () => {
    const { paths, lastmod } = sitemapLocs(SITEMAP_XML, ORIGIN);
    expect(paths).toHaveLength(1209);
    expect(lastmod[STALE[0].path]).toBe('2026-08-13');
    expect(lastmod[UNLISTED_LIVE[0]]).toBeUndefined();
  });

  it('decodes named and numeric XML entities in a loc', () => {
    const xml = (loc: string) => `<urlset><url><loc>${loc}</loc></url></urlset>`;
    expect(sitemapLocs(xml(`${ORIGIN}/a&#38;b`), ORIGIN).paths).toEqual(['/a&b']);
    expect(sitemapLocs(xml(`${ORIGIN}/a&#x26;b`), ORIGIN).paths).toEqual(['/a&b']);
    expect(sitemapLocs(xml(`${ORIGIN}/a&amp;b`), ORIGIN).paths).toEqual(['/a&b']);
  });

  it('throws on a body that is not a <urlset>, so the driver can exit 2', () => {
    expect(() => sitemapLocs('', ORIGIN)).toThrow(/urlset/);
    expect(() => sitemapLocs('<html><body>upstream error page</body></html>', ORIGIN)).toThrow(/urlset/);
    expect(() => sitemapLocs('<?xml version="1.0"?><sitemapindex><sitemap><loc>' + ORIGIN + '/sitemap.xml</loc></sitemap></sitemapindex>', ORIGIN)).toThrow(/urlset/);
  });
});

describe('watchedUniverse', () => {
  it('is the union of sitemap locs, homepage nav paths and the Capture list', () => {
    const universe = watchedUniverse({ origin: ORIGIN, sitemapXml: SITEMAP_XML, homepageHtml: HOMEPAGE_HTML, captureList: CAPTURE_LIST });
    expect(universe).toHaveLength(1220);
    expect(new Set(universe).size).toBe(universe.length);
    for (const p of sitemapLocs(SITEMAP_XML, ORIGIN).paths) expect(universe).toContain(p);
    for (const p of capturePaths) expect(universe).toContain(p);
    for (const p of [...UNLISTED_LIVE, ...HOME_REDIRECTS.map((r) => r.path)]) expect(universe).toContain(p);
  });

  it('does not let sitemap membership bound the universe', () => {
    const universe = watchedUniverse({
      origin: ORIGIN,
      sitemapXml: '<urlset><url><loc>https://www.flocksafety.com/indexed</loc></url></urlset>',
      homepageHtml: '<a href="/only-on-the-homepage">nav</a>',
      captureList: ['https://www.flocksafety.com/only-in-the-capture-list'],
    });
    expect(universe).toEqual(['/indexed', '/only-in-the-capture-list', '/only-on-the-homepage']);
  });

  it('filters homepage references that are not same-origin paths', () => {
    expect(homepagePaths('<a href="/a">a</a><a href="https://x.com/b">b</a><a href="mailto:c@x.com">c</a><a href="#d">d</a><a href="/a/">a again</a>', ORIGIN)).toEqual(['/a', '/a']);
  });
});

describe('the measured 2026-09-13 fixture', () => {
  it('carries 1,209 sitemap locs, 13 of them not live 200 (10 x 401, 3 x 3xx)', () => {
    const report = measured();
    const sitemapRows = report.inventory.filter((r) => r.inSitemap);
    expect(report.counts.sitemap).toBe(1209);
    expect(sitemapRows.filter((r) => r.statusClass !== '200')).toHaveLength(13);
    expect(sitemapRows.filter((r) => r.statusClass === '401')).toHaveLength(10);
    expect(sitemapRows.filter((r) => r.statusClass === '3xx')).toHaveLength(3);
  });

  it('finds exactly the 4 live 200 paths absent from the sitemap', () => {
    const report = measured();
    expect(
      report.inventory
        .filter((r) => r.statusClass === '200' && !r.inSitemap)
        .map((r) => r.path)
        .sort(),
    ).toEqual(UNLISTED_LIVE);
  });

  it('reports a live 200-set identical to the Capture list: zero added, zero removed', () => {
    const report = measured();
    expect(report.inventory.filter((r) => r.statusClass === '200')).toHaveLength(capturePaths.length);
    expect(report.findings.added).toEqual([]);
    expect(report.findings.removed).toEqual([]);
    expect(exitCode(report)).toBe(0);
  });

  it('reports the three sitemap URLs that now 301 as demotions naming their targets', () => {
    const report = measured();
    expect(report.demotions).toEqual([...STALE].sort((a, b) => a.path.localeCompare(b.path)).map((s) => ({ path: s.path, target: s.target })));
  });

  it('keeps a 401 its own class, and out of findings and demotions', () => {
    const report = measured();
    expect(report.liveness['401']).toBe(10);
    expect(report.liveness['4xx']).toBe(0);
    expect(report.liveness['5xx']).toBe(0);
    const authRows = report.inventory.filter((r) => AUTH_GATED.includes(r.path));
    expect(authRows).toHaveLength(10);
    for (const row of authRows) expect(row.statusClass).toBe('401');
    for (const p of AUTH_GATED) {
      expect(report.findings.added).not.toContain(p);
      expect(report.demotions.map((d) => d.path)).not.toContain(p);
    }
  });

  it('reports sitemap membership per URL, not as the universe boundary', () => {
    const report = measured();
    expect(report.inventory).toHaveLength(1220);
    const unlisted = report.inventory.find((r) => r.path === UNLISTED_LIVE[0]);
    expect(unlisted).toMatchObject({ inSitemap: false, inCapture: true, statusClass: '200' });
    const stale = report.inventory.find((r) => r.path === STALE[0].path);
    expect(stale).toMatchObject({ inSitemap: true, inCapture: false, statusClass: '3xx' });
  });

  it('carries lastmod in the inventory but derives no finding from it', () => {
    const changed = SITEMAP_XML.replaceAll('2026-08-20T15:00:00.000Z', '2030-01-01T00:00:00.000Z');
    const base = measured();
    const mutated = buildWatchReport({ origin: ORIGIN, sitemapXml: changed, homepageHtml: HOMEPAGE_HTML, captureList: CAPTURE_LIST, probes: PROBES });
    expect(mutated.findings).toEqual(base.findings);
    expect(mutated.demotions).toEqual(base.demotions);
    expect(exitCode(mutated)).toBe(exitCode(base));
    expect(base.inventory.find((r) => r.path === UNLISTED_LIVE[0])?.lastmod).toBeNull();
  });
});

describe('findings and exit code', () => {
  const drift = () =>
    buildWatchReport({
      origin: ORIGIN,
      sitemapXml: '<urlset><url><loc>https://www.flocksafety.com/kept</loc></url><url><loc>https://www.flocksafety.com/gone</loc></url></urlset>',
      homepageHtml: '<a href="/new-page">new</a><a href="https://x.com/elsewhere">x</a>',
      captureList: ['https://www.flocksafety.com/kept', 'https://www.flocksafety.com/gone'],
      probes: { '/kept': { status: 200 }, '/gone': { status: 404 }, '/new-page': { status: 200 } },
    });

  it('names a live 200 the Capture list does not hold as added', () => {
    expect(drift().findings.added).toEqual(['/new-page']);
  });

  it('names a Capture-list path that no longer answers 200 as removed, with its status', () => {
    expect(drift().findings.removed).toEqual([{ path: '/gone', status: 404, location: null }]);
  });

  it('never reports a 401 as a finding, even on a Capture-list path', () => {
    const report = buildWatchReport({
      origin: ORIGIN,
      sitemapXml: '<urlset></urlset>',
      homepageHtml: '',
      captureList: ['https://www.flocksafety.com/gated'],
      probes: { '/gated': { status: 401 } },
    });
    expect(report.findings.removed).toEqual([]);
    expect(report.demotions).toEqual([]);
    expect(exitCode(report)).toBe(0);
    expect(report.inventory[0]).toMatchObject({ path: '/gated', inCapture: true, statusClass: '401' });
  });

  it('exits 1 for findings and 0 for none', () => {
    expect(exitCode(drift())).toBe(1);
    expect(exitCode(measured())).toBe(0);
  });

  it('throws when the probe map does not cover the watched universe', () => {
    expect(() =>
      buildWatchReport({
        origin: ORIGIN,
        sitemapXml: '<urlset><url><loc>https://www.flocksafety.com/kept</loc></url></urlset>',
        homepageHtml: '',
        captureList: [],
        probes: {},
      }),
    ).toThrow(/no probe result/);
  });

  it('reports a redirect target on a removed path', () => {
    const report = buildWatchReport({
      origin: ORIGIN,
      sitemapXml: '<urlset></urlset>',
      homepageHtml: '',
      captureList: ['https://www.flocksafety.com/moved'],
      probes: { '/moved': { status: 301, location: `${ORIGIN}/landing` } },
    });
    expect(report.findings.removed).toEqual([{ path: '/moved', status: 301, location: '/landing' }]);
  });

  it('prints the same findings the JSON report carries', () => {
    const report = drift();
    const human = formatWatchReport(report);
    const parsed = JSON.parse(JSON.stringify(report));
    expect(parsed.findings).toEqual(report.findings);
    for (const p of report.findings.added) expect(human).toContain(p);
    for (const r of report.findings.removed) expect(human).toContain(r.path);
  });
});
