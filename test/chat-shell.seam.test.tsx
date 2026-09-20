// @vitest-environment jsdom
// Chat shell seam: the surface the viewer sees, mounted in a real DOM (jsdom)
// against the exact engine bytes the host serves at `/chat/runtime.js`. The
// React shell itself ships in the page's own bundle (ticket 11), so this seam
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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatShell } from '@/components/chat/chat-shell';
import { BLOCK_ADAPTERS, Message } from '@/components/chat/message';
import { CHAT_BLOCK_TYPES } from '@/pipeline/chat-turn.mjs';
import type { ChatBlock, ChatMessage } from '@/lib/types';
import { shippedAsset } from './seam-harness';

const GREETING =
  'Hey there! I’m Flock, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?';

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
  (window as unknown as { eval: (source: string) => void }).eval(shippedAsset('/chat/runtime.js'));
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
});

describe('the block adapters', () => {
  const message = (parts: ChatBlock[]): ChatMessage => ({ id: 'test', role: 'assistant', parts });

  it('has an adapter entry for every block type in the locked vocabulary', () => {
    for (const type of CHAT_BLOCK_TYPES) {
      expect(BLOCK_ADAPTERS[type], type).toBeTypeOf('function');
    }
  });

  it('renders text, link and the designed fallback', () => {
    render(
      <Message
        message={message([
          { who: 'bot', type: 'text', text: 'hello' },
          { who: 'bot', type: 'link', href: 'https://www.flocksafety.com/', label: 'Flock Safety' },
          { who: 'bot', type: 'unknown', reason: 'Unknown block' },
        ])}
      />,
    );
    expect(screen.getByText('hello')).toBeTruthy();
    const link = screen.getByText('Flock Safety').closest('a');
    expect(link?.getAttribute('href')).toBe('https://www.flocksafety.com/');
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
});
