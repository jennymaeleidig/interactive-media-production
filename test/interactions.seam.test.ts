// Interactions DOM seam (the interactions DOM seam, added to the spec's
// Testing Decisions at ticket 05): the delegated click contract — tabs,
// dropdowns, accordions, and sliders operate by captured classes and
// geometry, from one shared runtime with no per-page bespoke logic; reduced
// motion never blocks function. The runtime under test is the exact source
// the build injects inline (pipeline/interactions-runtime.js), evaluated in
// a real DOM (jsdom) — the same bytes every served page carries. Fixtures
// mirror the real captured shapes (research/08 census patterns 11–15).
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { layerSource, seamWindow } from './seam-harness';

const SOURCE = layerSource('interactions');

// Captured shapes, miniature: w-tabs (video-cameras/podcast), the custom
// home4 tabs (flock-ecosystem), the two w-dropdown shapes (animated-height
// FAQ + base-rule filter), the accordion-css item (LPR),
// and both slider control vocabularies (data-slider quotes, swiper arrows).
// The hiding rules are the captured Webflow base rules (ticket 15): the
// 2026-09-09 capture's SingleFile artifact class (sf-hidden) is gone.
const PAGE = `<!DOCTYPE html><html><head><style>.w-tab-pane{display:none;position:relative}.w--tab-active{display:block}.w-dropdown-list{display:none}.w-dropdown-list.w--open{display:block}</style></head><body>

<div data-current=PTZ data-easing=ease data-duration-in=300 data-duration-out=100 class="product_tab-wr is-small w-tabs">
  <div class="tabs-menu w-tab-menu" role=tablist>
    <a data-w-tab=PTZ class="product_tab-link is-full w-inline-block w-tab-link w--current" id=w-tabs-1-data-w-tab-0 href=#w-tabs-1-data-w-pane-0 role=tab aria-controls=w-tabs-1-data-w-pane-0 aria-selected=true><div>PTZ</div></a>
    <a data-w-tab=Fixed class="product_tab-link is-full w-inline-block w-tab-link" tabindex=-1 id=w-tabs-1-data-w-tab-1 href=#w-tabs-1-data-w-pane-1 role=tab aria-controls=w-tabs-1-data-w-pane-1 aria-selected=false><div>Fixed</div></a>
  </div>
  <div class=w-tab-content>
    <div data-w-tab=PTZ class="w-tab-pane w--tab-active" id=w-tabs-1-data-w-pane-0 role=tabpanel aria-labelledby=w-tabs-1-data-w-tab-0><div class=product_tab-content>PTZ pane</div></div>
    <div data-w-tab=Fixed class="w-tab-pane" id=w-tabs-1-data-w-pane-1 role=tabpanel aria-labelledby=w-tabs-1-data-w-tab-1><div class=product_tab-content>Fixed pane</div></div>
  </div>
</div>

<div data-tabs=home class=home4_layout>
  <div data-tabs=menu-list class=home4_scroll_row>
    <button type=button role=tab aria-selected data-tabs=home-menu-item class=home4_scroll_button_wrap><div class=home4_scroll_button_text>One</div></button>
    <button type=button role=tab aria-selected data-tabs=home-menu-item class="home4_scroll_button_wrap is-active"><div class=home4_scroll_button_text>Two</div></button>
    <button type=button role=tab aria-selected data-tabs=home-menu-item class=home4_scroll_button_wrap><div class=home4_scroll_button_text>Three</div></button>
  </div>
  <div data-tabs=home-content-list class=home4_tab_component>
    <div data-tabs=home-content-item role=tabpanel class=home4_tab style=opacity:0;pointer-events:none;position:absolute;inset:0px><div class=home4_image_wrap>pane one</div></div>
    <div data-tabs=home-content-item role=tabpanel class="home4_tab is-active" style=opacity:1;pointer-events:auto;position:relative;inset:0px><div class=home4_image_wrap>pane two</div></div>
    <div data-tabs=home-content-item role=tabpanel class=home4_tab style=opacity:0;pointer-events:none;position:absolute;inset:0px><div class=home4_image_wrap>pane three</div></div>
  </div>
</div>

<div data-delay=0 data-hover=false class="faq_card w-dropdown">
  <div class="faq_trigger is-dfr w-dropdown-toggle" id=w-dropdown-toggle-0 aria-controls=w-dropdown-list-0 aria-haspopup=menu aria-expanded=false role=button tabindex=0><div class=faq_trigger_text>Q1</div></div>
  <nav class="faq_content-wr is-dfr w-dropdown-list" id=w-dropdown-list-0 aria-labelledby=w-dropdown-toggle-0 style=height:0px;background-color:rgb(255,255,255)><div class=faq_content><p>A1</p></div></nav>
</div>

<div data-delay=0 data-hover=false class="filter_dropdown w-dropdown">
  <div class="filter_dropdown-toggle w-dropdown-toggle" id=w-dropdown-toggle-1 aria-controls=w-dropdown-list-1 aria-haspopup=menu aria-expanded=false role=button tabindex=0><div>Type</div></div>
  <nav class="filter-dropdown-list w-dropdown-list" id=w-dropdown-list-1 aria-labelledby=w-dropdown-toggle-1></nav>
</div>

<div data-animate=slide-up data-accordion-status=not-active class="accordion-css__item" id=acc-1>
  <button data-accordion-toggle data-hover aria-expanded=false id=panel-toggle-1 aria-controls=panel-content-1 class=accordion-css__item-top>
    <h3 class=accordion-css__item-heading>What is an LPR?</h3>
    <div aria-hidden=true class=accordion-css__item-icon>
      <svg xmlns=http://www.w3.org/2000/svg width=100% viewBox="0 0 8 8" fill=none class=accordion-css__item-icon-svg><rect y=3.15 width=8 height=1.5 rx=0.75 fill=currentColor></rect><rect x=3.15 width=1.5 height=8 rx=0.75 fill=currentColor></rect></svg>
    </div>
  </button>
  <div id=panel-content-1 aria-labelledby=panel-toggle-1 role=region class=accordion-css__item-bottom>
    <div class=accordion-css__item-bottom-wrap><div class=accordion-css__item-bottom-content><p>answer one</p></div></div>
  </div>
</div>

<div data-animate=slide-up data-accordion-status=not-active class="accordion-css__item" id=acc-2>
  <button data-accordion-toggle data-hover aria-expanded=false id=panel-toggle-2 aria-controls=panel-content-2 class=accordion-css__item-top>
    <h3 class=accordion-css__item-heading>Second?</h3>
    <div aria-hidden=true class=accordion-css__item-icon>
      <svg xmlns=http://www.w3.org/2000/svg width=100% viewBox="0 0 8 8" fill=none class=accordion-css__item-icon-svg><rect y=3.15 width=8 height=1.5 rx=0.75 fill=currentColor></rect><rect x=3.15 width=1.5 height=8 rx=0.75 fill=currentColor></rect></svg>
    </div>
  </button>
  <div id=panel-content-2 aria-labelledby=panel-toggle-2 role=region class=accordion-css__item-bottom>
    <div class=accordion-css__item-bottom-wrap><div class=accordion-css__item-bottom-content><p>answer two</p></div></div>
  </div>
</div>

<div class="swiper is-cs w-dyn-list swiper-initialized swiper-horizontal swiper-backface-hidden" id=quote-swiper>
  <div role=list class="swiper-wrapper is-quotes w-dyn-items" id=swiper-wrapper-quote aria-live=polite>
    <div role=group class="swiper-slide is-cs w-dyn-item swiper-slide-active" aria-label="1 / 2" style=width:928px;margin-right:20px><div class=cs_sldier-card-wr>quote one</div></div>
    <div role=group class="swiper-slide is-cs w-dyn-item swiper-slide-next" aria-label="2 / 2" style=width:928px;margin-right:20px><div class=cs_sldier-card-wr>quote two</div></div>
  </div>
  <div data-slider=pagination class="slider_pagination swiper-pagination-clickable swiper-pagination-bullets swiper-pagination-horizontal">
    <span class="slider-bullet is-active" tabindex=0 role=button aria-label="Go to slide 1" aria-current=true></span>
    <span class=slider-bullet tabindex=0 role=button aria-label="Go to slide 2"></span>
  </div>
</div>
<div data-slider=back class="slider-button swiper-button-disabled" tabindex=-1 role=button aria-label="Previous slide" aria-controls=swiper-wrapper-quote aria-disabled=true><div class="embed-icon w-embed">back</div></div>
<div data-slider=next class=slider-button tabindex=0 role=button aria-label="Next slide" aria-controls=swiper-wrapper-quote aria-disabled=false><div class="embed-icon w-embed">next</div></div>

<div class="swiper is-featured w-dyn-list swiper-initialized swiper-horizontal swiper-backface-hidden" id=ind-swiper>
  <div role=list class="swiper-wrapper cs_list is-dark w-dyn-items" id=swiper-wrapper-ind aria-live=polite style=transform:translate3d(0px,0px,0px)>
    <div role=group class="swiper-slide cs_card-wr w-dyn-item swiper-slide-active" aria-label="1 / 3" style=margin-right:20px>card one</div>
    <div role=group class="swiper-slide cs_card-wr w-dyn-item swiper-slide-next" aria-label="2 / 3" style=margin-right:20px>card two</div>
    <div role=group class="swiper-slide cs_card-wr w-dyn-item" aria-label="3 / 3" style=margin-right:20px>card three</div>
  </div>
</div>
<a data-swiper-prev href=# class="swiper-arrow w-inline-block is-disabled" tabindex=-1 role=button aria-label="Previous slide" aria-controls=swiper-wrapper-ind aria-disabled=true>back</a>
<a data-swiper-next href=# class="swiper-arrow w-inline-block" tabindex=0 role=button aria-label="Next slide" aria-controls=swiper-wrapper-ind aria-disabled=false>next</a>

<div data-youtube-card class=th_video-card-component>
  <button data-youtube-poster aria-label="Play video: Are You Being Tracked?" aria-controls=youtube-video-panel-1 aria-expanded=false data-video-trigger=lV1WCvNGnmM role=button class=th_video-card type=button style=opacity:1;visibility:inherit>poster</button>
  <div id=youtube-video-panel-1 data-youtube-video aria-hidden=true class=th_video-wrapper inert style=pointer-events:none;opacity:0;visibility:hidden><iframe data-video-id=lV1WCvNGnmM class=th_video id=youtube-player-1 allow="accelerometer; autoplay; fullscreen"></iframe></div>
</div>

<div data-youtube-card class=th_video-card-component>
  <button data-youtube-poster aria-label="Play video: Are License Plates Private?" aria-controls=youtube-video-panel-2 aria-expanded=false data-video-trigger=lV1WCvNGnmM role=button class=th_video-card type=button style=opacity:1;visibility:inherit>poster two</button>
  <div id=youtube-video-panel-2 data-youtube-video aria-hidden=true class=th_video-wrapper inert style=pointer-events:none;opacity:0;visibility:hidden><iframe data-video-id=Qq1eaw86JWw class=th_video id=youtube-player-2 allow=autoplay></iframe></div>
</div>

</body></html>`;

