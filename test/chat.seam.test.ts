// Chat dialogue seam: the engine the piece ships, driven headlessly.
// start/option → the whole block sequence each turn, the live choice sets, surfaced
// variables, session persistence across calls, and the branch shape of the four
// flows (general / Products & offerings / Get a Demo / Privacy & safety) plus
// Support and the closing.
// The engine under test is `scripts/chat-engine.mjs` — the module
// `scripts/build-chat-runtime.mjs` bundles into the committed
// `scripts/chat-runtime.js`, which `/chat/runtime.js` publishes — run in a real
// DOM (jsdom) because its one session lives in `localStorage`, not in a server
// process. There is no HTTP boundary to drive: nothing answers a turn but this
// engine, so this is the surface that ships.
//
// A turn out is the whole block sequence so far (`lib/chat-turn.mjs`), so
// these tests assert the exact block sequence the viewer sees. Blocks authored in
// Yarn as plain lines are `text` blocks; `<<block "id">>` resolves against the
// inventory (`lib/chat-blocks.mjs`). Containment is a contract term here
// too: an id the inventory does not name degrades to a designed fallback and
// cannot cost the rest of the turn.
//
// The copy is locked, not sampled: OBSERVED strings come from the one observed
// Qualified session, ADAPTED strings are those with the speaker renamed, and
// AUTHORED strings trace to a Flock page (`assets/dialogue/` carries a
// `// src:` line above each). A copy change fails a test here instead of
// drifting, which is the whole reason these constants are spelled out.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { compileSource } from 'yarnspinner-typescript';
import { loadYarnProject } from 'yarnspinner-typescript/node';
import type { ChatBlock, ChatRequest, ChatResponse } from '../lib/chat-turn.mjs';
import { CHAT_BLOCKS } from '../lib/chat-blocks.mjs';
import { groupBlocks } from '../lib/transcript';
// Side-effect import: the engine installs its whole public surface as
// `window.__flockChatEngine`. Read live so a stale test cannot pass against a
// captured function if the module stops installing it.
import '../scripts/chat-engine.mjs';

const engine = window.__flockChatEngine!;

/** One compiled instruction, as this suite needs to read it. */
type Instruction = { op: string; text?: string; tags?: string[]; content?: string; node?: string };

/** The committed program the runtime inlines — read from disk rather than
 * imported, so the guards assert on the bytes that ship (`npm run chat:check`
 * is what keeps them following from the Yarn sources). */
const program = JSON.parse(readFileSync(resolve('scripts/chat-program.json'), 'utf8')) as {
  nodes: Record<string, { instructions: Instruction[] }>;
};

/** The project file the build reads — the declaration surface these guards
 * assert on, so a command typo fails here rather than in the editor alone. */
const PROJECT_FILE = resolve('assets/dialogue/flock.yarnproject');

// The session is the one the engine owns; each case starts from an empty page.
beforeEach(() => {
  window.localStorage.clear();
});

/** One turn through the shipped engine, as the shell sends it. */
function turn(request: ChatRequest): Promise<ChatResponse> {
  return engine.turn(request);
}

/** One authored text block, as the engine builds it. */
function text(who: 'bot' | 'me', body: string): ChatBlock {
  return { who, type: 'text', text: body };
}

/** One Cam line, exactly as the engine delivers it. */
function cam(body: string): ChatBlock {
  return text('bot', body);
}

/** A Cam line carrying `#newmessage`: it opens a fresh bubble. */
function cut(body: string): ChatBlock {
  return { ...text('bot', body), newMessage: true };
}

/** The viewer's own line; `cut` marks the second bubble of a ` ~ ` echo. */
function me(body: string, isCut = false): ChatBlock {
  return isCut ? { ...text('me', body), newMessage: true } : text('me', body);
}

// ADAPTED (s9 greeting; the name is the piece's, the rest is verbatim).
const GREETING =
  'Hey there! I’m Cam, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?';
// OBSERVED (s10 general).
const GENERAL =
  "I'm here to assist with any questions you have about Flock's safety technology, including our products, services, and how we can help improve public safety in your community or organization. How can I help you today?";
// OBSERVED (s10 support) — Flock's own phone number and address, verbatim.
const SUPPORT =
  "You can reach our support team through the following channels: - Call us at +1 (866) 901-1781 - Email us at support@flocksafety.com Is there anything specific you'd like assistance with, or any other way I can help you today?";
