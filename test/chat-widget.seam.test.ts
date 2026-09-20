// @vitest-environment jsdom
// Chat widget DOM seam: the widget's external behavior, evaluated in a real DOM
// (jsdom) against the exact bytes the host serves at `/chat/runtime.js` — the
// generated file that carries the client-side dialogue engine ahead of the
// widget, built by `pipeline/build-chat-runtime.mjs`, and resolved here through
// `pipeline/chat-assets.mjs` so the seam drives exactly what the host publishes.
// The engine seam (`test/chat.seam.test.ts`) drives the source module
// (`pipeline/chat-engine.mjs`); this one covers the surface the visitor sees,
// which no engine seam can reach: the three captured surfaces, the inert
// composer, the choice chips in the composer slot, complete-bubble replies, and
// the absence of typing indicators and sounds.
//
// There is no fetch stub: the engine runs the real `dialogue/flock.yarn`
// program in the page, so these assertions are the deployed conversation, and
// the resume case drives a real round trip through `localStorage`.
//
// SPDX-License-Identifier: CC0-1.0
import { afterEach, describe, expect, it } from 'vitest';
import type { DOMWindow } from 'jsdom';
import type { ChatLine } from '../pipeline/chat-turn.mjs';
// Side-effect import: the shipped source engine installs `window.__flockChatEngine`
// on the jsdom global. The parity block below drives it as the oracle the widget
// bundle must agree with, so the committed `chat-runtime.js` cannot go stale
// against the module `pipeline/build-chat-runtime.mjs` bundles.
import '../pipeline/chat-engine.mjs';
import { seamWindow, shippedAsset } from './seam-harness';

/** The source engine every turn below is compared against. */
const shippedEngine = window.__flockChatEngine!;

const CHAT_CSS = shippedAsset('/chat/widget.css');
/** The shipped runtime: the engine bundle plus the widget, concatenated. */
const CHAT_JS = shippedAsset('/chat/runtime.js');

// PINNED copy (s9 greeting, s10 general + support), the same strings
// test/chat.seam.test.ts locks against the dialogue.
const GREETING =
  'Hey there! I\u2019m Flock, your friendly AI Sales Assistant. What questions do you have about Flock\u2019s offerings today?';
const GENERAL =
  "I'm here to assist with any questions you have about Flock's safety technology, including our products, services, and how we can help improve public safety in your community or organization. How can I help you today?";
const SUPPORT =
  "You can reach our support team through the following channels: - Call us at +1 (866) 901-1781 - Email us at support@flocksafety.com Is there anything specific you'd like assistance with, or any other way I can help you today?";
const CLOSING = 'Thanks for stopping by — take care!';

const HUB = ['What can you help me with?', 'Get a Demo', 'Support'];
const GENERAL_PENDING = ['Get a Demo', 'Support', "That's all for now"];
const SUPPORT_PENDING = ['Get a Demo', "That's all for now"];

let win: DOMWindow;

/**
 * Mount the shipped asset into a fresh window. `seed` restores the two
 * localStorage keys a prior page left, which is how a reload is simulated.
 */
function mount(seed?: { session: string; state: string }) {
  const seam = seamWindow('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    prep: (window) => {
      if (!seed) return;
      window.localStorage.setItem('flock-chat-session', seed.session);
      window.localStorage.setItem('flock-chat-state', seed.state);
    },
  });
  win = seam.window;
  // a JSDOM document is parsed synchronously; if the runtime deferred to
  // DOMContentLoaded, release it
  if (!win.document.querySelector('.fpc-root')) {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return win;
}

const doc = () => win.document;
const $ = <T extends Element>(sel: string) => doc().querySelector<T>(sel);
const texts = (sel: string) => [...doc().querySelectorAll(sel)].map((el) => el.textContent);
/** Every rendered bubble, bot and visitor alike, in document order. */
const bubbleTexts = () => texts('.fpc-bubble, .fpc-bubble--me');
const chipTexts = () => texts('.fpc-chip');

