// Lottie hero runtime DOM seam: each page-scoped Lottie runtime mounts its own
// container with the neutered player and the vendored animation data, and drops
// the captured `data-src` the player would otherwise fetch.
//
// The runtime under test is the exact source the publisher ships
// (`pipeline/lottie/<name>.runtime.js`), evaluated in a real DOM (jsdom). The
// smallest hero stands in for all six: they share one neuter and one mount
// policy and differ only in the JSON they inline.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { layerSource, releaseDomReady, seamWindow } from './seam-harness';
import { isInertSource } from '../pipeline/injected-source.mjs';

const LAYER = 'lottie-flock-dfr';
const SOURCE = layerSource(LAYER);

/** The captured container: unquoted attributes, the stamp inside a remote `data-src`. */
const PAGE = [
  '<!DOCTYPE html><html><body>',
  '<div class=l-img><div class=cc-dfr data-animation-type=lottie',
  ' data-src=https://cdn.prod.website-files.com/6821cc9ecc966b7f252b372e/697aa404c8693265548d6485_46eaf6ace16345d0a3c77a77b862a440.json',
  ' data-loop=1 data-autoplay=0 data-renderer=svg data-loading=eager></div></div>',
  '</body></html>',
].join('');

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

/** Mount the runtime into `html`, as a served page does. */
function mount(html: string, reduced = true) {
  const seam = seamWindow(LAYER, html, { reduced, captureConsole: true, prep: shimRendering });
  releaseDomReady(seam.window);
  return seam;
}

describe('the Lottie runtime mounts its own container', () => {
  it('plays the vendored animation into an svg and drops the network-bearing data-src', () => {
    const seam = mount(PAGE);
    const container = seam.document.querySelector('[data-animation-type=lottie]')!;
    // the captured attribute is the address the player would fetch from; it must go
    expect(container.getAttribute('data-src')).toBe(null);
    // the player is the runtime's own copy, not a captured global
    expect(typeof (seam.window as unknown as { lottie?: unknown }).lottie).toBe('object');
    // the mount rendered the animation: the svg renderer's tree is in the container
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path, rect, circle, g').length).toBeGreaterThan(0);
  });

  it('takes the only container when the page carries exactly one, stamp or not', () => {
    const seam = mount('<!DOCTYPE html><html><body><div data-animation-type=lottie data-src=/other.json></div></body></html>');
    expect(seam.document.querySelector('[data-animation-type=lottie] svg')).not.toBeNull();
  });

  it('touches a page with no lottie container not at all', () => {
    const seam = mount('<!DOCTYPE html><html><body><p>no hero</p></body></html>');
    expect(seam.document.querySelector('svg')).toBeNull();
  });

  it('reads the reduced-motion query once, at boot, and never watches it', () => {
    const seam = mount(PAGE);
    expect(seam.reducedMotion.reads()).toBe(1);
    expect(seam.reducedMotion.listeners()).toBe(0);
    seam.reducedMotion.set(false);
    expect(seam.reducedMotion.reads()).toBe(1);
  });
});

describe('the Lottie runtime keeps the zero-outbound invariant', () => {
  it('ships no network primitive, and inlines the animation instead of fetching it', () => {
    expect(isInertSource(SOURCE)).toBe(true);
    // the served bytes must not carry the CDN address the capture pointed at
    expect(SOURCE).not.toContain('cdn.prod.website-files.com');
    expect(SOURCE).toContain('data-animation-type=lottie');
  });
});
