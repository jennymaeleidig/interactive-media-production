// The engine seam's client declaration: how the shell reaches the engine the
// host page serves.
//
// The React shell ships in the page's own Next bundle; the engine ships as the
// one published file `/chat/runtime.js` and installs itself on a window global.
// Three readers need to agree about that path and that global and none of them
// can see the others: the host document that loads the script
// (`app/layout.tsx`), the React shell that calls it (`hooks/use-dialogue.ts`),
// and the route that serves it (`scripts/chat-assets.mjs`). This module is the
// one declaration they all read.
//
// It is a plain `.mjs` with no aliases or dependencies, so Node can import it
// through `scripts/chat-assets.mjs` under `test/artifact.mjs` and the client
// bundle can import it too. `scripts/globals.d.ts` narrows
// `Window.__flockChatEngine` to the `Engine` declared here.
//
// SPDX-License-Identifier: CC0-1.0

/** @typedef {import('./chat-turn.mjs').ChatRequest} ChatRequest */
/** @typedef {import('./chat-turn.mjs').ChatResponse} ChatResponse */

/**
 * The engine the shell calls: one request in, one response out. The runtime
 * installs it; the shell never sees how it is built.
 * @typedef {{ turn(request: ChatRequest): Promise<ChatResponse>, reset(): Promise<ChatResponse> }} Engine
 */

/** The one published path the chat runtime is served at. */
export const RUNTIME_PATH = '/chat/runtime.js';

/** The window property the runtime installs its engine on. */
export const ENGINE_GLOBAL = '__flockChatEngine';

/** The window, as a string-keyed bag, so the global can be read and written by
 * its one declared name. @returns {Record<string, unknown>} */
function globals() {
  return /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
}

/** The engine global, if the runtime has run. @returns {Engine | undefined} */
export function currentEngine() {
  if (typeof window === 'undefined') return undefined;
  return /** @type {Engine | undefined} */ (globals()[ENGINE_GLOBAL]);
}

/** Install the engine on the global. The runtime calls this once. @param {Engine} engine */
export function installEngine(engine) {
  globals()[ENGINE_GLOBAL] = engine;
}

/**
 * Wait for the runtime to install the engine, resolving it. On a cold load the
 * shell can mount before the deferred script in the host page has run, so this
 * waits for that script rather than erroring on a race the viewer cannot see or
 * fix. Resolves `undefined` when no such script is present or it fails to load;
 * the caller decides what an absent engine means.
 * @returns {Promise<Engine | undefined>}
 */
export function acquireEngine() {
  const running = currentEngine();
  if (running || typeof document === 'undefined') return Promise.resolve(running);
  const script = document.querySelector(`script[src="${RUNTIME_PATH}"]`);
  if (!script) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const settle = () => resolve(currentEngine());
    script.addEventListener('load', settle, { once: true });
    script.addEventListener('error', settle, { once: true });
    // It may have installed between the lookup above and the listener attaching.
    if (currentEngine()) settle();
  });
}