/** Resolve the promise chain a turn schedules (the engine answers asynchronously). */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Open the expanded panel the way the visitor does: click the launcher. */
async function openPanel() {
  $<HTMLButtonElement>('.fpc-launcher')!.click();
  await flush();
}

/** Select one chip the way the visitor does. */
async function selectChip(text: string) {
  const chip = [...doc().querySelectorAll<HTMLButtonElement>('.fpc-chip')].find((c) => c.textContent === text);
  if (!chip) throw new Error(`no chip ${JSON.stringify(text)}`);
  chip.click();
  await flush();
}

afterEach(() => {
  win?.close();
});

describe('the three captured surfaces', () => {
  it('shows the launcher on load, and opens the expanded panel on click', async () => {
    mount();
    expect($('.fpc-launcher')).not.toBeNull();
    $<HTMLButtonElement>('.fpc-launcher')!.click();
    await flush();
    expect($('.fpc-surface--panel')).not.toBeNull();
    expect($('.fpc-launcher')).toBeNull();
    // opening starts the real conversation: the pinned greeting plus the hub
    expect(bubbleTexts()).toEqual([GREETING]);
    expect(chipTexts()).toEqual(HUB);
  });

  it('never peeks: scrolling cannot open a surface or start a conversation', async () => {
    mount();
    expect($('.fpc-surface')).toBeNull();
    Object.defineProperty(win, 'scrollY', { value: 400, writable: true, configurable: true });
    win.dispatchEvent(new win.Event('scroll'));
    await flush();
    expect($('.fpc-surface')).toBeNull();
    // no turn ran, so the engine wrote no session state
    expect(win.localStorage.getItem('flock-chat-state')).toBeNull();
  });
});

describe('the inert composer and its chips', () => {
  it('renders the pending choices as chips inside the composer slot', async () => {
    mount();
    await openPanel();
    const slot = $('.fpc-composer .fpc-slot');
    expect(slot).not.toBeNull();
    expect([...slot!.querySelectorAll('.fpc-chip')].map((c) => c.textContent)).toEqual(HUB);
  });

  it('shows the panel placeholder when the conversation has no pending choice', async () => {
    mount();
    await openPanel();
    await selectChip('What can you help me with?');
    await selectChip("That's all for now");
    // the end node completes the dialogue: a closing line and no chips
    expect(bubbleTexts()).toEqual([GREETING, 'What can you help me with?', GENERAL, "That's all for now", CLOSING]);
    expect(chipTexts()).toEqual([]);
    expect($('.fpc-placeholder')!.textContent).toBe('Enter a message');
  });

  it('selecting a chip reads as the visitor\u2019s own sent message and advances the turn', async () => {
    mount();
    await openPanel();
    await selectChip('What can you help me with?');
    // exactly ONE echo: the engine prepends the visitor line, so the widget must
    // not add its own copy (the double-echo this assertion guards against)
    expect(texts('.fpc-bubble--me')).toEqual(['What can you help me with?']);
    expect(bubbleTexts()).toEqual([GREETING, 'What can you help me with?', GENERAL]);
    expect(chipTexts()).toEqual(GENERAL_PENDING);
  });

  it('keeps the send button inert: no turn, no navigation, aria-disabled', async () => {
    mount();
    await openPanel();
    const send = $<HTMLButtonElement>('.fpc-send')!;
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.type).toBe('button');
    const before = bubbleTexts();
    send.click();
    await flush();
    expect(bubbleTexts()).toEqual(before);
    expect(texts('.fpc-bubble--me')).toEqual([]);
    expect(chipTexts()).toEqual(HUB);
  });
});

describe('replies and the no-sound / no-typing contract', () => {
  it('renders complete bubbles with no typing indicator and no sounds', async () => {
    mount();
    await openPanel();
    expect($('audio')).toBeNull();
    // no typing/dot/pulse affordance is rendered anywhere in the widget
    for (const el of doc().querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/typing|dot|pulse|bubblePop/i);
    }
    // the reply is a complete bubble, never a streaming placeholder
    expect($('.fpc-bubble')!.textContent).toBe(GREETING);
  });
});

