// Live media embeds (ADR 0002): the pass that trades a Capture's inert player
// snapshot for the live player document, and the allow-list audit that keeps
// that exception from spreading. Pure, so it is pinned here rather than only
// through the site build.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { embedPass, iframeSources, offAllowlistFrames, srcdocSpans, wistiaEmbedUrl, wistiaIframe, MEDIA_HOSTS } from '../pipeline/embeds.mjs';

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

  it('leaves a popover slot in its captured end-state', () => {
    const html = `<div class="wistia_embed wistia_async_eeeeeeeeee popover=true videoFoam=true" style=display:inline-block><div class=wistia_click_to_play><img src=/assets/p.jpg></div></div>`;
    const r = embedPass(html);
    expect(r.reshaped.popover).toBe(1);
    expect(r.html).toBe(html);
    // reported, not silent: the page references a video this pass did not make live
    expect(r.unreachable).toEqual(['eeeeeeeeee']);
  });

  it('leaves a dead-upstream media in its captured end-state', () => {
    const r = embedPass(SRCDOC_SLOT('ffffffffff'), { dead: ['ffffffffff'] });
    expect(r.reshaped.dead).toBe(1);
    expect(r.html).toContain('srcdoc');
    expect(r.rewritten).toEqual([]);
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
