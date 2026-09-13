// The composed-window seam (spec, Testing Decisions seam #7). Every served page
// carries all six site-wide injected layers, and one carries a seventh; they
// share a single document, and until this seam nothing put two of them in one
// window. Their overlaps are not documented anywhere else:
//
//   * four document-level click listeners, whose registration order decides who
//     sees an already-prevented click (page script order is the only thing
//     holding it: nav registers on DOMContentLoaded, so it lands last even
//     though its script sits third)
//   * the <html> class space, which the Capture already filled with
//     `w-mod-js`/`wf-*` classes — a layer that assigned instead of appended
//     would wipe the capture, and nothing would notice
//   * the dialog the scroll layer owns, and the body lock it takes
//   * the interaction layer's `defaultPrevented` guard, which is how a handler
//     earlier in the bubble path keeps its click
//
// The window is the committed `served/safe-cities.html` itself — the only page
// carrying all seven marked members and the only one with a `<dialog>` — with the
// marked layers' bytes installed in the order the page names them. jsdom loads no
// external resource, so the page's own `src`-referenced scripts are inert and the
// bytes come from `pipeline/` through the harness; that the two agree is
// `test/injected-layers.test.ts`'s assertion, not this one.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole, type DOMWindow } from 'jsdom';
import {
  SEAM_URL,
  installDomGeometryShims,
  installReducedMotion,
  installRuntime,
  layerSource,
  releaseDomReady,
} from './seam-harness';
import { LAYERS as ROSTER, markedMembers } from '../pipeline/injected-layers.mjs';

const PAGE = readFileSync('served/safe-cities.html', 'utf8');

/** Every marked member the page names, in page order — the page's whole roster. */
const LAYERS: string[] = [...new Set(markedMembers(PAGE).map((m: { name: string }) => m.name))];

/**
 * The members whose bytes are scripts — the ones a window has to evaluate. The
 * rest (the asset-backed stylesheets, the inline `scroll` style, the 67-byte
 * `legibility` patch) are already in the page, as the marked tags the tree ships.
 */
const SCRIPT_LAYERS: string[] = LAYERS.filter((layer) =>
  markedMembers(PAGE).some((m: { name: string; kind: string }) => m.name === layer && m.kind === 'js'),
);

interface Composed {
  window: DOMWindow;
  document: Document;
  /** The document-level click listeners the layers registered, attributed and in order. */
  clickListeners: string[];
  /** Uncaught script errors while composing (stylesheets jsdom cannot parse are not script errors). */
  errors: string[];
}

/**
 * The composed window: the real page, with each marked layer's runtime bytes
 * evaluated in the page's own order, then DOMContentLoaded released so the layers
 * that defer (nav) register the way they do on a real visit.
 */
function composed(): Composed {
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (err: Error) => {
    if (!/Could not parse CSS stylesheet/.test(err.message)) errors.push(err.message);
  });
  const dom = new JSDOM(PAGE, { runScripts: 'dangerously', pretendToBeVisual: true, url: SEAM_URL, virtualConsole: vc });
  const win = dom.window as DOMWindow;
  installReducedMotion(win, false);
  installDomGeometryShims(win.document);

  // attribute every document-level click listener to the layer that registered it
  const clickListeners: string[] = [];
  let installing = '';
  const listen = win.document.addEventListener.bind(win.document);
  (win.document as unknown as { addEventListener: (type: string, fn: unknown, opts?: unknown) => void }).addEventListener = (
    type: string,
    fn: unknown,
    opts?: unknown,
  ) => {
    if (type === 'click') clickListeners.push(installing);
    listen(type as never, fn as never, opts as never);
  };

  for (const layer of SCRIPT_LAYERS) {
    installing = layer;
    installRuntime(win, layerSource(layer));
  }
  // nav defers its document listeners to DOMContentLoaded, so it registers last
  // even though its script is third in the page — attribute them while it runs
  installing = 'nav';
  releaseDomReady(win);
  return { window: win, document: win.document, clickListeners, errors };
}

