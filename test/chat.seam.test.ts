// Chat dialogue seam: the engine the piece ships, driven headlessly.
// start/resume/option → turn blocks, choice sets, surfaced variables, session
// persistence across calls, and the email-gate branch shape. The engine under
// test is `pipeline/chat-engine.mjs` — the module
// `pipeline/build-chat-runtime.mjs` bundles into the committed
// `pipeline/chat-runtime.js`, which `/chat/runtime.js` publishes — run in a real
// DOM (jsdom) because its one session lives in `localStorage`, not in a server
// process. There is no HTTP boundary to drive: nothing answers a turn but this
// engine, so this is the surface that ships.
//
// A turn out is a sequence of blocks (`pipeline/chat-turn.mjs`), so these tests
// assert the exact block sequence the viewer sees. Blocks authored in Yarn as
// plain lines are `text` blocks; `<<block "id">>` resolves against the inventory
// (`pipeline/chat-blocks.mjs`). Containment is a contract term here too: an id
// the inventory does not name degrades to a designed fallback and cannot cost
// the rest of the turn.
//
// The pinned strings are transcribed from one observed Qualified session, and
// that transcript is gone; these comments are the provenance now. The fixture
// fixes one canonical string per beat, so these tests lock the copy.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import type { ChatBlock, ChatRequest, ChatResponse } from '../pipeline/chat-turn.mjs';
import { CHAT_BLOCKS } from '../pipeline/chat-blocks.mjs';
// Side-effect import: the engine installs its whole public surface as
// `window.__flockChatEngine`. Read live so a stale test cannot pass against a
// captured function if the module stops installing it.
import '../pipeline/chat-engine.mjs';

const engine = window.__flockChatEngine!;

/** One turn through the shipped engine, as the shell sends it. */
function turn(request: ChatRequest): Promise<ChatResponse> {
  return engine.turn(request);
}

/** One authored text block, as the engine builds it. */
function text(who: 'bot' | 'me', body: string): ChatBlock {
  return { who, type: 'text', text: body };
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

/** The seeded link block, exactly as `pipeline/chat-blocks.mjs` declares it. */
const FLOCK_LINK: ChatBlock = { who: 'bot', type: 'link', href: 'https://www.flocksafety.com/', label: 'Flock Safety', newMessage: true };

function start(): Promise<ChatResponse> {
  return turn({ type: 'start' });
}

/** Select the pending option whose rendered text matches. */
async function option(sessionId: string, label: string): Promise<ChatResponse> {
  const current = await turn({ type: 'resume', sessionId });
  const index = current.turn.options?.find((o) => o.text === label)?.index;
  if (index === undefined) throw new Error(`no pending option ${JSON.stringify(label)}`);
  return turn({ type: 'option', sessionId, optionIndex: index });
}

/** The text of every text block in a turn, in order. */
function texts(res: ChatResponse): string[] {
  return res.turn.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []));
}
function optionTexts(res: ChatResponse): string[] | null {
  return res.turn.options ? res.turn.options.map((o) => o.text) : null;
}
function replayTexts(res: ChatResponse): string[] {
  return (res.replay ?? []).flatMap((block) => (block.type === 'text' ? [block.text] : []));
}

describe('starting a session', () => {
  it('yields the pinned greeting as a text block and the hub option set', async () => {
    const res = await start();
    expect(res.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.turn.blocks).toEqual([text('bot', GREETING)]);
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
    expect(second.turn.blocks).toEqual([
      text('me', 'What can you help me with?'),
      text('bot', GENERAL),
    ]);
    expect(optionTexts(second)).toEqual(['Get a Demo', 'Support', "That's all for now"]);
  });

  it('routes Support to the pinned support reply', async () => {
    const first = await start();
    const second = await option(first.sessionId, 'Support');
    expect(texts(second)).toEqual(['Support', SUPPORT]);
  });

  it('reaches completion through the exit choice, carrying the authored blocks', async () => {
    const first = await start();
    await option(first.sessionId, 'What can you help me with?');
    const second = await option(first.sessionId, "That's all for now");
    expect(second.turn.complete).toBe(true);
    expect(optionTexts(second)).toBeNull();
    expect(second.turn.blocks).toEqual([
      text('me', "That's all for now"),
      text('bot', CLOSING),
      FLOCK_LINK,
    ]);
  });
});

