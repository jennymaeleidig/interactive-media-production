// The session store's one contract: raw text in, raw text out, and no throw
// when the backing store refuses.
//
// The private-mode fallback is the branch no seam could reach before: the
// engine kept its own `memory`/`persisted` flags, and only a browser that
// actually denies `localStorage` exercised them. Here a fake backing store
// that throws is the whole environment, so the fallback is proven rather than
// latent.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { memoryStore, resilientStore } from '../lib/session-store.mjs';
import type { SessionStore } from '../lib/session-store.mjs';

/** A store that refuses every operation, as a browser in private mode does. */
function denied(): SessionStore {
  return {
    read() {
      throw new Error('denied');
    },
    write() {
      throw new Error('denied');
    },
    clear() {
      throw new Error('denied');
    },
  };
}

/**
 * A store with a switch, standing in for `localStorage` that starts refusing
 * and later accepts — what clearing private mode (or freeing quota) looks like.
 * @param {{ failing: boolean }} state
 */
function switchable(state: { failing: boolean }): SessionStore {
  let held: string | null = null;
  return {
    read: () => {
      if (state.failing) throw new Error('denied');
      return held;
    },
    write: (text) => {
      if (state.failing) throw new Error('denied');
      held = text;
    },
    clear: () => {
      if (state.failing) throw new Error('denied');
      held = null;
    },
  };
}

describe('the memory store', () => {
  it('holds and clears text without any backing', () => {
    const store = memoryStore();
    expect(store.read()).toBeNull();
    store.write('a session');
    expect(store.read()).toBe('a session');
    store.clear();
    expect(store.read()).toBeNull();
  });
});

describe('the resilient store', () => {
  it('moves text through a working backing store', () => {
    const store = resilientStore(memoryStore());
    expect(store.read()).toBeNull();
    store.write('a session');
    expect(store.read()).toBe('a session');
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('keeps serving the in-page copy once the backing store refuses', () => {
    const store = resilientStore(denied());
    store.write('a private session');
    // The write was refused but did not throw, and the session survives.
    expect(store.read()).toBe('a private session');
  });

  it('falls back to the copy when a read is refused without a prior write', () => {
    const store = resilientStore(denied());
    expect(store.read()).toBeNull();
  });

  it('trusts the backing store again once it recovers', () => {
    const state = { failing: true };
    const store = resilientStore(switchable(state));
    store.write('held in the copy');
    expect(store.read()).toBe('held in the copy');

    state.failing = false;
    store.write('held in the backing store');
    // The copy and the backing agree after a successful write, and the backing
    // is the one that is read.
    expect(store.read()).toBe('held in the backing store');
  });

  it('forgets through both stores without throwing', () => {
    const store = resilientStore(denied());
    store.write('a private session');
    expect(() => store.clear()).not.toThrow();
    expect(store.read()).toBeNull();
  });
});
