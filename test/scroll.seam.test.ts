// Scroll choreography + modal DOM seam (ticket 21): the captured page's
// JS-driven behavior restored in vanilla JS — `[animate="scrub-word"]` colors,
// `.line-label` reveal, `[data-scroll-video]` play/pause, and the
// `dialog.c-modal` open/close with its route draw and markers. The runtime
// under test is the exact source the build injects inline
// (pipeline/scroll-runtime.js), evaluated in a real DOM (jsdom). jsdom has no
// layout, so geometry is stubbed per element to the real page's relationship.
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { installDomGeometryShims, seamWindow } from './seam-harness';

const PAGE = `<!DOCTYPE html><html><head></head><body>
<h2 animate=scrub-word><span class="gsap_split_word gsap_split_word1" style="position:relative;display:inline-block">Detect</span></h2>
<div class=line-label style="translate:none;rotate:none;scale:none;transform:translate3d(0px,0px,0px) scale(1,1)"><img class=line-label--marker style="translate:none;rotate:none;scale:none;transform:translate(0px,0%)"></div>
<video data-scroll-video muted playsinline></video>
<div id=stickme-parent><div id=stickme><a data-c-modal-open=detect href=# class=btn>see it in action</a></div></div>
<svg viewBox="0 0 10 100"><path class=main-line d="M0 0L0 100"></path><path id=main-progress d="M0 0L0 100"></path></svg>
<dialog class=c-modal data-c-modal=detect>
  <div class=c-modal__overlay>
    <a c-modal-close href=# class=c-modal__close></a>
    <div c-modal-close class=c-modal__backdrop></div>
    <div c-modal-scroll class="l-layout_z l-stack c-modal__panel">
      <div class=sub-line></div>
      <svg viewBox="0 0 100 100"><path id=route-progress d="M0 0L100 100"></path><circle class=marker data-stop=e2 data-offset=10 cx=0 cy=0 r=1></circle></svg>
      <article class="l-grid_zz timeline-event"><aside id=e2></aside></article>
    </div>
  </div>
</dialog>
</body></html>`;

type Win = DOMWindow & { document: Document };
type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number; x: number; y: number };
const rect = (top: number, height = 100): Rect => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top });

function domOf(html: string, opts: { reduced?: boolean; prep?: (doc: Document) => void } = {}) {
  return seamWindow('scroll', html, {
    reduced: opts.reduced,
    prep: (window) => {
      installDomGeometryShims(window.document);
      if (opts.prep) opts.prep(window.document);
    },
  });
}

function setRect(el: Element | null, r: Rect): void {
  if (!el) throw new Error('setRect: missing element');
  (el as unknown as { getBoundingClientRect: () => Rect }).getBoundingClientRect = () => r;
}

function fire(window: DOMWindow, type: string): void {
  const Event = (window as unknown as { Event: new (t: string) => Event }).Event;
  window.dispatchEvent(new Event(type));
}

