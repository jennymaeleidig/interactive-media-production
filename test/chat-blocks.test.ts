// The block inventory, pinned.
//
// `pipeline/chat-blocks.mjs` is the hand-reviewed declaration of every block the
// piece can render and every remote source it may reach. It is the no-ask rule's
// allowlist (`CODING_STANDARDS.md`), so this suite is its check: the ids are
// unique, every type is in the locked vocabulary, the derived allowlist equals
// the set of `src` values and nothing else, no frame asks for both
// `allow-scripts` and `allow-same-origin`, and every `<<block>>` id the compiled
// program names resolves.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAT_BLOCKS, allowedSources } from '../pipeline/chat-blocks.mjs';
import { CHAT_BLOCK_TYPES } from '../pipeline/chat-turn.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The locked vocabulary, minus the designed `unknown` fallback. */
const LOCKED = CHAT_BLOCK_TYPES.filter((type) => type !== 'unknown');

/** Every string in the compiled program that is a block command. */
function programBlockIds(): string[] {
  const program = JSON.parse(readFileSync(path.join(ROOT, 'pipeline/chat-program.json'), 'utf8'));
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