function domOf(html: string, opts: { reduced?: boolean } = {}) {
  return seamWindow('interactions', html, { reduced: opts.reduced });
}

type Win = DOMWindow & { document: Document };

/** Click like a visitor: a bubbling, cancelable primary click from the SAME window (delegation target may be any descendant). */
function clickIn(window: DOMWindow, el: Element): boolean {
  const Event = (window as unknown as { MouseEvent: new (t: string, init: MouseEventInit) => MouseEvent }).MouseEvent;
  return el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true, button: 0 }));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Give the quotes/industries wrappers a scroll box (jsdom has no layout) — the captured clipper relationship. */
function stubLayout(window: DOMWindow): void {
  const doc = (window as Win).document;
  const define = (el: Element, props: Record<string, number>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, configurable: true });
  };
  const quotes = doc.getElementById('swiper-wrapper-quote')!;
  define(quotes, { scrollWidth: 1876, clientWidth: 928 }); // 2×(928+20) wide content, one 928px slide visible
  const ind = doc.getElementById('swiper-wrapper-ind')!;
  define(ind, { scrollWidth: 1000, clientWidth: 660 }); // 3×(320+20) content → max translate 340
  for (const slide of ind.querySelectorAll('.swiper-slide')) define(slide, { offsetWidth: 320 });
}

