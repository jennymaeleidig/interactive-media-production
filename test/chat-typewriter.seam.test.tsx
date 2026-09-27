// @vitest-environment jsdom
//
// The animated reveal: a landed bot line is drawn through `typewriter-effect`
// (`components/chat/message.tsx`). The shell seam runs reduced motion (see
// `test/setup-jsdom.ts`) so its async reads are whole-line and immediate; this
// one file runs the motion path instead, so the package stays covered. It is a
// separate file deliberately — framer-motion reads the reduced-motion preference
// into a module singleton on first render, so flipping it inside the shell file
// would be ignored once an earlier test had initialized it.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message } from '@/components/chat/message';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import type { ChatMessage } from '@/lib/transcript';

const message = (parts: ChatBlock[]): ChatMessage => ({ id: 'test', role: 'assistant', parts, at: new Date() });

beforeAll(() => {
  // Ask for motion: this file is the animated path.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

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
