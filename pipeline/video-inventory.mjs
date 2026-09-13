// Video slot detection for the build — where a served page names a video.
//
// The embed pass (`pipeline/embeds.mjs`) imports `wistiaFromPage` to find every
// Wistia media a page references before it rewrites the captured player slots,
// and the seam test (`test/video-inventory.test.ts`) pins both sweeps' boundary
// rules. The stakes: an id the inventory cannot see is an id the build cannot
// act on. On 2026-09-11 a slot that named its media as an *attribute* rather
// than a URL was invisible, and the build shipped a live frame to a dead Wistia
// player.
//
// Two providers are modelled, because they are the ones whose slots survive the
// build:
//
//   - Wistia media (10-char hashed ID) — the captured `w-json-ld` VideoObject
//     blocks (which also carry title, duration, and the direct delivery
//     `contentUrl`), embed / media-link URLs, `wistia_async_*`, and the
//     attribute form `<wistia-player media-id=…>`, including a media named only
//     in a captured CSS attribute selector.
//   - YouTube videos (11-char ID) — embed / shorts / live / `watch?v=` / youtu.be
//     URLs and the `data-video-id` attribute on the click-to-arm panels.
//
// Vidzflow, the fourth provider, is deliberately not modelled: the build strips
// its hidden video.js documents (ticket 19), so no Vidzflow slot survives. A
// *new* provider is caught at build time by the embeds summary plus the
// `unclassified remote refs` audit, not here.
//
// Pure string-in/IDs-out, **with no network and no upstream**: it describes the
// frozen snapshot (ADR 0004). Player liveness on the live site is not a
// question this repo asks any more — the one dead-media list the build uses is
// frozen in `pipeline/config.mjs` (`DEAD_VIDEO_IDS`).
//
// SPDX-License-Identifier: CC0-1.0

const YOUTUBE_EMBED = /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/g;
const YOUTUBE_LINK = /(?:youtube(?:-nocookie)?\.com\/watch\?(?:[^"'`\s>]*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const WISTIA_EMBED = /(?:fast\.wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/|wistia_async_)([a-z0-9]{10})/g;
const WISTIA_LINK = /flocksafety\.wistia\.com\/medias\/([a-z0-9]{10})/g;
// Slot elements that name their video as an *attribute* rather than a URL. Both
// are bounded: `data-video-id` must hold exactly the 11 id characters (podcast
// episode buttons carry 24-char ids; Vidzflow's `data-video-id=32614` is
// numeric) and `media-id` exactly 10 — and `media-id` must not be prefixed
// (Wistia's own attribute is bare; `data-media-id` belongs to other markup).
const YOUTUBE_ATTR = /(?<![\w-])data-video-id\s*=\s*["']?([A-Za-z0-9_-]{11})["']?(?![A-Za-z0-9_-])/g;
const WISTIA_MEDIA_ATTR = /(?<![\w-])media-id\s*=\s*["']?([a-z0-9]{10})["']?(?![a-z0-9])/g;

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
 * embed/link hashed IDs, and YouTube embed/link IDs — each id tagged with the
 * contexts it appeared in.
 * @param {string} html raw page bytes
 * @returns {{wistia: WistiaEntries, youtube: Map<string, Set<'embed'|'link'>>}}
 */
export function extractFromPage(html) {
  const { wistia } = wistiaFromPage(html);
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
  return { wistia, youtube };
}

/**
 * One Wistia media as the page names it: the w-json-ld metadata when captured,
 * and every context (`embed` — a slot; `link` — body copy) the id appeared in.
 * @typedef {Map<string, {title: string|null, duration: string|null, contentUrl: string|null, contexts: Set<'embed'|'link'>}>} WistiaEntries
 */

/**
 * The Wistia half of {@link extractFromPage}: the `w-json-ld` VideoObject
 * blocks (hashed ID, title, duration, delivery URL) plus the embed-URL /
 * media-link / `wistia_async_*` / `media-id` ID sweeps. Split out because the
 * embed pass wants only the IDs and titles and should not pay for the YouTube
 * sweeps on every one of 1,181 pages.
 * @param {string} html raw page bytes
 * @returns {{wistia: WistiaEntries}}
 */
export function wistiaFromPage(html) {
  /** @type {WistiaEntries} */
  const wistia = new Map();

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
      }
    } catch {
      // Not JSON (truncated capture etc.) — fall through to regex sweeps below.
    }
  }

  let mm;
  while ((mm = WISTIA_EMBED.exec(html)) !== null) markWistia(mm[1], 'embed', null);
  while ((mm = WISTIA_MEDIA_ATTR.exec(html)) !== null) markWistia(mm[1], 'embed', null);
  while ((mm = WISTIA_LINK.exec(html)) !== null) markWistia(mm[1], 'link', null);
  return { wistia };
}
