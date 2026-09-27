// @vitest-environment jsdom
// Chat shell seam: the surface the viewer sees, mounted in a real DOM (jsdom)
// against the exact engine bytes the host serves at `/chat/runtime.js`. The
// React shell itself ships in the page's own bundle, so this seam
// mounts the shell components directly and drives them through the engine the
// runtime installs on `window`.
//
// It pins what a viewer can observe: the greeting and the chip row, the inert
// composer with no input anywhere, the resume round trip, the block adapters,
// and containment — a throwing adapter or an unallowlisted frame URL cannot cost
// the transcript. The engine seam (`test/chat.seam.test.ts`) drives the source
// module; the artifact seam reads the built export.
//
// SPDX-License-Identifier: CC0-1.0
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatShell } from '@/components/chat/chat-shell';
import { BLOCK_ADAPTERS, Message } from '@/components/chat/message';
import { RUNTIME_PATH } from '@/lib/engine-reach.mjs';
import { CHAT_BLOCK_TYPES } from '@/lib/chat-turn.mjs';
import type { ChatMessage } from '@/lib/transcript';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import { shippedAsset } from './seam-harness';

// The suite runs the piece's real motion, but two things would make this seam
// take minutes, and neither is what it is here to pin:
//
// - the reveal: `typewriter-effect` advances one character per animation frame
//   (~16ms), so a 110-character greeting alone costs ~1.8s of every test. The
//   real reveal is covered at the `Message` level in
//   `test/chat-typewriter.seam.test.tsx`; here the package renders the line at
//   once.
// - the beats: a 190-character reply holds ~5.7s at the piece's pace. The
//   clocks are pinned by `test/turn-plan.test.ts`; here they are near-instant.
//
// Both leave the same animation path under test — only its clock is short.
vi.mock('typewriter-effect', async () => {
  const React = await import('react');
  return {
    default: ({ component = 'span', onInit }: { component?: string; onInit?: (writer: unknown) => void }) => {
      let typed = '';
      const writer = {
        typeString: (text: string) => {
          typed = text;
          return writer;
        },
        start: () => writer,
      };
      onInit?.(writer);
      return React.createElement(component, null, typed);
    },
  };
});

vi.mock('@/lib/pacing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pacing')>()),
  // Only the levers that decide speed are shortened; the constants and the
  // words-per-minute names come from the real module, so they cannot drift.
  MIN_TYPING_BEAT_MS: 1,
  FRAME_MS: 0.1,
  msPerChar: () => 0.1,
}));

const GREETING =
  'Hey there! I’m Cam, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?';

