// Live media embeds (ADR 0002): the pass that trades a Capture's inert player
// snapshot for the live player document, and the allow-list audit that keeps
// that exception from spreading. Pure, so it is pinned here rather than only
// through the site build.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  embedPass,
  iframeSources,
  offAllowlistFrames,
  srcdocScripts,
  srcdocSpans,
  stripHiddenVidzflow,
  unclassifiedRemoteRefs,
  wistiaEmbedUrl,
  wistiaIframe,
  youtubeSlots,
  MEDIA_HOSTS,
} from '../pipeline/embeds.mjs';

// A real `srcdoc` value is HTML-escaped — the player document's own quotes are
// `&quot;` — which is why the span cannot contain a raw quote and why the first
// quote reliably ends the value.
const SRCDOC_SLOT = (id: string) =>
  `<div class="w-embed"><iframe scrolling=no frameborder=0 allowfullscreen sandbox="allow-scripts" srcdoc="<!DOCTYPE html><html><script class=w-json-ld type=application/ld+json id=w-json-ldplayer>{&quot;embedUrl&quot;:&quot;https://fast.wistia.net/embed/iframe/${id}&quot;}</script></html>"></iframe></div>`;

const CHROME_SLOT = (id: string) =>
  `<div class="wistia_responsive_padding" style="padding:56.25% 0 0 0;position:relative"><div class=wistia_responsive_wrapper><div class="wistia_embed wistia_async_${id} seo=true" style="height:100%;position:relative;width:100%" id=wistia-${id}-1><div id=wistia_chrome_23 class="w-chrome notranslate" style=display:inline-block;height:100%><div class=wistia_click_to_play><img src=/assets/abc.jpg></div></div></div></div></div>`;

const COMPONENT_SLOT = (id: string) =>
  `<div class="l-img-wrapper r-16x9"><div class="l-img w-embed w-script"><style>wistia-player[media-id="${id}"]:not(:defined){background:center/contain no-repeat url(/assets/poster.jpg)}</style> <wistia-player media-id=${id} aspect=1.7777777777777777 unique-id=wistia-${id}-16><template shadowrootmode=open><div id=wistia_chrome_37 class="w-chrome notranslate"></div></template></wistia-player></div></div>`;

describe('srcdocSpans', () => {
  it('finds the tag, value, and bounds of a srcdoc attribute', () => {
    const html = SRCDOC_SLOT('aaaaaaaaaa');
    const [span] = srcdocSpans(html);
    expect(span.value).toContain('w-json-ldplayer');
    expect(html.slice(span.tagStart, span.tagEnd)).toMatch(/^<iframe/);
    expect(html.slice(span.tagEnd)).toBe('</iframe></div>');
  });

  it('is not confused by the `>` characters inside an inlined document', () => {
    const html = `<iframe srcdoc="<p>a</p><p>b</p>"></iframe>`;
    expect(srcdocSpans(html)).toHaveLength(1);
  });
});