// OBSERVED (s12 demo ask) — the email gate's question; the piece never takes the
// address, so the only way on is "Maybe later".
const DEMO_ASK =
  "I'd be happy to help you book a demo! Could you please provide your email address? That way, we can set up a meeting to explore our solutions further.";
// OBSERVED (s10 closing).
const CLOSING = 'Thanks for stopping by — take care!';

// AUTHORED — the demo flow's opener, then the hub's return line.
const DEMO_INTRO =
  "A demo walks you through the Flock Difference: the largest public-private safety network, technology that's always up-to-date, and privacy-first accountability.";
const DEMO_CONNECT = 'Everything connected, with no silos.';
const HUB_LINE = 'Is there anything else I can help you with today?';
// AUTHORED — the products menu.
const PRODUCTS_LINE =
  'Flock brings the tools together: solar-powered cameras and devices that capture actionable evidence, drones that arrive on-scene in seconds, and software that turns real-time intel into faster investigations.';
const CAMERAS_LINE = 'Solar-powered devices that detect threats and capture actionable evidence.';
// AUTHORED — one representative product leaf, end to end.
const LPR_ONE =
  'Solar-powered license plate readers capture accurate plates and vehicle details in any condition — up to 100 mph, day and night, and up to 75 feet away.';
const LPR_TWO =
  "They feed the nation's largest connected LPR network, which helps law enforcement, businesses, and communities share vehicle evidence securely.";
// AUTHORED — the privacy & safety menu.
const PRIVACY_LINE =
  'Safety is a fundamental right. Public safety technology affects real people and neighborhoods, so Flock builds clear limits into the product, keeps decisions with local agencies, and records system use so it can be reviewed.';
const MYTHS_ONE = 'Is LPR mass surveillance? No. It is used for specific public safety investigations under rules set by your local agency.';

// The two chip sets: first contact offers the general beat, and the hub is the
// same four topics with the exit.
const START_OPTIONS = ['What can you help me with?', 'Products & offerings', 'Get a Demo', 'Privacy & safety', 'Support'];
const HUB_OPTIONS = ['Products & offerings', 'Get a Demo', 'Privacy & safety', 'Support', "That's all for now"];
const PRODUCT_GROUPS = ['Cameras & Devices', 'Flock Drones', 'Software'];
const CAMERA_PRODUCTS = ['License Plate Readers', 'Video Cameras', 'Mobile Security Trailers', 'Gunshot & Audio Detection'];
const PRIVACY_TOPICS = ['Data & retention', 'Facial recognition', 'Who can access it', 'Myths & facts'];

/** One seeded inventory entry, exactly as `lib/chat-blocks.mjs` declares it. */
function inventoryLink(id: keyof typeof CHAT_BLOCKS, newMessage = false): ChatBlock {
  const payload = CHAT_BLOCKS[id];
  if (payload.type !== 'link') throw new Error(`${id} is not a link`);
  return { who: 'bot', ...payload, ...(newMessage ? { newMessage: true } : {}) };
}

const PRODUCTS_LINK = inventoryLink('flock-products');
const DEMO_LINK = inventoryLink('flock-demo');
const TRUST_LINK = inventoryLink('flock-trust');
const HOME_LINK = inventoryLink('flock-home', true);

function start(): Promise<ChatResponse> {
  return turn({ type: 'start' });
}

/** Select the pending option whose rendered text matches. */
async function option(label: string): Promise<ChatResponse> {
  const current = await start();
  const index = current.turn.options?.find((o) => o.text === label)?.index;
  if (index === undefined) throw new Error(`no pending option ${JSON.stringify(label)}`);
  return turn({ type: 'option', optionIndex: index });
}

function optionTexts(res: ChatResponse): string[] | null {
  return res.turn.options ? res.turn.options.map((o) => o.text) : null;
}

/** The text of every text block in the block sequence, in order. */
function texts(res: ChatResponse): string[] {
  return res.turn.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []));
}

/** Every bubble the transcript would draw, as the label-or-text of its parts. */
function bubbles(res: ChatResponse): string[][] {
  return groupBlocks(res.turn.blocks).map((run) =>
    run.parts.map((part) => (part.type === 'text' ? part.text : part.type === 'link' ? part.label : part.type)),
  );
}

