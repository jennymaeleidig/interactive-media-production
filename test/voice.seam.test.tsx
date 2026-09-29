// @vitest-environment jsdom
//
// The voice: a fresh line speaks when its reveal starts, and nothing else does.
// `lib/voice` owns the audio engine, so this seam mocks it and pins the wiring
// alone — which lines speak, and with what text. The lever invariant lives in
// `test/voice-levers.test.ts`.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { speakLine } = vi.hoisted(() => ({ speakLine: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('@/lib/voice', () => ({ speakLine }));

import { Message } from '@/components/chat/message';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import type { ChatMessage } from '@/lib/transcript';

const message = (parts: ChatBlock[], overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'test',
  role: 'assistant',
  parts,
  at: new Date(),
  fresh: true,
  ...overrides,
});

describe('the voice', () => {
  beforeEach(() => speakLine.mockClear());

  it('speaks a fresh assistant line from its first character, in its speaker’s voice', async () => {
    render(<Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'hello there' }])} />);
    await waitFor(() => expect(speakLine).toHaveBeenCalledWith('hello there', 'cam'));
  });

  it('speaks each character’s line in that character’s voice', async () => {
    render(<Message message={message([{ who: 'bot', speaker: 'flock', type: 'text', text: 'hello there' }])} />);
    await waitFor(() => expect(speakLine).toHaveBeenCalledWith('hello there', 'flock'));
  });

  it('stays silent for a restored line', async () => {
    render(<Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'hello there' }], { fresh: false })} />);
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(speakLine).not.toHaveBeenCalled();
  });

  it("stays silent for the viewer's own line", async () => {
    render(<Message message={message([{ who: 'me', type: 'text', text: 'hi' }], { role: 'user' })} />);
    expect(await screen.findByText('hi')).toBeTruthy();
    expect(speakLine).not.toHaveBeenCalled();
  });
});
