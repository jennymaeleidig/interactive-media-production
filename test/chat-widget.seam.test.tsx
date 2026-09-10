// Chat widget DOM seam (ticket 09): the widget's external behavior, evaluated
// in a real DOM (jsdom) against the actual component. The spec's chat seam
// covers the message API; this one covers the surface the visitor sees, which
// the API seam cannot reach: the three captured surfaces, the scroll pounce,
// the inert composer, the choice chips in the composer slot, complete-bubble
// replies, and the absence of typing indicators and sounds.
//
// Fetch is stubbed with scripted turn batches, so the test is headless and
// never touches the network or the real capture run.
//
// SPDX-License-Identifier: CC0-1.0
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatWidget } from '../components/ChatWidget';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Node 26 exposes a global `localStorage` that is undefined without
// --localstorage-file, and it shadows jsdom's. Give the widget a real store.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

const GREETING = 'Hey there! I’m Flock, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?';
const GENERAL = 'I can help with our products and services. How can I help you today?';

interface Turn {
  lines: { from: 'bot' | 'me'; text: string }[];
  options: { index: number; text: string }[] | null;
  complete?: boolean;
}

/** A scripted per-turn responder; `start` and `option` return fresh batches. */
function scriptedFetch(script: { start: Turn; options: Record<number, Turn>; resume?: Turn }) {
  const calls: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push(body);
    let turn: Turn;
    if (body.type === 'resume') {
      turn = script.resume ?? { lines: [], options: null };
    } else if (body.type === 'option') {
      turn = script.options[body.optionIndex as number] ?? { lines: [], options: null };
    } else {
      turn = script.start;
    }
    return {
      ok: true,
      json: async () => ({
        sessionId: 's-test',
        turn: { lines: turn.lines, options: turn.options, complete: turn.complete ?? false },
        state: { node: 'Start', complete: false, vars: {} },
        ...(body.type === 'resume' ? { replay: turn.lines } : {}),
      }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const HUB = [
  { index: 0, text: 'What can you help me with?' },
  { index: 1, text: 'Get a Demo' },
  { index: 2, text: 'Support' },
];

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root = createRoot(container);
    root.render(<ChatWidget />);
  });
}

/** jsdom reports scrollY 0; set it and fire the captured pounce trigger. */
async function scrollPastFold() {
  Object.defineProperty(window, 'scrollY', { value: 400, writable: true, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(1500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the three captured surfaces', () => {
  it('shows the launcher on load, and opens the expanded panel on click', async () => {
    scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    expect(container.querySelector('.fpc-launcher')).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.fpc-launcher')!.click();
    });
    expect(container.querySelector('.fpc-surface--panel')).not.toBeNull();
    expect(container.querySelector('.fpc-launcher')).toBeNull();
  });

  it('fires the pounce on the captured scroll trigger and morphs into the panel from the greeting preview', async () => {
    scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    expect(container.querySelector('.fpc-surface--card')).toBeNull();
    await scrollPastFold();
    const card = container.querySelector('.fpc-surface--card');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(GREETING);
    // captured behavior: clicking the greeting preview opens the conversation
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.fpc-bubble--preview')!.click();
    });
    expect(container.querySelector('.fpc-surface--panel')).not.toBeNull();
  });

  it('does not re-pounce once the visitor has engaged', async () => {
    const calls = scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.fpc-launcher')!.click();
    });
    await scrollPastFold();
    // exactly one start: the launcher's; the scroll did not fire a second
    expect(calls.filter((c) => c.type === 'start')).toHaveLength(1);
  });
});

describe('the inert composer and its chips', () => {
  it('renders the pending choices as chips inside the composer slot', async () => {
    scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    await scrollPastFold();
    const slot = container.querySelector('.fpc-composer .fpc-slot');
    expect(slot).not.toBeNull();
    expect([...slot!.querySelectorAll('.fpc-chip')].map((c) => c.textContent)).toEqual([
      'What can you help me with?',
      'Get a Demo',
      'Support',
    ]);
  });

  it('shows the placeholder when no chips are pending — captured string per surface', async () => {
    scriptedFetch({
      start: { lines: [{ from: 'bot', text: GREETING }], options: null },
      options: {},
    });
    render();
    await scrollPastFold();
    expect(container.querySelector('.fpc-placeholder')!.textContent).toBe('Ask a question');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.fpc-bubble--preview')!.click();
    });
    expect(container.querySelector('.fpc-placeholder')!.textContent).toBe('Enter a message');
  });

  it('selecting a chip reads as the visitor’s own sent message and advances the turn', async () => {
    const calls = scriptedFetch({
      start: { lines: [{ from: 'bot', text: GREETING }], options: HUB },
      options: { 0: { lines: [{ from: 'me', text: 'What can you help me with?' }, { from: 'bot', text: GENERAL }], options: [{ index: 0, text: "That's all for now" }] } },
    });
    render();
    await scrollPastFold();
    const chip = [...container.querySelectorAll<HTMLButtonElement>('.fpc-chip')].find((c) => c.textContent === 'What can you help me with?')!;
    await act(async () => {
      chip.click();
    });
    const own = container.querySelector('.fpc-bubble--me');
    expect(own!.textContent).toBe('What can you help me with?');
    // exactly ONE echo: the engine prepends the visitor line, so the widget must
    // not add its own copy (the double-echo this assertion guards against)
    expect([...container.querySelectorAll('.fpc-bubble--me')].map((b) => b.textContent)).toEqual([
      'What can you help me with?',
    ]);
    expect(container.textContent).toContain(GENERAL); // the reply arrives as the next batch
    expect(calls.at(-1)).toMatchObject({ type: 'option', optionIndex: 0 });
  });

  it('keeps the send button inert: no turn, no navigation, aria-disabled', async () => {
    const calls = scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    await scrollPastFold();
    const before = calls.length;
    const send = container.querySelector<HTMLButtonElement>('.fpc-send')!;
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.type).toBe('button');
    await act(async () => {
      send.click();
    });
    expect(calls).toHaveLength(before);
  });
});

describe('replies and the no-sound / no-typing contract', () => {
  it('renders complete bubbles with no typing indicator and no sounds', async () => {
    scriptedFetch({ start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} });
    render();
    await scrollPastFold();
    expect(container.querySelector('audio')).toBeNull();
    // no typing/dot/pulse affordance is rendered anywhere in the widget
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/typing|dot|pulse|bubblePop/i);
    }
    // the reply is a complete bubble, never a streaming placeholder
    expect(container.querySelector('.fpc-bubble--bot')!.textContent).toBe(GREETING);
  });
});

describe('session persistence', () => {
  it('resumes a saved server-side session on reload instead of re-pouncing', async () => {
    const scripted = {
      start: { lines: [{ from: 'bot' as const, text: GREETING }], options: HUB },
      options: {},
      resume: {
        lines: [
          { from: 'bot' as const, text: GREETING },
          { from: 'me' as const, text: 'Support' },
        ],
        options: HUB,
      },
    };
    const calls = scriptedFetch(scripted);
    window.localStorage.setItem('flock-chat-session', 's-live');
    render();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls[0]).toMatchObject({ type: 'resume', sessionId: 's-live' });
    // the restored thread is there when the launcher opens the panel
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.fpc-launcher')!.click();
    });
    expect(container.textContent).toContain('Support');
    await scrollPastFold();
    expect(container.querySelector('.fpc-surface--card')).toBeNull(); // live session does not pounce
  });
});
