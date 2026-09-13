// Scroll choreography + modal DOM seam (ticket 21): the captured page's
// JS-driven behavior restored in vanilla JS — `[animate="scrub-word"]` colors,
// `.line-label` reveal, `[data-scroll-video]` play/pause, `#stickme`, and the
// `dialog.c-modal` open/close with its route draw and markers. The runtime
// under test is the exact source the build injects inline
// (pipeline/scroll-runtime.js), evaluated in a real DOM (jsdom). jsdom has no
// layout, so geometry is stubbed per element to the real page's relationship.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, type DOMWindow } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, '../pipeline/scroll-runtime.js'), 'utf8');

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

function stubGeometry(doc: Document): void {
  // jsdom has no SVGGeometryElement; the runtime reads real path lengths.
  doc.querySelectorAll('path').forEach((p) => {
    (p as unknown as { getTotalLength: () => number }).getTotalLength = () => 100;
    (p as unknown as { getPointAtLength: (l: number) => { x: number; y: number } }).getPointAtLength = (l) => ({ x: l, y: l });
  });
  // jsdom does not implement <dialog>.showModal/close.
  doc.querySelectorAll('dialog').forEach((d) => {
    (d as unknown as { showModal: () => void }).showModal = function (this: Element) { this.setAttribute('open', ''); };
    (d as unknown as { close: () => void }).close = function (this: Element) { this.removeAttribute('open'); };
  });
  // jsdom's media element methods are not implemented.
  doc.querySelectorAll('video').forEach((v) => {
    (v as unknown as { play: () => Promise<void> }).play = () => Promise.resolve();
    (v as unknown as { pause: () => void }).pause = () => {};
  });
}

function install(window: DOMWindow): void {
  (window as unknown as { eval: (src: string) => void }).eval(SOURCE);
}

function domOf(html: string, opts: { reduced?: boolean; prep?: (doc: Document) => void } = {}) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://recreation.test/' });
  const doc = dom.window.document;
  stubGeometry(doc);
  if (opts.reduced) (dom.window as unknown as { matchMedia: () => unknown }).matchMedia = () => ({ matches: true });
  if (opts.prep) opts.prep(doc);
  install(dom.window);
  return dom;
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

describe('#stickme sticky button', () => {
  // The button's own rect must never drive the decision: `.stick` makes it
  // fixed, which moves that rect into viewport coordinates — measuring it makes
  // the class flip on every scroll event (the button flickers).
  it('pins once, stays pinned while its parent spans the viewport, and hands off at the parent end', async () => {
    const dom = domOf(PAGE, {
      prep: (doc) => {
        const stick = doc.getElementById('stickme')!;
        Object.defineProperty(stick, 'offsetHeight', { value: 40, configurable: true });
        setRect(stick, rect(10_000));
        setRect(doc.getElementById('stickme-parent'), rect(9_000, 5_000));
      },
    });
    const win = dom.window as Win;
    const stick = win.document.getElementById('stickme')!;
    const parent = win.document.getElementById('stickme-parent')!;
    // at load its natural place is far below the fold
    expect(stick.classList.contains('stick')).toBe(false);

    // the section reaches the fold → pinned to the viewport bottom
    setRect(parent, rect(-1_000, 5_000));
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(stick.classList.contains('stick')).toBe(true);
    expect(stick.classList.contains('stick--is-stuck')).toBe(false);

    // now the button really is fixed at the viewport bottom: that new rect must
    // not un-pin it on the next tick
    setRect(stick, rect(win.innerHeight - 40));
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(stick.classList.contains('stick')).toBe(true);

    // the parent's end passes the fold → hand back to the parent's own bottom
    setRect(parent, rect(-4_800, 5_000));
    fire(dom.window, 'scroll');
    await sleep(50);
    expect(stick.classList.contains('stick--is-stuck')).toBe(true);
    // `.stick` stays on: the captured CSS's `.stick{top:auto}` is what keeps
    // `.stick--is-stuck`'s `top:0` from stretching the wrapper
    expect(stick.classList.contains('stick')).toBe(true);
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
