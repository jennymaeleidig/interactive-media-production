// Motion runtime DOM seam (the motion DOM seam, added to the spec's Testing
// Decisions at ticket 04): the reveal contract — the runtime adds
// html.fpm-motion only when reduced motion allows, re-fires the hero split's
// captured visibility class, and one-shot-reveals the annotated patterns.
// Reduced motion (and, by construction, no-JS) leaves the page at the
// captured static end-state.
// The runtime under test is the exact source the build injects inline
// (pipeline/motion-runtime.js), evaluated in a real DOM (jsdom) — the same
// bytes every served page carries. Ticket 04.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, type DOMWindow } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, '../pipeline/motion-runtime.js'), 'utf8');

const PAGE = `<!DOCTYPE html><html><body>
<h1 data-split-title class="is-split is-visible"><span class=title-word>Safer</span></h1>
<h2 data-split-gsap=words><div class=word>Public</div><div class=word>safety</div></h2>
<div data-animation-gsap=fade-in-2>cards</div>
<div data-animation-gsap=image-clip>clip</div>
<div data-fpm-reveal>generic</div>
</body></html>`;

/** Eval the injected source into a jsdom window (post-parse, as an inline body script observes it). */
function install(window: DOMWindow): void {
  (window as unknown as { eval: (src: string) => void }).eval(SOURCE);
}

function domOf(html: string, opts: { reduced?: boolean } = {}) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://recreation.test/' });
  if (opts.reduced) {
    // stub before the runtime reads it once at eval time
    (dom.window as unknown as { matchMedia: () => unknown }).matchMedia = () => ({ matches: true });
  }
  install(dom.window);
  return dom;
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
    for (const sel of ['[data-split-gsap]', '[data-animation-gsap=fade-in-2]', '[data-animation-gsap=image-clip]', '[data-fpm-reveal]']) {
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
    expect(doc.querySelector('[data-split-title]')!.classList.contains('is-visible')).toBe(true);
  });
});

describe('the runtime keeps the zero-outbound invariants', () => {
  it('references no network primitive — DOM class/attribute surgery only', () => {
    expect(SOURCE).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|\bimport\s*\(/);
  });
});
