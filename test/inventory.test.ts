// The re-inventory vocabulary (ticket 11): the CSV schema the whole refresh
// pipeline shares, and the discovery parsers the walk is built from. Pure —
// every network fetch lives in the CLI, so these tests never touch the wire.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  INVENTORY_COLUMNS,
  buildInventoryRows,
  classifyType,
  extractInternalLinks,
  extractTitle,
  inventoryCsvPath,
  navLabel,
  nextListingUrl,
  paginationPageNumbers,
  parseInventoryCsv,
  parseRobotsTxt,
  parseSitemap,
  toInventoryCsv,
} from '../pipeline/inventory.mjs';

describe('inventory CSV schema', () => {
  it('uses the established column format', () => {
    expect(INVENTORY_COLUMNS).toEqual(['path', 'title', 'nav', 'type', 'status', 'redirect_target', 'url']);
  });

  it('parses quoted titles, commas, and doubled quotes', () => {
    const csv = [
      INVENTORY_COLUMNS.join(','),
      '/a,"FreeForm Search, Inc. ""Pro""",header,product,200,,https://www.flocksafety.com/a',
    ].join('\n');
    const rows = parseInventoryCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('FreeForm Search, Inc. "Pro"');
    expect(rows[0].type).toBe('product');
  });

  it('round-trips rows through serialization', () => {
    const rows = parseInventoryCsv(
      [
        INVENTORY_COLUMNS.join(','),
        '/a,"Title, with comma",sitemap-only,post,200,,https://www.flocksafety.com/a',
        '/b,Plain,header,index,200 (redirect),/a,https://www.flocksafety.com/b',
      ].join('\n'),
    );
    const round = parseInventoryCsv(toInventoryCsv(rows));
    expect(round).toEqual(rows);
  });

  it('quotes fields that need it when serializing', () => {
    const lines = toInventoryCsv([
      { path: '/a', title: 'A, B', nav: 'header', type: 'index', status: '200', redirect_target: '', url: 'https://www.flocksafety.com/a' },
    ]).split('\n');
    expect(lines[1]).toContain('"A, B"');
  });
});

