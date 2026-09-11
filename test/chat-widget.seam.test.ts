// Chat widget DOM seam (ticket 09; re-pointed at the injected runtime by
// ticket 10): the widget's external behavior, evaluated in a real DOM (jsdom)
// against the exact bytes the build inlines on every launcher page
// (pipeline/chat-widget.js) — the same bytes every mounted served page
// carries. The spec's chat seam covers the message API; this one covers the
// surface the visitor sees, which the API seam cannot reach: the three
// captured surfaces, the scroll pounce, the inert composer, the choice chips
// in the composer slot, complete-bubble replies, and the absence of typing
// indicators and sounds.
//
// fetch is stubbed with scripted turn batches, so the test is headless and
// never touches the network or the real capture run. A fresh JSDOM window per
// test isolates the runtime's mount guard and its scroll listener.
//
// SPDX-License-Identifier: CC0-1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, type DOMWindow } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, '../pipeline/chat-widget.js'), 'utf8');

const GREETING = 'Hey there! I\u2019m Flock, your friendly AI Sales Assistant. What questions do you have about Flock\u2019s offerings today?';
const GENERAL = 'I can help with our products and services. How can I help you today?';

interface Turn {
  lines: { from: 'bot' | 'me'; text: string }[];
  options: { index: number; text: string }[] | null;
  complete?: boolean;
}
interface Script {
  start: Turn;
  options: Record<number, Turn>;
  resume?: Turn;
}

/** A scripted per-turn responder; `start` and `option` return fresh batches. */
function scriptedFetch(script: Script) {
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
  return { fetchMock, calls };
}

let win: DOMWindow;
let calls: Record<string, unknown>[];

/** Resolve the promise microtasks a turn's fetch chain schedules. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function mount(opts: { script: Script; saved?: string }) {
  const scripted = scriptedFetch(opts.script);
  calls = scripted.calls;
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  win = dom.window;
  // jsdom's own timers bypass vitest's fake timers; route the runtime's
  // window.setTimeout/clearTimeout to the ones this test controls.
  win.fetch = scripted.fetchMock as unknown as typeof fetch;
  win.setTimeout = globalThis.setTimeout as unknown as typeof window.setTimeout;
  win.clearTimeout = globalThis.clearTimeout as unknown as typeof window.clearTimeout;
  if (opts.saved) win.localStorage.setItem('flock-chat-session', opts.saved);
  (win as unknown as { eval: (src: string) => void }).eval(SOURCE);
  // a JSDOM document is parsed synchronously; if the runtime deferred to
  // DOMContentLoaded, release it
  if (!win.document.querySelector('.fpc-root')) {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return win;
}

const doc = () => win.document;
const $ = <T extends Element>(sel: string) => doc().querySelector<T>(sel);

/** jsdom reports scrollY 0; set it and fire the captured pounce trigger. */
async function scrollPastFold() {
  Object.defineProperty(win, 'scrollY', { value: 400, writable: true, configurable: true });
  win.dispatchEvent(new win.Event('scroll'));
  vi.advanceTimersByTime(1500);
  await flush();
}

const HUB = [
  { index: 0, text: 'What can you help me with?' },
  { index: 1, text: 'Get a Demo' },
  { index: 2, text: 'Support' },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  win?.close();
});

describe('the three captured surfaces', () => {
  it('shows the launcher on load, and opens the expanded panel on click', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    expect($('.fpc-launcher')).not.toBeNull();
    $<HTMLButtonElement>('.fpc-launcher')!.click();
    await flush();
    expect($('.fpc-surface--panel')).not.toBeNull();
    expect($('.fpc-launcher')).toBeNull();
  });

  it('fires the pounce on the captured scroll trigger and morphs into the panel from the greeting preview', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    expect($('.fpc-surface--card')).toBeNull();
    await scrollPastFold();
    const card = $('.fpc-surface--card');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(GREETING);
    // captured behavior: clicking the greeting preview opens the conversation
    $<HTMLButtonElement>('.fpc-bubble--preview')!.click();
    await flush();
    expect($('.fpc-surface--panel')).not.toBeNull();
  });

  it('does not re-pounce once the visitor has engaged', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    $<HTMLButtonElement>('.fpc-launcher')!.click();
    await flush();
    await scrollPastFold();
    // exactly one start: the launcher's; the scroll did not fire a second
    expect(calls.filter((c) => c.type === 'start')).toHaveLength(1);
  });
});