describe('starting a session', () => {
  it('yields the greeting as a text block and the first-contact option set', async () => {
    const res = await start();
    expect(res.turn.blocks).toEqual([cam(GREETING)]);
    expect(optionTexts(res)).toEqual(START_OPTIONS);
    expect(res.state.complete).toBe(false);
    expect(res.state.node).toBe('Start');
  });

  it('surfaces the session variables with the turn', async () => {
    const res = await start();
    expect(res.state.vars).toMatchObject({ demoRequested: false });
  });

  it('gives the first-contact set the general beat and no exit chip', async () => {
    // The exit belongs to the hub: at first contact the viewer has seen nothing
    // to close.
    expect(optionTexts(await start())).not.toContain("That's all for now");
  });
});

describe('advancing the conversation', () => {
  it('answers "What can you help me with?" with the observed general reply, then the hub', async () => {
    const second = await option('What can you help me with?');
    expect(second.turn.blocks).toEqual([cam(GREETING), me('What can you help me with?'), cam(GENERAL), cut(HUB_LINE)]);
    expect(optionTexts(second)).toEqual(HUB_OPTIONS);
    expect(second.state.node).toBe('hub');
  });

  it('routes Support to the observed support reply, then the hub', async () => {
    const second = await option('Support');
    expect(texts(second)).toEqual([GREETING, 'Support', SUPPORT, HUB_LINE]);
  });

  it('opens the Products & offerings menu with its three groups and the inventory link', async () => {
    const second = await option('Products & offerings');
    expect(second.turn.blocks).toEqual([cam(GREETING), me('Products & offerings'), cam(PRODUCTS_LINE), PRODUCTS_LINK]);
    expect(optionTexts(second)).toEqual(PRODUCT_GROUPS);
  });

  it('opens the Privacy & safety menu with the four trust topics', async () => {
    const second = await option('Privacy & safety');
    expect(second.turn.blocks).toEqual([cam(GREETING), me('Privacy & safety'), cam(PRIVACY_LINE), TRUST_LINK]);
    expect(optionTexts(second)).toEqual(PRIVACY_TOPICS);
  });

  it('reaches a product leaf three levels down and lands it on the hub', async () => {
    await option('Products & offerings');
    await option('Cameras & Devices');
    const leaf = await option('License Plate Readers');
    expect(texts(leaf)).toEqual([
      GREETING,
      'Products & offerings',
      PRODUCTS_LINE,
      'Cameras & Devices',
      CAMERAS_LINE,
      'License Plate Readers',
      LPR_ONE,
      LPR_TWO,
      HUB_LINE,
    ]);
    expect(optionTexts(leaf)).toEqual(HUB_OPTIONS);
  });
});

describe('the return hub', () => {
  it('is the same node with the same five chips however a spoke ends', async () => {
    const general = await option('What can you help me with?');
    const support = await option('Support');
    // The demo opener is its own beat; the gate's exit is what returns to the hub.
    await option('Get a Demo');
    const gate = await option('Maybe later');
    await option('Products & offerings');
    await option('Cameras & Devices');
    const leaf = await option('License Plate Readers');
    await option('Privacy & safety');
    const topic = await option('Myths & facts');
    for (const [name, res] of [
      ['general', general],
      ['support', support],
      ['the email gate', gate],
      ['a product leaf', leaf],
      ['a privacy topic', topic],
    ] as const) {
      expect(optionTexts(res), name).toEqual(HUB_OPTIONS);
      expect(res.state.node, name).toBe('hub');
    }
  });

  it('lands the hub question in its own bubble, never glued to the beat', async () => {
    const second = await option('Support');
    // [greeting] [the viewer] [support reply] [hub question]
    expect(bubbles(second).at(-1)).toEqual([HUB_LINE]);
  });
});

describe('the email gate (ratified)', () => {
  it('plays the demo opener, the link, then the observed ask', async () => {
    const second = await option('Get a Demo');
    expect(second.turn.blocks).toEqual([
      cam(GREETING),
      me('Get a Demo'),
      cam(DEMO_INTRO),
      cut(DEMO_CONNECT),
      DEMO_LINK,
      cut(DEMO_ASK),
    ]);
    expect(second.state.vars).toMatchObject({ demoRequested: true });
  });

  it('offers only "Maybe later" — no email capture, no booker', async () => {
    const second = await option('Get a Demo');
    expect(optionTexts(second)).toEqual(['Maybe later']);
  });

  it('never dead-ends: "Maybe later" returns to the hub rather than re-greeting', async () => {
    await option('Get a Demo');
    const gate = await option('Maybe later');
    expect(gate.state.complete).toBe(false);
    expect(optionTexts(gate)).toEqual(HUB_OPTIONS);
    expect(texts(gate).at(-1)).toBe(HUB_LINE);
    // and the returned hub is live: another selection still advances
    expect(texts(await option('Support'))).toContain(SUPPORT);
  });
});

