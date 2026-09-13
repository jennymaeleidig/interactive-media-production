// Live media embeds (ADR 0002): the one thing in a served page that reaches
// the network.
//
// A Capture cannot play a video, so it keeps an inert snapshot of the player
// instead. Three shapes, all rendering as a dead poster:
//
//   srcdoc iframe — SingleFile inlined the Wistia player document into the
//     iframe (`srcdoc="…fast.wistia.net/embed/iframe/<id>…"`), so the slot is a
//     frozen copy of a player page with no scripts to drive it.
//   JS-built chrome — the capture froze the DOM Wistia's runtime had already
//     built inside the `wistia_async_<id>` element (poster image, play button,
//     `wistia_click_to_play`), which does nothing without that runtime.
//   <wistia-player media-id> — Wistia's web component, captured with its
//     declarative shadow root (`<template shadowrootmode=open>`), which the HTML
//     parser attaches with no script at all — so it renders the captured chrome
//     and is inert for the same reason.
//
// Geometry note: every one of these sits in a wrapper that owns the box —
// `.r-16x9 { aspect-ratio: 16/9 }`, Webflow's `wistia_responsive_padding` aspect
// trick, or the element's own `height/width:100%` inline style — so a
// `width:100%;height:100%` iframe lands in the same box the snapshot filled.
//
// This pass swaps each snapshot for the live player document — the same
// `fast.wistia.net/embed/iframe/<id>` URL the Capture's own w-json-ld names as
// `embedUrl`, run inside a frame so the served bytes stay script-free. The slot
// element keeps its tag, classes, and inline styles, so the box does not move;
// only its contents become live.
//
// A fifth shape is not a snapshot at all: SingleFile strips every frame's `src`,
// and for a cross-origin player it cannot inline the document, so the element is
// left empty with nothing to play. The blog's rich-text YouTube figures are this
// shape (91 empty frames on 74 pages). `--save-original-urls` makes the Capture
// record the URL it removed in `data-sf-original-src`, and this pass points the
// frame at that player again — the frame is *visible*, and the live page loaded
// it on arrival, so the request belongs there. Hidden frames stay unarmed (see
// the YouTube `data-video-id` panels below).
//
// Popover slots (`popover=true`) are inlined like every other shape: measured,
// their box is already the 16:9 `wistia_responsive_padding` box, so replacing
// the captured click-to-play thumbnail with the live player moves nothing and
// removes a control that invited a click it could not answer.
//
// Two classes stay as captured, deliberately:
//   dead medias (config.DEAD_VIDEO_IDS) — deleted upstream, so there is nothing
//     to play; the captured poster is the honest end-state.
//   YouTube's `data-video-id` panels — the pass leaves the frame `src`-less and
//     only records the host, because a build-time `src` would fetch a frame
//     nobody can see (the panel is hidden at rest). The interactions runtime
//     points the frame at the player on the poster click (ticket 17).
//
// The hidden Vidzflow player documents (`.video-desktop`/`.video-tablet`, both
// `is-hidden`) are stripped, not embedded: their visible content is a sibling
// still image, and Wistia's pass has no counterpart for the provider (ticket
// 19). `stripHiddenVidzflow` removes the `srcdoc` payload that holds them.
//
// Pure: HTML in, HTML out. The caller applies it and audits the result.
//
// SPDX-License-Identifier: CC0-1.0
import { wistiaFromPage } from './video-inventory.mjs';
import { attrOf, openTags, srcdocSpans } from './html.mjs';
import { MEDIA_HOSTS, decodeEntities, hostOf } from './audit.mjs';