describe('the custom accordion (LPR accordion-css system) toggles state and icon, function-only', () => {
  it('flips data-accordion-status, aria-expanded, the panel grid rows, and the icon bar — and back', () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    const item = doc.getElementById('acc-1')!;
    const toggle = doc.getElementById('panel-toggle-1')!;
    const region = doc.getElementById('panel-content-1')!;
    const iconBar = item.querySelector('.accordion-css__item-icon-svg rect:last-child') as SVGRectElement;

    clickIn(dom.window, toggle);
    expect(item.getAttribute('data-accordion-status')).toBe('active');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // the open state is the captured CSS's missing half: rows 1fr inline; the
    // height tween itself is suppressed by the layer's CSS half (pipeline seam)
    expect(region.style.gridTemplateRows).toBe('1fr');
    expect(iconBar.style.transform).toBe('rotate(90deg)');

    clickIn(dom.window, toggle);
    expect(item.getAttribute('data-accordion-status')).toBe('not-active');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.style.gridTemplateRows).toBe(''); // inline gone — the captured 0fr rule applies again
    expect(iconBar.style.transform).toBe('');
  });

  it('items are independent — opening one leaves the others closed', () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    clickIn(dom.window, doc.getElementById('panel-toggle-1')!);
    clickIn(dom.window, doc.getElementById('panel-toggle-2')!);
    expect(doc.getElementById('acc-1')!.getAttribute('data-accordion-status')).toBe('active');
    expect(doc.getElementById('acc-2')!.getAttribute('data-accordion-status')).toBe('active');
    expect(doc.getElementById('panel-content-2')!.style.gridTemplateRows).toBe('1fr');
  });
});

