// The block inventory, pinned.
//
// `lib/chat-blocks.mjs` is the hand-reviewed declaration of every block the
// piece can render and every remote source it may reach. It is the no-ask rule's
// allowlist (`CODING_STANDARDS.md`), so this suite is its check: the ids are
// unique, every type is in the locked vocabulary, the derived allowlist equals
// the set of `src` values and nothing else, no frame asks for both
// `allow-scripts` and `allow-same-origin`, and every `<<block>>` id the compiled
// program names resolves.
//
// The inventory also carries each type's contract terms, and this suite carries
// those too: a beat weight declared for every renderable type (a missing one is
// an inventory defect, not a silent zero), the text and link weights exactly the
// characters today's composing clock read, and the frugality rules demanded of
// the types whose render reaches a remote source.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAT_BLOCKS, CHAT_BLOCK_TERMS, allowedSources } from '../lib/chat-blocks.mjs';
import { CHAT_BLOCK_TYPES } from '../lib/chat-turn.mjs';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The locked vocabulary, minus the designed `unknown` fallback. */
const LOCKED = CHAT_BLOCK_TYPES.filter((type) => type !== 'unknown');

/** A minimal well-formed block per type — enough to weigh. */
function sampleBlock(type: (typeof CHAT_BLOCK_TYPES)[number]): ChatBlock {
  switch (type) {
    case 'text':
      return { who: 'bot', type: 'text', text: 'Hello there, friend.' };
    case 'link':
      return { who: 'bot', type: 'link', href: 'https://www.flocksafety.com/', label: 'Flock Safety' };
    case 'me':
      return { who: 'me', type: 'me' };
    case 'image':
      return { who: 'bot', type: 'image', src: 'https://example.com/one.png', alt: 'A camera at an intersection' };
    case 'frame':
      return { who: 'bot', type: 'frame', src: 'https://example.com/', sandbox: '', title: 'Example' };
    case 'unknown':
      return { who: 'bot', type: 'unknown', reason: 'Unknown block' };
  }
}

/** Every string in the compiled program that is a block command. */
function programBlockIds(): string[] {
  const program = JSON.parse(readFileSync(path.join(ROOT, 'scripts/chat-program.json'), 'utf8'));
  const ids: string[] = [];
  /** @param {unknown} value */
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      const match = /^block "([^"]+)"(?:\s+(?:new|join))?$/.exec(value);
      if (match) ids.push(match[1]);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(program);
  return ids;
}

describe('the block inventory', () => {
  it('names every entry with a type in the locked vocabulary', () => {
    for (const [id, payload] of Object.entries(CHAT_BLOCKS)) {
      expect(LOCKED, id).toContain(payload.type);
    }
  });

  it('derives the allowlist from the inventory and nothing else', () => {
    const declared = new Set<string>();
    for (const payload of Object.values(CHAT_BLOCKS)) {
      if (payload.type === 'image' || payload.type === 'frame') declared.add(payload.src);
    }
    expect([...allowedSources()].sort()).toEqual([...declared].sort());
  });

  it('ships no frames yet, so the allowlist is empty (ticket 10)', () => {
    expect([...allowedSources()]).toEqual([]);
    expect(Object.values(CHAT_BLOCKS).some((payload) => payload.type === 'frame')).toBe(false);
  });

  it('never gives a frame both allow-scripts and allow-same-origin', () => {
    for (const [id, payload] of Object.entries(CHAT_BLOCKS)) {
      if (payload.type !== 'frame') continue;
      const sandbox = payload.sandbox ?? '';
      const both = sandbox.includes('allow-scripts') && sandbox.includes('allow-same-origin');
      expect(both, id).toBe(false);
    }
  });

  it('resolves every block id the compiled program names', () => {
    const ids = programBlockIds();
    expect(ids.length, 'the fixture exercises at least one authored block').toBeGreaterThan(0);
    for (const id of ids) expect(Object.keys(CHAT_BLOCKS), id).toContain(id);
  });
});

describe('the block contract terms', () => {
  it('declares a beat weight for every type in the locked vocabulary', () => {
    for (const type of CHAT_BLOCK_TYPES) {
      const terms = CHAT_BLOCK_TERMS[type];
      expect(terms, type).toBeTruthy();
      expect(typeof terms.beat, `${type}: beat`).toBe('function');
      const weight = terms.beat(sampleBlock(type));
      expect(Number.isFinite(weight), `${type}: finite`).toBe(true);
      expect(weight, `${type}: non-negative`).toBeGreaterThanOrEqual(0);
      // A content type cannot type in zero time: the only deliberate zeros are
      // the two designed ones, named here, so a new type must either weigh its
      // content or argue itself into this list.
      if (type !== 'me' && type !== 'unknown') {
        expect(weight, `${type}: zero beat`).toBeGreaterThan(0);
      }
    }
  });

  it('weighs text and link exactly as the characters-at-pace clock read them', () => {
    // The compatibility term: the weights are the exact character counts the
    // hook's composing clock read before the weights moved here, so the
    // piece's pacing — floor included, which stays the hook's — is unchanged.
    const text = 'You can reach our support team through the following channels.';
    const label = 'Flock Safety';
    expect(CHAT_BLOCK_TERMS.text.beat({ who: 'bot', type: 'text', text })).toBe(text.length);
    expect(
      CHAT_BLOCK_TERMS.link.beat({ who: 'bot', type: 'link', href: 'https://www.flocksafety.com/', label }),
    ).toBe(label.length);
    // The viewer's own turn never types.
    expect(CHAT_BLOCK_TERMS.me.beat({ who: 'me', type: 'me' })).toBe(0);
  });

  it('demands a lazy render from the types whose render reaches a remote source', () => {
    // The frugality rules (`CODING_STANDARDS.md`'s no-ask spirit): images and
    // frames load only near the viewport, and images decode off the main
    // thread. The adapters that ship these types are held to the declaration
    // by the adapter tests as they land.
    expect(CHAT_BLOCK_TERMS.image.lazy, 'image: lazy').toBe(true);
    expect(CHAT_BLOCK_TERMS.image.asyncDecode, 'image: async decoding').toBe(true);
    expect(CHAT_BLOCK_TERMS.frame.lazy, 'frame: lazy').toBe(true);
    // The types that reach no remote source declare no frugality rules.
    expect(CHAT_BLOCK_TERMS.text.lazy ?? false).toBe(false);
    expect(CHAT_BLOCK_TERMS.link.asyncDecode ?? false).toBe(false);
  });
});
