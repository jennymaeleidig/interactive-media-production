// Ticket 06's seam: **media liveness** — the one class of rot a page edit cannot
// explain. The media allow-list is the whole of the exception to the tree's
// zero-outbound rule, so the frames a served page carries still reach the
// network at runtime. When a media dies upstream the served page shows a dead
// player and nobody edited anything.
//
// Everything the tier decides is a pure function of the served pages' HTML plus
// a map of probe results: `mediaSlots` enumerates every allow-listed frame from
// the bytes, `mediaLiveness` classifies one probe result, and `mediaReport`
// joins them into the run's media tier. The network edge
// (`regression/upstream-watch-cli.mjs`) is the only place a media host is
// reached, so the whole of ticket 06 is pinned here — offline — beside the
// index, copy, chrome and restyle seams.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { livenessUrl, mediaLiveness, mediaReport, mediaSlot, mediaSlots } from '../regression/upstream-media.mjs';
import { exitCode, formatWatchReport } from '../regression/upstream-watch.mjs';
import { runWatch } from '../regression/upstream-baseline.mjs';

const ORIGIN = 'https://www.flocksafety.com';
const VERIFIED = '2026-09-13';

const WISTIA = 'https://fast.wistia.net/embed/iframe/abc1234567';
const YOUTUBE = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
const NOCOOKIE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?si=xyz';

/** A probe result as the edge hands it to the core: the status the media host
 * answered, plus the body a Wistia metadata read needs. */
type Probe = { status: number; body?: string };

/** The body a live Wistia media's metadata endpoint answers with: the endpoint
 * wraps the media, and `status: 2` plus a non-empty `assets` array is ready.
 * The shape is taken from a real 2026-09-13 read, not invented. */
const ready = (assets: unknown[] = [{ type: 'original' }]) => JSON.stringify({ media: { status: 2, assets }, options: {} });

/** The body Wistia answers a deleted/unknown id with: HTTP 200 and no `media`. */
const deleted = () => JSON.stringify({ error: true, iframe: true });

/** One run's fetched inputs: the universe is the union of these three sources. */
function run(sitemap: string[], capture: string[], probes: Record<string, { status: number; location?: string }>, homepage: string[] = []) {
  return {
    origin: ORIGIN,
    sitemapXml: `<urlset>${sitemap.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`,
    homepageHtml: homepage.map((p) => `<a href="${p}">nav</a>`).join(''),
    captureList: capture.map((p) => `${ORIGIN}${p}`),
    probes,
  };
}

const steady = () => run(['/a', '/b'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 } });

const frame = (src: string) => `<iframe src="${src}"></iframe>`;

describe('mediaSlot — an allow-listed frame parsed to provider, id and key', () => {
  it('parses a Wistia player frame', () => {
    expect(mediaSlot(WISTIA)).toEqual({ url: WISTIA, provider: 'wistia', id: 'abc1234567', key: 'wistia:abc1234567' });
  });

  it('parses a YouTube embed frame', () => {
    expect(mediaSlot(YOUTUBE)).toEqual({ url: YOUTUBE, provider: 'youtube', id: 'dQw4w9WgXcQ', key: 'youtube:dQw4w9WgXcQ' });
  });

  it('parses the privacy host to the same YouTube media as www, ignoring its query', () => {
    expect(mediaSlot(NOCOOKIE)).toEqual({ url: NOCOOKIE, provider: 'youtube', id: 'dQw4w9WgXcQ', key: 'youtube:dQw4w9WgXcQ' });
  });

  it('leaves an allow-listed frame on an unrecognised path unclassifiable rather than guessing', () => {
    const url = 'https://fast.wistia.net/playlist/whatever';
    expect(mediaSlot(url)).toEqual({ url, provider: 'unknown', id: null, key: null });
  });

  it('classifies a protocol-relative allow-listed frame the same as its absolute form', () => {
    // `iframeSources` keeps `//host/...` and `hostOf` allow-lists it, so the
    // census must not call it unclassifiable where the audit calls it reachable.
    expect(mediaSlot('//fast.wistia.net/embed/iframe/abc1234567')).toEqual({
      url: WISTIA,
      provider: 'wistia',
      id: 'abc1234567',
      key: 'wistia:abc1234567',
    });
  });

  it('leaves a frame on a host the allow-list does not name unclassifiable', () => {
    const url = 'https://example.com/embed/abc1234567';
    expect(mediaSlot(url)).toEqual({ url, provider: 'unknown', id: null, key: null });
  });
});