describe('the exit', () => {
  it('closes the conversation with the observed sign-off and the home link', async () => {
    await option('What can you help me with?');
    const end = await option("That's all for now");
    expect(end.state.complete).toBe(true);
    expect(optionTexts(end)).toBeNull();
    expect(end.turn.blocks).toEqual([
      cam(GREETING),
      me('What can you help me with?'),
      cam(GENERAL),
      cut(HUB_LINE),
      me("That's all for now"),
      me('talk soon', true),
      cam(CLOSING),
      HOME_LINK,
    ]);
  });

  it('splits the exit echo at ` ~ ` and puts the link in its own bubble', async () => {
    await option('What can you help me with?');
    // Each echoed segment is its own `me` block cut at `newMessage`, so the
    // viewer's turn lands as two bubbles; the sign-off and the link follow.
    expect(bubbles(await option("That's all for now")).slice(-4)).toEqual([
      ["That's all for now"],
      ['talk soon'],
      [CLOSING],
      ['Flock Safety'],
    ]);
  });
});

describe('restarting (the mechanism a viewer control reads)', () => {
  it('resumes a finished conversation as finished, so the restart is the only way on', async () => {
    await option('What can you help me with?');
    const finished = await option("That's all for now");
    const resumed = await start();
    expect(resumed.turn.blocks).toEqual(finished.turn.blocks);
    expect(optionTexts(resumed)).toBeNull();
    expect(resumed.state.complete).toBe(true);
  });

  it('reset forgets the finished conversation and reopens at the greeting', async () => {
    await option('What can you help me with?');
    await option("That's all for now");
    const fresh = await engine.reset();
    expect(texts(fresh)).toEqual([GREETING]);
    expect(optionTexts(fresh)).toEqual(START_OPTIONS);
    expect(fresh.state.complete).toBe(false);
    // and the forget held: a reload after the reset stays fresh, resurrecting
    // nothing from the dropped conversation.
    expect(texts(await start())).toEqual([GREETING]);
  });
});

describe('block resolution (containment)', () => {
  it('resolves an authored id against the inventory without a URL in the program', async () => {
    await option('What can you help me with?');
    const end = await option("That's all for now");
    expect(end.turn.blocks).toContainEqual(HOME_LINK);
  });

  it('degrades an id the inventory does not name without costing the turn', async () => {
    // Mask the seeded entry so the authored id stops resolving; the fallback is
    // the engine's, not a fixture bug shipped in the program.
    const inventory = CHAT_BLOCKS as unknown as Record<string, unknown>;
    const saved = inventory['flock-home'];
    delete inventory['flock-home'];
    try {
      await option('What can you help me with?');
      const end = await option("That's all for now");
      expect(end.turn.blocks).toEqual([
        cam(GREETING),
        me('What can you help me with?'),
        cam(GENERAL),
        cut(HUB_LINE),
        me("That's all for now"),
        me('talk soon', true),
        cam(CLOSING),
        { who: 'bot', type: 'unknown', id: 'flock-home', reason: 'Unknown block', newMessage: true },
      ]);
    } finally {
      inventory['flock-home'] = saved;
    }
  });
});

describe('`#newmessage` (the authored bubble boundary)', () => {
  it('cuts the bubble at a tagged line, and a bare block joins the one it follows', async () => {
    const demo = await option('Get a Demo');
    // [greeting] [the viewer] [the opener] [connected + the link] [the ask]
    // The opener and "everything connected" are both Cam lines and would share a
    // bubble untagged; the link carries no tag and stays in the bubble it
    // follows; the ask opens its own.
    expect(bubbles(demo)).toEqual([
      [GREETING],
      ['Get a Demo'],
      [DEMO_INTRO],
      [DEMO_CONNECT, 'Book a demo'],
      [DEMO_ASK],
    ]);
  });

  it('is the only authored way to break a speaker run', async () => {
    // Two untagged adjacent Cam lines would group as one bubble: the tag is the
    // whole mechanism, so every multi-line beat in the tree carries it.
    const twoLines = groupBlocks([cam('first'), cam('second')]);
    expect(twoLines).toHaveLength(1);
    expect(groupBlocks([cam('first'), cut('second')])).toHaveLength(2);
  });
});

