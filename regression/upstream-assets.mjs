// The **restyle signal** — a global restyle is invisible to the
// index, the copy projection and the per-page chrome projection, because no
// page's text changes and every page's HTML carries build-hashed asset names.
// Webflow's shared stylesheet and script filenames carry a build hash that
// changes on every publish (`flocksafety-staging.shared.5697e783c.min.css`), so
// a per-URL check would fire on every publish and teach us to ignore it.
//
// The signal is therefore a digest of the *bytes* of the site's shared asset
// set, recorded in the baseline. A digest we have never recorded is a
// chrome-tier finding that names the asset and its size; a publish that changes
// an asset's filename without changing its content is not a finding, because
// the comparison is between digests and never between URLs.
//
// Discovery is a pure function of one live page's HTML. The page advertises its
// Webflow site id on `<html data-wf-site>`, and the site's own published assets
// are the stylesheet `<link>` and script `<script src>` references whose
// resolved path lies under `/<site-id>/`. In this site's output that directory
// is the Webflow CDN, so the set stays small (the 2026-09-14 homepage had 27
// references, 4 of them under the site id) and third-party CDNs (Google Fonts,
// cdnjs, jsDelivr, Marketo, the Webflow-served jQuery and GSAP) fall out because
// the site id does not appear in their paths. The rule checks the path only; a
// reference on another host that happened to carry the site id in its path
// would also be kept.
//
// What discovery cannot see: it reads a single page, so a shared asset that
// page does not reference is invisible; it needs the `data-wf-site` attribute,
// so a page that does not advertise its site id discovers nothing; and it keeps
// only stylesheet links and script sources, so an asset reached from CSS
// (`@import`, `url()`) or a preload/`as=style` link is invisible. Comparison is
// by digest only, so an asset that disappears with no replacement — a bare
// removal — sets no finding; only bytes that are new to us do.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { parse } from 'parse5';

/** @typedef {import('parse5').DefaultTreeAdapterTypes.Node} HtmlNode */

/**
 * One referenced shared asset, discovered from a live page: the basename it is
 * named by in the report, and the absolute URL it was fetched from.
 * @typedef {Object} AssetRef
 * @property {string} name
 * @property {string} url
 */

/**
 * One fetched asset: a discovered reference plus the bytes the network edge
 * read. The bytes are what the digest covers.
 * @typedef {Object} FetchedAsset
 * @property {string} name
 * @property {string} url
 * @property {Uint8Array} bytes
 */

/**
 * One asset as the baseline records it: its name, URL, content digest and byte
 * size. The URL is carried for the report and for a human reading the file; the
 * comparison matches on `digest`, never on `url`.
 * @typedef {Object} AssetRecord
 * @property {string} name
 * @property {string} url
 * @property {string} digest
 * @property {number} bytes
 */

/**
 * A **restyle finding**: one shared asset whose byte digest is new to us, named
 * with its size. It is chrome-tier — the site's presentation moved and every
 * served page is potentially out of date — but carries no per-page path, which
 * is what distinguishes it from a per-page chrome finding.
 * @typedef {Object} RestyleFinding
 * @property {string} name
 * @property {string} url
 * @property {number} bytes
 */

/**
 * One run of the restyle tier: the assets compared, the findings, and the
 * baseline form of this run's asset set.
 * @typedef {Object} AssetReport
 * @property {number} compared
 * @property {number} differed
 * @property {RestyleFinding[]} findings
 * @property {AssetRecord[]} records
 */

/**
 * The restyle tier as the run report carries it: the counts and the asset
 * findings, with no per-page path — the shape that distinguishes it from the
 * per-page chrome findings it sits beside under `report.chrome.restyle`.
 * @typedef {Object} RestyleTier
 * @property {number} compared
 * @property {number} differed
 * @property {RestyleFinding[]} findings
 */

/** The attribute that names the page's own Webflow site. @type {string} */
const SITE_ATTR = 'data-wf-site';

/**
 * Asset order, code-unit by URL, shared by the discovery, the run's records and
 * the baseline's serialization so asset ordering cannot drift between them.
 * @param {{url: string}} a
 * @param {{url: string}} b
 * @returns {number}
 */
export const byAssetUrl = (a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);

/** @param {HtmlNode} node @param {string} name @returns {string|undefined} */
function attr(node, name) {
  if (!('attrs' in node)) return undefined;
  return node.attrs.find((a) => a.name === name)?.value;
}

/**
 * The site id the page advertises on `<html data-wf-site>`. Discovery needs it
 * to tell the site's own published assets from third-party references; a page
 * that does not advertise it discovers nothing.
 * @param {HtmlNode} root
 * @returns {string|undefined}
 */
function siteId(root) {
  /** @type {string|undefined} */
  let id;
  const visit = (/** @type {HtmlNode} */ node) => {
    if ('tagName' in node && node.tagName === 'html') {
      const value = attr(node, SITE_ATTR);
      if (value !== undefined && value !== '') id = value;
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return id;
}

/**
 * The set of shared assets a live page references: every `<link rel=stylesheet
 * href>` and `<script src>` whose absolute URL lies in the page's own Webflow
 * site directory, deduped by URL and sorted by it. Pure: the same HTML and base
 * URL discover the same set.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {AssetRef[]}
 */
export function assetRefs(html, pageUrl) {
  const root = parse(String(html));
  const id = siteId(root);
  if (id === undefined) return [];
  const prefix = `/${id}/`;
  /** @type {Map<string, AssetRef>} */
  const refsByUrl = new Map();
  const visit = (/** @type {HtmlNode} */ node) => {
    if ('tagName' in node) {
      const reference =
        node.tagName === 'link' && (attr(node, 'rel') ?? '').toLowerCase() === 'stylesheet'
          ? attr(node, 'href')
          : node.tagName === 'script'
            ? attr(node, 'src')
            : undefined;
      if (reference !== undefined && reference !== '') {
        let resolved = null;
        try {
          resolved = new URL(reference, pageUrl);
        } catch {
          resolved = null;
        }
        if (resolved !== null && resolved.pathname.startsWith(prefix)) {
          const name = resolved.pathname.slice(resolved.pathname.lastIndexOf('/') + 1);
          refsByUrl.set(resolved.href, { name, url: resolved.href });
        }
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return [...refsByUrl.values()].sort(byAssetUrl);
}

/**
 * The content digest of one asset, over its bytes and never its URL: a
 * republish that changes a build-hashed filename without changing the content
 * produces the same digest, so it is not a finding. Sixteen hex characters,
 * matching the copy and chrome projection digests.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function assetDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/**
 * One run of the restyle tier. Every fetched asset is digested; an asset whose
 * digest the previous baseline does not hold is a finding. Matching by digest
 * rather than by URL is the whole rule — a build-hashed filename alone never
 * fires, and `records` is the baseline form of this run's asset set.
 * @param {FetchedAsset[]} assets
 * @param {AssetRecord[]} [previousAssets]
 * @returns {AssetReport}
 */
export function assetReport(assets, previousAssets = []) {
  const known = new Set(previousAssets.map((record) => record.digest));
  /** @type {RestyleFinding[]} */
  const findings = [];
  /** @type {AssetRecord[]} */
  const records = [];
  for (const asset of assets) {
    const byteLength = asset.bytes.byteLength;
    const digest = assetDigest(asset.bytes);
    records.push({ name: asset.name, url: asset.url, digest, bytes: byteLength });
    if (!known.has(digest)) findings.push({ name: asset.name, url: asset.url, bytes: byteLength });
  }
  records.sort(byAssetUrl);
  return { compared: assets.length, differed: findings.length, findings, records };
}