// The suite runs the piece's motion, but on the short clock the mocks install
// (below), so this is headroom over the async engine turn, not a wait on the
// piece's typing pace.
configure({ asyncUtilTimeout: 40_000 });

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
  (window as unknown as { eval: (source: string) => void }).eval(shippedAsset(RUNTIME_PATH));
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('the mounted shell', () => {
  it('opens the authored greeting and offers the hub chips', async () => {
    render(<ChatShell />);
    expect(await screen.findByText(GREETING)).toBeTruthy();
    const chips = within(screen.getByTestId('chip-row'));
    expect(chips.getByText('What can you help me with?')).toBeTruthy();
    expect(chips.getByText('Get a Demo')).toBeTruthy();
    expect(chips.getByText('Support')).toBeTruthy();
  });

  it('starts over from the disclosure, with no history carried', async () => {
    // The reset is a dev-server fixture: stub the dev env the way `next dev`
    // serves it. A built page never carries the control.
    vi.stubEnv('NODE_ENV', 'development');
    render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByText('Support'));
    // The support reply has landed, so there is a conversation to drop.
    await screen.findByText(
      'You can reach our support team through the following channels: - Call us at +1 (866) 901-1781 - Email us at support@flocksafety.com Is there anything specific you\'d like assistance with, or any other way I can help you today?',
    );

    fireEvent.click(screen.getByTestId('disclosure-toggle'));
    fireEvent.click(screen.getByTestId('reset-button'));
    // A fresh conversation: the greeting alone, no earlier turn before it.
    await waitFor(() => expect(screen.getAllByText(GREETING)).toHaveLength(1));
    vi.unstubAllEnvs();
  });

  it('offers no reset control outside the dev server', async () => {
    // The suite runs with NODE_ENV=test, the same statically-inlined-away case
    // as a production build: no dev fixture in the disclosure.
    render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByTestId('disclosure-toggle'));
    expect(screen.queryByTestId('reset-button')).toBeNull();
  });

  it('advances only by chips, with no text input anywhere', async () => {
    const { container } = render(<ChatShell />);
    await screen.findByText(GREETING);
    expect(container.querySelectorAll('input, textarea, form, [contenteditable]')).toHaveLength(0);
    expect(screen.queryByText(/typing/i)).toBeNull();

    fireEvent.click(screen.getByText('Support'));
    expect(await screen.findByText(/You can reach our support team/)).toBeTruthy();
  });

  it('keeps the send glyph present but inert', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    const send = screen.getByTestId('inert-send');
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.closest('button')).toBeNull();
  });

  it("marks an assistant run once, and the viewer's turn never", async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    expect(screen.getAllByTestId('assistant-mark')).toHaveLength(1);

    fireEvent.click(screen.getByText('Get a Demo'));
    await screen.findByText(/provide your email address/);
    // The viewer's turn adds a bubble and no mark; the reply adds one.
    expect(screen.getAllByTestId('message-user')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-mark')).toHaveLength(2);
  });

  it('does not repeat the mark on a continued run', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);
    fireEvent.click(await screen.findByText("That's all for now"));
    // The end turn is two bubbles too: the sign-off lands, then the link.
    await screen.findByText('Flock Safety');
    expect(screen.getAllByTestId('message-assistant')).toHaveLength(5);
    expect(screen.getAllByTestId('assistant-mark')).toHaveLength(3);
  });

  it('opens the transcript with the day divider', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    expect(screen.getByTestId('day-divider').textContent).toMatch(/^Today, \d{1,2}:\d{2} (am|pm)$/);
  });

  it('restores the transcript after a reload', async () => {
    const first = render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);
    first.unmount();

    render(<ChatShell />);
    expect(await screen.findByText(GREETING)).toBeTruthy();
    expect(await screen.findByText(/You can reach our support team/)).toBeTruthy();
  });

  it('keeps message keys unique as the conversation grows', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });
    try {
      render(<ChatShell />);
      await screen.findByText(GREETING);
      fireEvent.click(screen.getByText('Support'));
      await screen.findByText(/You can reach our support team/);
      fireEvent.click(await screen.findByText("That's all for now"));
      await screen.findByText('Flock Safety');
    } finally {
      spy.mockRestore();
    }
    expect(errors.filter((message) => message.includes('same key'))).toEqual([]);
  });

  it('sends the closing line and the link as two assistant messages', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);
    fireEvent.click(await screen.findByText("That's all for now"));
    await screen.findByText('Flock Safety');
    const linkBubble = screen.getByText('Flock Safety').closest('[data-testid="message-assistant"]');
    expect(linkBubble?.textContent).not.toContain('Thanks for stopping by');
  });
});

describe('transcript identity', () => {
  /** Every bubble's log-derived id, in transcript order, read off the DOM. */
  const domIds = () =>
    [...document.querySelectorAll('[data-message-id]')].map((element) => element.getAttribute('data-message-id'));

  /** A bubble element, found by its text inside the transcript. Scoped to the
   * log because a chip can carry the same label the bubble it sent does. */
  const bubbleFor = (text: string, role: 'assistant' | 'user') =>
    within(screen.getByRole('log')).getByText(text).closest(`[data-testid="message-${role}"]`);

  it('keeps the exact bubble elements as turns append', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    const greeting = bubbleFor(GREETING, 'assistant');
    expect(greeting).toBeTruthy();

    // The reply lands and the greeting bubble survives it: the transcript
    // grows, it does not redraw.
    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);
    expect(bubbleFor(GREETING, 'assistant')).toBe(greeting);

    const echo = bubbleFor('Support', 'user');
    expect(echo).toBeTruthy();

    fireEvent.click(await screen.findByText("That's all for now"));
    await screen.findByText(/Thanks for stopping by/);
    // Both earlier bubbles are the same elements after the closing turn: the
    // transcript grew, it did not redraw.
    expect(bubbleFor(GREETING, 'assistant')).toBe(greeting);
    expect(bubbleFor('Support', 'user')).toBe(echo);
  });

  it('keeps log-derived ids stable as turns append', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    const before = domIds();
    expect(before.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);

    const after = domIds();
    // The earlier transcript keeps its ids, in order, and the turn appends new
    // ones; no id is ever reused for a different bubble.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(new Set(after).size).toBe(after.length);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('keeps log-derived ids across a reload-resume of the persisted session', async () => {
    const first = render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByText('Support'));
    await screen.findByText(/You can reach our support team/);
    // The hub question is its own bubble after the reply; wait for it, or the
    // first transcript could be captured mid-turn and the resumed one, which
    // lands whole, would not match.
    await screen.findByText('Is there anything else I can help you with today?');
    const before = domIds();
    first.unmount();

    render(<ChatShell />);
    await screen.findByText(/You can reach our support team/);

    // A returning viewer finds the transcript they left: same ids, in the same
    // order, whatever regrouped them in between.
    expect(domIds()).toEqual(before);
  });
});