describe('Webflow dropdowns open and close by their captured hiding shape', () => {
  it('animated-height FAQ shape: w--open + aria-expanded, inline height 0px ↔ auto', () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    const toggle = doc.getElementById('w-dropdown-toggle-0')!;
    const list = doc.getElementById('w-dropdown-list-0')!;
    clickIn(dom.window, toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.classList.contains('w--open')).toBe(true);
    expect(list.classList.contains('w--open')).toBe(true);
    expect(list.style.height).toBe('auto');
    clickIn(dom.window, toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.classList.contains('w--open')).toBe(false);
    expect(list.classList.contains('w--open')).toBe(false);
    expect(list.style.height).toBe('0px'); // the captured closed geometry, restored
  });

  it('display:none filter shape: w--open toggles on the list, base rule does the hiding', () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    const toggle = doc.getElementById('w-dropdown-toggle-1')!;
    const list = doc.getElementById('w-dropdown-list-1')!;
    expect(list.classList.contains('w--open')).toBe(false);
    clickIn(dom.window, toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.classList.contains('w--open')).toBe(true);
    clickIn(dom.window, toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.classList.contains('w--open')).toBe(false);
  });
});

describe('Webflow tabs switch panes with the captured classes and pairings', () => {
  it('with reduced motion: the swap is instant — w--current/w--tab-active and data-current all move', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const root = doc.querySelector('.w-tabs')!;
    const fixedLink = doc.getElementById('w-tabs-1-data-w-tab-1')!;
    const ptzLink = doc.getElementById('w-tabs-1-data-w-tab-0')!;
    const ptzPane = doc.getElementById('w-tabs-1-data-w-pane-0')!;
    const fixedPane = doc.getElementById('w-tabs-1-data-w-pane-1')!;

    clickIn(dom.window, fixedLink);
    expect(fixedLink.classList.contains('w--current')).toBe(true);
    expect(fixedLink.getAttribute('aria-selected')).toBe('true');
    expect(fixedLink.hasAttribute('tabindex')).toBe(false);
    expect(ptzLink.classList.contains('w--current')).toBe(false);
    expect(ptzLink.getAttribute('aria-selected')).toBe('false');
    expect(ptzLink.getAttribute('tabindex')).toBe('-1');
    expect(root.getAttribute('data-current')).toBe('Fixed');
    expect(fixedPane.classList.contains('w--tab-active')).toBe(true);
    expect(ptzPane.classList.contains('w--tab-active')).toBe(false);
    // no fade plumbing left behind
    expect(fixedPane.style.transition).toBe('');
    expect(ptzPane.style.transition).toBe('');
  });

  it('with motion allowed: the captured fade plays — out over duration-out, then in over duration-in', async () => {
    const dom = domOf(PAGE); // jsdom matchMedia: reduce does not match → motion allowed
    const doc = (dom.window as Win).document;
    const fixedLink = doc.getElementById('w-tabs-1-data-w-tab-1')!;
    const ptzPane = doc.getElementById('w-tabs-1-data-w-pane-0')!;
    const fixedPane = doc.getElementById('w-tabs-1-data-w-pane-1')!;

    clickIn(dom.window, fixedLink);
    // out-phase armed synchronously; the pane is still visible while fading
    expect(ptzPane.style.opacity).toBe('0');
    expect(ptzPane.style.transition).toBe('opacity 100ms ease');
    expect(ptzPane.classList.contains('w--tab-active')).toBe(true);
    expect(fixedPane.classList.contains('w--tab-active')).toBe(false);

    await sleep(200); // > duration-out
    expect(ptzPane.classList.contains('w--tab-active')).toBe(false);
    expect(ptzPane.style.opacity).toBe('');
    expect(fixedPane.classList.contains('w--tab-active')).toBe(true);
    // in-phase armed from the 0 from-state, releasing to 1
    expect(fixedPane.style.opacity).toBe('1');
    expect(fixedPane.style.transition).toBe('opacity 300ms ease');

    await sleep(400); // > duration-in + settle
    expect(fixedPane.style.opacity).toBe('');
    expect(fixedPane.style.transition).toBe('');
  });

  it('clicking the current tab is a no-op', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const ptzLink = doc.getElementById('w-tabs-1-data-w-tab-0')!;
    const ptzPane = doc.getElementById('w-tabs-1-data-w-pane-0')!;
    clickIn(dom.window, ptzLink);
    expect(ptzPane.classList.contains('w--tab-active')).toBe(true);
  });

  it('a link whose pane is missing mutates nothing — pairing validated before any state changes', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const orphan = doc.createElement('a');
    orphan.setAttribute('data-w-tab', 'Ghost');
    orphan.className = 'w-tab-link';
    doc.querySelector('.w-tab-menu')!.appendChild(orphan);
    const ptzLink = doc.getElementById('w-tabs-1-data-w-tab-0')!;
    const ptzPane = doc.getElementById('w-tabs-1-data-w-pane-0')!;
    clickIn(dom.window, orphan);
    expect(ptzLink.classList.contains('w--current')).toBe(true); // current link untouched
    expect(ptzLink.getAttribute('aria-selected')).toBe('true');
    expect(doc.querySelector('.w-tabs')!.getAttribute('data-current')).toBe('PTZ');
    expect(ptzPane.classList.contains('w--tab-active')).toBe(true);
  });

  it('a click mid-fade is ignored until the switch completes (never double-armed)', async () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    const ptzLink = doc.getElementById('w-tabs-1-data-w-tab-0')!;
    const fixedLink = doc.getElementById('w-tabs-1-data-w-tab-1')!;
    clickIn(dom.window, fixedLink);
    clickIn(dom.window, ptzLink); // inside the 100ms out-phase
    await sleep(700);
    const ptzPane = doc.getElementById('w-tabs-1-data-w-pane-0')!;
    const fixedPane = doc.getElementById('w-tabs-1-data-w-pane-1')!;
    expect(doc.querySelector('.w-tabs')!.getAttribute('data-current')).toBe('Fixed');
    expect(fixedPane.classList.contains('w--tab-active')).toBe(true);
    expect(ptzPane.classList.contains('w--tab-active')).toBe(false);
    // the ignored click left no half-faded state behind
    expect(ptzPane.style.opacity).toBe('');
    expect(fixedPane.style.opacity).toBe('');
  });
});

