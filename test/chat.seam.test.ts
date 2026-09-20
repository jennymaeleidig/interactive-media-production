// Chat dialogue seam: the engine the piece ships, driven headlessly.
// start/resume/option → turn batches, choice sets, surfaced variables, session
// persistence across calls, and the email-gate branch shape. The engine under
// test is `pipeline/chat-engine.mjs` — the module
// `pipeline/build-chat-runtime.mjs` bundles into the committed
// `pipeline/chat-runtime.js`, which `/chat/runtime.js` publishes — run in a real
// DOM (jsdom) because its one session lives in `localStorage`, not in a server
// process. There is no HTTP boundary to drive: nothing answers a turn but this
// engine, so this is the surface that ships.
//
// The pinned strings are transcribed from one observed Qualified session, and
// that transcript is gone; these comments are the provenance now. The fixture
// fixes one canonical string per beat, so these tests lock the copy.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import type { ChatRequest, ChatResponse } from '../pipeline/chat-turn.mjs';
// Side-effect import: the engine installs its whole public surface as
// `window.__flockChatEngine`. Read live so a stale test cannot pass against a
// captured function if the module stops installing it.
import '../pipeline/chat-engine.mjs';

const engine = window.__flockChatEngine!;

/** One turn through the shipped engine, as the widget sends it. */
function turn(request: ChatRequest): Promise<ChatResponse> {
  return engine.turn(request);
}

// PINNED copy (s9 greeting, s10 general + support, s12 demo ask).
const GREETING =
  'Hey there! I’m Flock, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?';
const GENERAL =
  "I'm here to assist with any questions you have about Flock's safety technology, including our products, services, and how we can help improve public safety in your community or organization. How can I help you today?";
const SUPPORT =
  "You can reach our support team through the following channels: - Call us at +1 (866) 901-1781 - Email us at support@flocksafety.com Is there anything specific you'd like assistance with, or any other way I can help you today?";
const DEMO_ASK =
  "I'd be happy to help you book a demo! Could you please provide your email address? That way, we can set up a meeting to explore our solutions further.";
const CLOSING = 'Thanks for stopping by — take care!';

const HUB_OPTIONS = ['What can you help me with?', 'Get a Demo', 'Support'];

function start(): Promise<ChatResponse> {
  return turn({ type: 'start' });
}

/** Select the pending option whose rendered text matches. */
async function option(sessionId: string, text: string): Promise<ChatResponse> {
  const current = await turn({ type: 'resume', sessionId });
  const index = current.turn.options?.find((o) => o.text === text)?.index;
  if (index === undefined) throw new Error(`no pending option ${JSON.stringify(text)}`);
  return turn({ type: 'option', sessionId, optionIndex: index });
}

function texts(res: ChatResponse): string[] {
  return res.turn.lines.map((l) => l.text);
}
function optionTexts(res: ChatResponse): string[] | null {
  return res.turn.options ? res.turn.options.map((o) => o.text) : null;
}

describe('starting a session', () => {
  it('yields the pinned greeting and the hub option set', async () => {
    const res = await start();
    expect(res.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.turn.lines).toEqual([{ from: 'bot', text: GREETING }]);
    expect(optionTexts(res)).toEqual(HUB_OPTIONS);
    expect(res.turn.complete).toBe(false);
    expect(res.state.node).toBe('Start');
  });

  it('surfaces the session variables with the turn', async () => {
    const res = await start();
    expect(res.state.vars).toMatchObject({ demoRequested: false });
  });
});

describe('advancing the conversation', () => {
  it('echoes the selection as the visitor and yields the next reply', async () => {
    const first = await start();
    const second = await option(first.sessionId, 'What can you help me with?');
    expect(second.turn.lines).toEqual([
      { from: 'me', text: 'What can you help me with?' },
      { from: 'bot', text: GENERAL },
    ]);
    expect(optionTexts(second)).toEqual(['Get a Demo', 'Support', "That's all for now"]);
  });

  it('routes Support to the pinned support reply', async () => {
    const first = await start();
    const second = await option(first.sessionId, 'Support');
    expect(texts(second)).toEqual(['Support', SUPPORT]);
  });

  it('reaches completion through the exit choice', async () => {
    const first = await start();
    await option(first.sessionId, 'What can you help me with?');
    const second = await option(first.sessionId, "That's all for now");
    expect(second.turn.complete).toBe(true);
    expect(optionTexts(second)).toBeNull();
    expect(texts(second)).toEqual(["That's all for now", CLOSING]);
  });
});

