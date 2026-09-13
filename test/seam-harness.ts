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
import { LAYERS as ROSTER } from '../pipeline/injected-layers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The Recreation origin every seam window shares (chat overrides to localhost). */
export const SEAM_URL = 'https://recreation.test/';

/**
 * How each injected layer reads `prefers-reduced-motion`. Three read the query
 * once, at boot, and are blind to a change afterwards; the interaction layer
 * reads it fresh at each use, so a change must reach it; the two that never
 * animate do not read it at all. This is a contract, not a note: every seam
 * asserts its own layer's policy through the counter below, so a layer that
 * starts reading the query somewhere new fails its own seam — and a seventh
 * layer cannot be added without declaring one.
 */
export type ReducedPolicy = 'read-once' | 'read-fresh' | 'none';

/**
 * How each layer reads `prefers-reduced-motion` — the one fact about a layer the
 * harness owns. The source files are derived below from the roster
 * (`pipeline/injected-layers.mjs` names every maintained path), so a layer's
 * file is written down in exactly one place and this table carries only policy.
 */
const REDUCED: Record<string, ReducedPolicy> = {
  motion: 'read-once',
  interactions: 'read-fresh',
  nav: 'read-once',
  chat: 'none',
  'story-hook': 'none',
  scroll: 'read-once',
};

/** The roster, narrowed to the fields this harness reads. */
const ROSTER_LAYERS = ROSTER as unknown as { name: string; parts: { kind: string; source?: string }[] }[];

/**
 * The injected runtimes, by layer: the source file each layer ships (the
 * basename of the roster's maintained source), and how it reads the
 * reduced-motion query. The tree in `served/` carries these bytes as
 * content-addressed assets; `pipeline/injected-layers.mjs` owns the pair, and
 * `test/injected-layers.test.ts` is where their agreement is asserted, not here.
 */
const LAYERS: Record<string, { runtime?: string; css?: string; reduced: ReducedPolicy }> = Object.fromEntries(
  Object.entries(REDUCED).map(([name, reduced]) => {
    const file = (kind: string) =>
      ROSTER_LAYERS.find((layer) => layer.name === name)
        ?.parts.find((part) => part.kind === kind)
        ?.source?.split('/')
        .pop();
    return [name, { runtime: file('js'), css: file('css'), reduced }];
  }),
);

/**
 * A layer's declared reduced-motion policy. Throws for a layer that has none, so
 * a new seam cannot quietly invent a seventh layer's behaviour.
 */
export function reducedPolicy(layer: string): ReducedPolicy {
  const policy = LAYERS[layer]?.reduced;
  if (!policy) throw new Error(`injected layer '${layer}' has no declared reduced-motion policy`);
  return policy;
}

/** Read a layer's injected bytes (runtime by default). */
export function layerSource(layer: string, kind: 'runtime' | 'css' = 'runtime'): string {
  const file = LAYERS[layer]?.[kind];
  if (file === undefined) throw new Error(`no ${kind} for injected layer '${layer}'`);
  return readFileSync(path.join(HERE, '..', 'pipeline', file), 'utf8');
}

/** Eval the injected source into a jsdom window, as an inline body script observes it. */
export function installRuntime(window: DOMWindow, source: string): void {
  (window as unknown as { eval: (src: string) => void }).eval(source);
}

/**
 * The reduced-motion answer: mutable, and counted.
 *
 * jsdom's own `matchMedia` means nothing, and the layers disagree about when they
 * read it, so the harness answers the reduce query from a flag a seam can flip at
 * any point — and counts the reads, because "once at boot" and "fresh at each
 * use" are distinguishable only through that count. A `change` subscription is
 * honoured and counted too (none of the six install one today), so a layer that
 * starts observing the query changes something deliberate.
 */
export interface ReducedMotion {
  /** Flip the answer the query gives, as the OS setting would. */
  set(reduced: boolean): void;
  /** How many times a layer has read `matches`. */
  reads(): number;
  /** How many `change` listeners a layer has installed. */
  listeners(): number;
  /** Deliver `change` to any listener — none of the six have one. */
  change(): void;
}

interface MediaQueryShape {
  readonly matches: boolean;
  media: string;
  onchange: null;
  addListener: (fn?: () => void) => void;
  removeListener: (fn?: () => void) => void;
  addEventListener: (type: string, fn?: () => void) => void;
  removeEventListener: (type: string, fn?: () => void) => void;
  dispatchEvent: () => boolean;
}

export function installReducedMotion(window: DOMWindow, reduced: boolean): ReducedMotion {
  let answer = reduced;
  let reads = 0;
  let listeners: (() => void)[] = [];
  (window as unknown as { matchMedia: (query: string) => MediaQueryShape }).matchMedia = (query: string) => {
    const isReduceQuery = query.includes('prefers-reduced-motion');
    return {
      get matches() {
        if (isReduceQuery) reads += 1;
        return isReduceQuery && answer;
      },
      media: query,
      onchange: null,
      addListener: (fn?: () => void) => {
        if (isReduceQuery && fn) listeners.push(fn);
      },
      removeListener: (fn?: () => void) => {
        if (fn) listeners = listeners.filter((l) => l !== fn);
      },
      addEventListener: (type: string, fn?: () => void) => {
        if (isReduceQuery && type === 'change' && fn) listeners.push(fn);
      },
      removeEventListener: (type: string, fn?: () => void) => {
        if (fn) listeners = listeners.filter((l) => l !== fn);
      },
      dispatchEvent: () => false,
    };
  };
  return {
    set: (next: boolean) => {
      answer = next;
    },
    reads: () => reads,
    listeners: () => listeners.length,
    change: () => {
      for (const fn of [...listeners]) fn();
    },
  };
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
  /** The layer's reduced-motion query — flip it and read the count to pin the layer's policy. */
  reducedMotion: ReducedMotion;
}

/**
 * Build the one seam window: shared `runScripts: 'dangerously'`, shared
 * `matchMedia`, the layer's own runtime bytes, page HTML supplied by the test.
 */
export function seamWindow(layer: string, html: string, opts: SeamOptions = {}): SeamWindow {
  reducedPolicy(layer);
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
  const reducedMotion = installReducedMotion(dom.window, opts.reduced ?? false);
  if (opts.prep) opts.prep(dom.window);
  if (opts.install !== false) installRuntime(dom.window, source);
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    install: () => installRuntime(dom.window, source),
    debug: capture?.debug ?? [],
    reducedMotion,
  };
}
