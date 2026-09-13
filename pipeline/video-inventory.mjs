// Video inventory extractor for the served tree (ticket 11 prep).
//
// Scans every served HTML page and extracts every video reference into a
// deduped, page-mapped inventory:
//
//   - Wistia media (hashed ID), usually via the captured `w-json-ld`
//     VideoObject blocks, which also carry title, duration, thumbnail, and
//     the direct delivery `contentUrl` (HLS .m3u8).
//   - YouTube videos (embed / shorts / live / watch?v= / youtu.be, 11-char ID).
//   - Orphan Wistia delivery assets referenced outside a w-json-ld block
//     (the inline player markup), classified video vs poster image.
//
// Each entry records `context`: whether the reference is an `embed` (renders
// as a video slot — the iframe is stripped in the served bytes, so today it is
// an empty box), a `link` (body copy pointing at the video — survives as an
// `<a href>` and already works), or `both`. The distinction is what makes the
// probe's report meaningful: a dead embed is a blank slot, a dead link is
// broken copy.
//
// Coverage is scoped to the providers whose slots survive the build: Wistia
// (URLs and `<wistia-player media-id>` attributes) and YouTube (URLs and
// `data-video-id`). Vidzflow — the fourth provider, a video.js player inlined
// in an `srcdoc` — is deliberately not modelled: the build strips its hidden
// player documents (ticket 19), so no Vidzflow slot survives to inventory. A
// *new* provider is caught at build time by the embeds summary plus the
// `unclassified remote refs` audit, not by this tool; this tool's job is the
// liveness of the players that actually reach the network.
//
// Pure transformation: reads the served tree, writes dated inventory files.
// No network access of its own — the upstream liveness probe is a separate ops
// tool, `pipeline/video-probe.mjs`, whose fast tier takes the dated inventory
// as its input.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';

import { makeArg, invokedDirectly } from './cli.mjs';

/**
 * @typedef {Object} VideoEntry
 * @property {string} key          `wistia:<id>` | `youtube:<id>` — the probe's join key
 * @property {'wistia'|'youtube'} host
 * @property {string} kind         `media` (Wistia) | `video` (YouTube)
 * @property {'embed'|'link'|'both'} context  slot vs body-copy link
 * @property {string} id
 * @property {string} url          the URL the probe fetches
 * @property {string|null} title   from the w-json-ld VideoObject, when captured
 * @property {string|null} duration
 * @property {string|null} contentUrl  direct delivery stream (HLS)
 * @property {string[]} pages      served pages referencing it, sorted
 */

