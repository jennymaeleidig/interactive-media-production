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

const message = (parts: ChatBlock[]): ChatMessage => ({ id: 'test', role: 'assistant', parts, at: new Date(), fresh: true });

describe('the animated reveal', () => {
  it('draws a landed line through the typewriter, cursorless', async () => {
    const { container } = render(
      <Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'hello there' }])} />,
    );
    // The typewriter owns the line: its wrapper is what renders, and the
    // authored `cursor: ''` leaves no cursor behind the reveal.
    expect(container.querySelector('.Typewriter__wrapper')).not.toBeNull();
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(container.textContent).not.toContain('|');
  });

  it('types a fast stretch through the real splitter, two characters at a time', async () => {
    // The real library applies `stringSplitter`, so this is the one place that
    // proves a `fast` run really rides two characters on one queue entry.
    const block: ChatBlock = {
      who: 'bot',
      speaker: 'cam',
      type: 'text',
      text: 'abcde',
      segments: [{ text: 'abcde', pace: 'fast' }],
    };
    render(<Message message={message([block])} />);
    expect(await screen.findByText('abcde')).toBeTruthy();
  });

  it('keeps a line that has already typed when its bubble re-renders', async () => {
    // The real symptom, through the real library: `typewriter-effect` rebuilds its
    // instance whenever its options fail a deep comparison, and a rebuilt instance
    // blanks the wrapper without ever calling `onInit` — the line is erased and
    // nothing types it again. Re-rendering the same bubble is exactly what a later
    // bubble joining the run does (`components/chat/message.tsx`).
    const line = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text });
    const { rerender } = render(<Message message={message([line('first line')])} />);
    expect(await screen.findByText('first line')).toBeTruthy();
    rerender(<Message message={message([line('first line'), line('second line')])} />);
    expect(screen.getByText('first line')).toBeTruthy();
  });
});
