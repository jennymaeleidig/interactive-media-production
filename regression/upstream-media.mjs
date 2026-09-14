// Ticket 06: the **media liveness** signal — the one class of rot a page edit
// cannot explain. The media allow-list is the whole of the exception to the
// tree's zero-outbound rule, so the frames a served page carries still reach
// the network at runtime. When a media dies upstream the served page shows a
// dead player and nobody edited anything.
//
// The tier is a slot census plus a resolves-or-not question per slot. A slot is
// an allow-listed `<iframe src>` in the served bytes, parsed into a provider and
// a media id — the enumeration is a pure function of the page's HTML, and it is
// the *whole* census rather than a hand-listed inventory: the audit allow-list
// (`pipeline/audit.mjs`) is imported here, so the two cannot disagree on which
// frames still reach the network. A Wistia slot is asked through its metadata
// endpoint (`fast.wistia.com/embed/medias/<id>.json`); a YouTube slot through
// oEmbed. A media is `alive`, `gone` (the host answers 404, or Wistia answers
// 200 with no ready asset), or `restricted` (YouTube answers 401 for a private
// video or 403 for an embed-disabled one).
//
// What the signal cannot see: it asks the media host's own metadata, so a media
// that resolves but refuses to play behind that metadata (a delivery stream that
// 403s, a geo-block) is invisible; and it sees only allow-listed `<iframe src>`
// slots, so the `srcdoc` snapshots, the `data-video-id` panels the interactions
// runtime arms, and `<video>` tags are outside the census. A status the rule
// cannot classify throws rather than guessing, so an outage (a 500 from a media
// API) is an operational failure and never mass-dead media.
//
// SPDX-License-Identifier: CC0-1.0
import { MEDIA_HOSTS, hostOf, iframeSources } from '../pipeline/audit.mjs';

/**
 * The provider a slot's frame names, or `unknown` when an allow-listed host
 * answers on a path this watch has no liveness rule for.
 * @typedef {'wistia'|'youtube'|'unknown'} MediaProvider
 */

/**
 * One media slot: an allow-listed `<iframe src>` parsed to the provider it
 * names, the media id, and the run-wide key the probe map uses. `key` is null
 * when the host is allow-listed but the path is not one this watch can measure —
 * the report refuses such a slot rather than treating it as clean.
 * @typedef {Object} MediaSlot
 * @property {string} url
 * @property {MediaProvider} provider
 * @property {string|null} id
 * @property {string|null} key
 */

/**
 * One page the tier enumerates: the path the report names it by, and its served
 * HTML. The tier is a pure function of these bytes.
 * @typedef {Object} MediaPage
 * @property {string} path
 * @property {string} html
 */

/**
 * One probe result the network edge read for a slot key: the HTTP status the
 * media host answered, plus the body a Wistia metadata read needs.
 * @typedef {Object} MediaProbe
 * @property {number} status
 * @property {string} [body]
 */

/** The three liveness classes. @typedef {'alive'|'gone'|'restricted'} MediaLiveness */

/**
 * One finding: a page and the slot on it whose media is not alive. A dead media
 * that appears on two pages is one finding per page.
 * @typedef {Object} MediaFinding
 * @property {string} path
 * @property {string} slot
 * @property {string} url
 * @property {Exclude<MediaLiveness, 'alive'>} liveness
 */

/**
 * One run of the media tier: the slots compared, the findings, and the liveness
 * tally. The tally counts every slot before findings dedupe by page and slot, so
 * it always sums to `compared`.
 * @typedef {Object} MediaReport
 * @property {number} compared
 * @property {number} differed
 * @property {MediaFinding[]} findings
 * @property {Record<MediaLiveness, number>} liveness
 */

/** The media tier as the run report carries it. @typedef {MediaReport} MediaTier */

