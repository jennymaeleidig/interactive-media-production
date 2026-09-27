// jsdom's `localStorage` is shadowed in this Node runtime.
//
// Node exposes a global `localStorage` that is `undefined` unless the process is
// started with a storage file, and vitest's jsdom environment skips a window
// property that already exists on the global. The engine and the shell both keep
// their one session in `localStorage`, so the jsdom projects install a real
// in-memory `Storage` before any test runs. It is a standard map-backed
// implementation — the browser's own is the real one.
//
// jsdom has no `matchMedia`, and the shell reads it through framer-motion's
// `useReducedMotion` — which drives both the block-rise animation and the
// typewriter reveal (`components/chat/message.tsx`) — and through
// `prefersReducedMotion` in the dialogue hook, which lands a reply at once.
// The suite asks for reduced motion so a test can read a line the moment it
// lands, with no per-character clock to wait out. The animated path has its own
// file — `test/chat-typewriter.seam.test.tsx`, which flips this back on.
// SPDX-License-Identifier: CC0-1.0
if (typeof window !== 'undefined') {
  const media = (query: string): MediaQueryList =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  window.matchMedia = (query: string) => media(query);
}

if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    },
  });
}
