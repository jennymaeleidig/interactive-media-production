// The re-inventory walk (ticket 11, step 1) and the inventory CSV vocabulary
// the whole capture-refresh pipeline shares.
//
// The walk is ticket 01's proven method, re-run: robots.txt → sitemap.xml in
// full → homepage header/footer nav crawl → listing pagination walks → one
// verification pass over the union, producing a dated CSV in the established
// column format (`path,title,nav,type,status,redirect_target,url`).
//
// This module is an **ops tool**: it needs the network and is run by hand
// (`node pipeline/inventory.mjs`), never by `npm test`. The pure parsers,
// classifier, and row builder below are unit-tested; only the CLI fetches.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { makeArg, invokedDirectly } from './cli.mjs';

/** The live site under inventory. */
export const SITE_ORIGIN = 'https://www.flocksafety.com';

/**
 * @typedef {Object} InventoryRow
 * @property {string} path
 * @property {string} title
 * @property {string} nav
 * @property {string} type
 * @property {string} status
 * @property {string} redirect_target
 * @property {string} url
 */

/** The established inventory columns (ticket 01's table). */
export const INVENTORY_COLUMNS = ['path', 'title', 'nav', 'type', 'status', 'redirect_target', 'url'];

/** Listing hubs whose Webflow `?<hash>_page=N` pagination hides item pages. */
const LISTING_HUBS = ['/blog', '/customers', '/resources', '/press-center'];

/** Section hub paths — the `index` type. */
const SECTION_INDEXES = new Set([
  '/', '/blog', '/careers', '/customers', '/legal', '/press-center', '/products', '/resources', '/trust', '/upcoming-events',
]);

/** Gated-content paths that are not under a resource family prefix. */
const RESOURCE_EXTRAS = new Set(['/brand-partner-guide', '/podcast', '/video-form', '/webinar-thankyou']);

/**
 * The utility vocabulary: forms, thank-yous, tests, site files, and one-off
 * account-adjacent pages. Explicit rather than slug-heuristic so the type is
 * auditable; an unknown new utility page defaults to `marketing` (advisory
 * only — type drift drives no capture action).
 */
const UTILITY_PATHS = new Set([
  '/accessibility-plan', '/accessibility-statement', '/book-a-demo', '/book-a-demo---ctv', '/book-a-demo-arizona',
  '/book-a-demo-blue-eye', '/book-a-demo-form-test', '/book-a-demo-homeowners', '/book-a-demo-layout',
  '/book-a-demo-multistep', '/book-a-demo-neighborhoods', '/book-a-demo-paid', '/book-a-demo-paid-copy',
  '/book-a-demo-short-form', '/book-a-demo-short-form-paid', '/book-a-demo-short-form-test', '/book-a-demo-test',
  '/book-a-mobile-security-trailers-demo', '/business-template', '/chilipiper-2', '/city-leadership-direct',
  '/connected-workflows-demo', '/contact', '/dir-contract', '/drones-demo', '/email-exclusions-test', '/fb-click-id',
  '/form-test', '/kb-tickets', '/newsletter', '/partner-inquiry', '/privacy-ethics-copy', '/refer',
  '/reinstall-fee-schedule', '/supplier-registration', '/thank-you-download-asset', '/thank-you-freeform',
  '/thank-you-hoa', '/thank-you-le-ss', '/thank-you-on-demand-webinar', '/thank-you-webinar', '/thanks-meeting',
  '/thanks-meeting-hv',
]);

// ---- CSV ---------------------------------------------------------------------

/**
 * One CSV line → fields. Honors double-quoted fields with doubled-quote
 * escapes; the same small flat parser the build's manifest reader uses.
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else { field += ch; }
    } else if (ch === '"') { quoted = true; }
    else if (ch === ',') { fields.push(field); field = ''; }
    else { field += ch; }
  }
  fields.push(field);
  return fields;
}

/** Quote a field iff it needs it. */
function csvField(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Parse a CSV with a header row into row objects keyed by that header. The
 * shared seam for every CSV-shaped run artifact (inventory, capture status,
 * title repairs): the header names the columns, nothing is positional.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsvTable(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const cols = parseCsvLine(lines[0]).map((c) => c.trim());
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    cols.forEach((c, i) => { row[c] = fields[i] ?? ''; });
    return row;
  });
}

/**
 * Parse an inventory(-shaped) CSV into row objects, keyed by its header row.
 * @param {string} text
 * @returns {import('./inventory.mjs').InventoryRow[]}
 */
export function parseInventoryCsv(text) {
  return parseCsvTable(text).map((row) => /** @type {import('./inventory.mjs').InventoryRow} */ (row));
}