describe('the block adapters', () => {
  const message = (parts: ChatBlock[]): ChatMessage => ({ id: 'test', role: 'assistant', parts, at: new Date() });

  it('has an adapter entry for every block type in the locked vocabulary', () => {
    for (const type of CHAT_BLOCK_TYPES) {
      expect(BLOCK_ADAPTERS[type], type).toBeTypeOf('function');
    }
  });

  it('renders text, link and the designed fallback', async () => {
    render(
      <Message
        message={message([
          { who: 'bot', type: 'text', text: 'hello' },
          { who: 'bot', type: 'link', href: 'https://www.flocksafety.com/', label: 'Flock Safety' },
          { who: 'bot', type: 'unknown', reason: 'Unknown block' },
        ])}
      />,
    );
    expect(await screen.findByText('hello')).toBeTruthy();
    const link = screen.getByText('Flock Safety').closest('a');
    expect(link?.getAttribute('href')).toBe('https://www.flocksafety.com/');
    // Inline link, not a button: it carries the open-in-new-tab glyph itself.
    expect(link?.querySelector('svg')).toBeTruthy();
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/opens in a new tab/)).toBeTruthy();
    expect(screen.getByText(/could not be shown/)).toBeTruthy();
  });

  it('issues no request for a frame URL outside the derived allowlist', () => {
    const { container } = render(
      <Message
        message={message([
          { who: 'bot', type: 'frame', src: 'https://example.com/', sandbox: '', title: 'example' },
        ])}
      />,
    );
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(screen.getByText(/Blocked at the seam/)).toBeTruthy();
  });

  it('contains a throwing adapter without costing the transcript', () => {
    const original = BLOCK_ADAPTERS.text;
    BLOCK_ADAPTERS.text = () => {
      throw new Error('boom');
    };
    try {
      render(
        <Message
          message={message([
            { who: 'bot', type: 'text', text: 'first' },
            { who: 'bot', type: 'text', text: 'second' },
          ])}
        />,
      );
      expect(screen.getAllByText(/This message could not be shown/)).toHaveLength(2);
      // every part is still in the DOM, so one bad adapter did not cost the run
      expect(screen.getAllByTestId('message-assistant')).toHaveLength(1);
    } finally {
      BLOCK_ADAPTERS.text = original;
    }
  });
});

describe('the disclosure', () => {
  it('is present from first paint and opens on tap', async () => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    const toggle = screen.getByTestId('disclosure-toggle');
    expect(screen.queryByTestId('disclosure-popover')).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId('disclosure-popover')).toBeTruthy());
    expect(screen.getByText("This is not Flock Safety; it's an artwork.")).toBeTruthy();
  });

  // The popover is non-modal, so it must also be dismissible without finding the
  // toggle again: Esc from anywhere, or a pointer landing outside it.
  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a pointer outside it', () => fireEvent.pointerDown(document.body)],
  ])('closes on %s', async (_name, dismiss) => {
    render(<ChatShell />);
    await screen.findByText(GREETING);
    fireEvent.click(screen.getByTestId('disclosure-toggle'));
    await waitFor(() => expect(screen.getByTestId('disclosure-popover')).toBeTruthy());

    dismiss();

    await waitFor(() => expect(screen.queryByTestId('disclosure-popover')).toBeNull());
  });
});
