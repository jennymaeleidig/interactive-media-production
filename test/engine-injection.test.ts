// @vitest-environment jsdom
// The engine's constructor seam: `createEngine(store)` over an injected store.
//
// The published engine is built over `localStorage` (via `lib/engine-reach.mjs`),
// but the engine's persistence is a parameter. This drives that parameter
// directly: an in-page memory store proves the store is the only thing the
// engine persists through, and that the constructor's injection point is real
// rather than exported-but-unexercised. The published `localStorage` wiring is
// exercised through the published runtime (`test/chat-interface.test.ts`).
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { createEngine } from '../scripts/chat-engine.mjs';
import { memoryStore } from '../lib/session-store.mjs';

describe('the engine over an injected store', () => {
  it('opens, advances, and resumes through the store alone', async () => {
    const store = memoryStore();
    const engine = createEngine(store);

    const opened = await engine.turn({ type: 'start' });
    expect(opened.turn.blocks.length).toBeGreaterThan(0);
    expect(opened.turn.options?.length).toBeGreaterThan(0);

    const advanced = await engine.turn({ type: 'option', optionIndex: 0 });
    expect(advanced.turn.blocks.length).toBeGreaterThan(opened.turn.blocks.length);

    // A second engine over the same store resumes the session the first wrote:
    // the injected store, not a module-level variable, carries the conversation.
    const resumed = createEngine(store);
    const reopened = await resumed.turn({ type: 'start' });
    expect(reopened.turn.blocks).toEqual(advanced.turn.blocks);
  });

  it('starts a fresh conversation from an empty store', async () => {
    const engine = createEngine(memoryStore());
    const res = await engine.turn({ type: 'start' });
    expect(res.turn.blocks.length).toBeGreaterThan(0);
  });
});