const WISTIA_EMBED_URL = /fast\.wistia\.net\/embed\/iframe\/([a-z0-9]{10})/;
const WISTIA_ASYNC = /wistia_async_([a-z0-9]{10})/g;
const WISTIA_PLAYER_TAG = /<wistia-player\b[^>]*>/gi;
const WISTIA_MEDIA_ID = /\bmedia-id\s*=\s*("|')?([a-z0-9]{10})/i;
const POPOVER_ATTR = /\bpopover\s*=\s*("|')?true\b/i;

/**
 * @param {string} text
 * @returns {string} the text with HTML attribute metacharacters escaped
 */
function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The public Wistia iframe embed URL for a hashed id — the form the Captures'
 * own `w-json-ld` blocks carry as `embedUrl`.
 * @param {string} id
 * @returns {string}
 */
export function wistiaEmbedUrl(id) {
  return `https://fast.wistia.net/embed/iframe/${id}`;
}

/**
 * The player iframe written into a slot. Sized 100% because every slot's
 * wrapper already carries the geometry (Webflow's `wistia_responsive_padding`
 * aspect box, or the element's own inline height/width).
 * @param {string} id
 * @param {string|null} title
 * @returns {string}
 */
export function wistiaIframe(id, title) {
  const label = title ? ` title="${escapeAttr(title)}"` : '';
  return `<iframe src="${wistiaEmbedUrl(id)}"${label} allow="autoplay; fullscreen" allowfullscreen frameborder=0 scrolling=no style="width:100%;height:100%"></iframe>`;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
// A YouTube player URL safe to serve as-is: the canonical embed path, an
// optional query of plain parameters (`start`, `controls`, `si`).
const CLEAN_YOUTUBE_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}(?:\?[A-Za-z0-9_=&%.,\-]*)?$/;
const YOUTUBE_EMBED_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed|v|shorts)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const FRAME_ORIGINAL_SRC = /\s+data-sf-original-src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
const ORIGINAL_URL_ATTR = /\s+data-sf-original-[a-z0-9-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Every YouTube slot on the page: a `src`-less frame whose `data-video-id` is
 * an 11-character YouTube id. The bound matters — the podcast pages carry
 * 24-character episode-button ids in the same attribute, and Vidzflow's
 * `data-video-id` is numeric; neither is a YouTube video (ticket 17).
 * @param {string} html
 * @returns {string[]}
 */
export function youtubeSlots(html) {
  const ids = [];
  for (const tag of openTags(html)) {
    if (tag.name.toLowerCase() !== 'iframe') continue;
    if (/\ssrc\s*=/i.test(tag.attrs)) continue; // already live — not a slot the runtime arms
    const id = attrOf(tag.attrs, 'data-video-id');
    if (id !== null && YOUTUBE_ID.test(id)) ids.push(id);
  }
  return ids;
}

const VIDZFLOW_DOC = /vidzflow/i;

/**
 * Drop the `data-sf-original-*` bookkeeping SingleFile writes with
 * `--save-original-urls` — every original URL it removed or inlined, on frames,
 * images, stylesheets, and links alike. `embedPass` has already consumed the
 * frame URLs; what is left would otherwise print the original's asset URLs into
 * served bytes (the publication/rights question ADR 0002 flags) and add bytes
 * nothing reads.
 *
 * A plain attribute sweep, deliberately: a tag scanner that skipped the bodies
 * of `<script>`/`<style>` (the `unclassifiedRemoteRefs` shape) costs a
 * backtracking pass over every inlined stylesheet, and nothing in served bytes
 * carries the literal string `data-sf-original-` except the attributes
 * themselves — SingleFile writes it, and the capture scripts that could quote
 * it are stripped before this pass runs.
 * @param {string} html
 * @returns {{html: string, removed: number}}
 */
export function stripOriginalUrls(html) {
  let removed = 0;
  const out = html.replace(ORIGINAL_URL_ATTR, () => {
    removed += 1;
    return '';
  });
  return { html: out, removed };
}

/**
 * The player URL a Capture recorded for a frame it emptied, or null when the
 * frame is not one of ours (ticket 12). SingleFile strips every frame's `src`
 * — it rebuilds the frame as `srcdoc` when it can inline the document, and for
 * a cross-origin player it can only leave the element empty. With
 * `--save-original-urls` it records what it removed in `data-sf-original-src`,
 * which is the only surviving trace of the player the live page loaded.
 *
 * A clean embed URL is served as captured, so a `?start=…` or `?controls=0`
 * keeps its meaning and a `www.youtube-nocookie.com` frame stays on the host
 * the original chose. Embedly-wrapped values arrive escaped past parsing
 * (`&quot;https://www.youtube.com/embed/<id>?wmode=…&amp;amp;…&quot;`), so those
 * collapse to the canonical URL the id names.
 * @param {string} raw  the captured attribute value
 * @returns {string|null}
 */
export function capturedFrameUrl(raw) {
  const value = decodeEntities(String(raw)).trim().replace(/^["']+|["']+$/g, '');
  if (!/^(?:https?:)?\/\//i.test(value)) return null;
  const id = YOUTUBE_EMBED_ID.exec(value)?.[1];
  if (id) return CLEAN_YOUTUBE_EMBED.test(value) ? value : `https://www.youtube.com/embed/${id}`;
  return MEDIA_HOSTS.includes(hostOf(value)) ? value : null;
}

/**
 * The frames a Capture emptied but remembered: a `src`-less `<iframe>` whose
 * `data-sf-original-src` names an allow-listed player. The YouTube
 * `data-video-id` panels are excluded on purpose — they are hidden at rest and
 * the interactions runtime arms them on the poster click, so a build-time `src`
 * would fetch a frame nobody can see (ticket 17).
 * @param {string} html
 * @returns {Array<{index: number, tag: string, url: string}>}
 */
export function capturedFrameSlots(html) {
  const slots = [];
  for (const tag of openTags(html)) {
    if (tag.name.toLowerCase() !== 'iframe') continue;
    if (/\ssrc\s*=/i.test(tag.attrs)) continue; // already live
    if (attrOf(tag.attrs, 'data-video-id') !== null) continue; // the reveal panels stay unarmed
    const raw = attrOf(tag.attrs, 'data-sf-original-src');
    if (raw === null) continue;
    const url = capturedFrameUrl(raw);
    if (url === null) continue;
    slots.push({ index: tag.index, tag: tag.tag, url });
  }
  return slots;
}

/**
 * Remove the hidden Vidzflow player documents. Each slot is an `srcdoc` frame
 * in a `.video-desktop`/`.video-tablet.is-hidden` wrapper (the visible content
 * is a sibling still image); the whole inlined video.js document is dead bytes
 * — no runtime, and a sandbox without `allow-scripts`. Removing just the frame
 * keeps the wrapper's (display:none) box and the sibling artwork untouched.
 * @param {string} html
 * @returns {{html: string, removed: number}}
 */
export function stripHiddenVidzflow(html) {
  let removed = 0;
  for (const span of srcdocSpans(html).reverse()) {
    if (!/^<iframe\b/i.test(span.tag)) continue;
    if (!VIDZFLOW_DOC.test(span.value)) continue;
    const close = html.indexOf('</iframe>', span.tagEnd);
    if (close === -1) continue; // truncated capture — leave it
    html = html.slice(0, span.tagStart) + html.slice(close + '</iframe>'.length);
    removed += 1;
  }
  return { html, removed };
}

/**
 * Rewrite every playable slot to its live player document.
 * @param {string} html
 * @param {{dead?: string[]}} [options]  `dead` = hashed ids with nothing upstream to play
 * @returns {{html: string, reshaped: {srcdoc: number, element: number, component: number, popover: number, dead: number, youtube: number, frame: number}, rewritten: string[], unreachable: string[], hosts: string[]}}
 */
export function embedPass(html, options = {}) {
  const dead = new Set(options.dead ?? []);
  const reshaped = { srcdoc: 0, element: 0, component: 0, popover: 0, dead: 0, youtube: 0, frame: 0 };
  const rewritten = [];
  /** @type {Set<string>} */
  const deadSeen = new Set();
  const hosts = new Set();

  // The page's own video metadata: the JSON-LD VideoObjects carry the title
  // (for the iframe's accessible name) for the ids the markup points at.
  const { wistia } = wistiaFromPage(html);
  const titleOf = (id) => wistia.get(id)?.title ?? null;

  // ---- shape 1: `srcdoc` iframes (the inlined player document) --------------
  // Back-to-front: the spans were measured on the original string, and each
  // rewrite shortens it.
  for (const span of srcdocSpans(html).reverse()) {
    const id = WISTIA_EMBED_URL.exec(span.value)?.[1];
    if (!id) continue; // a non-video srcdoc (form, map) — not ours
    if (dead.has(id)) { deadSeen.add(id); continue; } // stays as captured — counted once, below
    const live = span.tag.replace(/\s+srcdoc\s*=\s*"[^"]*"/i, '').replace(/\s*>$/, ` src="${wistiaEmbedUrl(id)}">`);
    html = html.slice(0, span.tagStart) + live + html.slice(span.tagEnd);
    reshaped.srcdoc++;
    rewritten.push(id);
    hosts.add('fast.wistia.net');
  }

  // ---- shape 2: the JS-built chrome inside the slot element -----------------
  const slots = [];
  for (const m of html.matchAll(WISTIA_ASYNC)) {
    const id = m[1];
    const tagStart = html.lastIndexOf('<', m.index);
    const tagEnd = html.indexOf('>', m.index);
    if (tagStart === -1 || tagEnd === -1) continue;
    const tag = html.slice(tagStart, tagEnd + 1);
    if (!/^<(div|span)\b/i.test(tag)) continue; // the marker must be in a tag…
    if (!/\bclass\s*=/.test(tag)) continue; // the marker must be the class this element carries
    if (slots.some((s) => s.tagStart === tagStart)) continue;
    slots.push({ id, tagStart, tagEnd: tagEnd + 1, tag, name: /^<(\w+)/.exec(tag)[1].toLowerCase() });
  }
  // Rewrite back-to-front so the earlier offsets stay valid.
  for (const slot of slots.sort((a, b) => b.tagStart - a.tagStart)) {
    if (dead.has(slot.id)) { deadSeen.add(slot.id); continue; } // stays as captured — counted once, below
    if (POPOVER_ATTR.test(slot.tag)) reshaped.popover++; // reported, then inlined like any other chrome slot
    const end = balanceEnd(html, slot.tagStart, slot.name);
    if (end === -1) continue; // unbalanced — leave the subtree as captured
    const inner = html.slice(slot.tagEnd, end - (slot.name.length + 3));
    if (inner.includes(wistiaEmbedUrl(slot.id))) continue; // already live
    html = html.slice(0, slot.tagEnd) + wistiaIframe(slot.id, titleOf(slot.id)) + html.slice(end - (slot.name.length + 3));
    reshaped.element++;
    rewritten.push(slot.id);
    hosts.add('fast.wistia.net');
  }

  // ---- shape 3: Wistia's web component --------------------------------------
  // The whole element goes, shadow root and all; its box comes from the wrapper
  // (`.r-16x9`) or from the element's own inline sizing, both of which stay.
  // Back-to-front, like shape 1: the matches were measured before any rewrite.
  for (const tag of [...html.matchAll(WISTIA_PLAYER_TAG)].reverse()) {
    const id = WISTIA_MEDIA_ID.exec(tag[0])?.[2];
    if (!id) continue;
    if (dead.has(id)) { deadSeen.add(id); continue; } // stays as captured — counted once, below
    const start = tag.index;
    const end = html.indexOf('</wistia-player>', start);
    if (end === -1) continue; // truncated capture — leave it as captured
    const stop = end + '</wistia-player>'.length;
    html = html.slice(0, start) + wistiaIframe(id, titleOf(id)) + html.slice(stop);
    reshaped.component++;
    rewritten.push(id);
    hosts.add('fast.wistia.net');
  }

  // ---- shape 4: YouTube slots (the runtime arms them on click) -------------
  // No rewrite: the panel is hidden at rest, so a build-time `src` would fetch a
  // frame nobody can see. The pass records the host so the page's `frame-src`
  // grant names `www.youtube.com` for the frame the interactions runtime will
  // point at the player (ticket 17).
  const youtube = youtubeSlots(html);
  if (youtube.length > 0) {
    hosts.add('www.youtube.com');
    reshaped.youtube = youtube.length;
  }

  // ---- shape 5: frames the Capture emptied but remembered (ticket 12) -------
  // The blog's rich-text YouTube figures are `w-richtext-figure-type-video`
  // frames the live page loaded on arrival. Restoring the captured URL puts the
  // player back in the same box (the figure owns the aspect ratio), unlike the
  // hidden reveal panels above. Back-to-front: the spans were measured on the
  // string as it stands after shapes 1–4.
  for (const slot of capturedFrameSlots(html).reverse()) {
    const live = slot.tag.replace(FRAME_ORIGINAL_SRC, ` src="${escapeAttr(slot.url)}"`);
    html = html.slice(0, slot.index) + live + html.slice(slot.index + slot.tag.length);
    reshaped.frame++;
    hosts.add(hostOf(slot.url));
  }

  // ---- what the markup never pointed at ------------------------------------
  const reached = new Set(rewritten);
  // Dead medias are counted by *reference*, not by slot met: their own slot
  // markup is often gone by the time this pass runs (the strip removes the
  // popover panel), and a page that names a dead media must still say so. Both
  // routes matter — the JSON-LD map sees medias whose slot markup vanished, and
  // `deadSeen` sees the attribute-form slots (`<wistia-player media-id>`) that the
  // map's URL sweeps cannot see at all.
  reshaped.dead = new Set([...deadSeen, ...[...wistia.keys()].filter((id) => dead.has(id))]).size;
  const unreachable = [...wistia.keys()].filter((id) => !reached.has(id) && !dead.has(id));

  return { html, reshaped, rewritten: [...new Set(rewritten)], unreachable, hosts: [...hosts] };
}

/**
 * The tag-balancing the strip pass uses, kept here so the embed pass is pure.
 * @param {string} html
 * @param {number} start  index of the opening tag
 * @param {string} tag
 * @returns {number} index just past the matching close tag, or -1 when unbalanced
 */
function balanceEnd(html, start, tag) {
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth += 1;
    }
  }
  return -1;
}