describe('session persistence', () => {
  it('resumes a live session instead of resetting it (start is idempotent)', async () => {
    const first = await start();
    const advanced = await option(first.sessionId, 'Support');
    const restarted = await turn({ type: 'start', sessionId: first.sessionId });
    expect(restarted.turn.lines).toEqual([]); // no fresh greeting
    expect(restarted.state.node).toBe(advanced.state.node);
    expect(restarted.replay?.map((l) => l.text)).toEqual([GREETING, 'Support', SUPPORT]);
    // and it is live, not just replayable: another selection still advances
    expect(texts(await option(first.sessionId, 'Get a Demo'))).toEqual(['Get a Demo', DEMO_ASK]);
  });

  it('replays the conversation across a page reload (resume)', async () => {
    const first = await start();
    await option(first.sessionId, 'Get a Demo');
    const reloaded = await turn({ type: 'resume', sessionId: first.sessionId });
    expect(reloaded.replay?.map((l) => l.text)).toEqual([GREETING, 'Get a Demo', DEMO_ASK]);
    expect(optionTexts(reloaded)).toEqual(['Maybe later']);
    expect(reloaded.turn.lines).toEqual([]);
  });

  it('continues a reloaded conversation from where it left off', async () => {
    const first = await start();
    await option(first.sessionId, 'Support');
    await turn({ type: 'resume', sessionId: first.sessionId });
    const next = await option(first.sessionId, 'Get a Demo');
    expect(texts(next)).toEqual(['Get a Demo', DEMO_ASK]);
  });

  it('starts a fresh conversation when resuming an unknown session', async () => {
    const res = await turn({ type: 'resume', sessionId: 'no-such-session' });
    expect(texts(res)).toEqual([GREETING]);
  });
});

describe('the email gate (ratified)', () => {
  it('asks for the email with the pinned demo-ask string', async () => {
    const first = await start();
    const second = await option(first.sessionId, 'Get a Demo');
    expect(texts(second)).toEqual(['Get a Demo', DEMO_ASK]);
    expect(second.state.vars).toMatchObject({ demoRequested: true });
  });

  it('offers only "Maybe later" — no email capture, no booker', async () => {
    const first = await start();
    const second = await option(first.sessionId, 'Get a Demo');
    expect(optionTexts(second)).toEqual(['Maybe later']);
  });

  it('never dead-ends: "Maybe later" returns to the hub option set', async () => {
    const first = await start();
    await option(first.sessionId, 'Get a Demo');
    const gate = await option(first.sessionId, 'Maybe later');
    expect(gate.turn.complete).toBe(false);
    expect(optionTexts(gate)).toEqual(HUB_OPTIONS);
    expect(gate.turn.lines).toEqual([{ from: 'me', text: 'Maybe later' }]); // no re-greeting
    // and the hub is live: a further selection still advances
    const onward = await option(first.sessionId, 'Support');
    expect(texts(onward)).toEqual(['Support', SUPPORT]);
  });
});

describe('no rendered divergence notice', () => {
  it('keeps every rendered string free of prototype/marker language', async () => {
    const first = await start();
    const turns = [
      first,
      await option(first.sessionId, 'Get a Demo'),
      await option(first.sessionId, 'Maybe later'),
      await option(first.sessionId, 'What can you help me with?'),
    ];
    const rendered = [
      ...turns.flatMap((t) => t.turn.lines.map((l) => l.text)),
      ...turns.flatMap((t) => t.turn.options?.map((o) => o.text) ?? []),
    ];
    for (const text of rendered) {
      expect(text).not.toMatch(/prototype|divergen|not implemented|placeholder|TODO/i);
    }
  });
});

describe('stale-client guards', () => {
  it('ignores an out-of-range option index without throwing', async () => {
    const first = await start();
    const res = await turn({ type: 'option', sessionId: first.sessionId, optionIndex: 99 });
    expect(optionTexts(res)).toEqual(HUB_OPTIONS);
  });

  it('ignores an option selection when no choice set is pending', async () => {
    const first = await start();
    await option(first.sessionId, 'What can you help me with?');
    await option(first.sessionId, "That's all for now");
    const res = await turn({ type: 'option', sessionId: first.sessionId, optionIndex: 0 });
    expect(res.turn.complete).toBe(true);
    expect(optionTexts(res)).toBeNull();
  });
});