describe('the append-only turn flow', () => {
  /** The turn-flow contract the shell's reuse ledger stands on: a turn only
   * appends to the conversation log, so a run's id hit there is the same run
   * and its parts can never grow. Locked here, at the engine seam, because the
   * shell's length check is sound only while the engine holds this side of it.
   * The walk covers all four flows, the email gate's return, and completion —
   * every way the authored tree can answer a turn. */
  it('only ever appends, so no run is extended and no id moves', async () => {
    const turns: ChatResponse[] = [await start()];
    for (const label of [
      'Get a Demo',
      'Maybe later',
      'Products & offerings',
      'Cameras & Devices',
      'License Plate Readers',
      'Support',
      'Privacy & safety',
      'Myths & facts',
      "That's all for now",
    ]) {
      const pending = turns.at(-1)!.turn.options;
      const index = pending?.find((option) => option.text === label)?.index;
      if (index === undefined) throw new Error(`no pending option ${JSON.stringify(label)}`);
      turns.push(await turn({ type: 'option', optionIndex: index }));
    }
    expect(turns.at(-1)!.state.complete).toBe(true);

    for (let i = 1; i < turns.length; i += 1) {
      const previous = turns[i - 1].turn.blocks;
      const next = turns[i].turn.blocks;
      // The sequence grew by appending: the earlier log is a value-prefix.
      expect(next.slice(0, previous.length), `turn ${i}`).toEqual(previous);
      // Log-derived ids, in order, survive the turn; only new ones append.
      const beforeIds = groupBlocks(previous).map((message) => message.id);
      const afterIds = groupBlocks(next).map((message) => message.id);
      expect(afterIds.slice(0, beforeIds.length), `turn ${i} ids`).toEqual(beforeIds);
      // And no surviving run grew: same id, same parts.
      const lengths = new Map(groupBlocks(previous).map((message) => [message.id, message.parts.length]));
      for (const run of groupBlocks(next)) {
        const prior = lengths.get(run.id);
        if (prior !== undefined) expect(run.parts.length, `turn ${i} run ${run.id}`).toBe(prior);
      }
    }
  });
});

describe('session persistence', () => {
  it('replays the whole conversation across a page reload', async () => {
    await option('Get a Demo');
    const reloaded = await start();
    expect(texts(reloaded)).toEqual([GREETING, 'Get a Demo', DEMO_INTRO, DEMO_CONNECT, DEMO_ASK]);
    expect(optionTexts(reloaded)).toEqual(['Maybe later']);
  });

  it('resumes a live session instead of resetting it (start is idempotent)', async () => {
    const advanced = await option('Support');
    const restarted = await start();
    expect(restarted.turn.blocks).toEqual([cam(GREETING), me('Support'), cam(SUPPORT), cut(HUB_LINE)]);
    expect(restarted.state.node).toBe(advanced.state.node);
    // and it is live, not just a replay: another selection still advances
    expect(texts(await option('Get a Demo')).at(-1)).toBe(DEMO_ASK);
  });

  it('starts a fresh conversation when nothing is stored', async () => {
    window.localStorage.clear();
    expect(texts(await start())).toEqual([GREETING]);
  });
});

describe('no rendered divergence notice', () => {
  it('keeps every rendered string free of prototype/marker language', async () => {
    const turns = [
      await start(),
      await option('Get a Demo'),
      await option('Maybe later'),
      await option('Support'),
      await option('Products & offerings'),
    ];
    const rendered = [
      ...new Set([
        ...turns.flatMap((t) => t.turn.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []))),
        ...turns.flatMap((t) => t.turn.options?.map((o) => o.text) ?? []),
      ]),
    ];
    expect(rendered.length).toBeGreaterThan(8);
    for (const body of rendered) {
      expect(body).not.toMatch(/prototype|divergen|not implemented|placeholder|TODO/i);
    }
  });
});

