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
import { cleanup, render, screen, within } from '@testing-library/react';

/** The typewriter's writer API, captured so the reveal's calls are assertable. */
const writer = vi.hoisted(() => ({
  changeDelay: vi.fn(),
  start: vi.fn(),
  typeString: vi.fn(),
  callFunction: vi.fn(),
}));
const { speakLine, stop } = vi.hoisted(() => {
  const stop = vi.fn();
  return { speakLine: vi.fn(() => ({ stop })), stop };
});
/** The options the reveal last handed the typewriter, so their identity across
 * renders is assertable — the library rebuilds itself when they change. */
const lastOptions = vi.hoisted(() => ({
  current: null as null | { stringSplitter?: (text: string) => string[] },
}));

vi.mock('typewriter-effect', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ onInit, options }: { onInit?: (typewriter: unknown) => void; options?: typeof lastOptions.current }) => {
      // The last options rendered: captured every render, because the library's
      // own update path reads the current prop, not the mount-time one.
      useEffect(() => {
        if (options) lastOptions.current = options;
      });
      useEffect(() => {
        onInit?.(writer);
      }, []);
      return <span data-testid="tw" />;
    },
  };
});
vi.mock('@/lib/voice', () => ({ speakLine }));

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
        { text: 'wait ', pace: 'slow' },
        { text: 'now', pace: 'fast' },
      ],
    };
    render(<Message message={message([block], { speaker: 'cam' })} />);

    expect(writer.typeString).toHaveBeenCalledWith('wait ');
    expect(writer.typeString).toHaveBeenCalledWith('now');
    // The second stretch changes the delay before its text is queued, so the two
    // stretches really type at two paces. The value is the requested delay, not
    // the frame-rounded step the schedule reads.
    const expected = revealDelayMs(revealWordsForPreset(characterFor('cam').paceWordsPerMinute ?? 400, 'fast'));
    expect(writer.changeDelay).toHaveBeenCalledWith(expected);
    // The voice gets the whole line and the speaker, once; the reveal's end is
    // where it is stopped.
    expect(speakLine).toHaveBeenCalledWith('wait now', 'cam');
    expect(writer.callFunction).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    (writer.callFunction.mock.calls[0]?.[0] as () => void)();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not change the delay for a line with one unmarked stretch', () => {
    render(<Message message={message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'plain' }], { speaker: 'cam' })} />);
    expect(writer.typeString).toHaveBeenCalledWith('plain');
    expect(writer.changeDelay).not.toHaveBeenCalled();
  });

  it('survives a landed line losing its freshness, with no hook-order surprise', () => {
    // The adapters are invoked as plain functions so a throw is contained by
    // `BlockPart`; none of them may hold a hook. A hook inside the text adapter
    // would unbalance `BlockPart`'s order the moment `animate` flips to false on
    // the same mounted bubble — React's "more hooks than the previous render".
    const block: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'landed' };
    const { rerender } = render(
      <Message message={message([block], { speaker: 'cam', fresh: true })} />,
    );
    expect(() =>
      rerender(<Message message={message([block], { speaker: 'cam', fresh: false })} />),
    ).not.toThrow();
    expect(screen.getByText('landed')).toBeTruthy();
  });

  it('anchors the run’s mark to its last bubble, not its first', () => {
    // The mark sits at the foot of the run so it meets the composing bubble that
    // follows, rather than floating beside the run's opening bubble.
    const first = message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'one' }], {
      id: 'first',
      speaker: 'cam',
    });
    const last = message([{ who: 'bot', speaker: 'cam', type: 'text', text: 'two' }], {
      id: 'last',
      speaker: 'cam',
    });
    render(
      <>
        <Message continues={false} continued message={first} />
        <Message continues continued={false} message={last} />
      </>,
    );
    const bubbles = screen.getAllByTestId('message-assistant');
    expect(bubbles[0].querySelector('[data-testid^="character-mark-"]')).toBeNull();
    expect(bubbles[1].querySelector('[data-testid^="character-mark-"]')).not.toBeNull();
  });

  it('keeps the typewriter’s whole options object equal when a bubble regroups', () => {
    // `typewriter-effect` deep-compares its options and, when they differ, builds
    // a new instance: the constructor blanks the wrapper and the update path
    // never re-runs `onInit`, so the line would stay blank for good. The reveal
    // therefore builds its options exactly once. `toEqual` compares functions by
    // reference, so this is what the library's `isEqual` sees — and it fails as
    // soon as any option is given a fresh identity per render.
    const block: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'wait' };
    const at = new Date();
    const one = (): ChatMessage => ({ id: 'one', role: 'assistant', parts: [block], at, fresh: true });

    const { rerender } = render(<Message continued={false} message={one()} />);
    const before = lastOptions.current;
    expect(before?.stringSplitter).toBeTypeOf('function');

    rerender(<Message continued message={one()} />);
    expect(lastOptions.current).toEqual(before);
    expect(lastOptions.current?.stringSplitter).toBe(before?.stringSplitter);
  });

  it('attributes the typing indicator to the character composing', () => {
    const { rerender } = render(<TypingIndicator speaker="flock" />);
    expect(screen.getByTestId('typing-indicator').getAttribute('aria-label')).toBe('Flock is typing');
    expect(screen.getByTestId('character-mark-flock')).toBeTruthy();

    rerender(<TypingIndicator />);
    expect(screen.getByTestId('typing-indicator').getAttribute('aria-label')).toBe('Cam is typing');
    expect(screen.getByTestId('character-mark-cam')).toBeTruthy();
  });

  it('draws the composing mark as the landed mark, exactly', () => {
    // The spec asks the composing character to be named "without a position jump
    // when the message lands", and there is no reason for the composing mark to
    // differ at all: it is the landed mark outright, hung at the landed mark's own
    // offset. A test rather than a comment, because the offset lives in two files
    // and a drift between them is invisible in review.
    render(
      <>
        <Message message={message([{ who: 'bot', speaker: 'flock', type: 'text', text: 'one' }], { speaker: 'flock' })} />
        <TypingIndicator speaker="flock" />
      </>,
    );
    const landed = within(screen.getByTestId('message-assistant')).getByTestId('character-mark-flock');
    const composing = within(screen.getByTestId('typing-indicator')).getByTestId('character-mark-flock');
    // The whole mark — disc, offset span and glyph — not just its classes.
    expect(composing.outerHTML).toBe(landed.outerHTML);
    expect(composing.parentElement?.className).toBe(landed.parentElement?.className);
  });
});