describe('mediaSlots — every allow-listed frame, from the page bytes', () => {
  it('keeps allow-listed frames in document order and duplicates, ignoring off-list and src-less frames', () => {
    const html = [
      frame(WISTIA),
      frame('https://example.com/x'),
      frame(YOUTUBE),
      '<iframe srcdoc="<p>snapshot</p>"></iframe>',
      frame('/relative'),
      frame(WISTIA),
    ].join('');
    expect(mediaSlots(html).map((s) => s.key)).toEqual(['wistia:abc1234567', 'youtube:dQw4w9WgXcQ', 'wistia:abc1234567']);
  });

  it('finds no slot on a page whose frames are all off the allow-list', () => {
    expect(mediaSlots(frame('https://example.com/x'))).toEqual([]);
  });

  it('is a pure function: the same bytes enumerate the same slots', () => {
    const html = frame(WISTIA) + frame(YOUTUBE);
    expect(mediaSlots(html)).toEqual(mediaSlots(html));
  });
});

describe('livenessUrl — the canonical metadata URL per provider', () => {
  it('probes a Wistia media through its metadata endpoint', () => {
    expect(livenessUrl(mediaSlot(WISTIA))).toBe('https://fast.wistia.com/embed/medias/abc1234567.json');
  });

  it('probes a YouTube media through its oEmbed endpoint', () => {
    const url = livenessUrl(mediaSlot(YOUTUBE));
    expect(url).toBe(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}&format=json`);
  });

  it('probes the privacy host through the same YouTube media, so one video is asked once', () => {
    expect(livenessUrl(mediaSlot(NOCOOKIE))).toBe(livenessUrl(mediaSlot(YOUTUBE)));
  });

  it('refuses an unclassifiable slot rather than inventing a URL', () => {
    expect(() => livenessUrl(mediaSlot('https://fast.wistia.net/playlist/whatever'))).toThrow(/media/i);
  });
});

describe('mediaLiveness — one probe result', () => {
  it('reads a Wistia metadata 200 as alive only when the media is ready with an asset', () => {
    expect(mediaLiveness('wistia', 200, ready())).toBe('alive');
  });

  it('reads a Wistia 404 as gone', () => {
    expect(mediaLiveness('wistia', 404, '')).toBe('gone');
  });

  it('reads a Wistia media that is not ready as gone', () => {
    expect(mediaLiveness('wistia', 200, JSON.stringify({ media: { status: 1, assets: [{ type: 'original' }] } }))).toBe('gone');
  });

  it('reads a ready Wistia media with no delivery asset as gone', () => {
    expect(mediaLiveness('wistia', 200, JSON.stringify({ media: { status: 2, assets: [] } }))).toBe('gone');
  });

  it('reads the 200 a deleted Wistia id answers with as gone, not an outage', () => {
    // Real Wistia: an unknown id is HTTP 200 `{"error": true}`, not a 404.
    expect(mediaLiveness('wistia', 200, deleted())).toBe('gone');
  });

  it('reads an unparsable Wistia body as gone, matching the retired probe', () => {
    expect(mediaLiveness('wistia', 200, 'not json')).toBe('gone');
  });

  it('throws on a Wistia status it cannot classify, so an outage is never mass-dead media', () => {
    expect(() => mediaLiveness('wistia', 500, '')).toThrow(/Wistia/);
  });

  it('reads a YouTube oEmbed 200 as alive and a 404 as gone', () => {
    expect(mediaLiveness('youtube', 200, '{}')).toBe('alive');
    expect(mediaLiveness('youtube', 404, '')).toBe('gone');
  });

  it('reports a private (401) or embed-disabled (403) YouTube media as restricted', () => {
    expect(mediaLiveness('youtube', 401, '')).toBe('restricted');
    expect(mediaLiveness('youtube', 403, '')).toBe('restricted');
  });

  it('throws on a YouTube status it cannot classify', () => {
    expect(() => mediaLiveness('youtube', 500, '')).toThrow(/YouTube/);
  });

  it('throws on a provider it has no rule for', () => {
    expect(() => mediaLiveness('unknown', 200, '')).toThrow(/provider/i);
  });
});

describe('mediaReport — one run of the media tier', () => {
  const page = (path: string, srcs: string[]) => ({ path, html: srcs.map(frame).join('') });

  it('reports nothing for a slot whose media resolves', () => {
    const report = mediaReport([page('/a', [WISTIA])], { 'wistia:abc1234567': { status: 200, body: ready() } });
    expect(report.findings).toEqual([]);
    expect(report.differed).toBe(0);
    expect(report.liveness.alive).toBe(1);
  });

  it('names the page and the slot for a media that no longer resolves', () => {
    const report = mediaReport([page('/a', [WISTIA])], { 'wistia:abc1234567': { status: 404, body: '' } });
    expect(report.findings).toEqual([{ path: '/a', slot: 'wistia:abc1234567', url: WISTIA, liveness: 'gone' }]);
    expect(report.differed).toBe(1);
  });

  it('reports a restricted media as a finding', () => {
    const report = mediaReport([page('/a', [YOUTUBE])], { 'youtube:dQw4w9WgXcQ': { status: 403, body: '' } });
    expect(report.findings).toEqual([{ path: '/a', slot: 'youtube:dQw4w9WgXcQ', url: YOUTUBE, liveness: 'restricted' }]);
  });

  it('counts every slot in the liveness tally, so the tally sums to the slots compared', () => {
    const pages = [page('/a', [WISTIA, YOUTUBE]), page('/b', [WISTIA])];
    const probes: Record<string, Probe> = {
      'wistia:abc1234567': { status: 404, body: '' },
      'youtube:dQw4w9WgXcQ': { status: 200, body: '{}' },
    };
    const report = mediaReport(pages, probes);
    expect(report.compared).toBe(3);
    const sum = report.liveness.alive + report.liveness.gone + report.liveness.restricted;
    expect(sum).toBe(report.compared);
    expect(report.liveness).toEqual({ alive: 1, gone: 2, restricted: 0 });
  });

  it('dedupes a finding by page and slot, but keeps counting the duplicates', () => {
    const report = mediaReport([page('/a', [WISTIA, WISTIA])], { 'wistia:abc1234567': { status: 404, body: '' } });
    expect(report.compared).toBe(2);
    expect(report.differed).toBe(1);
    expect(report.findings).toHaveLength(1);
  });

  it('reports one finding per page a dead media appears on', () => {
    const report = mediaReport([page('/a', [WISTIA]), page('/b', [WISTIA])], { 'wistia:abc1234567': { status: 404, body: '' } });
    expect(report.findings.map((f) => f.path)).toEqual(['/a', '/b']);
  });

  it('sorts findings by page then slot', () => {
    const report = mediaReport(
      [page('/b', [WISTIA]), page('/a', [YOUTUBE, WISTIA])],
      { 'wistia:abc1234567': { status: 404, body: '' }, 'youtube:dQw4w9WgXcQ': { status: 404, body: '' } },
    );
    expect(report.findings.map((f) => `${f.path} ${f.slot}`)).toEqual([
      '/a wistia:abc1234567',
      '/a youtube:dQw4w9WgXcQ',
      '/b wistia:abc1234567',
    ]);
  });

  it('throws when a slot has no probe, because an incomplete measurement is never a clean one', () => {
    expect(() => mediaReport([page('/a', [WISTIA])], {})).toThrow(/probe/i);
  });

  it('throws when an allow-listed frame carries no recognisable media id', () => {
    const report = () => mediaReport([page('/a', ['https://fast.wistia.net/playlist/whatever'])], {});
    expect(report).toThrow(/media/i);
  });
});

describe('the media tier — the run report and exit code', () => {
  const mediaPages = [
    { path: '/a', html: frame(WISTIA) },
    { path: '/b', html: frame(YOUTUBE) },
  ];
  const probes: Record<string, Probe> = {
    'wistia:abc1234567': { status: 404, body: '' },
    'youtube:dQw4w9WgXcQ': { status: 200, body: '{}' },
  };

  it('leaves a run with no media input without a media tier', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(result.report.media).toBeUndefined();
  });

  it('reports a dead media as drift, including on the silent first run — the tier is absolute, not a diff', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, mediaPages, mediaProbes: probes });
    expect(result.report.media).toEqual({
      compared: 2,
      differed: 1,
      findings: [{ path: '/a', slot: 'wistia:abc1234567', url: WISTIA, liveness: 'gone' }],
      liveness: { alive: 1, gone: 1, restricted: 0 },
    });
    expect(exitCode(result.report)).toBe(1);
  });

  it('exits 0 when every slot resolves', () => {
    const allAlive: Record<string, Probe> = {
      'wistia:abc1234567': { status: 200, body: ready() },
      'youtube:dQw4w9WgXcQ': { status: 200, body: '{}' },
    };
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, mediaPages, mediaProbes: allAlive });
    expect(result.report.media?.differed).toBe(0);
    expect(exitCode(result.report)).toBe(0);
  });

  it('prints the media finding with its page and slot', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, mediaPages, mediaProbes: probes });
    const human = formatWatchReport(result.report);
    expect(human).toContain('media');
    expect(human).toContain('/a');
    expect(human).toContain('wistia:abc1234567');
  });
});

describe('the committed served tree', () => {
  const root = fileURLToPath(new URL('../served', import.meta.url));

  function servedFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...servedFiles(child));
      else if (entry.name.endsWith('.html')) files.push(child);
    }
    return files;
  }

  const pages = servedFiles(root).map((file) => ({ path: path.relative(root, file), html: readFileSync(file, 'utf8') }));
  const slots = pages.flatMap((page) => mediaSlots(page.html));

  it('enumerates every allow-listed frame the tree serves', () => {
    expect(slots).toHaveLength(217);
    expect(new Set(pages.filter((page) => mediaSlots(page.html).length > 0).map((page) => page.path)).size).toBe(162);
  });

  it('reaches exactly the hosts the audit allow-list names', () => {
    const host = (url: string) => new URL(url).host;
    const tally: Record<string, number> = {};
    for (const slot of slots) tally[host(slot.url)] = (tally[host(slot.url)] ?? 0) + 1;
    expect(tally).toEqual({ 'fast.wistia.net': 130, 'www.youtube.com': 84, 'www.youtube-nocookie.com': 3 });
  });

  it('probes each distinct media once: the privacy host does not double-count a YouTube video', () => {
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(197);
  });

  it('reports the same slot count the tree holds, over the whole tree and not a hand-listed inventory', () => {
    const probes: Record<string, Probe> = {};
    for (const slot of slots) {
      if (slot.key === null) throw new Error(`unclassifiable slot in the served tree: ${slot.url}`);
      probes[slot.key] = slot.provider === 'wistia' ? { status: 200, body: ready() } : { status: 200, body: '{}' };
    }
    const report = mediaReport(pages, probes);
    expect(report.compared).toBe(slots.length);
    expect(report.compared).toBe(217);
    expect(report.differed).toBe(0);
    expect(report.liveness.alive).toBe(217);
  });
});
