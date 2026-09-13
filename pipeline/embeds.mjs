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
 * Iterate the open tags of an HTML string: the tag name and the raw attribute
 * text up to the first `>` outside a quoted value. A scanner, not a regex,
 * because the equivalent alternation (`(?:[^<>"']|"[^"]*"|'[^']*')*`)
 * overflows the regex engine's stack on a multi-megabyte *unquoted* attribute
 * value: SingleFile writes a video's `src=data:video/mp4;base64,…` unquoted,
 * and the engine recurses once per scanned unit of the value (ticket 12).
 * @param {string} html
 * @returns {Generator<{name: string, attrs: string, index: number, tag: string}>}
 */
export function* openTags(html) {
  const start = /<([a-z][a-z0-9-]*)/gi;
  let m;
  while ((m = start.exec(html)) !== null) {
    const name = m[1];
    let i = m.index + m[0].length;
    while (i < html.length) {
      const c = html[i];
      if (c === '"' || c === "'") {
        const close = html.indexOf(c, i + 1);
        if (close === -1) {
          i = html.length;
          break;
        }
        i = close + 1;
      } else if (c === '>' || c === '<') {
        break;
      } else {
        i += 1;
      }
    }
    if (html[i] === '>') {
      yield { name, attrs: html.slice(m.index + m[0].length, i), index: m.index, tag: html.slice(m.index, i + 1) };
      start.lastIndex = i + 1;
    } else {
      start.lastIndex = m.index + 1;
    }
  }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Read an attribute's value out of an open tag's attribute string, honoring
 * quoting. The `(?<![\w-])` guard keeps `data-src` from reading as `src`.
 * @param {string} attrs
 * @param {string} name
 * @returns {string|null} the value, or null when absent
 */
function attrOf(attrs, name) {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

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

const SCRIPT_TAG = /<script\b[^>]*>/gi;
const LD_JSON_SCRIPT = /\btype\s*=\s*("|')?application\/ld\+json/i;

/**
 * Resolve the character references a `srcdoc` attribute value may carry. The
 * HTML parser decodes entities in an attribute value before the frame document
 * is instantiated, so `&lt;script&gt;` is a real script; scanning the raw value
 * would miss it — the same self-validating-checker failure this audit exists to
 * close.
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
}

/**
 * Scripts living inside `srcdoc` payloads. The build's script census counts
 * them only by accident (SingleFile leaves `<` raw inside the attribute
 * value), so this makes the check explicit: `executable` must be zero on every
 * served page. `allowScripts`/`allowScriptsExecutable` name the one captured
 * `allow-scripts` widget document that carries only ld+json, so the build can
 * report it rather than leaving it silent.
 * @param {string} html
 * @returns {{total: number, executable: number, allowScripts: number, allowScriptsExecutable: number}}
 */
export function srcdocScripts(html) {
  let total = 0;
  let executable = 0;
  let allowScripts = 0;
  let allowScriptsExecutable = 0;
  for (const span of srcdocSpans(html)) {
    const tags = decodeEntities(span.value).match(SCRIPT_TAG) ?? [];
    if (tags.length === 0) continue;
    const exec = tags.filter((t) => !LD_JSON_SCRIPT.test(t)).length;
    total += tags.length;
    executable += exec;
    const sandbox = attrOf(span.tag, 'sandbox') ?? '';
    if (/\ballow-scripts\b/.test(sandbox)) {
      allowScripts += 1;
      allowScriptsExecutable += exec;
    }
  }
  return { total, executable, allowScripts, allowScriptsExecutable };
}

// The attributes a browser fetches on load, by element (ticket 20). Everything
// here is a *fetch*; an `<a href>` or a `<link rel=canonical>` is navigation or
// metadata and is not on the list.
const FETCHERS = {
  iframe: ['src'],
  frame: ['src'],
  script: ['src'],
  embed: ['src'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  object: ['data'],
  input: ['src'],
  link: ['href'],
};

// A <link> whose rel only advertises the URL — a browser never fetches it.
const NON_FETCHING_REL = /^(?:canonical|alternate|author|help|license|next|prev|search|dns-prefetch|preconnect|amphtml)$/i;
const ABSOLUTE_URL = /^(?:https?:)?\/\//i;

/**
 * Remote references in a class the audit does not know to be inert: a fetcher
 * attribute on an element that would actually ask the network for it (ticket
 * 20). The known classes are accepted in writing (ADR 0002) — an allow-listed
 * `<iframe src>`, a `poster` (`img-src` refuses it, or the element never asks),
 * a Lottie `data-src` (`connect-src 'self'`), a CSS `url()` (`img-src`), and a
 * `srcdoc` payload (sandboxed; see `srcdocScripts`). This must be empty on
 * every served page: a future Capture must not be able to introduce a fetched
 * reference in an unexpected class unnoticed.
 * @param {string} html
 * @returns {string[]}
 */
export function unclassifiedRemoteRefs(html) {
  // Script and style bodies are code, not markup; drop them so a string that
  // looks like a tag inside a runtime is not read as one.
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, '$1$2');
  const refs = [];
  for (const tag of openTags(markup)) {
    const name = tag.name.toLowerCase();
    const attrs = tag.attrs;
    if (name === 'meta') continue; // metadata — a crawler may read it, a browser never fetches it
    const rel = attrOf(attrs, 'rel') ?? '';
    for (const attr of FETCHERS[name] ?? []) {
      const value = attrOf(attrs, attr);
      if (value === null) continue;
      const candidates = attr.endsWith('srcset')
        ? value.split(',').map((part) => part.trim().split(/\s+/)[0])
        : [value];
      for (const url of candidates) {
        if (!ABSOLUTE_URL.test(url)) continue;
        if (attr === 'poster') continue; // inert class — img-src refuses it / the element never asks
        if ((name === 'iframe' || name === 'frame') && MEDIA_HOSTS.includes(hostOf(url))) continue; // the ADR's exception
        if (name === 'link' && NON_FETCHING_REL.test(rel)) continue; // advertises, never fetches
        refs.push(url);
      }
    }
  }
  // A CSS `url()` is img-src-governed and so accepted above; `@import` is not.
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    for (const imp of style[1].matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      if (ABSOLUTE_URL.test(imp[1])) refs.push(imp[1]);
    }
  }
  // A meta refresh navigates away rather than fetching on load, but it still
  // names a remote host and the audit must see it.
  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bhttp-equiv\s*=\s*("|')?refresh/i.test(meta[0])) continue;
    const url = /url\s*=\s*([^;]+)/i.exec(attrOf(meta[0], 'content') ?? '')?.[1]?.trim() ?? '';
    if (ABSOLUTE_URL.test(url)) refs.push(url);
  }
  return refs;
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
 * @returns {{html: string, reshaped: {srcdoc: number, element: number, component: number, popover: number, dead: number, youtube: number}, rewritten: string[], unreachable: string[], hosts: string[]}}
 */
export function embedPass(html, options = {}) {
  const dead = new Set(options.dead ?? []);
  const reshaped = { srcdoc: 0, element: 0, component: 0, popover: 0, dead: 0, youtube: 0 };
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
