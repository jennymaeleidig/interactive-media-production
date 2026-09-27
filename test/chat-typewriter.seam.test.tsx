// @vitest-environment jsdom
//
// The animated reveal: a landed bot line is drawn through `typewriter-effect`
// (`components/chat/message.tsx`), cursorless. Motion is always on
// (`CODING_STANDARDS.md`), so this file pins the typewriter alone, at the
// `Message` level — no engine, no beats.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from '@/components/chat/message';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import type { ChatMessage } from '@/lib/transcript';

const message = (parts: ChatBlock[]): ChatMessage => ({ id: 'test', role: 'assistant', parts, at: new Date() });

describe('the animated reveal', () => {
  it('draws a landed line through the typewriter, cursorless', async () => {
    const { container } = render(
      <Message message={message([{ who: 'bot', type: 'text', text: 'hello there' }])} />,
    );
    // The typewriter owns the line: its wrapper is what renders, and the
    // authored `cursor: ''` leaves no cursor behind the reveal.
    expect(container.querySelector('.Typewriter__wrapper')).not.toBeNull();
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(container.textContent).not.toContain('|');
  });
});