describe('the inert composer and its chips', () => {
  it('renders the pending choices as chips inside the composer slot', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    await scrollPastFold();
    const slot = $('.fpc-composer .fpc-slot');
    expect(slot).not.toBeNull();
    expect([...slot!.querySelectorAll('.fpc-chip')].map((c) => c.textContent)).toEqual([
      'What can you help me with?',
      'Get a Demo',
      'Support',
    ]);
  });

  it('shows the placeholder when no chips are pending — captured string per surface', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: null }, options: {} } });
    await scrollPastFold();
    expect($('.fpc-placeholder')!.textContent).toBe('Ask a question');
    $<HTMLButtonElement>('.fpc-bubble--preview')!.click();
    await flush();
    expect($('.fpc-placeholder')!.textContent).toBe('Enter a message');
  });

  it('selecting a chip reads as the visitor’s own sent message and advances the turn', async () => {
    mount({
      script: {
        start: { lines: [{ from: 'bot', text: GREETING }], options: HUB },
        options: {
          0: {
            lines: [{ from: 'me', text: 'What can you help me with?' }, { from: 'bot', text: GENERAL }],
            options: [{ index: 0, text: "That's all for now" }],
          },
        },
      },
    });
    await scrollPastFold();
    const chip = [...doc().querySelectorAll<HTMLButtonElement>('.fpc-chip')].find((c) => c.textContent === 'What can you help me with?')!;
    chip.click();
    await flush();
    const own = $('.fpc-bubble--me');
    expect(own!.textContent).toBe('What can you help me with?');
    // exactly ONE echo: the engine prepends the visitor line, so the widget must
    // not add its own copy (the double-echo this assertion guards against)
    expect([...doc().querySelectorAll('.fpc-bubble--me')].map((b) => b.textContent)).toEqual([
      'What can you help me with?',
    ]);
    expect(doc().body.textContent).toContain(GENERAL); // the reply arrives as the next batch
    expect(calls.at(-1)).toMatchObject({ type: 'option', optionIndex: 0 });
  });

  it('keeps the send button inert: no turn, no navigation, aria-disabled', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    await scrollPastFold();
    const before = calls.length;
    const send = $<HTMLButtonElement>('.fpc-send')!;
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.type).toBe('button');
    send.click();
    await flush();
    expect(calls).toHaveLength(before);
  });
});

describe('replies and the no-sound / no-typing contract', () => {
  it('renders complete bubbles with no typing indicator and no sounds', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    await scrollPastFold();
    expect($('audio')).toBeNull();
    // no typing/dot/pulse affordance is rendered anywhere in the widget
    for (const el of doc().querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/typing|dot|pulse|bubblePop/i);
    }
    // the reply is a complete bubble, never a streaming placeholder
    expect($('.fpc-bubble--bot')!.textContent).toBe(GREETING);
  });
});

describe('session persistence', () => {
  it('resumes a saved server-side session on reload instead of re-pouncing', async () => {
    mount({
      saved: 's-live',
      script: {
        start: { lines: [{ from: 'bot', text: GREETING }], options: HUB },
        options: {},
        resume: {
          lines: [
            { from: 'bot', text: GREETING },
            { from: 'me', text: 'Support' },
          ],
          options: HUB,
        },
      },
    });
    await flush();
    expect(calls[0]).toMatchObject({ type: 'resume', sessionId: 's-live' });
    // the restored thread is there when the launcher opens the panel
    $<HTMLButtonElement>('.fpc-launcher')!.click();
    await flush();
    expect(doc().body.textContent).toContain('Support');
    await scrollPastFold();
    expect($('.fpc-surface--card')).toBeNull(); // live session does not pounce
  });

  it('cancels an already-armed pounce when a live session lands (the resume/scroll race)', async () => {
    mount({
      saved: 's-live',
      script: {
        start: { lines: [{ from: 'bot', text: GREETING }], options: HUB },
        options: {},
        resume: { lines: [{ from: 'bot', text: GREETING }], options: HUB },
      },
    });
    // scroll before the resume resolves: the pounce timer arms on a not-yet-live session
    Object.defineProperty(win, 'scrollY', { value: 400, writable: true, configurable: true });
    win.dispatchEvent(new win.Event('scroll'));
    await flush(); // the resume lands and must cancel the armed timer
    vi.advanceTimersByTime(1500);
    await flush();
    expect($('.fpc-surface--card')).toBeNull();
    expect(calls.filter((c) => c.type === 'start')).toHaveLength(0);
  });
});

describe('site-wide mount invariants', () => {
  it('never requests anything but its own message API', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    await scrollPastFold();
    $<HTMLButtonElement>('.fpc-bubble--preview')!.click();
    await flush();
    const fetchMock = win.fetch as unknown as ReturnType<typeof vi.fn>;
    for (const call of fetchMock.mock.calls) expect(call[0]).toBe('/api/chat');
  });

  it('links the widget footer at the Recreation’s own privacy route', async () => {
    mount({ script: { start: { lines: [{ from: 'bot', text: GREETING }], options: HUB }, options: {} } });
    await scrollPastFold();
    expect($<HTMLAnchorElement>('.fpc-footer a')!.getAttribute('href')).toBe('/legal/privacy-policy');
  });
});