describe('robots.txt and sitemaps', () => {
  it('reads sitemap URLs and disallowed prefixes, ignoring comments', () => {
    const robots = [
      'User-agent: *',
      '# a comment',
      'Disallow: /blog-audiences/',
      'disallow: /use-case-filters/',
      'Sitemap: https://www.flocksafety.com/sitemap.xml',
    ].join('\n');
    expect(parseRobotsTxt(robots)).toEqual({
      sitemaps: ['https://www.flocksafety.com/sitemap.xml'],
      disallowed: ['/blog-audiences/', '/use-case-filters/'],
    });
  });

  it('reads a urlset with namespaced locs, deduped', () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://www.flocksafety.com/a</loc></url>
        <url><loc>https://www.flocksafety.com/b</loc></url>
        <url><loc>https://www.flocksafety.com/a</loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual(['https://www.flocksafety.com/a', 'https://www.flocksafety.com/b']);
  });

  it('descends a sitemap index', () => {
    const xml = `<sitemapindex><sitemap><loc>https://www.flocksafety.com/sitemap-0.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual(['https://www.flocksafety.com/sitemap-0.xml']);
  });
});

describe('link discovery', () => {
  it('keeps only same-origin page links, query and hash stripped', () => {
    const html = `
      <a href="/products">Products</a>
      <a href="https://www.flocksafety.com/blog?6f47fcda_page=2#top">Blog</a>
      <a href="https://twitter.com/flock">Twitter</a>
      <a href="mailto:hi@flocksafety.com">Mail</a>
      <a href="#main">Jump</a>
      <a href="//cdn.prod.website-files.com/a.js">CDN</a>
      <a href="/products">Products again</a>`;
    expect(extractInternalLinks(html, 'https://www.flocksafety.com/')).toEqual([
      'https://www.flocksafety.com/blog',
      'https://www.flocksafety.com/products',
    ]);
  });

  it('reads Webflow pagination page numbers for the listing path only', () => {
    const html = `
      <a href="/blog?6f47fcda_page=2">2</a>
      <a href="/blog?6f47fcda_page=69">Last</a>
      <a href="/customers?97994871_page=3">3</a>`;
    expect(paginationPageNumbers(html, 'https://www.flocksafety.com/blog')).toEqual([2, 69]);
  });

  it('returns no pages for a listing with one page', () => {
    expect(paginationPageNumbers('<a href="/blog">Blog</a>', 'https://www.flocksafety.com/blog')).toEqual([]);
  });

  it('steps to the next listing page from Webflow’s next control', () => {
    const html = `<a class="w-pagination-next cs_pg-button" href="?6f47fcda_page=2">Next</a>`;
    expect(nextListingUrl(html, 'https://www.flocksafety.com/blog')).toBe('https://www.flocksafety.com/blog?6f47fcda_page=2');
  });

  it('has no next page on the last listing page', () => {
    expect(nextListingUrl('<a class="w-pagination-prev" href="?6f47fcda_page=8">Prev</a>', 'https://www.flocksafety.com/blog')).toBeNull();
  });
});

describe('title extraction', () => {
  it('decodes numeric and named entities, as the inventory stores them', () => {
    expect(extractTitle('<title>2023 Flock #Solved Awards: See This Year&#x27;s 8 Winners</title>')).toBe("2023 Flock #Solved Awards: See This Year's 8 Winners");
    expect(extractTitle('<title>A &amp; B &#8212; C &rsquo;d</title>')).toBe('A & B \u2014 C \u2019d');
  });

  it('collapses a multiline title to one line', () => {
    expect(extractTitle('<title>\n  Two\n  Lines\n</title>')).toBe('Two Lines');
  });
});

describe('row classification', () => {
  it.each([
    ['/', '200', 'index'],
    ['/products/flock-os', '200', 'product'],
    ['/blog/a-post', '200', 'post'],
    ['/customers/a-story', '200', 'post'],
    ['/legal/privacy-policy', '200', 'legal'],
    ['/webinar/a-webinar', '200', 'resource'],
    ['/ebooks/a-book', '200', 'resource'],
    ['/abm/amazon', '200', 'marketing (campaign LP)'],
    ['/thank-you', '200', 'utility'],
    ['/book-a-demo-arizona', '200', 'utility'],
    ['/form-test', '200', 'utility'],
    ['/what-is-flock', '200', 'marketing'],
    ['/gone', '404', 'dead'],
    ['/events/test-event', '401', 'auth-gated'],
    ['/legal/privacy-notice', '200 (redirect)', 'redirect'],
  ])('classifies %s as %s', (path, status, type) => {
    expect(classifyType(path, status)).toBe(type);
  });

  it('labels nav membership, sitemap membership, and crawl-only discovery', () => {
    expect(navLabel({ inHeader: true, inFooter: false, inSitemap: true })).toBe('header');
    expect(navLabel({ inHeader: true, inFooter: true, inSitemap: true })).toBe('header+footer');
    expect(navLabel({ inHeader: false, inFooter: true, inSitemap: true })).toBe('footer');
    expect(navLabel({ inHeader: true, inFooter: false, inSitemap: false })).toBe('header [not-in-sitemap]');
    expect(navLabel({ inHeader: false, inFooter: true, inSitemap: false })).toBe('footer [not-in-sitemap]');
    expect(navLabel({ inHeader: false, inFooter: false, inSitemap: true })).toBe('sitemap-only');
    expect(navLabel({ inHeader: false, inFooter: false, inSitemap: false })).toBe('crawl-only [not-in-sitemap]');
  });
});

describe('buildInventoryRows', () => {
  const page = (over: Partial<{ status: number; redirected: boolean; finalUrl: string; title: string }> = {}) => ({
    status: 200,
    redirected: false,
    finalUrl: 'https://www.flocksafety.com/a',
    title: 'A',
    ...over,
  });

  it('labels nav membership, status, and redirect target, sorted by path', () => {
    const pages = new Map<string, ReturnType<typeof page>>([
      ['https://www.flocksafety.com/', page({ title: 'Flock Safety' })],
      ['https://www.flocksafety.com/products/flock-os', page({ title: 'Flock OS' })],
      ['https://www.flocksafety.com/legal/privacy-notice', page({ status: 200, redirected: true, finalUrl: 'https://www.flocksafety.com/legal/privacy-policy', title: 'Privacy Policy' })],
      ['https://www.flocksafety.com/gone', page({ status: 404, title: 'Not Found' })],
    ]);
    const rows = buildInventoryRows({
      urls: [
        'https://www.flocksafety.com/products/flock-os',
        'https://www.flocksafety.com/',
        'https://www.flocksafety.com/legal/privacy-notice',
        'https://www.flocksafety.com/gone',
      ],
      sitemapUrls: new Set(['https://www.flocksafety.com/', 'https://www.flocksafety.com/legal/privacy-notice', 'https://www.flocksafety.com/gone']),
      headerUrls: new Set(['https://www.flocksafety.com/', 'https://www.flocksafety.com/legal/privacy-notice']),
      footerUrls: new Set(['https://www.flocksafety.com/']),
      pages,
    });
    expect(rows.map((r) => r.path)).toEqual(['/', '/gone', '/legal/privacy-notice', '/products/flock-os']);
    expect(rows[0]).toMatchObject({ title: 'Flock Safety', nav: 'header+footer', type: 'index', status: '200', redirect_target: '' });
    expect(rows[1]).toMatchObject({ nav: 'sitemap-only', type: 'dead', status: '404' });
    expect(rows[2]).toMatchObject({ nav: 'header', type: 'redirect', status: '200 (redirect)', redirect_target: '/legal/privacy-policy' });
    expect(rows[3]).toMatchObject({ nav: 'crawl-only [not-in-sitemap]', type: 'product' });
  });

  it('marks a page that never answered as unreachable', () => {
    const rows = buildInventoryRows({
      urls: ['https://www.flocksafety.com/flaky'],
      sitemapUrls: new Set(),
      headerUrls: new Set(),
      footerUrls: new Set(),
      pages: new Map(),
    });
    expect(rows[0]).toMatchObject({ path: '/flaky', status: 'unreachable', type: 'marketing', title: '' });
  });
});

describe('inventory paths', () => {
  it('dates the inventory beside the baseline, not inside a capture run', () => {
    expect(inventoryCsvPath('2026-09-12')).toBe('.scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv');
  });
});
