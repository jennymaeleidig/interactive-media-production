// @vitest-environment jsdom
//
// The character seam, on real DOM: the mark beside a run, the segmented reveal
// through `typewriter-effect`, the typing indicator's composing character, and
// the voice's new argument. It extends the reveal seam
// (`chat-typewriter.seam.test.tsx`, `chat-reveal.seam.test.tsx`) with the two
// speakers the piece now has, and mocks the typewriter and the voice so the
// wiring — not the library — is what is under test.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/** The typewriter's writer API, captured so the reveal's calls are assertable. */
const writer = vi.hoisted(() => ({
  changeDelay: vi.fn(),
  start: vi.fn(),
  typeString: vi.fn(),
  callFunction: vi.fn(),
}));
const { speakLine, stopVoice } = vi.hoisted(() => ({ speakLine: vi.fn(() => 1), stopVoice: vi.fn() }));

vi.mock('typewriter-effect', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ onInit }: { onInit?: (typewriter: unknown) => void }) => {
      useEffect(() => {
        onInit?.(writer);
      }, []);
      return <span data-testid="tw" />;
    },
  };
});
vi.mock('@/lib/voice', () => ({ speakLine, stopVoice }));

import { Message } from '@/components/chat/message';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { characterFor } from '@/lib/chat-characters.mjs';
import { revealDelayMs, revealWordsForPreset } from '@/lib/pacing';
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

describe('the character seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('draws the speaking character’s mark beside the run', () => {
    const { rerender } = render(
      <Message message={message([{ who: 'bot', speaker: 'flock', type: 'text', text: 'one' }], { speaker: 'flock' })} />,
    );
    const flockMark = screen.getByTestId('character-mark-flock').querySelector('img');
    expect(flockMark?.getAttribute('src')).toBe(characterFor('flock').mark.src);
    expect(flockMark?.getAttribute('alt')).toBe('Flock');

    rerender(<Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'two' }], { speaker: 'cam' })} />);
    expect(screen.getByTestId('character-mark-cam')).toBeTruthy();
    expect(screen.queryByTestId('character-mark-flock')).toBeNull();
  });

  it('types a line in its authored stretches, at each stretch’s own pace', () => {
    const block: ChatBlock = {
      who: 'bot',
      speaker: 'cam',
      type: 'text',
      text: 'wait now',
      segments: [
        { text: 'wait ', pace: 'slowest' },
        { text: 'now', pace: 'slow' },
      ],
    };
    render(<Message message={message([block], { speaker: 'cam' })} />);

    expect(writer.typeString).toHaveBeenCalledWith('wait ');
    expect(writer.typeString).toHaveBeenCalledWith('now');
    // The second stretch changes the delay before its text is queued, so the two
    // stretches really type at two paces. The value is the requested delay, not
    // the frame-rounded step the schedule reads.
    const expected = revealDelayMs(revealWordsForPreset(characterFor('cam').paceWordsPerMinute ?? 400, 'slow'));
    expect(writer.changeDelay).toHaveBeenCalledWith(expected);
    // The voice gets the whole line and the speaker, once; the typewriter's
    // completion event is where it is stopped.
    expect(speakLine).toHaveBeenCalledWith('wait now', 'cam');
    expect(writer.callFunction).toHaveBeenCalledTimes(1);
    (writer.callFunction.mock.calls[0]?.[0] as () => void)();
    expect(stopVoice).toHaveBeenCalledWith(1);
  });

  it('does not change the delay for a line with one unmarked stretch', () => {
    render(<Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'plain' }], { speaker: 'cam' })} />);
    expect(writer.typeString).toHaveBeenCalledWith('plain');
    expect(writer.changeDelay).not.toHaveBeenCalled();
  });

  it('attributes the typing indicator to the character composing', () => {
    const { rerender } = render(<TypingIndicator speaker="flock" />);
    expect(screen.getByTestId('typing-indicator').getAttribute('aria-label')).toBe('Flock is typing');
    expect(screen.getByTestId('character-mark-flock')).toBeTruthy();

    rerender(<TypingIndicator />);
    expect(screen.getByTestId('typing-indicator').getAttribute('aria-label')).toBe('Cam is typing');
    expect(screen.getByTestId('character-mark-cam')).toBeTruthy();
  });
});
