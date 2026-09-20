// @vitest-environment jsdom
// Interface-shape seam: the drift guard ticket 11 asked for.
//
// The React shell ships in the page's own Next bundle and the engine ships as
// `/chat/runtime.js`, so the two halves are one deploy but two files. This seam
// installs the exact published runtime bytes and pins the one surface the shell
// calls (`window.__flockChatEngine.turn`) and the one shape it reads
// (`turn.blocks`). If the engine's published interface moves, this fails instead
// of the shell discovering it at runtime.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatResponse } from '../lib/chat-turn.mjs';
import { shippedAsset } from './seam-harness';

beforeAll(() => {
  (window as unknown as { eval: (source: string) => void }).eval(shippedAsset('/chat/runtime.js'));
});

describe('the engine the shell calls', () => {
  it('publishes exactly one method, the turn the shell sends', () => {
    const api = window.__flockChatEngine;
    expect(api).toBeDefined();
    expect(Object.keys(api!)).toEqual(['turn']);
    expect(typeof api!.turn).toBe('function');
  });

  it('answers with the block-carrying turn the shell renders, not lines', async () => {
    const res: ChatResponse = await window.__flockChatEngine!.turn({ type: 'start' });
    expect(Array.isArray(res.turn.blocks)).toBe(true);
    expect(res.turn).not.toHaveProperty('lines');
    expect(res.turn.blocks[0]).toMatchObject({ who: 'bot', type: 'text' });
  });
});
