// The seam harness for the chat's DOM seam.
//
// The question a DOM seam asks is "do the exact bytes the host serves behave in
// a real DOM?" — and the parts of answering it are easy to get subtly different:
// the `new JSDOM` options, the `runScripts` mode, the shape of a
// reduced-motion `matchMedia`. This module owns the window and the bytes, so the
// chat's seam drives exactly what the host serves through one setup instead of
// inventing its own.
//
// The bytes come from `pipeline/chat-assets.mjs` — the same declaration the
// asset route answers from — so the seam cannot silently test a different file
// than the one that ships.
//
// SPDX-License-Identifier: CC0-1.0
import { JSDOM, type DOMWindow } from 'jsdom';
import { assetFor, readAsset } from '../pipeline/chat-assets.mjs';

/** The shipped runtime, installed into every seam window by default. */
const RUNTIME_PATH = '/chat/runtime.js';

/** The origin a seam window gets when a test names none (chat uses localhost, for `localStorage`). */
const DEFAULT_URL = 'http://localhost/';

/**
 * One published file's maintained bytes — exactly what its path answers with.
 * Throws for a path nothing is published at, so a typo fails loudly instead of
 * mounting an empty document.
 */
export function shippedAsset(pathname: string): string {
  const asset = assetFor(pathname);
  if (asset === null) throw new Error(`nothing is published at ${JSON.stringify(pathname)}`);
  return readAsset(asset);
}

/** Eval the runtime bytes into a jsdom window, as the host's `<script src>` does. */
function installRuntime(window: DOMWindow, source: string): void {
  (window as unknown as { eval: (src: string) => void }).eval(source);
}

/**
 * The reduced-motion answer: mutable, and counted.
 *
 * jsdom's own `matchMedia` means nothing, so the harness answers the query from
 * a flag a seam can flip — and counts the reads, because "reads the query at
 * boot" and "never reads it" are distinguishable only through that count. The
 * chat's contract is the second: it has nothing to suppress.
 */
export interface ReducedMotion {
  /** Flip the answer the query gives, as the OS setting would. */
  set(reduced: boolean): void;
  /** How many times a runtime has read `matches`. */
  reads(): number;
  /** How many `change` listeners a runtime has installed. */
  listeners(): number;
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
  };
}

export interface SeamOptions {
  /** Runtime bytes to install (default the shipped runtime). */
  runtime?: string;
  /** Document URL (default localhost). */
  url?: string;
  /** Answer the prefers-reduced-motion query with `matches: true`. */
  reduced?: boolean;
  /** Run after construction, before the runtime installs — page state the test wants in place first. */
  prep?: (window: DOMWindow) => void;
}

export interface SeamWindow {
  dom: JSDOM;
  window: DOMWindow;
  document: Document;
  /** The reduced-motion query — read the count to pin the runtime's policy. */
  reducedMotion: ReducedMotion;
}

/** Build the one seam window: the page's HTML, the shipped runtime bytes, shared `matchMedia`. */
export function seamWindow(html: string, opts: SeamOptions = {}): SeamWindow {
  const source = opts.runtime ?? shippedAsset(RUNTIME_PATH);
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url ?? DEFAULT_URL,
  });
  const reducedMotion = installReducedMotion(dom.window, opts.reduced ?? false);
  if (opts.prep) opts.prep(dom.window);
  installRuntime(dom.window, source);
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    reducedMotion,
  };
}
