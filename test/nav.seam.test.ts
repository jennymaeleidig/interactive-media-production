// The shared header's nav layer seam (ticket 14): the exact source the build
// injects inline (pipeline/nav-runtime.js) evaluated in a real DOM (jsdom) —
// the same bytes every served page carries. It moves the class vocabulary the
// corrected capture's live CSS renders (ticket 15): .header-z.scroll on
// scroll, .nav__dd.show on desktop hover and mobile tap, .header__bg.is-open +
// the mobile take-over on the hamburger. A desktop trigger click must still
// navigate (no preventDefault) — the empty-cream-bar break must be impossible.
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { layerSource, releaseDomReady, seamWindow, type SeamWindow } from './seam-harness';

const NAV_CSS = layerSource('nav', 'css');

// The restored header shape, miniature: ids/classes as the live site uses them
// (the runtime keys on #header, .header__bg, .nav__dd, .nav__menu-list).
const PAGE = `<!DOCTYPE html><html><head></head><body>
<div id=header class="header-z w-nav" data-collapse=all data-duration=400>
  <div class=header__bg></div>
  <div class=header__container>
    <div class=nav-menu-mobile-wr>
      <a href=# class="nav__menu-button w-inline-block"><div class="nav-line is-01"></div><div class="nav-line is-02"></div></a>
    </div>
    <ul class="nav__menu-list w-nav">
      <li class=nav__list-item><div class=nav__dd>
        <a href=/products class=nav__dd-trigger><div>Products</div></a>
        <div class=nav__dd-content><div class=nav__dd-wr><a class=nav_back-link>Back</a></div></div>
      </div></li>
      <li class=nav__list-item><div class=nav__dd>
        <a href=/trust class=nav__dd-trigger><div>Privacy</div></a>
        <div class=nav__dd-content><div class=nav__dd-wr></div></div>
      </div></li>
    </ul>
  </div>
</div>
</body></html>`;

type Win = DOMWindow;

function domOf(reduced = false): SeamWindow {
  const seam = seamWindow('nav', PAGE, { reduced });
  // jsdom leaves readyState at 'loading' until the async load event; the
  // runtime boots on DOMContentLoaded, so fire it here
  releaseDomReady(seam.window);
  return seam;
}

function setWidth(win: Win, width: number) {
  (win as unknown as { innerWidth: number }).innerWidth = width;
}

function setScroll(win: Win, y: number) {
  (win as unknown as { scrollY: number }).scrollY = y;
  win.dispatchEvent(new win.Event('scroll'));
}