describe('stale-client guards', () => {
  it('ignores an out-of-range option index without throwing', async () => {
    await start();
    const res = await turn({ type: 'option', optionIndex: 99 });
    expect(optionTexts(res)).toEqual(START_OPTIONS);
    expect(texts(res)).toEqual([GREETING]);
  });

  it('ignores an option selection when no choice set is pending', async () => {
    await option('What can you help me with?');
    await option("That's all for now");
    const res = await turn({ type: 'option', optionIndex: 0 });
    expect(res.state.complete).toBe(true);
    expect(optionTexts(res)).toBeNull();
  });

  it('ignores a session blob whose blocks an older build wrote', async () => {
    const stale = {
      vars: {},
      log: [{ who: 'bot', text: 'the pre-block shape' }],
      node: 'Start',
      complete: false,
    };
    window.localStorage.setItem('flock-chat-state', JSON.stringify(stale));
    // Treated as absent, so the visitor gets a fresh greeting rather than a
    // replayed log of blocks no adapter can dispatch.
    expect((await start()).turn.blocks).toEqual([cam(GREETING)]);
  });

  it('ignores a session blob naming a node this program no longer declares', async () => {
    const stale = { vars: {}, log: [], node: 'RemovedNode', complete: false };
    window.localStorage.setItem('flock-chat-state', JSON.stringify(stale));
    expect((await start()).turn.blocks).toEqual([cam(GREETING)]);
  });
});

describe('the authored tree (program guards)', () => {
  /** The compiled program, as the shipped bytes declare it. */
  const nodes = Object.entries(program.nodes) as [string, { instructions: Instruction[] }][];

  it('gives every node at most one option set', () => {
    // A reload re-enters a node at its top (`chat-engine.mjs` `restore`), so a
    // second set in one node would re-offer the first chips after a reload.
    const offenders = nodes
      .filter(([, node]) => node.instructions.filter((i) => i.op === 'showOptions').length > 1)
      .map(([title]) => title);
    expect(offenders).toEqual([]);
  });

  it('names Cam on every authored line, so no line ships its speaker marker', () => {
    const offenders = nodes.flatMap(([title, node]) =>
      node.instructions
        .filter((i) => i.op === 'runLine' && !/^Cam: /.test(i.text ?? ''))
        .map((i) => `${title}: ${JSON.stringify(i.text)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('resolves every authored block command against the inventory', () => {
    const offenders = nodes.flatMap(([title, node]) =>
      node.instructions
        .filter((i) => i.op === 'runCommand')
        .map((i) => i.content ?? '')
        .filter((command) => {
          const match = /^block "([^"]+)"(?: (new|join))?$/.exec(command);
          return !match || !(match[1] in CHAT_BLOCKS);
        })
        .map((command) => `${title}: ${command}`),
    );
    expect(offenders).toEqual([]);
  });

  it('declares its one custom command, so opt-in validation stays silent', () => {
    // `<<block>>` is the piece's own command, declared in
    // `assets/dialogue/definitions.ysls.json` and named by the project file.
    // The build opts into command validation (`build-chat-runtime.mjs`), so
    // this is the guard that keeps the shipped tree free of YS0060 (unknown
    // command) and YS0061 (wrong parameter count) — and that fails if the
    // declaration is dropped from either file.
    const loaded = loadYarnProject(PROJECT_FILE, { validateCommands: true });
    const commandProblems = loaded.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'YS0060' || diagnostic.code === 'YS0061',
    );
    expect(loaded.program).toBeTruthy();
    expect(commandProblems.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)).toEqual([]);
  });

  it('turns the same validation on a typo, so the guard above is live', () => {
    // A green assertion means nothing if the check never runs: compile the
    // shipped start node with one command name misspelled and require the
    // diagnostic the editor would show.
    const source = readFileSync(resolve('assets/dialogue/core.yarn'), 'utf8').replace('<<block ', '<<blcok ');
    const { diagnostics } = compileSource(source, { validateCommands: true });
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'YS0060').length).toBeGreaterThan(0);
  });

  it('reaches every node from Start through a jump or a node call', () => {
    // A node nothing points at is copy no viewer can reach: dead weight the
    // four-flow tree should not carry.
    const reachable = new Set(['Start']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [title, node] of nodes) {
        if (!reachable.has(title)) continue;
        for (const instruction of node.instructions) {
          const target = instruction.node;
          if (typeof target === 'string' && target in program.nodes && !reachable.has(target)) {
            reachable.add(target);
            grew = true;
          }
        }
      }
    }
    expect([...Object.keys(program.nodes)].filter((title) => !reachable.has(title))).toEqual([]);
  });
});