describe('embedPass', () => {
  it('swaps an inlined srcdoc player document for the live URL', () => {
    const r = embedPass(SRCDOC_SLOT('aaaaaaaaaa'));
    expect(r.reshaped.srcdoc).toBe(1);
    expect(r.html).toContain(`src="${wistiaEmbedUrl('aaaaaaaaaa')}"`);
    expect(r.html).not.toContain('srcdoc');
    expect(r.html).not.toContain('w-json-ldplayer');
    expect(r.rewritten).toEqual(['aaaaaaaaaa']);
    expect(r.hosts).toEqual(['fast.wistia.net']);
  });

  it('replaces the JS-built player chrome inside the slot element', () => {
    const r = embedPass(CHROME_SLOT('bbbbbbbbbb'));
    expect(r.reshaped.element).toBe(1);
    // the element keeps its classes and inline geometry; only its contents change
    expect(r.html).toContain(`class="wistia_embed wistia_async_bbbbbbbbbb seo=true" style="height:100%;position:relative;width:100%"`);
    expect(r.html).toContain(wistiaIframe('bbbbbbbbbb', null));
    expect(r.html).not.toContain('wistia_click_to_play');
    // the aspect wrapper survives
    expect(r.html).toContain('padding:56.25% 0 0 0');
  });

  it('replaces a <wistia-player> web component, shadow root and all', () => {
    const r = embedPass(COMPONENT_SLOT('cccccccccc'));
    expect(r.reshaped.component).toBe(1);
    expect(r.html).not.toContain('<wistia-player');
    expect(r.html).not.toContain('shadowrootmode');
    expect(r.html).toContain(`src="${wistiaEmbedUrl('cccccccccc')}"`);
    // the box comes from the wrapper, which stays
    expect(r.html).toContain('<div class="l-img-wrapper r-16x9">');
  });

  it('takes the accessible name from the page’s own JSON-LD', () => {
    const html = `<script class=w-json-ld type=application/ld+json>{"@type":"VideoObject","name":"Flock911 video","embedUrl":"https://fast.wistia.net/embed/iframe/dddddddddd"}</script>${CHROME_SLOT('dddddddddd')}`;
    const r = embedPass(html);
    expect(r.html).toContain('title="Flock911 video"');
  });

  it('inlines a popover slot like any other chrome slot — its box is already the aspect box', () => {
    // ADR 0002 left popovers as captured on the belief that going inline was a
    // layout change. Measured: the slot sits in the captured 16:9 padding trick,
    // so the live player lands in the same box and the dead play button goes.
    const html = `<div class="wistia_responsive_padding" style="padding:56.25% 0 0 0;position:relative"><div class="wistia_embed wistia_async_eeeeeeeeee popover=true videoFoam=true" style=display:inline-block;height:100%;width:100%><div class=wistia_click_to_play><img src=/assets/p.jpg></div></div></div>`;
    const r = embedPass(html);
    expect(r.reshaped.popover).toBe(1);
    expect(r.reshaped.element).toBe(1);
    expect(r.html).toContain(wistiaIframe('eeeeeeeeee', null));
    expect(r.html).not.toContain('wistia_click_to_play');
    expect(r.html).toContain('padding:56.25%');
    expect(r.unreachable).toEqual([]);
  });

  it('leaves a dead-upstream media in its captured end-state', () => {
    const r = embedPass(SRCDOC_SLOT('ffffffffff'), { dead: ['ffffffffff'] });
    expect(r.reshaped.dead).toBe(1);
    expect(r.html).toContain('srcdoc');
    expect(r.rewritten).toEqual([]);
  });

  it('counts a dead media whose slot the JSON-LD never names', () => {
    // The case that shipped a live frame to a dead player (2026-09-11): a
    // `<wistia-player media-id>` slot carries its id as an attribute, so the
    // URL-based sweeps never see it — if the dead list were consulted through
    // that map alone, the page would report no dead slot and the summary would
    // lose it.
    const html = `<wistia-player media-id="ffffffffff" aspect="1.7777777777777777"></wistia-player>`;
    const r = embedPass(html, { dead: ['ffffffffff'] });
    expect(r.reshaped.dead).toBe(1);
    expect(r.rewritten).toEqual([]);
    expect(r.html).toBe(html);
  });

  it('leaves a non-video srcdoc (form, map) completely alone', () => {
    const html = `<iframe title="form" srcdoc="<form action=/api/mock></form>"></iframe>`;
    const r = embedPass(html);
    expect(r.html).toBe(html);
    expect(Object.values(r.reshaped).every((n) => n === 0)).toBe(true);
  });

  it('leaves a link-only wistia reference alone and reports it as unreachable', () => {
    const html = `<a href="https://flocksafety.wistia.com/medias/gggggggggg">Watch</a>`;
    const r = embedPass(html);
    expect(r.html).toBe(html);
    expect(r.unreachable).toEqual(['gggggggggg']);
  });

  it('is idempotent — a second pass finds nothing to do', () => {
    const once = embedPass(CHROME_SLOT('hhhhhhhhhh')).html;
    const twice = embedPass(once);
    expect(twice.html).toBe(once);
    expect(twice.rewritten).toEqual([]);
  });

  it('rewrites every slot on a page, not just the first', () => {
    const html = SRCDOC_SLOT('iiiiiiiiii') + CHROME_SLOT('jjjjjjjjjj') + COMPONENT_SLOT('kkkkkkkkkk');
    const r = embedPass(html);
    expect(r.rewritten).toEqual(['iiiiiiiiii', 'jjjjjjjjjj', 'kkkkkkkkkk']);
    expect(r.html.match(/https:\/\/fast\.wistia\.net\/embed\/iframe\//g)).toHaveLength(3);
  });
});

describe('every YouTube slot on the page (ticket 17)', () => {
  it('finds a src-less 11-character data-video-id frame without arming it', () => {
    const html = `<iframe data-video-id=lV1WCvNGnmM class=th_video title="YouTube video: x"></iframe>`;
    expect(youtubeSlots(html)).toEqual(['lV1WCvNGnmM']);
    const r = embedPass(html);
    expect(r.reshaped.youtube).toBe(1);
    expect(r.hosts).toEqual(['www.youtube.com']);
    // the interactions runtime points the frame at the player on the click; a
    // build-time `src` would fetch a frame nobody can see
    expect(r.html).toBe(html);
  });

  it('does not confuse a longer podcast id or a numeric Vidzflow id', () => {
    expect(youtubeSlots(`<iframe data-video-id=7hyzp0tDLlLVy2BWG284Qt></iframe>`)).toEqual([]);
    expect(youtubeSlots(`<iframe data-video-id=32614></iframe>`)).toEqual([]);
  });

  it('ignores a frame that already carries a src', () => {
    expect(youtubeSlots(`<iframe src="https://www.youtube.com/embed/lV1WCvNGnmM" data-video-id=lV1WCvNGnmM></iframe>`)).toEqual([]);
  });
});

describe('the hidden Vidzflow player documents (ticket 19)', () => {
  it('removes the srcdoc player document and keeps the visible sibling still', () => {
    const html = `<img class="l-img r-cc" src=/assets/still.svg><div class="video-desktop is-hidden w-embed w-iframe"><div style=aspect-ratio:1;overflow:hidden data-video-id=32614><iframe srcdoc="<!DOCTYPE html><style class=vjs-styles-defaults></style><div class=vidzflow-player-dimensions></div>"></iframe></div></div>`;
    const r = stripHiddenVidzflow(html);
    expect(r.removed).toBe(1);
    expect(r.html).toContain('/assets/still.svg');
    expect(r.html).not.toContain('vjs-styles-defaults');
    expect(r.html).not.toContain('<iframe');
  });

  it('leaves a non-Vidzflow srcdoc frame alone', () => {
    const html = `<iframe srcdoc="<form action=/api/mock></form>"></iframe>`;
    expect(stripHiddenVidzflow(html)).toEqual({ html, removed: 0 });
  });

  it('leaves a Wistia player document that happens to use video.js inside it', () => {
    // Wistia's own player is video.js-based, so `vjs-styles-defaults` is not a
    // Vidzflow marker: trusting it stripped 55 live Wistia slots in a rebuild.
    const html = `<iframe srcdoc="<style class=vjs-styles-defaults></style><script class=w-json-ld type=application/ld+json>{&quot;embedUrl&quot;:&quot;https://fast.wistia.net/embed/iframe/aaaaaaaaaa&quot;}</script>"></iframe>`;
    expect(stripHiddenVidzflow(html)).toEqual({ html, removed: 0 });
  });
});

describe('the srcdoc script audit (ticket 20)', () => {
  it('sees a script inside a srcdoc payload — the census could only see it by luck', () => {
    expect(srcdocScripts(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`).executable).toBe(1);
  });

  it('treats the captured allow-scripts ld+json payload as benign', () => {
    const html = `<iframe sandbox="allow-scripts" srcdoc="<script nonce type=application/ld+json>{}</script>"></iframe>`;
    expect(srcdocScripts(html)).toEqual({ total: 1, executable: 0, allowScripts: 1, allowScriptsExecutable: 0 });
  });

  it('counts only the srcdoc payloads, never the page scripts outside them', () => {
    const html = `<script data-flock-parody>1</script><iframe srcdoc="<script>alert(1)</script>"></iframe>`;
    expect(srcdocScripts(html).executable).toBe(1);
  });

  it('sees an entity-escaped script, which the parser decodes before the frame runs', () => {
    // The raw attribute value has no `<`, but the browser decodes `&lt;` before
    // instantiating the frame — scanning the raw value would score this 0.
    const html = `<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>`;
    expect(srcdocScripts(html).executable).toBe(1);
  });
});

describe('the remote-reference class audit (ticket 20)', () => {
  it('flags a remote reference in an unexpected fetcher position', () => {
    expect(unclassifiedRemoteRefs(`<img src="https://evil.example/x.jpg">`)).toEqual(['https://evil.example/x.jpg']);
    expect(unclassifiedRemoteRefs(`<link rel=stylesheet href="https://evil.example/x.css">`)).toEqual(['https://evil.example/x.css']);
    expect(unclassifiedRemoteRefs(`<script src="https://evil.example/x.js"></script>`)).toEqual(['https://evil.example/x.js']);
  });

  it('accepts the documented inert classes and the allow-listed frames', () => {
    const html = `<iframe src="${wistiaEmbedUrl('llllllllll')}"></iframe>`
      + `<video poster="https://r2.example/p.jpg"></video>`
      + `<div data-animation-type=lottie data-src="https://cdn.example/a.json"></div>`
      + `<meta property=og:image content="https://cdn.example/a.png">`
      + `<a href="https://external.example/page">link</a>`
      + `<link rel=canonical href="https://www.example.com/page">`;
    expect(unclassifiedRemoteRefs(html)).toEqual([]);
  });

  it('flags a remote @import in a stylesheet', () => {
    expect(unclassifiedRemoteRefs(`<style>@import url(https://evil.example/x.css);</style>`)).toEqual(['https://evil.example/x.css']);
  });

  it('does not read a `data-src` as a `src`', () => {
    expect(unclassifiedRemoteRefs(`<img data-src="https://cdn.example/a.jpg">`)).toEqual([]);
  });
});

describe('the frame allow-list', () => {
  it('reads absolute iframe sources', () => {
    expect(iframeSources(`<iframe src="https://a.example/x"></iframe><iframe src=/local></iframe>`)).toEqual(['https://a.example/x']);
  });

  it('flags a frame outside the allow-list, and passes the media hosts', () => {
    expect(offAllowlistFrames(`<iframe src="https://evil.example/x">`)).toEqual(['https://evil.example/x']);
    expect(offAllowlistFrames(`<iframe src="${wistiaEmbedUrl('llllllllll')}">`)).toEqual([]);
    expect(offAllowlistFrames(`<iframe src="https://www.youtube.com/embed/abcdefghijk">`)).toEqual([]);
    expect(MEDIA_HOSTS).toEqual(['fast.wistia.net', 'www.youtube.com']);
  });

  it('does not flag image-side remote references (CSP refuses those, not this audit)', () => {
    const html = `<video poster="https://r2.vidzflow.com/thumbnails/x.jpg"></video><img data-src="https://cdn.example/a.json">`;
    expect(offAllowlistFrames(html)).toEqual([]);
  });
});
