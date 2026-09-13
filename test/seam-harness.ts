// The one seam harness (architecture-deepening ticket 07). Every injected
// runtime's DOM seam asks the same question — "do the exact bytes the build
// inlines behave in a real DOM?" — and every copy of that question drifted:
// six `new JSDOM` calls, two `runScripts` modes, three reduced-motion
// `matchMedia` shapes, two `virtualConsole` wirings. This module owns the
// window and the bytes so a runtime's reduced-motion behaviour is comparable
// across layers and a seventh seam never invents its own setup.
//
// The runtime bytes come from one table below — a layer's name, not a
// hand-written path repeated across six tests — so every seam drives the bytes
// the layer ships.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole, type DOMWindow } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The Recreation origin every seam window shares (chat overrides to localhost). */
export const SEAM_URL = 'https://recreation.test/';

/**
 * The injected runtimes, by layer: the source file each layer ships. The tree in
 * `served/` carries these bytes as content-addressed assets; the sources here are
 * the maintained copy, and the two agree except for a comment-only lag in the
 * chat stylesheet and the story-hook script (see test/serving.seam.test.ts).
 */
const LAYER_FILES: Record<string, { runtime?: string; css?: string }> = {
  motion: { runtime: 'motion-runtime.js', css: 'motion.css' },
  interactions: { runtime: 'interactions-runtime.js', css: 'interactions.css' },
  nav: { runtime: 'nav-runtime.js', css: 'nav.css' },
  chat: { runtime: 'chat-widget.js', css: 'chat-widget.css' },
  'story-hook': { runtime: 'story-hook.js' },
  scroll: { runtime: 'scroll-runtime.js', css: 'scroll.css' },
};

/** Read a layer's injected bytes (runtime by default). */
export function layerSource(layer: string, kind: 'runtime' | 'css' = 'runtime'): string {
  const file = LAYER_FILES[layer]?.[kind];
  if (file === undefined) throw new Error(`no ${kind} for injected layer '${layer}'`);
  return readFileSync(path.join(HERE, '..', 'pipeline', file), 'utf8');
}

/** Eval the injected source into a jsdom window, as an inline body script observes it. */
export function installRuntime(window: DOMWindow, source: string): void {
  (window as unknown as { eval: (src: string) => void }).eval(source);
}

/**
 * The one reduced-motion / media-query shape. jsdom's own `matchMedia` is
 * queried fresh at each read; this stub answers the reduce query from the
 * caller's flag and reports `matches: false` for everything else — one shape,
 * so a layer's reduced-motion path is exercised the same way in every seam.
 */
interface MediaQueryShape {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: () => void;
  removeListener: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
  dispatchEvent: () => boolean;
}

function installMatchMedia(window: DOMWindow, reduced: boolean): void {
  (window as unknown as { matchMedia: (query: string) => MediaQueryShape }).matchMedia = (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * jsdom implements neither SVGGeometryElement lengths, nor
 * `<dialog>.showModal/close`, nor media playback — the geometry a page-driven
 * runtime reads from real layout. Page-specific element geometry (rects,
 * scroll boxes) stays in the test that knows the page.
 */
export function installDomGeometryShims(doc: Document): void {
  doc.querySelectorAll('path').forEach((p) => {
    (p as unknown as { getTotalLength: () => number }).getTotalLength = () => 100;
    (p as unknown as { getPointAtLength: (l: number) => { x: number; y: number } }).getPointAtLength = (l) => ({ x: l, y: l });
  });
  doc.querySelectorAll('dialog').forEach((d) => {
    (d as unknown as { showModal: () => void }).showModal = function (this: Element) {
      this.setAttribute('open', '');
    };
    (d as unknown as { close: () => void }).close = function (this: Element) {
      this.removeAttribute('open');
    };
  });
  doc.querySelectorAll('video').forEach((v) => {
    (v as unknown as { play: () => Promise<void> }).play = () => Promise.resolve();
    (v as unknown as { pause: () => void }).pause = () => {};
  });
}

/** Resolve once the real DOMContentLoaded lifecycle event has fired. */
export function onceReady(window: DOMWindow): Promise<void> {
  return new Promise((resolve) => {
    if (window.document.readyState !== 'loading') resolve();
    else window.document.addEventListener('DOMContentLoaded', () => resolve());
  });
}

/**
 * Release a window jsdom left at readyState 'loading'. The synchronous
 * stand-in for the real lifecycle event — an inline body script observes
 * 'loading' and boots on DOMContentLoaded; jsdom defers the real event, so a
 * test that wants that boot now asks for it.
 */
export function releaseDomReady(window: DOMWindow): void {
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
}

export interface SeamConsole {
  debug: unknown[][];
  vc: VirtualConsole;
}

/** jsdom's console is per-window — capture the runtime's debug notes. */
export function captureConsole(): SeamConsole {
  const debug: unknown[][] = [];
  const vc = new VirtualConsole();
  vc.on('debug', (...args: unknown[]) => debug.push(args));
  return { debug, vc };
}

export interface SeamOptions {
  /** Document URL (default the Recreation origin). */
  url?: string;
  /** Answer the prefers-reduced-motion query with `matches: true`. */
  reduced?: boolean;
  /** Run after construction, before install — page-specific shims (timers, fetch, layout). */
  prep?: (window: DOMWindow) => void;
  /** Install the layer runtime at construction (default true); false installs later via seam.install(). */
  install?: boolean;
  /** Capture window console.debug for this window. */
  captureConsole?: boolean;
  /** Share an existing virtual console (e.g. to keep one console across windows). */
  virtualConsole?: VirtualConsole;
  /** jsdom beforeParse hook — install before a single tag parses. */
  beforeParse?: (window: DOMWindow) => void;
}

export interface SeamWindow {
  dom: JSDOM;
  window: DOMWindow;
  document: Document;
  /** Eval the layer's runtime bytes into the window (a fresh <script>, as the build inlines it). */
  install(): void;
  /** Captured console.debug argument lists (empty unless captureConsole). */
  debug: unknown[][];
}

/**
 * Build the one seam window: shared `runScripts: 'dangerously'`, shared
 * `matchMedia`, the layer's own runtime bytes, page HTML supplied by the test.
 */
export function seamWindow(layer: string, html: string, opts: SeamOptions = {}): SeamWindow {
  const source = layerSource(layer, 'runtime');
  const capture = opts.captureConsole ? captureConsole() : null;
  const vc = opts.virtualConsole ?? capture?.vc;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url ?? SEAM_URL,
    ...(vc ? { virtualConsole: vc } : {}),
    ...(opts.beforeParse ? { beforeParse: opts.beforeParse } : {}),
  });
  installMatchMedia(dom.window, opts.reduced ?? false);
  if (opts.prep) opts.prep(dom.window);
  if (opts.install !== false) installRuntime(dom.window, source);
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    install: () => installRuntime(dom.window, source),
    debug: capture?.debug ?? [],
  };
}