describe('session persistence', () => {
  it('resumes the persisted conversation on reload instead of starting over', async () => {
    mount();
    await openPanel();
    await selectChip('Support');
    const session = win.localStorage.getItem('flock-chat-session');
    const state = win.localStorage.getItem('flock-chat-state');
    expect(session, 'the session id the widget persists').toBeTruthy();
    expect(state, 'the engine snapshot').toBeTruthy();
    win.close();

    // reload: a fresh window seeded with what the prior page left behind
    mount({ session: session as string, state: state as string });
    await flush(); // the widget's restore() resumes at mount
    $<HTMLButtonElement>('.fpc-launcher')!.click();
    await flush();

    // the whole thread is replayed, with no second greeting
    expect(bubbleTexts()).toEqual([GREETING, 'Support', SUPPORT]);
    expect(bubbleTexts().filter((text) => text === GREETING)).toHaveLength(1);
    // and the pending choice set is re-offered
    expect(chipTexts()).toEqual(SUPPORT_PENDING);
    // the session id survives the reload
    expect(win.localStorage.getItem('flock-chat-session')).toBe(session);
    // and the resume itself mutated nothing — the snapshot is byte-identical
    expect(win.localStorage.getItem('flock-chat-state')).toBe(state);
  });
});

describe('the widget renders exactly what the shipped engine returns', () => {
  /** Drive the shipped source engine down the same choice script and collect its turns. */
  async function engineConversation(
    script: string[],
  ): Promise<{ lines: ChatLine[]; options: string[] | null; vars: Record<string, unknown> }[]> {
    const steps: { lines: ChatLine[]; options: string[] | null; vars: Record<string, unknown> }[] = [];
    let res = await shippedEngine.turn({ type: 'start' });
    steps.push({ lines: res.turn.lines, options: res.turn.options?.map((o) => o.text) ?? null, vars: res.state.vars });
    for (const pick of script) {
      const live = await shippedEngine.turn({ type: 'resume', sessionId: res.sessionId });
      const index = live.turn.options?.find((o) => o.text === pick)?.index;
      if (index === undefined) throw new Error(`no engine option ${JSON.stringify(pick)}`);
      res = await shippedEngine.turn({ type: 'option', sessionId: res.sessionId, optionIndex: index });
      steps.push({ lines: res.turn.lines, options: res.turn.options?.map((o) => o.text) ?? null, vars: res.state.vars });
    }
    return steps;
  }

  it('renders the same lines, choice sets and variables the engine returns', async () => {
    const script = ['What can you help me with?', "That's all for now"];
    const steps = await engineConversation(script);
    const expectedLines = steps.flatMap((step) => step.lines.map((line) => line.text));
    /** The variables the client engine persisted for the live session. */
    const clientVars = () => JSON.parse(win.localStorage.getItem('flock-chat-state') as string).vars as Record<string, unknown>;

    mount();
    await openPanel();
    expect(clientVars()).toEqual(steps[0].vars);
    for (let i = 0; i < script.length; i++) {
      // the choices on offer agree before the next selection
      expect(chipTexts()).toEqual(steps[i].options ?? []);
      await selectChip(script[i]);
      // and so does the surfaced variable set (the serialization seam)
      expect(clientVars()).toEqual(steps[i + 1].vars);
    }
    expect(chipTexts()).toEqual(steps[script.length].options ?? []);
    expect(bubbleTexts()).toEqual(expectedLines);
  });
});

describe('what the host publishes', () => {
  it('ships the engine and the widget as one file, so they cannot ship out of step', () => {
    expect(CHAT_JS).toContain('__flockChatEngine');
    expect(CHAT_JS).toContain('fpc-launcher');
  });

  it('links the widget footer at the privacy path the host serves', async () => {
    mount();
    await openPanel();
    expect($<HTMLAnchorElement>('.fpc-footer a')!.getAttribute('href')).toBe('/legal/privacy-policy');
  });
});