/**
 * Serialize rows in a given column order, quoting fields that need it.
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 * @returns {string}
 */
export function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/**
 * Serialize inventory rows in the established column order.
 * @param {import('./inventory.mjs').InventoryRow[]} rows
 * @returns {string}
 */
export function toInventoryCsv(rows) {
  return toCsv(INVENTORY_COLUMNS, rows);
}

// ---- discovery parsers -------------------------------------------------------

/**
 * @typedef {Object} Robots
 * @property {string[]} sitemaps
 * @property {string[]} disallowed
 */

/**
 * Read a robots.txt: every `Sitemap:` line and every `Disallow:` prefix.
 * @param {string} text
 * @returns {Robots}
 */
export function parseRobotsTxt(text) {
  const sitemaps = [];
  const disallowed = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, directive, value] = m;
    if (!value) continue;
    if (directive.toLowerCase() === 'sitemap') sitemaps.push(value.trim());
    else if (directive.toLowerCase() === 'disallow') disallowed.push(value.trim());
  }
  return { sitemaps, disallowed };
}

/** Named HTML entities the site's titles use, beyond the numeric forms. */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', trade: '\u2122',
  reg: '\u00ae', copy: '\u00a9', deg: '\u00b0', middot: '\u00b7',
};

/** Decode numeric (`&#x27;`) and named entities — titles are stored decoded. */
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[/** @type {keyof typeof NAMED_ENTITIES} */ (body.toLowerCase())] ?? match;
  });
}

/**
 * Every `<loc>` in a sitemap or sitemap index. A sitemap index yields the
 * child sitemap URLs; the caller fetches and re-parses those.
 * @param {string} xml
 * @returns {string[]}
 */
export function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const url = decodeEntities(m[1].trim());
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** The live `<title>` of an HTML document, or '' when it has none. */
export function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Normalize a URL to `origin + pathname` — query, fragment, and a trailing
 * slash (except at the root) dropped, so discovery sources key the same path.
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  const u = new URL(url);
  const pathname = u.pathname === '/' ? '/' : u.pathname.replace(/\/+$/, '');
  return u.origin + pathname;
}

/** Every `<a>` tag with a usable href, as `{ url, href, cls }`. */
function* anchorTags(html, baseUrl) {
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    const hrefM = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    if (!hrefM) continue;
    const href = decodeEntities(hrefM[1] ?? hrefM[2] ?? hrefM[3] ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    const classM = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    try {
      yield { url: new URL(href, baseUrl), href, cls: classM ? classM[1] ?? classM[2] ?? '' : '' };
    } catch {
      // unparseable href — not a page
    }
  }
}

/**
 * Same-origin `<a href>` page paths, query and fragment stripped, deduped,
 * sorted. External hosts, `mailto:`/`tel:`, protocol-relative URLs, and
 * fragment-only links are ignored.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const paths = new Set();
  for (const { url } of anchorTags(html, baseUrl)) {
    if (url.origin !== origin) continue;
    paths.add(normalizeUrl(url.href));
  }
  return [...paths].sort();
}

/**
 * Webflow pagination links for the listing at `baseUrl` — every
 * `?<hash>_page=N` link on the same path, deduped by page number.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{ page: number, url: string }[]}
 */
export function paginationLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const byPage = new Map();
  for (const { url } of anchorTags(html, baseUrl)) {
    if (url.origin !== base.origin || url.pathname !== base.pathname) continue;
    for (const [key, value] of url.searchParams) {
      if (!/_page$/.test(key) || !/^\d+$/.test(value)) continue;
      const page = Number(value);
      if (!byPage.has(page)) byPage.set(page, `${url.origin}${url.pathname}?${key}=${value}`);
    }
  }
  return [...byPage].map(([page, url]) => ({ page, url })).sort((a, b) => a.page - b.page);
}

/**
 * The next listing page, from Webflow's `w-pagination-next` control. The
 * listing widget links only the adjacent pages, so the walk must step next by
 * next — page 1 advertises page 2, page 2 advertises page 3, and so on.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function nextListingUrl(html, baseUrl) {
  const base = new URL(baseUrl);
  for (const { url, cls } of anchorTags(html, baseUrl)) {
    if (/\bw-pagination-next\b/.test(cls) && url.origin === base.origin) return url.href;
  }
  return null;
}

/**
 * The page numbers a listing advertises — `paginationLinks` without the URLs.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {number[]}
 */
export function paginationPageNumbers(html, baseUrl) {
  return paginationLinks(html, baseUrl).map((l) => l.page);
}

// ---- classification ----------------------------------------------------------

