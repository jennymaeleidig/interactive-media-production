// @vitest-environment jsdom
//
// The reveal, mounted: a message's line types itself out exactly once, and a
// later message landing in the same transcript does not restart the ones above
// it. The typewriter is mocked to a mount counter — the library types on mount
// (`componentDidMount`), so a mount that should not happen is the replay the
// viewer sees. The viewer's own echo is pinned separately: it never types.
//
// SPDX-License-Identifier: CC0-1.0
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Messages } from '@/components/chat/messages';
import type { ChatMessage } from '@/lib/transcript';

const counter = vi.hoisted(() => ({ mounts: 0 }));

vi.mock('typewriter-effect', async () => {
  const { useEffect } = await import('react');
  return {
    default: () => {
      useEffect(() => {
        counter.mounts += 1;
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
