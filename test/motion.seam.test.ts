// Motion runtime DOM seam (added to the seam harness's Testing
// roster): the reveal contract — the runtime adds
// html.fpm-motion only when reduced motion allows, re-fires the hero split's
// captured visibility class, and one-shot-reveals the annotated patterns.
// Reduced motion (and, by construction, no-JS) leaves the page at the
// captured static end-state.
// The runtime under test is the exact source the build injects inline
// (pipeline/motion-runtime.js), evaluated in a real DOM (jsdom) — the same
// bytes every served page carries. The motion layer.
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { layerSource, seamWindow } from './seam-harness';
import { isInertSource } from '../pipeline/injected-source.mjs';

const SOURCE = layerSource('motion');
const MOTION_CSS = layerSource('motion', 'css');

const PAGE = `<!DOCTYPE html><html><body>
<h1 data-split-title class="is-split is-visible"><span class=title-word>Safer</span></h1>
<h2 data-split-gsap=words><div class=word>Public</div><div class=word>safety</div></h2>
<div data-animation-gsap=fade-in-2>cards</div>
<div data-animation-gsap=image-clip>clip</div>
<div data-fpm-reveal>generic</div>
<div class=alpha-media__stage><div class=alpha-media__item>frame</div></div>
</body></html>`;

function domOf(html: string, opts: { reduced?: boolean } = {}) {
  return seamWindow('motion', html, { reduced: opts.reduced });
}

/** Resolve after two animation frames — the hero re-adds is-visible on a double rAF. */
async function afterTwoFrames(window: DOMWindow): Promise<void> {
  await new Promise<void>((resolve) => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames >= 3) resolve();
      else window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

describe('the runtime arms the motion layer only when reduced motion allows', () => {
  it('adds html.fpm-motion and one-shot-reveals every annotated target when IO is unavailable', () => {
    const dom = domOf(PAGE);
    const doc = dom.window.document;
    expect(doc.documentElement.classList.contains('fpm-motion')).toBe(true);
    // no IntersectionObserver in jsdom — the fallback releases every from-state
    // so the page still lands on its static end-state
    for (const sel of ['[data-split-gsap]', '[data-animation-gsap=fade-in-2]', '[data-animation-gsap=image-clip]', '[data-fpm-reveal]', '.alpha-media__stage']) {
      expect(doc.querySelector(sel)!.classList.contains('fpm-in'), sel).toBe(true);
    }
  });

  it('re-fires the hero visibility class: removes it now, restores it after a double rAF', async () => {
    const dom = domOf(PAGE);
    const doc = dom.window.document;
    const hero = doc.querySelector('[data-split-title]')!;
    expect(hero.classList.contains('is-visible')).toBe(false); // from-state armed synchronously
    await afterTwoFrames(dom.window);
    expect(hero.classList.contains('is-visible')).toBe(true); // captured transition CSS plays it verbatim
  });

  it('with reduced motion requested: no motion class, no reveals, hero left at its captured end-state', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = dom.window.document;
    expect(doc.documentElement.classList.contains('fpm-motion')).toBe(false);
    expect(doc.querySelector('[data-split-gsap]')!.classList.contains('fpm-in')).toBe(false);
    expect(doc.querySelector('[data-fpm-reveal]')!.classList.contains('fpm-in')).toBe(false);
    expect(doc.querySelector('.alpha-media__stage')!.classList.contains('fpm-in')).toBe(false);
    expect(doc.querySelector('[data-split-title]')!.classList.contains('is-visible')).toBe(true);
  });

  it('lands the alpha-media end-state and gates its from-state on fpm-motion', () => {
    // the captured stylesheet keeps the from-state as a plain rule, so the
    // authored half has to land scale(1) ungated and re-arm scale(.5)/scale(2)
    // only under html.fpm-motion — the /products/flock-dfr width fix.
    expect(MOTION_CSS).toContain('.alpha-media__stage');
    expect(MOTION_CSS).toContain('transform: none');
    expect(MOTION_CSS).toContain('html.fpm-motion .alpha-media__stage:not(.fpm-in)');
    expect(MOTION_CSS).toContain('transform: scale(2)');
  });

  it('reads the query once, at boot: a change afterwards cannot reach it', () => {
    const dom = domOf(PAGE);
    expect(dom.reducedMotion.reads()).toBe(1);
    expect(dom.window.document.documentElement.classList.contains('fpm-motion')).toBe(true);
    // the layer has already booted, so flipping the query re-reads nothing
    dom.reducedMotion.set(true);
    expect(dom.reducedMotion.reads()).toBe(1);
  });

  it('never observes the query for changes', () => {
    expect(domOf(PAGE).reducedMotion.listeners()).toBe(0);
  });
});

describe('the runtime keeps the zero-outbound invariants', () => {
  it('references no network primitive — DOM class/attribute surgery only', () => {
    expect(isInertSource(SOURCE)).toBe(true);
  });
});
