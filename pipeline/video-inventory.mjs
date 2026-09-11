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
// Pure transformation: reads the served tree, writes dated inventory files.
// No network access — playability probing is a separate, manual step
// (`.scratch/flock-parody-impl/video-inventory/README.md`).
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';

import { makeArg, invokedDirectly } from './cli.mjs';

/** @typedef {{key: string, host: 'wistia'|'youtube', kind: string, id: string, url: string, title: string|null, duration: string|null, contentUrl: string|null, pages: string[]}} VideoEntry */

const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/|youtube(?:-nocookie)?\.com\/watch\?(?:[^"'`\s>]*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const WISTIA_HASHED = /(?:fast\.wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/|wistia_async_)([a-z0-9]{10})/g;
const DELIVERY = /embed-ssl\.wistia\.com\/deliveries\/([a-f0-9]{8,})(\.[a-z0-9]+)?/g;

const VIDEO_EXTS = new Set(['.m3u8', '.mp4', '.webm', '.mov']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Recursively list every file under `root` whose name ends in `.html`,
 * returning repo-relative-ish paths (posix separators) sorted ascending.
 * @param {string} root
 * @returns {string[]}
 */
function listHtmlPages(root) {
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
 * Extract one page's video references: w-json-ld Wistia VideoObjects, YouTube
 * IDs, raw Wistia hashed IDs, and delivery assets (video vs image).
 * @param {string} html raw page bytes
 * @returns {{wistia: Map<string, {title: string|null, duration: string|null, contentUrl: string|null}>, youtube: Set<string>, hashed: Set<string>, deliveries: Map<string, 'video'|'image'|'unknown'>}}
 */
function extractFromPage(html) {
  const text = unescapeEntities(html);
  /** @type {Map<string, {title: string|null, duration: string|null, contentUrl: string|null}>} */
  const wistia = new Map();
  /** @type {Set<string>} */
  const youtube = new Set();
  /** @type {Set<string>} */
  const hashed = new Set();
  /** @type {Map<string, 'video'|'image'|'unknown'>} */
  const deliveries = new Map();

  // w-json-ld VideoObject blocks: hashed id + title + direct delivery URL.
  const jsonld = /<script[^>]*w-json-ld[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = jsonld.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      const emb = typeof obj.embedUrl === 'string' ? obj.embedUrl.match(/[a-z0-9]{10}(?=\/?$|$)/) : null;
      const idFromIframe = obj.embedUrl && /fast\.wistia\.[a-z.]+\/embed\/iframe\/([a-z0-9]{10})/.exec(obj.embedUrl);
      const id = idFromIframe ? idFromIframe[1] : (emb ? emb[0] : null);
      if (id && /wistia/.test(m[0])) {
        wistia.set(id, {
          title: typeof obj.name === 'string' ? obj.name : null,
          duration: typeof obj.duration === 'string' ? obj.duration : null,
          contentUrl: typeof obj.contentUrl === 'string' ? obj.contentUrl : null,
        });
        hashed.add(id);
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
  while ((mm = YOUTUBE_ID.exec(text)) !== null) youtube.add(mm[1]);
  while ((mm = WISTIA_HASHED.exec(text)) !== null) hashed.add(mm[1]);
  while ((mm = DELIVERY.exec(text)) !== null) {
    const ext = (mm[2] || '').toLowerCase();
    const kind = VIDEO_EXTS.has(ext) ? 'video' : IMAGE_EXTS.has(ext) ? 'image' : 'unknown';
    if (!deliveries.has(mm[1]) || deliveries.get(mm[1]) === 'unknown') deliveries.set(mm[1], kind);
  }
  return { wistia, youtube, hashed, deliveries };
}

/**
 * Build the deduped site-wide inventory keyed by video, each with the sorted
 * list of referencing pages.
 * @param {string[]} pages posix-style served paths (paths relative to repo root)
 * @param {Map<string, string>} readHtml page path -> raw html
 * @returns {{videos: VideoEntry[], orphanDeliveries: Array<{sha: string, kind: string, url: string, pages: string[]}>}}
 */
function buildInventory(pages, readHtml) {
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
    const { wistia, youtube, hashed, deliveries } = extractFromPage(readHtml.get(page));
    for (const id of wistia.keys()) {
      const info = wistia.get(id);
      addPage(`wistia:${id}`, {
        key: `wistia:${id}`,
        host: 'wistia',
        kind: 'media',
        id,
        url: `https://fast.wistia.com/embed/medias/${id}.json`,
        title: info.title,
        duration: info.duration,
        contentUrl: info.contentUrl,
        pages: [],
      }, page);
    }
    for (const id of hashed) {
      if (!wistia.has(id)) {
        addPage(`wistia:${id}`, {
          key: `wistia:${id}`,
          host: 'wistia',
          kind: 'media',
          id,
          url: `https://fast.wistia.com/embed/medias/${id}.json`,
          title: null,
          duration: null,
          contentUrl: null,
          pages: [],
        }, page);
      }
    }
    for (const id of youtube) {
      addPage(`youtube:${id}`, {
        key: `youtube:${id}`,
        host: 'youtube',
        kind: 'video',
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
function csv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {string} servedRoot
 * @param {string} outDir
 * @returns {{videos: number, wistia: number, youtube: number, orphans: number, pages: number}}
 */
function run(servedRoot, outDir) {
  const pages = listHtmlPages(servedRoot);
  /** @type {Map<string, string>} */
  const readHtml = new Map();
  for (const p of pages) readHtml.set(p, fs.readFileSync(p, 'utf8'));

  const { videos, orphanDeliveries } = buildInventory(pages, readHtml);

  fs.mkdirSync(outDir, { recursive: true });

  // videos.json — full deduped model.
  fs.writeFileSync(path.join(outDir, 'videos.json'), JSON.stringify({ videos, orphanDeliveries }, null, 2) + '\n');

  // inventory.csv — one row per video (issue 11's "dated CSV" convention:
  // tracked, human-diffable, one row per item with the referencing pages).
  const rows = ['key,host,kind,id,title,duration,content_url,url,pages'];
  for (const v of videos) {
    rows.push([v.key, v.host, v.kind, v.id, csv(v.title), csv(v.duration), csv(v.contentUrl), v.url, csv(v.pages.join(' '))].join(','));
  }
  for (const o of orphanDeliveries) {
    rows.push([`delivery:${o.sha}`, 'wistia', `delivery-${o.kind}`, o.sha, '', '', '', o.url, csv(o.pages.join(' '))].join(','));
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
  return { videos: videos.length, wistia, youtube: yt, orphans: orphanDeliveries.length, pages: pages.length };
}

/** CLI entry. */
async function main() {
  const arg = makeArg(process.argv.slice(2));
  const served = arg('--served') ?? 'served';
  const out = arg('--out') ?? null;
  const stats = run(served, out ?? path.join('.scratch/flock-parody-impl/video-inventory', new Date().toISOString().slice(0, 10)));
  console.log(`scanned ${stats.pages} pages`);
  console.log(`videos: ${stats.videos} unique (${stats.wistia} wistia media, ${stats.youtube} youtube)`);
  console.log(`orphan delivery assets: ${stats.orphans}`);
  console.log(`wrote videos.json, inventory.csv, yt-dlp-urls.txt`);
}

if (invokedDirectly(import.meta.url)) await main();