function clickIn(win: Win, el: Element) {
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

/** The selector set of nav.css's reduced-motion block, order-independent. */
function reducedMotionCssSelectors(css: string): string[] {
  const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (at < 0) return [];
  const open = css.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  return css.slice(open + 1, end).split('{')[0].split(',').map((s) => s.trim()).filter(Boolean);
}

describe('nav layer (ticket 14)', () => {
  it('morphs the header on scroll: .scroll past the top, off again at 0', () => {
    const win = domOf().window as Win;
    const header = win.document.getElementById('header')!;
    expect(header.classList.contains('scroll')).toBe(false);
    setScroll(win, 500);
    expect(header.classList.contains('scroll')).toBe(true);
    setScroll(win, 0);
    expect(header.classList.contains('scroll')).toBe(false);
  });

  it('toggles .scroll-up while scrolling down (fidelity class — its live rule is commented out)', () => {
    const win = domOf().window as Win;
    const header = win.document.getElementById('header')!;
    setScroll(win, 100);
    expect(header.classList.contains('scroll-up')).toBe(true);
    setScroll(win, 50);
    expect(header.classList.contains('scroll-up')).toBe(false);
  });

  it('desktop: hover opens the mega-menu with .show, leaving closes it', () => {
    const win = domOf().window as Win;
    setWidth(win, 1440);
    const dd = win.document.querySelector('.nav__dd')!;
    dd.dispatchEvent(new win.MouseEvent('mouseenter'));
    expect(dd.classList.contains('show')).toBe(true);
    dd.dispatchEvent(new win.MouseEvent('mouseleave'));
    expect(dd.classList.contains('show')).toBe(false);
  });

  it('desktop: the trigger click navigates — no preventDefault, no empty cream bar', () => {
    const win = domOf().window as Win;
    setWidth(win, 1440);
    const dd = win.document.querySelector('.nav__dd')!;
    const trigger = win.document.querySelector('.nav__dd-trigger')!;
    // prove the layer is live before asserting the click's default is kept
    dd.dispatchEvent(new win.MouseEvent('mouseenter'));
    expect(dd.classList.contains('show')).toBe(true);
    const ev = clickIn(win, trigger);
    expect(ev.defaultPrevented).toBe(false);
    expect(dd.classList.contains('show')).toBe(true); // the nav click left the hover state alone
  });

  it('mobile: a tap toggles .show and suppresses the link; an outside click closes it', () => {
    const win = domOf().window as Win;
    setWidth(win, 390);
    const doc = win.document;
    const dd = doc.querySelector('.nav__dd')!;
    const trigger = doc.querySelector('.nav__dd-trigger')!;
    expect(clickIn(win, trigger).defaultPrevented).toBe(true);
    expect(dd.classList.contains('show')).toBe(true);
    clickIn(win, trigger);
    expect(dd.classList.contains('show')).toBe(false);
    clickIn(win, trigger);
    expect(dd.classList.contains('show')).toBe(true);
    clickIn(win, doc.querySelector('.nav__menu-button')!);
    expect(dd.classList.contains('show')).toBe(false);
  });

  it('mobile: the hamburger takes over — .header__bg.is-open and the list reveals', () => {
    const win = domOf().window as Win;
    setWidth(win, 390);
    const doc = win.document;
    const button = doc.querySelector('.nav__menu-button')!;
    const bg = doc.querySelector('.header__bg')!;
    const list = doc.querySelector('.nav__menu-list') as HTMLElement;
    clickIn(win, button);
    expect(bg.classList.contains('is-open')).toBe(true);
    expect(button.classList.contains('is-open')).toBe(true);
    expect(list.style.display).toBe('block');
    expect(list.style.opacity).toBe('1');
    clickIn(win, button);
    expect(bg.classList.contains('is-open')).toBe(false);
    expect(button.classList.contains('is-open')).toBe(false);
  });

  it('mobile: the back link returns to the menu root', async () => {
    const win = domOf().window as Win;
    setWidth(win, 390);
    const doc = win.document;
    clickIn(win, doc.querySelector('.nav__dd-trigger')!);
    expect(doc.querySelector('.nav__dd')!.classList.contains('show')).toBe(true);
    clickIn(win, doc.querySelector('.nav_back-link')!);
    await new Promise((r) => setTimeout(r, 25));
    expect(doc.querySelector('.nav__dd')!.classList.contains('show')).toBe(false);
  });

  it('resize clears every open mega-menu', () => {
    const win = domOf().window as Win;
    setWidth(win, 390);
    const doc = win.document;
    clickIn(win, doc.querySelector('.nav__dd-trigger')!);
    expect(doc.querySelector('.nav__dd')!.classList.contains('show')).toBe(true);
    win.dispatchEvent(new win.Event('resize'));
    expect(doc.querySelector('.nav__dd')!.classList.contains('show')).toBe(false);
  });

  it('resize into the desktop layout closes the mobile take-over', () => {
    const win = domOf().window as Win;
    setWidth(win, 390);
    const doc = win.document;
    const button = doc.querySelector('.nav__menu-button')!;
    const bg = doc.querySelector('.header__bg')!;
    const list = doc.querySelector('.nav__menu-list') as HTMLElement;
    clickIn(win, button);
    expect(bg.classList.contains('is-open')).toBe(true);
    expect(list.style.display).toBe('block');
    setWidth(win, 1440);
    win.dispatchEvent(new win.Event('resize'));
    expect(bg.classList.contains('is-open')).toBe(false);
    expect(button.classList.contains('is-open')).toBe(false);
    expect(list.style.display).toBe('');
  });

  it('reduced motion: the take-over is instant and no transition class is added', () => {
    const win = domOf(true).window as Win;
    setWidth(win, 390);
    const header = win.document.getElementById('header')!;
    const list = win.document.querySelector('.nav__menu-list') as HTMLElement;
    clickIn(win, win.document.querySelector('.nav__menu-button')!);
    expect(list.style.display).toBe('block');
    expect(list.style.opacity).toBe('');
    expect(header.classList.contains('fpn-motion')).toBe(false);
  });

  it('reduced motion cancels the header transitions the corrected capture carries', () => {
    // The corrected Capture's stylesheet is injected verbatim (ticket 15) and
    // keeps the live header transitions; the authored half has to cancel the
    // header's own ones, or the morph still animates for a reduced-motion
    // reader. jsdom does not evaluate media queries, so this checks the
    // stylesheet's shape, not a computed style: the selector SET, independent
    // of order, so a pure reordering of the block is not a test failure.
    expect(NAV_CSS).toContain('transition: none !important');
    const selectors = reducedMotionCssSelectors(NAV_CSS);
    for (const sel of [
      '.header-z',
      '.header__bg',
      '.nav__dd_arrow',
      '.nav__dd-product-image-wr',
      '.nav__dd-product-bg',
      '.nav__dd-product-all',
      '.nav__menu-button .nav-line',
    ]) {
      expect(selectors).toContain(sel);
    }
  });

  it('is inert when the page carries no shared header', () => {
    const seam = seamWindow('nav', '<!DOCTYPE html><html><body><p>no header</p></body></html>', { install: false });
    expect(() => seam.install()).not.toThrow();
  });
});
