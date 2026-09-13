// Story-hook DOM seam (spec, Testing Decisions #4): the apply() contract —
// each op mutates as documented, array order honored, missing selectors
// skipped without throwing, pre-DOM calls queue until DOMContentLoaded.
// The runtime under test is the exact source the build injects inline
// (pipeline/story-hook.js), evaluated in a real DOM (jsdom) — the same bytes
// every served page carries. The runtime is dormant: these tests drive it the
// way only the Parody layer ever should (ticket 03).
import { describe, it, expect } from 'vitest';
import type { DOMWindow } from 'jsdom';
import { installRuntime, layerSource, onceReady, seamWindow } from './seam-harness';
import { isInertSource } from '../pipeline/injected-source.mjs';

const SOURCE = layerSource('story-hook');

/** The seam's public shape — `window.flockParody.apply(patches)`. */
interface Seam {
  apply: (patches: unknown) => number;
}

const PAGE = '<!DOCTYPE html><html><body></body></html>';

function flockParodyOf(window: DOMWindow): Seam {
  return (window as unknown as { flockParody: Seam }).flockParody;
}

/**
 * A jsdom window past DOM-ready with the runtime aboard — the state every
 * real visit observes (inline body scripts run while loading, then the
 * document completes; the parody layer calls apply long after).
 */
async function seamDom(html: string = PAGE) {
  const seam = seamWindow('story-hook', html, { install: false, captureConsole: true });
  await onceReady(seam.window);
  seam.install();
  return { dom: seam.dom, debug: seam.debug, seam: flockParodyOf(seam.window) };
}

describe('apply() mutates the DOM for each supported operation', () => {
  it('text replaces the element’s text content', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><h1 id="hero">Safer Together</h1></body></html>');
    const applied = seam.apply([{ selector: '#hero', text: 'Replaced headline' }]);
    expect(applied).toBe(1);
    expect(dom.window.document.querySelector('#hero')!.textContent).toBe('Replaced headline');
  });

  it('html replaces the element’s subtree', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><div id="stage"><p>old</p></div></body></html>');
    const applied = seam.apply([{ selector: '#stage', html: '<b>bold</b> tail' }]);
    expect(applied).toBe(1);
    expect(dom.window.document.querySelector('#stage')!.innerHTML).toBe('<b>bold</b> tail');
  });

  it('src sets the src attribute', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><img id="pic" src="data:image/png;base64,AAA"></body></html>');
    const applied = seam.apply([{ selector: '#pic', src: '/parody-poster.png' }]);
    expect(applied).toBe(1);
    expect(dom.window.document.querySelector('#pic')!.getAttribute('src')).toBe('/parody-poster.png');
  });

  it('style merges camelCase properties onto the inline style, preserving captured declarations', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><div id="card" style="color:blue;margin-top:4px"></div></body></html>');
    const applied = seam.apply([{ selector: '#card', style: { backgroundColor: 'red', opacity: '0.5' } }]);
    expect(applied).toBe(1);
    // read back through the attribute — jsdom canonicalizes spacing, so match
    // declarations, not byte shapes
    const style = dom.window.document.querySelector('#card')!.getAttribute('style') ?? '';
    expect(style).toMatch(/(?:^|;)\s*color:\s*blue/); // captured declaration survives the merge
    expect(style).toMatch(/margin-top:\s*4px/);
    expect(style).toMatch(/background-color:\s*red/);
    expect(style).toMatch(/opacity:\s*0\.5/);
  });
});

describe('patch order is honored', () => {
  it('a later patch can target DOM an earlier patch created', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><div id="stage"></div></body></html>');
    const applied = seam.apply([
      { selector: '#stage', html: '<p id="late">seed</p>' },
      { selector: '#late', text: 'grown' },
    ]);
    expect(applied).toBe(2);
    expect(dom.window.document.querySelector('#late')!.textContent).toBe('grown');
  });

  it('later patches win where selectors overlap', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><h1 id="hero">First</h1></body></html>');
    seam.apply([
      { selector: '#hero', text: 'Second' },
      { selector: '#hero', text: 'Third' },
    ]);
    expect(dom.window.document.querySelector('#hero')!.textContent).toBe('Third');
  });
});

