// Lottie hero runtime DOM seam: the six product pages carry the shared player and
// one data runtime, and between them they mount every container the page has —
// each into the box its captured `data-src` names — and drop that attribute.
//
// The runtimes under test are the exact sources the publisher ships
// (`pipeline/lottie/player.runtime.js` and `pipeline/lottie/<name>.runtime.js`),
// evaluated in a real DOM (jsdom). `flock-dfr` stands in for the six because it is
// the hardest case: it is the one page with more than one animation, so it is the
// only one that exercises the per-stamp search rather than the single-box fallback.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { installRuntime, layerSource, releaseDomReady, seamWindow } from './seam-harness';
import { codeOf } from '../pipeline/injected-layers.mjs';
import { isInertSource } from '../pipeline/injected-source.mjs';

const LAYER = 'lottie-flock-dfr';
const PLAYER = 'lottie-player';
const SOURCE = layerSource(LAYER);
const PLAYER_SOURCE = layerSource(PLAYER);

/** The asset-id stamps of the page's first two animations, as captured. */
const STAMP_1 = '697aa404c8693265548d6485_';
const STAMP_2 = '697aab5445107d5470444391_';

/** One captured container: unquoted attributes, a remote `data-src`, the stamp inside it. */
const container = (stamp: string, loop = '1') =>
  `<div class=cc-dfr data-animation-type=lottie data-src=https://cdn.prod.website-files.com/6821cc9ecc966b7f252b372e/${stamp}46eaf6ace16345d0a3c77a77b862a440.json data-loop=${loop} data-autoplay=1></div>`;

const page = (...boxes: string[]) => `<!DOCTYPE html><html><body>${boxes.join('')}</body></html>`;

/**
 * jsdom answers no layout and has no 2D canvas; lottie's svg renderer measures
 * text through both while it builds its first frame. These shims answer exactly
 * what it asks for, so the mount runs to completion here instead of throwing on
 * a missing browser API (which is the only difference from a real page).
 * @param {DOMWindow} window
 */
function shimRendering(window: DOMWindow): void {
  // a catch-all 2d context: lottie asks for a large surface while it measures
  // text, and enumerating it here would just drift with the player version
  const context = new Proxy(
    {
      canvas: { width: 0, height: 0 },
      measureText: () => ({ width: 0 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    },
    {
      get: (target, prop) => (prop in target ? Reflect.get(target, prop) : () => {}),
      set: (target, prop, value) => Reflect.set(target, prop, value),
    },
  );
  (window.HTMLCanvasElement.prototype as unknown as { getContext: (id: string) => unknown }).getContext = (id: string) =>
    id === '2d' ? context : null;
  if (window.SVGElement) {
    Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });
  }
}

/** Mount as a served page does: the player first, then the page's data runtime. */
function mount(html: string, reduced = true) {
  const seam = seamWindow(LAYER, html, { reduced, captureConsole: true, prep: shimRendering, install: false });
  installRuntime(seam.window, PLAYER_SOURCE);
  installRuntime(seam.window, SOURCE);
  releaseDomReady(seam.window);
  return seam;
}

const shapes = (root: Element) => root.querySelectorAll('path, rect, circle, g').length;

describe('the Lottie runtimes mount the page containers', () => {
  it('plays the animation into an svg and drops the network-bearing data-src', () => {
    const seam = mount(page(container(STAMP_1)));
    const box = seam.document.querySelector('[data-animation-type=lottie]')!;
    // the captured attribute is the address the player would fetch from; it must go
    expect(box.getAttribute('data-src')).toBe(null);
    expect(box.querySelector('svg')).not.toBeNull();
    expect(shapes(box)).toBeGreaterThan(0);
  });

  it('mounts every animation the page carries, each into its own stamped container', () => {
    // the flock-dfr case: the player is shared, but each animation finds its own box
    const seam = mount(page(container(STAMP_1, '0'), container(STAMP_2, '1')));
    const boxes = [...seam.document.querySelectorAll('[data-animation-type=lottie]')];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.getAttribute('data-src')).toBe(null);
      expect(box.querySelector('svg')).not.toBeNull();
      expect(shapes(box)).toBeGreaterThan(0);
    }
  });

  it('mounts nothing without the shared player', () => {
    // the data runtime needs the player's `window.lottie`; a page that lost its
    // player tag renders nothing rather than throwing
    const seam = seamWindow(LAYER, page(container(STAMP_1)), { reduced: true, prep: shimRendering, install: false });
    installRuntime(seam.window, SOURCE);
    releaseDomReady(seam.window);
    expect((seam.window as unknown as { lottie?: unknown }).lottie).toBeUndefined();
    expect(seam.document.querySelector('svg')).toBeNull();
  });

  it('touches a page with no lottie container not at all', () => {
    const seam = mount('<!DOCTYPE html><html><body><p>no hero</p></body></html>');
    expect(seam.document.querySelector('svg')).toBeNull();
  });

  it('reads the reduced-motion query once for the page, however many animations it mounts', () => {
    const seam = mount(page(container(STAMP_1), container(STAMP_2)));
    expect(seam.reducedMotion.reads()).toBe(1);
    expect(seam.reducedMotion.listeners()).toBe(0);
    seam.reducedMotion.set(false);
    expect(seam.reducedMotion.reads()).toBe(1);
  });
});

describe('the Lottie runtimes keep the zero-outbound invariant', () => {
  it('ships no network primitive, and keeps the CDN address to the citation comment', () => {
    for (const source of [SOURCE, PLAYER_SOURCE]) expect(isInertSource(source)).toBe(true);

    const host = 'cdn.prod.website-files.com';
    // the citation records where the animation came from, and nothing else names it
    expect(SOURCE).toContain(host);
    expect(codeOf(SOURCE)).not.toContain(host);

    // the animation is inlined with the stamp that finds its container, so the
    // mount never needs to resolve the captured address
    expect(SOURCE).toContain(STAMP_1);
    expect(SOURCE).toContain('data-animation-type=lottie');
    expect(SOURCE).toContain('animationData');
    // and the player is shipped once, apart from the data
    expect(PLAYER_SOURCE).toContain('lottie');
    expect(SOURCE).not.toContain(PLAYER_SOURCE);
  });
});