describe('custom tabs (flock-ecosystem home4 system) pair menu and content by index', () => {
  it('is-active and the captured pane styles swap; aria-selected follows', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const buttons = [...doc.querySelectorAll<HTMLElement>('[data-tabs=home-menu-item]')];
    const panes = [...doc.querySelectorAll<HTMLElement>('[data-tabs=home-content-item]')];

    clickIn(dom.window, buttons[2]);
    expect(buttons[2].classList.contains('is-active')).toBe(true);
    expect(buttons[2].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].classList.contains('is-active')).toBe(false);
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
    // the captured active-pane style, verbatim
    expect(panes[2].classList.contains('is-active')).toBe(true);
    expect(panes[2].style.opacity).toBe('1');
    expect(panes[2].style.pointerEvents).toBe('auto');
    expect(panes[2].style.position).toBe('relative');
    // the captured hidden-pane style, verbatim (census pattern 14)
    expect(panes[1].style.opacity).toBe('0');
    expect(panes[1].style.pointerEvents).toBe('none');
    expect(panes[1].style.position).toBe('absolute');
  });
});

describe('sliders advance and retreat by captured slide geometry', () => {
  it('quotes slider: next translates by slide width + gap, moves active/next classes, bullets, and the disabled states', () => {
    const dom = domOf(PAGE);
    stubLayout(dom.window);
    const doc = (dom.window as Win).document;
    const wrapper = doc.getElementById('swiper-wrapper-quote')!;
    const slides = [...wrapper.querySelectorAll('.swiper-slide')];
    const back = doc.querySelector('[data-slider=back]')!;
    const next = doc.querySelector('[data-slider=next]')!;

    clickIn(dom.window, next);
    expect(wrapper.style.transform).toBe('translate3d(-948px, 0px, 0px)'); // 928 + 20 gap
    expect(slides[0].classList.contains('swiper-slide-active')).toBe(false);
    expect(slides[1].classList.contains('swiper-slide-active')).toBe(true);
    expect(wrapper.querySelector('.swiper-slide-next')).toBeNull(); // last slide: nothing after it
    const bullets = [...doc.querySelectorAll('.slider-bullet')];
    expect(bullets[1].classList.contains('is-active')).toBe(true);
    expect(bullets[1].getAttribute('aria-current')).toBe('true');
    expect(bullets[0].classList.contains('is-active')).toBe(false);
    expect(bullets[0].hasAttribute('aria-current')).toBe(false);
    // prev unlocks, next exhausts at the end of the scroll box
    expect(back.classList.contains('swiper-button-disabled')).toBe(false);
    expect(back.getAttribute('aria-disabled')).toBe('false');
    expect(back.getAttribute('tabindex')).toBe('0');
    expect(next.classList.contains('swiper-button-disabled')).toBe(true);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('tabindex')).toBe('-1');

    clickIn(dom.window, back);
    expect(wrapper.style.transform).toBe('translate3d(0px, 0px, 0px)'); // no negative zero — the captured resting format
    expect(slides[0].classList.contains('swiper-slide-active')).toBe(true);
    expect(slides[1].classList.contains('swiper-slide-next')).toBe(true);
    expect(back.classList.contains('swiper-button-disabled')).toBe(true);
    expect(next.classList.contains('swiper-button-disabled')).toBe(false);
  });

  it('industries arrows: clamped at the wrapper scroll box; the arrow keeps its own is-disabled vocabulary', () => {
    const dom = domOf(PAGE);
    stubLayout(dom.window);
    const doc = (dom.window as Win).document;
    const wrapper = doc.getElementById('swiper-wrapper-ind')!;
    const slides = [...wrapper.querySelectorAll('.swiper-slide')];
    const prev = doc.querySelector('[data-swiper-prev]')!;
    const next = doc.querySelector('[data-swiper-next]')!;

    clickIn(dom.window, next);
    // max translate = 1000 − 660 = 340; the wrapper ends flush with the last slide
    expect(wrapper.style.transform).toBe('translate3d(-340px, 0px, 0px)');
    expect(slides[1].classList.contains('swiper-slide-active')).toBe(true);
    expect(slides[2].classList.contains('swiper-slide-next')).toBe(true);
    expect(next.classList.contains('is-disabled')).toBe(true);
    expect(prev.classList.contains('is-disabled')).toBe(false);

    clickIn(dom.window, prev);
    expect(wrapper.style.transform).toBe('translate3d(0px, 0px, 0px)');
    expect(slides[0].classList.contains('swiper-slide-active')).toBe(true);
    expect(prev.classList.contains('is-disabled')).toBe(true);
    expect(next.classList.contains('is-disabled')).toBe(false);
  });

  it('pagination bullets jump straight to a slide', () => {
    const dom = domOf(PAGE);
    stubLayout(dom.window);
    const doc = (dom.window as Win).document;
    const wrapper = doc.getElementById('swiper-wrapper-quote')!;
    const bullets = [...doc.querySelectorAll('.slider-bullet')];
    clickIn(dom.window, bullets[1]);
    expect(wrapper.style.transform).toBe('translate3d(-948px, 0px, 0px)');
    expect(bullets[1].classList.contains('is-active')).toBe(true);
  });
});

