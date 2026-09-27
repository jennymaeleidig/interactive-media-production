// jsdom's `localStorage` is shadowed in this Node runtime.
//
// Node exposes a global `localStorage` that is `undefined` unless the process is
// started with a storage file, and vitest's jsdom environment skips a window
// property that already exists on the global. The engine and the shell both keep
// their one session in `localStorage`, so the jsdom projects install a real
// in-memory `Storage` before any test runs. It is a standard map-backed
// implementation — the browser's own is the real one.
//
// jsdom has no `matchMedia`, and libraries may probe it. Motion is the piece
// (`CODING_STANDARDS.md`), so the stub answers "no reduced motion": the suite
// runs the real typewriter and beats, and reads a line once it has typed.
// SPDX-License-Identifier: CC0-1.0
if (typeof window !== 'undefined') {
  const media = (query: string): MediaQueryList =>
    ({
      matches: false,
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