/** Click like a visitor: bubbling, cancelable, primary button, same window. */
function click(window: DOMWindow, el: Element): boolean {
  const MouseEventCtor = (window as unknown as { MouseEvent: new (t: string, init: MouseEventInit) => MouseEvent }).MouseEvent;
  return el.dispatchEvent(new MouseEventCtor('click', { bubbles: true, cancelable: true, button: 0 }));
}

/** The script layers' sources, by name, for the ownership assertions below. */
const sourceOf = Object.fromEntries(SCRIPT_LAYERS.map((layer) => [layer, layerSource(layer)])) as Record<string, string>;

/** The script layers whose bytes name a token — CSS cannot claim a click. */
const claimers = (token: string) => SCRIPT_LAYERS.filter((layer) => sourceOf[layer].includes(token));

describe('all seven marked members in one window', () => {
  it('installs every layer the page names, without an uncaught error', () => {
    const { document, errors } = composed();
    // the page's own order is the roster's — one declaration, checked against the artifact
    expect(LAYERS).toEqual(ROSTER.map((l: { name: string }) => l.name));
    expect(LAYERS).toHaveLength(7);
    // the two layers that write a class on <html> both got there
    expect(document.documentElement.classList.contains('fpm-motion')).toBe(true);
    expect(document.documentElement.classList.contains('fpm-scroll')).toBe(true);
    expect(errors).toEqual([]);
  });
});

describe('the <html> class space', () => {
  it('keeps the Capture’s own classes through both layers’ writes', () => {
    const { document } = composed();
    const classes = [...document.documentElement.classList];
    // the page arrives with these; a layer that assigned instead of appending
    // would have wiped them
    expect(classes).toContain('w-mod-js');
    expect(classes.some((c) => c.startsWith('wf-'))).toBe(true);
  });

  it('gives each class exactly one writing layer', () => {
    // one class per owner: a second writer is a collision, and the seam below
    // would not catch it (both writes would still land)
    expect(claimers('fpm-motion')).toEqual(['motion']);
    expect(claimers('fpm-scroll')).toEqual(['scroll']);
    expect(claimers('fpn-motion')).toEqual(['nav']);
  });
});

describe('the document click listeners', () => {
  it('registers in the page’s script order, with nav last because it defers', () => {
    expect(composed().clickListeners).toEqual(['interactions', 'scroll', 'nav', 'nav']);
  });
});

describe('the dialog the scroll layer owns', () => {
  it('is claimed by exactly one layer', () => {
    expect(claimers('data-c-modal-open')).toEqual(['scroll']);
    expect(claimers('fps-modal-open')).toEqual(['scroll']);
  });

  it('opens on its trigger once the whole window is composed', () => {
    const { window: win, document } = composed();
    const trigger = document.querySelector('[data-c-modal-open="detect"]')!;
    const dialog = document.querySelector('dialog.c-modal')!;
    expect(dialog.hasAttribute('open')).toBe(false);

    click(win, trigger);

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(document.body.classList.contains('fps-modal-open')).toBe(true);
  });
});

describe('the interaction layer’s defaultPrevented guard', () => {
  it('defers to an element-level handler that ran earlier in the bubble path', () => {
    const { window: win, document } = composed();
    const toggle = document.querySelector('.w-dropdown-toggle')!;
    // the family keys on captured classes: `w--open` lands on the toggle and the list
    const isOpen = () => toggle.classList.contains('w--open');
    expect(isOpen()).toBe(false);

    // an element-level handler: the document listener sees the click only after
    // this has cancelled it
    const blocker = (e: Event) => e.preventDefault();
    toggle.addEventListener('click', blocker);
    click(win, toggle);
    expect(isOpen(), 'the click was cancelled, so interactions must not act').toBe(false);

    // and it does act when nothing cancels it — the guard is not swallowing clicks
    toggle.removeEventListener('click', blocker);
    click(win, toggle);
    expect(isOpen(), 'unblocked, the dropdown family handles the click').toBe(true);
  });
});