describe('the layer is delegation-driven and keeps the zero-outbound invariants', () => {
  it('a click on a deep descendant operates the widget — one document listener, no per-element binding', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    clickIn(dom.window, doc.querySelector('#acc-1 h3')!);
    expect(doc.getElementById('acc-1')!.getAttribute('data-accordion-status')).toBe('active');
    clickIn(dom.window, doc.querySelector('[data-w-tab=Fixed] div')!);
    expect(doc.querySelector('.w-tabs')!.getAttribute('data-current')).toBe('Fixed');
  });

  it('a click on the pagination container itself (not a bullet) is inert', () => {
    const dom = domOf(PAGE);
    stubLayout(dom.window);
    const doc = (dom.window as Win).document;
    const wrapper = doc.getElementById('swiper-wrapper-quote')!;
    clickIn(dom.window, doc.querySelector('[data-slider=pagination]')!);
    expect(wrapper.style.transform).toBe('');
  });

  it('references no network primitive — DOM class/attribute/style surgery only', () => {
    expect(SOURCE).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|\bimport\s*\(/);
  });
});

describe('reduced motion never blocks interaction function', () => {
  it('every family completes its whole contract with reduce requested', () => {
    const dom = domOf(PAGE, { reduced: true });
    stubLayout(dom.window);
    const doc = (dom.window as Win).document;
    clickIn(dom.window, doc.getElementById('w-dropdown-toggle-0')!);
    expect(doc.getElementById('w-dropdown-list-0')!.style.height).toBe('auto');
    clickIn(dom.window, doc.getElementById('panel-toggle-1')!);
    expect(doc.getElementById('acc-1')!.getAttribute('data-accordion-status')).toBe('active');
    clickIn(dom.window, doc.querySelector('[data-tabs=home-menu-item]:nth-of-type(3)')!);
    expect(doc.querySelectorAll('[data-tabs=home-content-item]')[2].classList.contains('is-active')).toBe(true);
    clickIn(dom.window, doc.querySelector('[data-slider=next]')!);
    expect(doc.getElementById('swiper-wrapper-quote')!.style.transform).toBe('translate3d(-948px, 0px, 0px)');
    clickIn(dom.window, doc.querySelector('[data-swiper-next]')!);
    expect(doc.getElementById('swiper-wrapper-ind')!.style.transform).toBe('translate3d(-340px, 0px, 0px)');
    // the YouTube reveal has no motion branch: the frame is armed on the click
    const poster = doc.querySelector('[data-youtube-poster]')!;
    clickIn(dom.window, poster);
    expect(doc.getElementById('youtube-player-1')!.getAttribute('src')).toContain('youtube.com/embed/lV1WCvNGnmM');
  });
});