/**
 * The inventory `type` column. Status decides the route class first; then the
 * path vocabulary. Deterministic and auditable — advisory in the diff.
 * @param {string} pathname
 * @param {string} status
 * @returns {string}
 */
export function classifyType(pathname, status) {
  const base = Number.parseInt(status, 10);
  if (base === 401) return 'auth-gated';
  if (base === 404) return 'dead';
  if (/\(redirect\)/.test(status)) return 'redirect';
  if (SECTION_INDEXES.has(pathname)) return 'index';
  if (/^\/(blog|customers)\/.+/.test(pathname)) return 'post';
  if (/^\/legal(\/|$)/.test(pathname)) return 'legal';
  if (/^\/products\//.test(pathname)) return 'product';
  if (/^\/(abm|lp)\//.test(pathname)) return 'marketing (campaign LP)';
  if (/^\/(webinar|webinars|ebooks|whitepaper|video)\//.test(pathname) || RESOURCE_EXTRAS.has(pathname)) return 'resource';
  if (/^\/thank-you(\/|$)/.test(pathname) || /^\/thanks-/.test(pathname) || /^\/book-a-demo/.test(pathname)) return 'utility';
  if (UTILITY_PATHS.has(pathname)) return 'utility';
  return 'marketing';
}

/**
 * The inventory `nav` column: site-chrome membership, marked when the path is
 * absent from the sitemap.
 * @param {{ inHeader: boolean, inFooter: boolean, inSitemap: boolean }} membership
 * @returns {string}
 */
export function navLabel({ inHeader, inFooter, inSitemap }) {
  const suffix = inSitemap ? '' : ' [not-in-sitemap]';
  if (inHeader && inFooter) return `header+footer${suffix}`;
  if (inHeader) return `header${suffix}`;
  if (inFooter) return `footer${suffix}`;
  return inSitemap ? 'sitemap-only' : 'crawl-only [not-in-sitemap]';
}

// ---- row builder -------------------------------------------------------------

/**
 * @typedef {Object} FetchedPage
 * @property {number} status      final HTTP status after redirects
 * @property {boolean} redirected whether the request followed a redirect
 * @property {string} finalUrl    the URL that finally answered
 * @property {string} title       the live `<title>`
 */

/**
 * Fold the discovery union and the verification pass into inventory rows,
 * sorted by path. A URL with no fetched page is `unreachable`.
 * @param {Object} input
 * @param {string[]} input.urls           the verified union (absolute, query-free)
 * @param {Set<string>} input.sitemapUrls
 * @param {Set<string>} input.headerUrls
 * @param {Set<string>} input.footerUrls
 * @param {Map<string, FetchedPage>} input.pages
 * @returns {import('./inventory.mjs').InventoryRow[]}
 */
export function buildInventoryRows({ urls, sitemapUrls, headerUrls, footerUrls, pages }) {
  const rows = urls.map((url) => {
    const pathname = new URL(url).pathname;
    const page = pages.get(url);
    const status = page ? (page.redirected ? `${page.status} (redirect)` : `${page.status}`) : 'unreachable';
    return /** @type {import('./inventory.mjs').InventoryRow} */ ({
      path: pathname,
      title: page?.title ?? '',
      nav: navLabel({ inHeader: headerUrls.has(url), inFooter: footerUrls.has(url), inSitemap: sitemapUrls.has(url) }),
      type: classifyType(pathname, status),
      status,
      redirect_target: page && page.redirected ? new URL(page.finalUrl).pathname : '',
      url,
    });
  });
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return rows;
}

// ---- paths -------------------------------------------------------------------

/** Where dated inventories live: tracked, independent of capture runs. */
export function inventoryDir() {
  return '.scratch/flock-parody/research/inventory';
}

/** A run's dated inventory CSV. */
export function inventoryCsvPath(runDate) {
  return `${inventoryDir()}/${runDate}-full-site-inventory.csv`;
}

/** `YYYY-MM-DD` in local time — the run-date convention every artifact uses. */
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---- the walk (CLI) ----------------------------------------------------------

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 interactive-media-production-capture-refresh';

/** Map with bounded concurrency, preserving input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** GET a URL, retrying transient failures. */
async function fetchText(url, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45_000) });
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

/** Fetch one page for the verification pass. */
async function fetchPage(url) {
  const res = await fetchText(url);
  const html = await res.text();
  return /** @type {FetchedPage} */ ({ status: res.status, redirected: res.redirected, finalUrl: res.url, title: extractTitle(html) });
}

/**
 * The homepage header/footer nav crawl. Webflow emits no `<header>`/`<footer>`
 * tags, so membership is approximated by the class markers its chrome uses:
 * the header is everything before the first content section, the footer
 * everything from the first footer marker on. Approximate by design — nav drift
 * is advisory in the diff and drives no capture action.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{ header: string[], footer: string[] }}
 */
export function extractNavLinks(html, baseUrl) {
  const footerAt = html.search(/class="[^"]*(?:is-footer|footer-5_|footer-links)/);
  const headerEnd = html.search(/class="[^"]*(?:section-z|section_bg|main-content)/);
  const headerStop = headerEnd >= 0 ? headerEnd : footerAt >= 0 ? footerAt : html.length;
  return {
    header: extractInternalLinks(html.slice(0, headerStop), baseUrl),
    footer: footerAt >= 0 ? extractInternalLinks(html.slice(footerAt), baseUrl) : [],
  };
}