const YOUTUBE_EMBED = /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/g;
const YOUTUBE_LINK = /(?:youtube(?:-nocookie)?\.com\/watch\?(?:[^"'`\s>]*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const WISTIA_EMBED = /(?:fast\.wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/|wistia_async_)([a-z0-9]{10})/g;
const WISTIA_LINK = /flocksafety\.wistia\.com\/medias\/([a-z0-9]{10})/g;
// Slot elements that name their video as an *attribute* rather than a URL. The
// inventory missed these entirely until 2026-09-11, which cost it 16 YouTube
// slots and one Wistia media — and, because the dead-media list is generated
// from the inventory, shipped one live frame to a dead player (ticket 17).
// Both are bounded: `data-video-id` must hold exactly the 11 id characters
// (podcast episode buttons carry 24-char ids; Vidzflow's `data-video-id=32614`
// is numeric) and `media-id` exactly 10 — and `media-id` must not be prefixed
// (Wistia's own attribute is bare; `data-media-id` belongs to other markup).
const YOUTUBE_ATTR = /(?<![\w-])data-video-id\s*=\s*["']?([A-Za-z0-9_-]{11})["']?(?![A-Za-z0-9_-])/g;
const WISTIA_MEDIA_ATTR = /(?<![\w-])media-id\s*=\s*["']?([a-z0-9]{10})["']?(?![a-z0-9])/g;
const DELIVERY = /embed-ssl\.wistia\.com\/deliveries\/([a-f0-9]{8,})(\.[a-z0-9]+)?/g;

const VIDEO_EXTS = new Set(['.m3u8', '.mp4', '.webm', '.mov']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Recursively list every file under `root` whose name ends in `.html`,
 * returning repo-relative-ish paths (posix separators) sorted ascending.
 * @param {string} root
 * @returns {string[]}
 */
export function listHtmlPages(root) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.html')) out.push(p);
    }
  };
  walk(root);
  return out.map((p) => p.split(path.sep).join('/'));
}

/**
 * Decode the HTML-entity double-escaping the captures introduced
 * (`&quot;`, `&amp;quot;`) so inline JSON strings parse cleanly.
 * @param {string} s
 * @returns {string}
 */
function unescapeEntities(s) {
  return s
    .replace(/&amp;quot;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;lt;/g, '<')
    .replace(/&amp;gt;/g, '>');
}

/**
 * Extract one page's video references — w-json-ld Wistia VideoObjects, Wistia
 * embed/link hashed IDs, YouTube embed/link IDs, the slot attributes that name a
 * video without a URL (`data-video-id`, `media-id`), and delivery assets (video
 * vs poster image) — each id tagged with the contexts it appeared in.
 * @param {string} html raw page bytes
 * @returns {{wistia: Map<string, {title: string|null, duration: string|null, contentUrl: string|null, contexts: Set<'embed'|'link'>}>, youtube: Map<string, Set<'embed'|'link'>>, deliveries: Map<string, 'video'|'image'|'unknown'>}}
 */
export function extractFromPage(html) {
  const { wistia, deliveries } = wistiaFromPage(html);
  /** @type {Map<string, Set<'embed'|'link'>>} */
  const youtube = new Map();
  const markYouTube = (id, context) => {
    if (!youtube.has(id)) youtube.set(id, new Set());
    youtube.get(id).add(context);
  };

  let mm;
  while ((mm = YOUTUBE_EMBED.exec(html)) !== null) markYouTube(mm[1], 'embed');
  while ((mm = YOUTUBE_ATTR.exec(html)) !== null) markYouTube(mm[1], 'embed');
  while ((mm = YOUTUBE_LINK.exec(html)) !== null) markYouTube(mm[1], 'link');
  return { wistia, youtube, deliveries };
}

/**
 * The Wistia half of {@link extractFromPage}: the `w-json-ld` VideoObject blocks
 * (hashed ID, title, duration, delivery URL), the embed-URL / media-link /
 * `wistia_async_*` ID sweeps, and the delivery assets those blocks name. Split
 * out because a caller that only wants the IDs and titles — the live-embed pass
 * — should not pay for the YouTube sweeps on every one of 1,180 pages.
 * @param {string} html raw page bytes
 * @returns {{wistia: Map<string, {title: string|null, duration: string|null, contentUrl: string|null, contexts: Set<'embed'|'link'>}>, deliveries: Map<string, 'video'|'image'|'unknown'>}}
 */
export function wistiaFromPage(html) {
  /** @type {Map<string, {title: string|null, duration: string|null, contentUrl: string|null, contexts: Set<'embed'|'link'>}>} */
  const wistia = new Map();
  /** @type {Map<string, 'video'|'image'|'unknown'>} */
  const deliveries = new Map();

  const markWistia = (id, context, info) => {
    if (!wistia.has(id)) wistia.set(id, { title: null, duration: null, contentUrl: null, contexts: new Set() });
    const e = wistia.get(id);
    e.contexts.add(context);
    if (info) {
      if (info.title != null) e.title = info.title;
      if (info.duration != null) e.duration = info.duration;
      if (info.contentUrl != null) e.contentUrl = info.contentUrl;
    }
  };

  // w-json-ld VideoObject blocks: hashed id + title + direct delivery URL.
  // Only the block is entity-unescaped — the captures double-escape its quotes
  // as `&amp;quot;` — because unescaping the whole page would allocate a second
  // copy of up to 64 MB per page. Every sweep below reads the raw bytes: the ids
  // and URLs it keys on are never entity-escaped, only the quotes around them.
  const jsonld = /<script[^>]*w-json-ld[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = jsonld.exec(html)) !== null) {
    try {
      const obj = JSON.parse(unescapeEntities(m[1]));
      const emb = typeof obj.embedUrl === 'string' ? obj.embedUrl.match(/[a-z0-9]{10}(?=\/?$|$)/) : null;
      const idFromIframe = obj.embedUrl && /fast\.wistia\.[a-z.]+\/embed\/iframe\/([a-z0-9]{10})/.exec(obj.embedUrl);
      const id = idFromIframe ? idFromIframe[1] : (emb ? emb[0] : null);
      if (id && /wistia/.test(m[0])) {
        markWistia(id, 'embed', {
          title: typeof obj.name === 'string' ? obj.name : null,
          duration: typeof obj.duration === 'string' ? obj.duration : null,
          contentUrl: typeof obj.contentUrl === 'string' ? obj.contentUrl : null,
        });
        if (typeof obj.contentUrl === 'string') {
          const d = /deliveries\/([a-f0-9]{8,})/.exec(obj.contentUrl);
          if (d) deliveries.set(d[1], 'video');
          if (typeof obj.thumbnailUrl === 'string') {
            const t = /deliveries\/([a-f0-9]{8,})/.exec(obj.thumbnailUrl);
            if (t) deliveries.set(t[1], 'image');
          }
        }
      }
    } catch {
      // Not JSON (truncated capture etc.) — fall through to regex sweeps below.
    }
  }

  let mm;
  while ((mm = WISTIA_EMBED.exec(html)) !== null) markWistia(mm[1], 'embed', null);
  while ((mm = WISTIA_MEDIA_ATTR.exec(html)) !== null) markWistia(mm[1], 'embed', null);
  while ((mm = WISTIA_LINK.exec(html)) !== null) markWistia(mm[1], 'link', null);
  while ((mm = DELIVERY.exec(html)) !== null) {
    const ext = (mm[2] || '').toLowerCase();
    const kind = VIDEO_EXTS.has(ext) ? 'video' : IMAGE_EXTS.has(ext) ? 'image' : 'unknown';
    if (!deliveries.has(mm[1]) || deliveries.get(mm[1]) === 'unknown') deliveries.set(mm[1], kind);
  }
  return { wistia, deliveries };
}

/**
 * Collapse a set of contexts into the entry's single `context` value.
 * @param {Set<'embed'|'link'>} contexts
 * @returns {'embed'|'link'|'both'}
 */
function contextOf(contexts) {
  return contexts.size > 1 ? 'both' : contexts.has('embed') ? 'embed' : 'link';
}

/**
 * Build the deduped site-wide inventory keyed by video, each with the sorted
 * list of referencing pages.
 * @param {string[]} pages posix-style served paths (paths relative to repo root)
 * @param {(page: string) => string} readPage page path -> raw html, called one
 *   page at a time so the whole tree is never resident (the tree is ~2 GB)
 * @returns {{videos: VideoEntry[], orphanDeliveries: Array<{sha: string, kind: string, url: string, pages: string[]}>}}
 */
export function buildInventory(pages, readPage) {
  /** @type {Map<string, VideoEntry>} */
  const byKey = new Map();
  /** @type {Map<string, {sha: string, kind: string, pages: Set<string>}>} */
  const orphans = new Map();

  const addPage = (key, entry, page) => {
    if (!byKey.has(key)) byKey.set(key, entry);
    const e = byKey.get(key);
    if (!e.pages.includes(page)) e.pages.push(page);
  };

  for (const page of pages) {
    const { wistia, youtube, deliveries } = extractFromPage(readPage(page));
    for (const [id, info] of wistia) {
      addPage(`wistia:${id}`, {
        key: `wistia:${id}`,
        host: 'wistia',
        kind: 'media',
        context: contextOf(info.contexts),
        id,
        url: `https://fast.wistia.com/embed/medias/${id}.json`,
        title: info.title,
        duration: info.duration,
        contentUrl: info.contentUrl,
        pages: [],
      }, page);
    }
    for (const [id, contexts] of youtube) {
      addPage(`youtube:${id}`, {
        key: `youtube:${id}`,
        host: 'youtube',
        kind: 'video',
        context: contextOf(contexts),
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: null,
        duration: null,
        contentUrl: null,
        pages: [],
      }, page);
    }
    for (const [sha, kind] of deliveries) {
      const coveredByJsonld = kind === 'video' && [...wistia.values()].some((w) => w.contentUrl && w.contentUrl.includes(sha));
      if (!coveredByJsonld && kind !== 'image') {
        if (!orphans.has(sha)) orphans.set(sha, { sha, kind, pages: new Set() });
        orphans.get(sha).pages.add(page);
      }
    }
  }

  const videos = [...byKey.values()].map((v) => ({ ...v, pages: [...v.pages].sort() }))
    .sort((a, b) => (a.host + a.id).localeCompare(b.host + b.id));
  const orphanDeliveries = [...orphans.values()].map((o) => ({
    sha: o.sha,
    kind: o.kind,
    url: `https://embed-ssl.wistia.com/deliveries/${o.sha}.m3u8`,
    pages: [...o.pages].sort(),
  })).sort((a, b) => a.sha.localeCompare(b.sha));
  return { videos, orphanDeliveries };
}

/**
 * CSV-escape one field: quote when it contains comma, quote, or newline.
 * @param {string|null} v
 * @returns {string}
 */
export function csv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {string} servedRoot
 * @param {string} outDir
 * @returns {{videos: number, wistia: number, youtube: number, slots: number, links: number, orphans: number, pages: number}}
 */
export function run(servedRoot, outDir) {
  const pages = listHtmlPages(servedRoot);
  const { videos, orphanDeliveries } = buildInventory(pages, (p) => fs.readFileSync(p, 'utf8'));

  fs.mkdirSync(outDir, { recursive: true });

  // videos.json — full deduped model.
  fs.writeFileSync(path.join(outDir, 'videos.json'), JSON.stringify({ videos, orphanDeliveries }, null, 2) + '\n');

  // inventory.csv — one row per video (issue 11's "dated CSV" convention:
  // tracked, human-diffable, one row per item with the referencing pages).
  const rows = ['key,host,kind,context,id,title,duration,content_url,url,pages'];
  for (const v of videos) {
    rows.push([v.key, v.host, v.kind, v.context, v.id, csv(v.title), csv(v.duration), csv(v.contentUrl), v.url, csv(v.pages.join(' '))].join(','));
  }
  for (const o of orphanDeliveries) {
    rows.push([`delivery:${o.sha}`, 'wistia', `delivery-${o.kind}`, 'delivery', o.sha, '', '', '', o.url, csv(o.pages.join(' '))].join(','));
  }
  fs.writeFileSync(path.join(outDir, 'inventory.csv'), rows.join('\n') + '\n');

  // yt-dlp-urls.txt — the download list the user feeds to yt-dlp:
  // YouTube watch URLs, Wistia media in yt-dlp's `wistia:HASH` form, and any
  // orphan delivery stream as a direct URL.
  const lines = [];
  for (const v of videos) {
    if (v.host === 'youtube') lines.push(`https://www.youtube.com/watch?v=${v.id}`);
  }
  for (const v of videos) {
    if (v.host === 'wistia') lines.push(`wistia:${v.id}`);
  }
  for (const o of orphanDeliveries) lines.push(o.url);
  fs.writeFileSync(path.join(outDir, 'yt-dlp-urls.txt'), lines.join('\n') + '\n');

  const wistia = videos.filter((v) => v.host === 'wistia').length;
  const yt = videos.filter((v) => v.host === 'youtube').length;
  const slots = videos.filter((v) => v.context !== 'link').length;
  const links = videos.filter((v) => v.context !== 'embed').length;
  return { videos: videos.length, wistia, youtube: yt, slots, links, orphans: orphanDeliveries.length, pages: pages.length };
}

/**
 * Local `YYYY-MM-DD`. `toISOString()` is UTC — an evening run (UTC-4) would
 * name tomorrow and silently split the run's artifacts into a new folder,
 * leaving the tracked CSVs stale.
 * @returns {string}
 */
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** CLI entry. */
async function main() {
  const arg = makeArg(process.argv.slice(2));
  const served = arg('--served') ?? 'served';
  const out = arg('--out') ?? null;
  const stats = run(served, out ?? path.join('research/video-inventory', localDate()));
  console.log(`scanned ${stats.pages} pages`);
  console.log(`videos: ${stats.videos} unique (${stats.wistia} wistia media, ${stats.youtube} youtube)`);
  console.log(`context: ${stats.slots} render as a slot (embed or both) · ${stats.links} appear as body-copy links`);
  console.log(`orphan delivery assets: ${stats.orphans}`);
  console.log(`wrote videos.json, inventory.csv, yt-dlp-urls.txt`);
}

if (invokedDirectly(import.meta.url)) await main();