/** The Wistia player path, capturing the media id. @type {RegExp} */
const WISTIA_EMBED = /^\/embed\/iframe\/([^/?#]+)\/?$/;
/** The YouTube player path, capturing the video id; privacy and www share it. @type {RegExp} */
const YOUTUBE_EMBED = /^\/embed\/([^/?#]+)\/?$/;

/**
 * Parse one URL into a media slot. A host outside the allow-list, or an
 * allow-listed host on a path with no rule, is `unknown` with a null key — the
 * report turns that into an operational failure rather than a silent skip.
 * `www.youtube.com` and `www.youtube-nocookie.com` share one provider and one
 * key, so a video is probed once however the page names it.
 * @param {string} url
 * @returns {MediaSlot}
 */
export function mediaSlot(url) {
  // `iframeSources` keeps a protocol-relative `//host/...` frame, and `hostOf`
  // allow-lists it — normalize the same way so the census can never disagree
  // with the audit about which frames reach the network.
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  const unknown = { url: absolute, provider: /** @type {MediaProvider} */ ('unknown'), id: null, key: null };
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return unknown;
  }
  if (!MEDIA_HOSTS.includes(parsed.host)) return unknown;
  const provider = parsed.host === 'fast.wistia.net' ? 'wistia' : 'youtube';
  const pattern = provider === 'wistia' ? WISTIA_EMBED : YOUTUBE_EMBED;
  const id = pattern.exec(parsed.pathname)?.[1] ?? null;
  if (id === null) return unknown;
  return { url: absolute, provider, id, key: `${provider}:${id}` };
}

/**
 * Every media slot a page serves: each allow-listed `<iframe src>`, in document
 * order, duplicates kept. A frame off the allow-list, a `srcdoc` snapshot, or a
 * relative `src` is not a slot. Pure: the same bytes enumerate the same slots.
 * @param {string} html
 * @returns {MediaSlot[]}
 */
export function mediaSlots(html) {
  const slots = [];
  for (const url of iframeSources(html)) {
    if (MEDIA_HOSTS.includes(hostOf(url))) slots.push(mediaSlot(url));
  }
  return slots;
}

/**
 * The canonical metadata URL a slot is asked through: Wistia's media JSON, or
 * YouTube's oEmbed for the watch page. Throws for a slot with no rule, so the
 * edge probes nothing it cannot interpret.
 * @param {MediaSlot} slot
 * @returns {string}
 * @throws {Error} when the slot has no liveness rule
 */
export function livenessUrl(slot) {
  if (slot.provider === 'wistia' && slot.id !== null) {
    return `https://fast.wistia.com/embed/medias/${slot.id}.json`;
  }
  if (slot.provider === 'youtube' && slot.id !== null) {
    const watch = `https://www.youtube.com/watch?v=${slot.id}`;
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  }
  throw new Error(`no liveness URL for a media slot the watch cannot classify: ${slot.url}`);
}

/**
 * Whether a Wistia metadata body describes a playable media: `status: ready`
 * with at least one delivery asset. An unparseable body is not ready.
 * @param {string|undefined} body
 * @returns {boolean}
 */
function wistiaReady(body) {
  if (typeof body !== 'string') return false;
  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== 'object') return false;
    return parsed.status === 'ready' && Array.isArray(parsed.assets) && parsed.assets.length > 0;
  } catch {
    return false;
  }
}

/**
 * Classify one probe result. A status outside the rule throws: a media API
 * outage must surface as an operational failure, never as mass-dead media.
 * @param {MediaProvider} provider
 * @param {number} status
 * @param {string} [body]
 * @returns {MediaLiveness}
 * @throws {Error} when the provider or status has no rule
 */
export function mediaLiveness(provider, status, body) {
  if (provider === 'wistia') {
    if (status === 404) return 'gone';
    if (status === 200) return wistiaReady(body) ? 'alive' : 'gone';
    throw new Error(`Wistia media probe answered an unclassifiable status: HTTP ${status}`);
  }
  if (provider === 'youtube') {
    if (status === 200) return 'alive';
    if (status === 404) return 'gone';
    if (status === 401 || status === 403) return 'restricted';
    throw new Error(`YouTube media probe answered an unclassifiable status: HTTP ${status}`);
  }
  throw new Error(`no liveness rule for media provider: ${provider}`);
}

/**
 * One run of the media tier. Every slot on every page is classified from its
 * probe; a slot that is not alive becomes a finding naming the page and the
 * slot, deduped by page and slot. A slot with no recognisable id, or one whose
 * key the probe map does not cover, throws — an incomplete measurement is never
 * reported as a clean one. Findings are sorted by page then slot.
 * @param {MediaPage[]} pages
 * @param {Record<string, MediaProbe>} probes
 * @returns {MediaReport}
 * @throws {Error} when a slot is unclassifiable or unprobed
 */
export function mediaReport(pages, probes) {
  /** @type {Record<MediaLiveness, number>} */
  const liveness = { alive: 0, gone: 0, restricted: 0 };
  /** @type {Map<string, MediaFinding>} */
  const findingsBySlot = new Map();
  let compared = 0;
  for (const page of pages) {
    for (const slot of mediaSlots(page.html)) {
      compared += 1;
      if (slot.key === null) {
        throw new Error(`allow-listed frame at ${page.path} has no recognisable media id: ${slot.url}`);
      }
      const probe = probes[slot.key];
      if (probe === undefined) {
        throw new Error(`no media probe for ${slot.key} — the probe map must cover every slot the tree serves`);
      }
      const cls = mediaLiveness(slot.provider, probe.status, probe.body);
      liveness[cls] += 1;
      const id = `${page.path}\u0000${slot.key}`;
      if (cls !== 'alive' && !findingsBySlot.has(id)) {
        findingsBySlot.set(id, { path: page.path, slot: slot.key, url: slot.url, liveness: cls });
      }
    }
  }
  const findings = [...findingsBySlot.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0,
  );
  return { compared, differed: findings.length, findings, liveness };
}