describe('the YouTube reveal (ticket 17: the /trust video cards)', () => {
  it('arms the captured frame and crossfades the panel in on the poster click', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const poster = doc.querySelector('[data-youtube-poster]')!;
    const panel = doc.getElementById('youtube-video-panel-1')!;
    const frame = doc.getElementById('youtube-player-1')!;

    expect(frame.hasAttribute('src')).toBe(false); // at rest, no third-party request
    clickIn(dom.window, poster);

    // the frame is pointed at the player only now — autoplay rides the click
    expect(frame.getAttribute('src')).toBe('https://www.youtube.com/embed/lV1WCvNGnmM?autoplay=1');
    // the captured open-state inverse: panel gone from inert/aria-hidden/closed styles
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.style.opacity).toBe('1');
    expect(panel.style.visibility).toBe('inherit');
    expect(panel.style.pointerEvents).toBe('');
    // the poster yields the box
    expect(poster.getAttribute('aria-expanded')).toBe('true');
    expect((poster as HTMLElement).style.opacity).toBe('0');
    expect((poster as HTMLElement).style.visibility).toBe('hidden');
    expect((poster as HTMLElement).style.pointerEvents).toBe('none');
  });

  it('cards are independent, and the panel frame owns the id (the trigger is only a fallback)', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    const posters = [...doc.querySelectorAll<HTMLElement>('[data-youtube-poster]')];
    // card two's trigger is the template default while its frame names another
    // video — /trust/compliance-tools is exactly this shape, and reading the
    // trigger would play the same video on all four cards
    clickIn(dom.window, posters[1]);
    expect(doc.getElementById('youtube-player-2')!.getAttribute('src')).toContain('youtube.com/embed/Qq1eaw86JWw');
    expect(doc.getElementById('youtube-player-2')!.getAttribute('src')).not.toContain('lV1WCvNGnmM');
    expect(doc.getElementById('youtube-player-1')!.hasAttribute('src')).toBe(false);

    const orphan = doc.createElement('button');
    orphan.setAttribute('data-youtube-poster', '');
    orphan.setAttribute('aria-controls', 'missing-panel');
    orphan.setAttribute('data-video-trigger', 'lV1WCvNGnmM');
    doc.body.appendChild(orphan);
    expect(() => clickIn(dom.window, orphan)).not.toThrow();
    expect(doc.getElementById('youtube-player-1')!.hasAttribute('src')).toBe(false);
  });
});
