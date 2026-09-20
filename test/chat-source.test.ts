// The chat's no-network rule, and the bytes that have to satisfy it.
//
// The rule is the piece's privacy contract: the conversation runs in the page
// and the page reaches nothing. Its own behaviour is pinned here, and the
// shipped runtime is pinned against it, so a `fetch` cannot join the chat
// without failing a test.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { NETWORK_PRIMITIVES, isInertSource } from '../pipeline/chat-source.mjs';
import { assetFor, readAsset } from '../pipeline/chat-assets.mjs';

describe('isInertSource', () => {
  it('accepts a source that only reads and writes the document', () => {
    expect(isInertSource("document.addEventListener('click', () => el.classList.add('x'));")).toBe(true);
    expect(isInertSource('new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.add("fpm-in")))')).toBe(true);
    expect(isInertSource('localStorage.setItem("flock-chat-session", id);')).toBe(true);
  });

  const primitives: [string, string][] = [
    ['fetch', "fetch('/api/chat', { method: 'POST' })"],
    ['a bare fetch reference', 'const send = fetch;'],
    ['XMLHttpRequest', 'const xhr = new XMLHttpRequest(); xhr.open("GET", url);'],
    ['WebSocket', 'const ws = new WebSocket(url);'],
    ['EventSource', 'const es = new EventSource(url);'],
    ['sendBeacon', 'navigator.sendBeacon(url, body);'],
    ['a dynamic import', "const mod = await import('./x.js');"],
  ];

  it.each(primitives)('refuses %s', (_name: string, source: string) => {
    expect(isInertSource(source)).toBe(false);
  });

  it('refuses a fetch whose target it cannot see — a variable could be anywhere', () => {
    expect(isInertSource('fetch(ENDPOINT, opts)')).toBe(false);
  });

  it('counts a mention that is never called — the name alone is a reference', () => {
    expect(isInertSource('// the old build used to fetch a reply here')).toBe(false);
    expect(isInertSource('const o = { fetch: 1 };')).toBe(false);
  });

  it('is not fooled by a word that merely contains a primitive', () => {
    expect(isInertSource('const prefetched = 1; const fetching = 2;')).toBe(true);
  });

  it('names what it refuses, so a caller can say what a source reached for', () => {
    expect(NETWORK_PRIMITIVES.test('new EventSource(url)')).toBe(true);
  });
});

describe('the shipped runtime', () => {
  const runtime = assetFor('/chat/runtime.js')!;

  it('names no network primitive — the whole conversation runs in the page', () => {
    expect(isInertSource(readAsset(runtime))).toBe(true);
  });
});
