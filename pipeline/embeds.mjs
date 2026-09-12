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
// What this pass deliberately does NOT touch, and why:
//   popover slots (`popover=true`) — the captured end-state is a click-to-play
//     thumbnail whose whole point is a modal that the Recreation has no runtime
//     for; going inline would change the layout, not just the behavior.
//   dead medias (config.DEAD_VIDEO_IDS) — deleted upstream, so there is nothing
//     to play; the captured poster is the honest end-state.
//   YouTube's `data-video-id` panels — they sit `inert`/`opacity:0` until a
//     site script reveals them, and that reveal is not reproduced, so a live src
//     would load a third-party frame nobody can see.
//
// Pure: HTML in, HTML out. The caller applies it and audits the result.
//
// SPDX-License-Identifier: CC0-1.0
import { wistiaFromPage } from './video-inventory.mjs';

/** Hosts a served page may fetch from — the ADR 0002 allow-list. */
export const MEDIA_HOSTS = ['fast.wistia.net', 'www.youtube.com'];

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

/**
 * Every `srcdoc` attribute span in the page: the tag that carries it, the
 * attribute value, and where the tag ends. `srcdoc` values are HTML-escaped, so
 * a raw `"` cannot appear inside one and the first quote ends the value.
 * @param {string} html
 * @returns {Array<{tagStart: number, tagEnd: number, tag: string, value: string}>}
 */
export function srcdocSpans(html) {
  const spans = [];
  const re = /\bsrcdoc\s*=\s*"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const valueStart = m.index + m[0].length;
    const valueEnd = html.indexOf('"', valueStart);
    if (valueEnd === -1) continue;
    const tagStart = html.lastIndexOf('<', m.index);
    const tagEnd = html.indexOf('>', valueEnd);
    if (tagStart === -1 || tagEnd === -1) continue;
    spans.push({ tagStart, tagEnd: tagEnd + 1, tag: html.slice(tagStart, tagEnd + 1), value: html.slice(valueStart, valueEnd) });
  }
  return spans;
}

/**
 * Rewrite every playable slot to its live player document.
 * @param {string} html
 * @param {{dead?: string[]}} [options]  `dead` = hashed ids with nothing upstream to play
 * @returns {{html: string, reshaped: {srcdoc: number, element: number, component: number, popover: number, dead: number}, rewritten: string[], unreachable: string[], hosts: string[]}}
 */
export function embedPass(html, options = {}) {
  const dead = new Set(options.dead ?? []);
  const reshaped = { srcdoc: 0, element: 0, component: 0, popover: 0, dead: 0 };
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
    if (POPOVER_ATTR.test(slot.tag)) {
      reshaped.popover++;
      continue;
    }
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

/**
 * Every absolute `src` a frame on this page would fetch. Frames are the one
 * reference ADR 0002 lets reach the network, so this is the set the audit
 * checks — image-side remote references (a captured `poster=`, a Lottie
 * `data-src`, a Wistia swatch in CSS) exist in the bytes but are refused by the
 * captured `img-src 'self' data:`, which is why the invariant still holds there.
 * @param {string} html
 * @returns {string[]}
 */
export function iframeSources(html) {
  const urls = [];
  for (const m of html.matchAll(/<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (/^(?:https?:)?\/\//i.test(url)) urls.push(url);
  }
  return urls;
}

/**
 * @param {string} url
 * @returns {string} its host, or the url itself when unparseable
 */
export function hostOf(url) {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).host;
  } catch {
    return url;
  }
}

/**
 * Frames pointed somewhere the allow-list does not name — must be empty on
 * every served page.
 * @param {string} html
 * @returns {string[]}
 */
export function offAllowlistFrames(html) {
  return iframeSources(html).filter((url) => !MEDIA_HOSTS.includes(hostOf(url)));
}