describe('block resolution (containment)', () => {
  it('resolves an authored id against the inventory without a URL in the program', async () => {
    const first = await start();
    await option(first.sessionId, 'What can you help me with?');
    const end = await option(first.sessionId, "That's all for now");
    expect(end.turn.blocks).toContainEqual(FLOCK_LINK);
  });

  it('degrades an id the inventory does not name without costing the turn', async () => {
    // Mask the seeded entry so the authored id stops resolving; the fallback is
    // the engine's, not a fixture bug shipped in the program.
    const inventory = CHAT_BLOCKS as unknown as Record<string, unknown>;
    const saved = inventory['flock-home'];
    delete inventory['flock-home'];
    try {
      const first = await start();
      await option(first.sessionId, 'What can you help me with?');
      const end = await option(first.sessionId, "That's all for now");
      expect(end.turn.blocks).toEqual([
        text('me', "That's all for now"),
        text('bot', CLOSING),
        { who: 'bot', type: 'unknown', id: 'flock-home', reason: 'Unknown block', newMessage: true },
      ]);
    } finally {
      inventory['flock-home'] = saved;
    }
  });
});

describe('session persistence', () => {
  it('resumes a live session instead of resetting it (start is idempotent)', async () => {
    const first = await start();
    const advanced = await option(first.sessionId, 'Support');
    const restarted = await turn({ type: 'start', sessionId: first.sessionId });
    expect(restarted.turn.blocks).toEqual([]); // no fresh greeting
    expect(restarted.state.node).toBe(advanced.state.node);
    expect(replayTexts(restarted)).toEqual([GREETING, 'Support', SUPPORT]);
    // and it is live, not just replayable: another selection still advances
    expect(texts(await option(first.sessionId, 'Get a Demo'))).toEqual(['Get a Demo', DEMO_ASK]);
  });

  it('replays the conversation across a page reload (resume)', async () => {
    const first = await start();
    await option(first.sessionId, 'Get a Demo');
    const reloaded = await turn({ type: 'resume', sessionId: first.sessionId });
    expect(replayTexts(reloaded)).toEqual([GREETING, 'Get a Demo', DEMO_ASK]);
    expect(optionTexts(reloaded)).toEqual(['Maybe later']);
    expect(reloaded.turn.blocks).toEqual([]);
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
    expect(gate.turn.blocks).toEqual([text('me', 'Maybe later')]); // no re-greeting
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
      ...turns.flatMap((t) => t.turn.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []))),
      ...turns.flatMap((t) => t.turn.options?.map((o) => o.text) ?? []),
    ];
    for (const body of rendered) {
      expect(body).not.toMatch(/prototype|divergen|not implemented|placeholder|TODO/i);
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

  it('ignores a session blob whose blocks an older build wrote', async () => {
    const stale = {
      sessionId: 'stale-old-build',
      vars: {},
      log: [{ who: 'bot', text: 'the pre-block shape' }],
      node: 'Start',
      complete: false,
    };
    window.localStorage.setItem('flock-chat-state', JSON.stringify(stale));
    const res = await turn({ type: 'resume', sessionId: 'stale-old-build' });
    // Treated as absent, so the visitor gets a fresh greeting rather than a
    // replayed log of blocks no adapter can dispatch.
    expect(res.turn.blocks).toEqual([text('bot', GREETING)]);
  });

  it('ignores a session blob naming a node this program no longer declares', async () => {
    const stale = { sessionId: 'stale-old-node', vars: {}, log: [], node: 'RemovedNode', complete: false };
    window.localStorage.setItem('flock-chat-state', JSON.stringify(stale));
    const res = await turn({ type: 'resume', sessionId: 'stale-old-node' });
    expect(res.turn.blocks).toEqual([text('bot', GREETING)]);
  });
});
