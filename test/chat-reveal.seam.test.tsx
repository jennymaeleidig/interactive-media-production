// @vitest-environment jsdom
//
// The reveal, mounted: a message's line types itself out exactly once, and a
// later message landing in the same transcript does not restart the ones above
// it. The typewriter is mocked to a mount counter and a captured writer — the
// library types on mount (`componentDidMount`), so a mount that should not
// happen is the replay the viewer sees. The viewer's own echo is pinned
// separately: it never types.
//
// The reveal's end is the turn's clock (`lib/reveal.ts`), so this seam pins its
// exactly-once rule for all three paths: the typewriter completes, the adapter
// unmounts mid-reveal, or a fresh line has nothing to type at all. A restored
// line and the viewer's own line report nothing, because neither is revealed.
//
// SPDX-License-Identifier: CC0-1.0
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Messages } from '@/components/chat/messages';
import { BLOCK_ADAPTERS } from '@/components/chat/message';
import type { ChatMessage } from '@/lib/transcript';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

const counter = vi.hoisted(() => ({ mounts: 0 }));
/** The writer API the reveal wires, captured so its completion hook is callable. */
const writer = vi.hoisted(() => ({
  changeDelay: vi.fn(),
  start: vi.fn(),
  typeString: vi.fn(),
  callFunction: vi.fn(),
}));

vi.mock('typewriter-effect', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ onInit }: { onInit?: (typewriter: unknown) => void }) => {
      useEffect(() => {
        counter.mounts += 1;
        onInit?.(writer);
      }, []);
      return <span data-testid="tw" />;
    },
  };
});

beforeAll(() => {
  // jsdom has no layout engine; the transcript's autoscroll library observes
  // resize. A no-op observer is the whole stub it needs.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const message = (id: string, role: ChatMessage['role'], text: string, fresh = true): ChatMessage => ({
  id,
  role,
  parts:
    role === 'user'
      ? [{ who: 'me', type: 'text', text }]
      : [{ who: 'bot', speaker: 'cam', type: 'text', text }],
  at: new Date(),
  fresh,
});

/** A fresh bot message whose only block never types. */
const mute = (id: string): ChatMessage => ({
  id,
  role: 'assistant',
  parts: [{ who: 'bot', speaker: 'cam', type: 'link', href: 'https://example.test/', label: 'Open the docs' } satisfies ChatBlock],
  at: new Date(),
  fresh: true,
});

describe('the reveal across lands', () => {
  it('mounts the typewriter once per fresh message, never replaying an earlier one', () => {
    counter.mounts = 0;
    const first = message('run-0', 'assistant', 'hello there');
    const { rerender } = render(<Messages messages={[first]} />);
    expect(counter.mounts).toBe(1);

    // A second message lands: only the new bubble may mount a typewriter.
    rerender(<Messages messages={[first, message('run-1', 'assistant', 'second line')]} />);
    expect(counter.mounts).toBe(2);
  });

  it('renders a restored transcript whole, with no typewriter at all', () => {
    counter.mounts = 0;
    render(
      <Messages
        messages={[message('run-0', 'assistant', 'restored line', false), message('run-1', 'user', 'Support', false)]}
      />,
    );
    expect(counter.mounts).toBe(0);
    expect(screen.getByText('restored line')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
  });

  it('never types the viewer’s own echo', () => {
    counter.mounts = 0;
    render(<Messages messages={[message('run-0', 'user', 'Support')]} />);
    expect(counter.mounts).toBe(0);
    expect(screen.getByText('Support')).toBeTruthy();
  });
});

describe('the reveal’s end', () => {
  /** Fire the completion hook the reveal commanded onto the typewriter. */
  const complete = () => {
    const end = writer.callFunction.mock.calls.at(-1)?.[0] as (() => void) | undefined;
    expect(end).toBeTypeOf('function');
    end!();
  };

  it('reports the end once when the typewriter completes, however often it fires', () => {
    const onRevealEnd = vi.fn();
    render(<Messages messages={[message('run-0', 'assistant', 'hello there')]} onRevealEnd={onRevealEnd} />);
    complete();
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
    expect(onRevealEnd).toHaveBeenCalledWith('run-0');
    // A late completion from the same line is not a second end: the hook would
    // advance the turn twice.
    complete();
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
  });

  it('reports the end when the adapter unmounts before the typing finishes', async () => {
    const onRevealEnd = vi.fn();
    const { unmount } = render(<Messages messages={[message('run-0', 'assistant', 'hello there')]} onRevealEnd={onRevealEnd} />);
    expect(onRevealEnd).not.toHaveBeenCalled();
    unmount();
    // The cleanup defers the report a microtask, so StrictMode's remount can
    // cancel it; a real unmount reaches the end on the next tick.
    await act(async () => {});
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
    expect(onRevealEnd).toHaveBeenCalledWith('run-0');
  });

  it('does not report the end a second time when a completed line unmounts', () => {
    const onRevealEnd = vi.fn();
    const { unmount } = render(<Messages messages={[message('run-0', 'assistant', 'hello there')]} onRevealEnd={onRevealEnd} />);
    complete();
    unmount();
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
  });

  it('reports the end at once for a fresh line that never types', () => {
    const onRevealEnd = vi.fn();
    render(<Messages messages={[mute('run-0')]} onRevealEnd={onRevealEnd} />);
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
    expect(onRevealEnd).toHaveBeenCalledWith('run-0');
  });

  it('reports the end when an adapter throws before its reveal mounts', () => {
    // A message that fails to render must not stall the turn (spec user story 3):
    // the fallback carries no reveal, so the catch path reports the end itself.
    const onRevealEnd = vi.fn();
    const original = BLOCK_ADAPTERS.text;
    BLOCK_ADAPTERS.text = () => {
      throw new Error('boom');
    };
    try {
      render(<Messages messages={[message('run-0', 'assistant', 'hello there')]} onRevealEnd={onRevealEnd} />);
      expect(screen.getByText(/could not be shown/)).toBeTruthy();
      expect(onRevealEnd).toHaveBeenCalledTimes(1);
      expect(onRevealEnd).toHaveBeenCalledWith('run-0');
    } finally {
      BLOCK_ADAPTERS.text = original;
    }
  });

  it('does not report the end from React StrictMode’s simulated unmount', () => {
    // Next's App Router runs dev under StrictMode, which mounts, unmounts, and
    // remounts every effect. A cleanup that reported the end outright would end
    // the line the instant it mounted: the next dots would rise under a
    // still-typing line and the voice would be stopped before it spoke.
    const onRevealEnd = vi.fn();
    render(
      <StrictMode>
        <Messages messages={[message('run-0', 'assistant', 'hello there')]} onRevealEnd={onRevealEnd} />
      </StrictMode>,
    );
    expect(onRevealEnd).not.toHaveBeenCalled();
    complete();
    expect(onRevealEnd).toHaveBeenCalledTimes(1);
    expect(onRevealEnd).toHaveBeenCalledWith('run-0');
  });

  it('reports nothing for a restored line or the viewer’s own line', () => {
    const onRevealEnd = vi.fn();
    render(
      <Messages
        messages={[message('run-0', 'assistant', 'restored', false), message('run-1', 'user', 'Support')]}
        onRevealEnd={onRevealEnd}
      />,
    );
    expect(onRevealEnd).not.toHaveBeenCalled();
  });
});