describe('missing selectors are skipped, never thrown', () => {
  it('skips a missing selector with a console.debug note and still applies the rest', async () => {
    const { dom, debug, seam } = await seamDom('<!DOCTYPE html><html><body><p id="real">here</p></body></html>');
    let applied = -1;
    expect(() => {
      applied = seam.apply([
        { selector: '#does-not-exist', text: 'x' },
        { selector: '#real', text: 'mutated' },
      ]);
    }).not.toThrow();
    expect(applied).toBe(1);
    expect(dom.window.document.querySelector('#real')!.textContent).toBe('mutated');
    // the skip is reported where a parody author will look: the console
    expect(debug).toHaveLength(1);
    expect(debug[0].map(String).join(' ')).toContain('#does-not-exist');
  });

  it('never throws on a malformed list — non-array and empty both apply nothing', async () => {
    const { seam } = await seamDom();
    expect(seam.apply(undefined)).toBe(0);
    expect(seam.apply(null)).toBe(0);
    expect(seam.apply([])).toBe(0);
  });

  it('treats an undefined-valued op as absent instead of writing “undefined” into the page', async () => {
    const { dom, seam } = await seamDom('<!DOCTYPE html><html><body><p id="p">captured</p></body></html>');
    const applied = seam.apply([{ selector: '#p', text: undefined, html: undefined }]);
    expect(applied).toBe(1); // the selector resolved — the patch located its element
    expect(dom.window.document.querySelector('#p')!.textContent).toBe('captured');
  });
});

describe('the return value counts applied patches', () => {
  it('counts every patch whose selector resolved — only missing ones are lost', async () => {
    const { seam } = await seamDom('<!DOCTYPE html><html><body><i id=a></i><i id=b></i><i id=c></i></body></html>');
    const applied = seam.apply([
      { selector: '#a', text: '1' },
      { selector: '#missing', text: '2' },
      { selector: '#b', text: '3' },
      { selector: '#c', text: '4' },
    ]);
    expect(applied).toBe(3);
  });
});

describe('calls made before DOM-ready queue until DOMContentLoaded', () => {
  it('queues while the document is loading, returns 0, then applies in order at the real DOMContentLoaded', async () => {
    let readyStateAtInstall = '';
    const seam = seamWindow('story-hook', '<!DOCTYPE html><html><body><p id="q">start</p><span id="r"></span></body></html>', {
      install: false,
      captureConsole: true,
      beforeParse(window) {
        // beforeParse runs before a single tag parses — readyState is 'loading',
        // which is exactly the state an inline body script observes
        readyStateAtInstall = window.document.readyState;
        installRuntime(window, SOURCE);
        const parody = flockParodyOf(window);
        const first = parody.apply([{ selector: '#q', text: 'queued-1' }]);
        const second = parody.apply([{ selector: '#r', html: '<b>queued-2</b>' }]);
        // queued calls have applied nothing yet — and say so
        expect(first).toBe(0);
        expect(second).toBe(0);
      },
    });
    const dom = seam.dom;
    const debug = seam.debug;
    expect(readyStateAtInstall).toBe('loading');
    // not applied early — the page sat at its captured end-state
    expect(dom.window.document.querySelector('#q')!.textContent).toBe('start');
    // the real event, not a synthetic dispatch, drains the queue
    await onceReady(dom.window);
    expect(dom.window.document.querySelector('#q')!.textContent).toBe('queued-1');
    expect(dom.window.document.querySelector('#r')!.innerHTML).toBe('<b>queued-2</b>');
    expect(debug).toHaveLength(0); // both queued selectors resolved at drain time
  });
});

describe('the seam ships inert', () => {
  it('exposes exactly one new global — window.flockParody with a single apply function', async () => {
    // compare against a pristine window with identical jsdom options (the
    // runScripts mode itself adds globals like Temporal) and lifecycle
    const pristine = seamWindow('story-hook', PAGE, { install: false });
    await onceReady(pristine.window);
    const before = Object.getOwnPropertyNames(pristine.window);
    const { dom } = await seamDom();
    const added = Object.getOwnPropertyNames(dom.window).filter((n) => !before.includes(n));
    expect(added).toEqual(['flockParody']);
    expect(typeof flockParodyOf(dom.window).apply).toBe('function');
  });

  it('is dormant — installed before parsing, it mutates and logs nothing through DOMContentLoaded', async () => {
    const seam = seamWindow('story-hook', '<!DOCTYPE html><html><body><p id="q">captured</p></body></html>', {
      install: false,
      captureConsole: true,
      beforeParse(window) {
        installRuntime(window, SOURCE);
      },
    });
    await onceReady(seam.window);
    expect(seam.window.document.body.innerHTML).toBe('<p id="q">captured</p>');
    expect(seam.debug).toHaveLength(0); // nothing skipped, nothing logged — the runtime only defines the seam
  });

  it('is DOM-only — the injected source references no network primitive', () => {
    expect(isInertSource(SOURCE)).toBe(true);
  });

  it('never reads the reduced-motion query — the seam ships dormant', async () => {
    const seam = seamWindow('story-hook', PAGE, { install: false, captureConsole: true });
    await onceReady(seam.window);
    seam.install();
    expect(seam.reducedMotion.reads()).toBe(0);
    expect(seam.reducedMotion.listeners()).toBe(0);
  });
});
