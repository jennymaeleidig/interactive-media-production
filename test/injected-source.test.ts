// The rule over our own injected sources: they touch the document and nothing
// else, every member of the roster. The other half of the invariant, what the
// Capture's own bytes may reach, is `audit.mjs`'s Media allow-list, and the two
// are deliberately not the same module (one guards captured bytes, this one
// guards ours).
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { honoursOutbound, isInertSource, isSelfBoundSource } from '../pipeline/injected-source.mjs';
import { LAYERS, markedMembers, partOf, shippedSource } from '../pipeline/injected-layers.mjs';

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

  it('is not fooled by a word that merely contains a primitive', () => {
    expect(isInertSource('const prefetched = 1; const fetching = 2;')).toBe(true);
  });
});

describe('isSelfBoundSource', () => {
  it('accepts a same-origin call at a root-relative path', () => {
    expect(isSelfBoundSource("return fetch('/api/chat', { method: 'POST', body: JSON.stringify(body) })")).toBe(true);
    expect(isSelfBoundSource('fetch("/somewhere")')).toBe(true);
  });

  it('accepts a same-origin member that reaches nothing at all', () => {
    expect(isSelfBoundSource("document.querySelector('.fpc-launcher').classList.add('fpc-open');")).toBe(true);
  });

  it('refuses an absolute or protocol-relative target', () => {
    expect(isSelfBoundSource("fetch('https://api.example.com/chat')")).toBe(false);
    expect(isSelfBoundSource("fetch('//api.example.com/chat')")).toBe(false);
  });

  it('refuses a fetch whose target it cannot see — a variable could be anywhere', () => {
    expect(isSelfBoundSource('fetch(ENDPOINT, opts)')).toBe(false);
  });

  it('refuses a bare fetch that is never called — the mention alone is a reference', () => {
    expect(isSelfBoundSource('const send = fetch;')).toBe(false);
    expect(isSelfBoundSource('const o = { fetch: 1 };')).toBe(false);
  });

  it('refuses the primitives that have no same-origin use', () => {
    expect(isSelfBoundSource('new WebSocket(local)')).toBe(false);
    expect(isSelfBoundSource("const es = new EventSource('/events')")).toBe(false);
    expect(isSelfBoundSource("import('/x.js')")).toBe(false);
  });
});

describe('honoursOutbound', () => {
  it('applies the strict rule to a member with no allowance', () => {
    expect(honoursOutbound("fetch('/api/chat')", undefined)).toBe(false);
    expect(honoursOutbound("fetch('/api/chat')", 'none')).toBe(false);
    expect(honoursOutbound('el.classList.add("x")', 'none')).toBe(true);
  });

  it('applies the same-origin rule to a member the roster allows', () => {
    expect(honoursOutbound("fetch('/api/chat')", 'self')).toBe(true);
    expect(honoursOutbound("fetch('https://elsewhere.example')", 'self')).toBe(false);
  });
});

// The rule only earns its keep if it holds over the bytes that actually ship, so
// this pins it against the tree rather than against a fixture.
describe('the injected sources in the tree', () => {
  /** The allowance the roster declares for one member. */
  const outboundOf = (name: string, kind: string) => partOf(name, kind)?.outbound;

  it('allows no member to reach anything — the chat engine runs in the page', () => {
    const allowed = LAYERS.flatMap((l: { name: string; parts: { kind: string; outbound?: string }[] }) =>
      l.parts.filter((p) => p.outbound === 'self').map((p) => `${l.name}/${p.kind}`),
    );
    expect(allowed).toEqual([]);
  });

  it('leaves every marked member of a served page inside its declared allowance', () => {
    // /safe-cities carries all seven, so one page covers the whole roster
    const members = markedMembers(readFileSync('served/safe-cities.html', 'utf8'));
    expect(members).toHaveLength(12);
    for (const member of members) {
      const bytes = member.body ?? shippedSource('served', member.ref as string);
      const label = `${member.name}/${member.kind}`;
      expect(bytes, label).not.toBeNull();
      expect(honoursOutbound(bytes as string, outboundOf(member.name, member.kind)), label).toBe(true);
    }
  });

  it('leaves every maintained source inside its allowance, so a new fetch cannot ship green', () => {
    for (const layer of LAYERS) {
      for (const part of layer.parts) {
        if (part.kind !== 'js' || !part.source) continue;
        expect(honoursOutbound(readFileSync(part.source, 'utf8'), part.outbound), part.source).toBe(true);
      }
    }
  });
});