/** Walk one listing hub's pagination, stepping `next` until there is none. */
async function walkListing(hubUrl, log) {
  const found = new Set();
  let url = hubUrl;
  let page = 0;
  while (url && page < 500) {
    const html = await (await fetchText(url)).text();
    page += 1;
    for (const link of extractInternalLinks(html, url)) found.add(link);
    const next = nextListingUrl(html, url);
    if (!next || next === url) break;
    url = next;
  }
  log(`  ${new URL(hubUrl).pathname}: ${page} page(s)`);
  return found;
}

/** Discover the union of sitemap, nav, and pagination-walk URLs. */
async function discover(log) {
  const robots = await (await fetchText(`${SITE_ORIGIN}/robots.txt`)).text();
  const { sitemaps, disallowed } = parseRobotsTxt(robots);
  const roots = sitemaps.length > 0 ? sitemaps : [`${SITE_ORIGIN}/sitemap.xml`];
  const sitemapUrls = new Set();
  for (const root of roots) {
    const xml = await (await fetchText(root)).text();
    for (const loc of parseSitemap(xml)) {
      // a sitemap index lists child sitemaps; fetch those too
      if (/\.xml(\?|$)/.test(loc) && loc !== root) {
        const childXml = await (await fetchText(loc)).text();
        for (const child of parseSitemap(childXml)) sitemapUrls.add(normalizeUrl(child));
      } else {
        sitemapUrls.add(normalizeUrl(loc));
      }
    }
  }
  log(`sitemap: ${sitemapUrls.size} URL(s) from ${roots.length} root(s); robots disallows ${disallowed.length} prefix(es)`);

  const home = await (await fetchText(`${SITE_ORIGIN}/`)).text();
  const { header, footer } = extractNavLinks(home, `${SITE_ORIGIN}/`);
  log(`nav: ${header.length} header + ${footer.length} footer link(s)`);

  const listing = new Set();
  for (const hub of LISTING_HUBS) {
    const links = await walkListing(`${SITE_ORIGIN}${hub}`, log);
    for (const link of links) listing.add(link);
  }

  const union = new Set([...sitemapUrls, ...header, ...footer, ...listing]);
  return {
    urls: [...union].sort(),
    sitemapUrls,
    headerUrls: new Set(header),
    footerUrls: new Set(footer),
  };
}

async function main() {
  const arg = makeArg(process.argv.slice(2));
  const runDate = arg('--date') ?? localDate();
  const out = arg('--out') ?? inventoryCsvPath(runDate);
  const log = (m) => console.log(m);

  log(`re-inventorying ${SITE_ORIGIN} → ${out}`);
  const { urls, sitemapUrls, headerUrls, footerUrls } = await discover(log);
  const limit = Number(arg('--limit') ?? 0);
  const verify = limit > 0 ? urls.slice(0, limit) : urls;
  log(`verifying ${verify.length} URL(s)${limit > 0 ? ` (--limit ${limit})` : ''}…`);
  const pages = new Map();
  let done = 0;
  await mapLimit(verify, 8, async (url) => {
    try {
      pages.set(url, await fetchPage(url));
    } catch (error) {
      log(`  ⚠ ${url}: ${error instanceof Error ? error.message : error}`);
    }
    done += 1;
    if (done % 100 === 0) log(`  ${done}/${verify.length}`);
  });
  const rows = buildInventoryRows({ urls: verify, sitemapUrls, headerUrls, footerUrls, pages });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toInventoryCsv(rows));
  const live = rows.filter((r) => r.status === '200').length;
  const unreachable = rows.filter((r) => r.status === 'unreachable').length;
  log(`wrote ${rows.length} row(s): ${live} live, ${rows.length - live - unreachable} non-live, ${unreachable} unreachable`);
}

if (invokedDirectly(import.meta.url)) await main();