function clickIn(window: DOMWindow, el: Element): void {
  const MouseEvent = (window as unknown as { MouseEvent: new (t: string, init: MouseEventInit) => MouseEvent }).MouseEvent;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const bare = (color: string) => color.replace(/\s+/g, '');

describe('the scroll gate', () => {
  it('adds fpm-scroll (the gate every scroll.css rule hangs on) and no-ops without the markup', () => {
    const dom = domOf('<html><body><p>plain page</p></body></html>');
    expect(dom.window.document.documentElement.className).toContain('fpm-scroll');
  });

  it('reduced motion keeps function but leaves the decoration at the build end-state', () => {
    const dom = domOf(PAGE, { reduced: true });
    const doc = (dom.window as Win).document;
    // decoration untouched — the build's normalized end-state stands
    expect((doc.querySelector('.gsap_split_word') as HTMLElement).style.color).toBe('');
    // ...but the modal still opens (reduced motion never blocks function)
    clickIn(dom.window, doc.querySelector('[data-c-modal-open=detect]')!);
    expect(doc.querySelector('dialog.c-modal')!.hasAttribute('open')).toBe(true);
    expect(doc.body.classList.contains('fps-modal-open')).toBe(true);
  });

  it('reads the query once, at boot, and never observes it changing', () => {
    const dom = domOf(PAGE);
    expect(dom.reducedMotion.reads()).toBe(1);
    expect(dom.reducedMotion.listeners()).toBe(0);
    // a change mid-session reaches neither the read nor a listener
    dom.reducedMotion.set(true);
    dom.reducedMotion.change();
    expect(dom.reducedMotion.reads()).toBe(1);
  });
});

describe('[animate="scrub-word"] colors (IX2 t-67b5deff)', () => {
  it('starts at the captured dark from-state, plays to the light end-state, and reverses', async () => {
    const dom = domOf(PAGE, { prep: (doc) => setRect(doc.querySelector('h2'), rect(2000)) });
    const doc = (dom.window as Win).document;
    const word = doc.querySelector('.gsap_split_word') as HTMLElement;
    // below the fold at load → the from-state is applied
    expect(bare(word.style.color)).toBe('rgb(34,40,31)');
    // scroll it into view → play to the near-white end-state
    setRect(doc.querySelector('h2'), rect(100));
    fire(dom.window, 'scroll');
    await sleep(700);
    expect(bare(word.style.color)).toBe('rgb(236,239,235)');
    // scroll back past the start → reverse to dark
    setRect(doc.querySelector('h2'), rect(2000));
    fire(dom.window, 'scroll');
    await sleep(700);
    expect(bare(word.style.color)).toBe('rgb(34,40,31)');
  });
});

describe('.line-label reveal (IX2 t-4e5bbe4b)', () => {
  it('reveals scale(0)->(1) and slides the marker 170%->0 on scroll-in', async () => {
    const dom = domOf(PAGE, { prep: (doc) => setRect(doc.querySelector('.line-label'), rect(2000)) });
    const doc = (dom.window as Win).document;
    const label = doc.querySelector('.line-label') as HTMLElement;
    const marker = doc.querySelector('.line-label--marker') as HTMLElement;
    expect(label.style.transform).toContain('scale(0,0)');
    expect(marker.style.transform).toContain('170%');
    setRect(doc.querySelector('.line-label'), rect(100));
    fire(dom.window, 'scroll');
    await sleep(350);
    expect(label.style.transform).toContain('scale(1,1)');
    expect(marker.style.transform).toContain('translate(0,0%)');
  });
});

describe('[data-scroll-video]', () => {
  it('plays a video in view and pauses it out of view', async () => {
    let played = 0;
    let paused = 0;
    const dom = domOf(PAGE, {
      prep: (doc) => {
        const v = doc.querySelector('video') as HTMLVideoElement;
        let isPaused = true;
        // jsdom media elements never actually play; model paused so the runtime
        // (which keys off it) sees a real transition.
        Object.defineProperty(v, 'paused', { get: () => isPaused, configurable: true });
        (v as unknown as { play: () => Promise<void> }).play = () => { played += 1; isPaused = false; return Promise.resolve(); };
        (v as unknown as { pause: () => void }).pause = () => { paused += 1; isPaused = true; };
        setRect(v, rect(100, 200));
      },
    });
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(played).toBeGreaterThan(0);
    setRect((dom.window as Win).document.querySelector('video'), rect(5000, 200));
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(paused).toBeGreaterThan(0);
  });
});

describe('#stickme stays in flow', () => {
  // The button is not pinned anywhere. The live page's own sticky script runs
  // inline before #stickme exists in the DOM, so its `stick('#stickme')` call
  // throws at parse time and the listener never attaches — the button keeps its
  // captured absolute position under the intro paragraph. Review rejected the
  // pin this runtime used to add, so the seam now only guards that the runtime
  // leaves the element alone.
  it('never gains a pin, even with its parent on screen', async () => {
    const dom = domOf(PAGE, {
      // the case that used to pin: the parent's top crosses the viewport bottom
      prep: (doc) => setRect(doc.getElementById('stickme-parent'), rect(0, 5_000)),
    });
    const win = dom.window as Win;
    const stick = win.document.getElementById('stickme')!;
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(stick.classList.contains('stick')).toBe(false);
    expect(stick.classList.contains('stick--is-stuck')).toBe(false);
    expect(stick.style.position).toBe('');
    expect(stick.style.top).toBe('');
    expect(stick.style.bottom).toBe('');
  });
});

describe('dialog.c-modal open / close', () => {
  it('opens on its data-c-modal-open trigger, locks body scroll, and closes on [c-modal-close]', async () => {
    const dom = domOf(PAGE);
    const doc = (dom.window as Win).document;
    const dialog = doc.querySelector('dialog.c-modal') as HTMLDialogElement;
    clickIn(dom.window, doc.querySelector('[data-c-modal-open=detect]')!);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(doc.body.classList.contains('fps-modal-open')).toBe(true);
    await sleep(350);
    clickIn(dom.window, doc.querySelector('[c-modal-close]')!);
    await sleep(400);
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(doc.body.classList.contains('fps-modal-open')).toBe(false);
  });
});

describe('modal route draw + markers (live inline #25)', () => {
  it('arms the path on open and places each marker along it opposite its event', () => {
    const dom = domOf(PAGE, {
      prep: (doc) => {
        setRect(doc.querySelector('.sub-line'), rect(0, 400));
        setRect(doc.querySelector('#e2'), rect(400, 20));
        setRect(doc.querySelector('[c-modal-scroll]'), rect(0, 500));
      },
    });
    const doc = (dom.window as Win).document;
    const path = doc.getElementById('route-progress') as unknown as SVGPathElement;
    const marker = doc.querySelector('.marker') as SVGElement;
    clickIn(dom.window, doc.querySelector('[data-c-modal-open=detect]')!);
    expect(path.style.strokeDasharray).toBe('100');
    // trigger progress 1.0 (400/400) + data-offset 10, clamped to length-1 → 99
    expect(Number(marker.getAttribute('cx'))).toBeCloseTo(99, 5);
    expect(Number(marker.getAttribute('cy'))).toBeCloseTo(99, 5);
    // the marker pop-in from-state starts hidden (its event is below the fold)
    expect(marker.style.transform).toBe('scale(0)');
  });
});