/**
 * One `@media <condition>` block's declarations, keyed by selector.
 * jsdom does not evaluate media queries, so the mobile layout is checked as
 * the stylesheet's shape (the nav seam does the same for its reduced-motion
 * block); the rendered result is the human side-by-side evidence.
 */
function mediaRules(css: string, condition: string): Map<string, string> {
  const at = css.indexOf(`@media ${condition}`);
  if (at < 0) return new Map();
  const open = css.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const rules = new Map<string, string>();
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const chunk of body.split('}')) {
    const brace = chunk.indexOf('{');
    if (brace < 0) continue;
    rules.set(
      chunk.slice(0, brace).trim().replace(/\s+/g, ' '),
      chunk.slice(brace + 1).trim().replace(/\s+/g, ' '),
    );
  }
  return rules;
}

describe('mobile layout parity', () => {
  const mobile = mediaRules(CHAT_CSS, '(max-width: 767px)');

  it('keys the mobile variant on the stylesheet\u2019s own 767px breakpoint', () => {
    // jsdom evaluates no media queries, so the mobile layout is read as the
    // stylesheet's shape; the tests below read what the block says, and the
    // rendered result is the human side-by-side evidence.
    expect(mobile.size).toBeGreaterThan(0);
  });

  it('makes the expanded panel a fullscreen, square-cornered surface', () => {
    const panel = mobile.get('.fpc-surface--panel') ?? '';
    expect(panel).toMatch(/inset:\s*0/);
    expect(panel).toMatch(/width:\s*auto/);
    expect(panel).toMatch(/height:\s*auto/);
    expect(panel).toMatch(/max-height:\s*none/);
    expect(panel).toMatch(/min-height:\s*0/);
    expect(panel).toMatch(/border-radius:\s*0/);
    // the header and footer bands must go square with the surface, or their
    // 8px radii re-round the fullscreen corners
    expect(mobile.get('.fpc-surface--panel .fpc-header')).toMatch(/border-radius:\s*0/);
    expect(mobile.get('.fpc-surface--panel .fpc-footer')).toMatch(/border-radius:\s*0/);
  });

  it('docks the launcher at the captured 50px / 16px mobile geometry', () => {
    const launcher = mobile.get('.fpc-launcher') ?? '';
    expect(launcher).toMatch(/width:\s*50px/);
    expect(launcher).toMatch(/height:\s*50px/);
    expect(launcher).toMatch(/right:\s*16px/);
    expect(launcher).toMatch(/bottom:\s*16px/);
  });

  it('leaves the widget a static end-state \u2014 nothing for reduced motion to suppress', () => {
    // the widget never animates, and the next test pins that it never reads the
    // preference either; this guard is what keeps the two agreeing, so a future
    // mobile transition cannot ship without someone deciding what reduced motion
    // should do with it.
    expect(CHAT_CSS).not.toMatch(/transition|animation|@keyframes/i);
  });

  it('never reads the reduced-motion query \u2014 it has nothing to suppress', () => {
    const seam = seamWindow('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
    expect(seam.reducedMotion.reads()).toBe(0);
    expect(seam.reducedMotion.listeners()).toBe(0);
  });

  it('keeps the widget root above anything a host page might put on top', () => {
    // the widget was built for a page whose own furniture stacks over 2000, and
    // for a third-party badge that sits at the top of the range: it must clear
    // the first and stay under the second.
    const root = /\.fpc-root\s*\{[^}]*z-index:\s*(\d+)/.exec(CHAT_CSS);
    expect(root, 'the .fpc-root z-index').not.toBeNull();
    expect(Number(root![1])).toBeGreaterThan(2000);
    expect(Number(root![1])).toBeLessThan(2147483647);
  });
});
