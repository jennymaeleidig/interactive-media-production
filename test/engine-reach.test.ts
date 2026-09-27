// @vitest-environment jsdom
// The engine seam's client declaration, driven directly.
//
// `lib/engine-reach.mjs` declares the published path, the engine global, and
// how the client reaches it. The cold-load wait is the branch no other seam
// crosses: the shell seam evals the runtime before it mounts, so it never sees
// a page whose script has not run yet. This does.
//
// SPDX-License-Identifier: CC0-1.0
import { afterEach, describe, expect, it } from 'vitest';
import { RUNTIME_PATH, acquireEngine, currentEngine, installEngine } from '../lib/engine-reach.mjs';
import type { Engine } from '../lib/engine-reach.mjs';

const engine: Engine = {
  turn: () => new Promise<never>(() => {}),
  reset: () => new Promise<never>(() => {}),
};

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__flockChatEngine;
  for (const script of document.querySelectorAll(`script[src="${RUNTIME_PATH}"]`)) script.remove();
});

describe('the engine reach', () => {
  it('declares the one published path', () => {
    expect(RUNTIME_PATH).toBe('/chat/runtime.js');
  });

  it('reports no engine before the runtime runs', async () => {
    expect(currentEngine()).toBeUndefined();
    // No runtime script in the document, so there is nothing to wait for.
    expect(await acquireEngine()).toBeUndefined();
  });

  it('returns the engine once it is installed', async () => {
    installEngine(engine);
    expect(currentEngine()).toBe(engine);
    expect(await acquireEngine()).toBe(engine);
  });

  it('waits for the runtime script to load on a cold load', async () => {
    const script = document.createElement('script');
    script.setAttribute('src', RUNTIME_PATH);
    document.body.appendChild(script);

    let settled = false;
    const pending = acquireEngine().then((reached) => {
      settled = true;
      return reached;
    });
    await Promise.resolve();
    // Attached before the script ran: the promise is still open.
    expect(settled).toBe(false);

    installEngine(engine);
    script.dispatchEvent(new Event('load'));
    expect(await pending).toBe(engine);
  });
});
