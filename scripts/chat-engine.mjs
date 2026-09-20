// SPDX-License-Identifier: CC0-1.0
// The chat's dialogue engine, client-side: the engine the page ships, speaking
// the same turn contract (`lib/chat-turn.mjs`) the vendored shell renders.
//
// Why it exists: the piece is a static export with no server behind it, so no
// route can answer a request per turn and the shell would render an empty
// column. This module owns the one session, keeping it in `localStorage` instead
// of a server's module-level Map, and rebuilds the `Dialogue` from the snapshot
// on every turn — a page has no process to keep it in. The snapshot therefore
// holds exactly what `state` reports (vars, node, blocks, completion) and never
// VM position: a turn re-enters the persisted node at its top, which is why the
// snapshot needs nothing more.
//
// This file is not served. `scripts/build-chat-runtime.mjs` bundles it (plus
// its `yarnspinner-typescript` runtime, the compiled `chat-program.json`, and the
// inlined `lib/chat-blocks.mjs` inventory) into `scripts/chat-runtime.js`,
// the file `/chat/runtime.js` publishes. Comments here are the review surface;
// the bundle is generated.

import programJson from './chat-program.json';
import { CHAT_BLOCKS } from '../lib/chat-blocks.mjs';
import { CHAT_BLOCK_TYPES } from '../lib/chat-turn.mjs';
import { Dialogue, InMemoryVariableStorage, runUntilCompleteEvents } from 'yarnspinner-typescript';

// `chat-program.json` is deployment data, not source; its type — the runtime's
// `Program` — is declared beside it (`chat-program.d.json.ts`), out of the
// bundle's way.
const program = programJson;

/** Where the one client-side session lives. Owned by this engine. */
const STORAGE_KEY = 'flock-chat-state';

/**
 * A persisted session: the whole conversation plus the three facts `state`
 * reports. `node` is null before a dialogue starts and once it has run out of
 * content; `complete` is carried explicitly because a rebuilt dialogue's
 * `isComplete` is false until it runs again. There is no id: this engine owns
 * the one conversation, so nothing outside it needs to name one.
 * @typedef {{
 *   vars: Record<string, unknown>,
 *   log: ChatBlock[],
 *   node: string | null,
 *   complete: boolean,
 * }} ChatSnapshot
 */

/**
 * The latest snapshot, used when the browser refuses `localStorage` (private
 * mode): the conversation still works within the page, it just cannot survive a
 * reload — the same degradation the widget's own session key had.
 * @type {ChatSnapshot|null}
 */
let memory = null;

/**
 * Whether `localStorage` accepted the last write. When it refuses (private mode,
 * a full quota) the in-page copy is the session and `load` must prefer it over
 * the empty store; when it accepts, an empty store means the page has no
 * session.
 */
let persisted = false;

/**
 * True when a persisted snapshot still matches this build: a block log whose
 * every entry the renderer can dispatch, a vars object, and a node this
 * program still declares. A snapshot written by an older build (a different
 * block shape, a renamed node) is stale, and replaying it would paint fallback
 * bubbles — so it is treated as absent and the visitor starts fresh.
 * @param {unknown} parsed
 * @returns {boolean}
 */
function isCurrentSnapshot(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const snapshot = /** @type {Record<string, unknown>} */ (parsed);
  if (typeof snapshot.complete !== 'boolean') return false;
  if (!snapshot.vars || typeof snapshot.vars !== 'object') return false;
  if (snapshot.node !== null && (typeof snapshot.node !== 'string' || !Object.hasOwn(program.nodes, snapshot.node))) return false;
  return (
    Array.isArray(snapshot.log) &&
    snapshot.log.every(
      (block) =>
        block &&
        typeof block === 'object' &&
        typeof block.type === 'string' &&
        CHAT_BLOCK_TYPES.includes(block.type) &&
        (block.who === 'bot' || block.who === 'me'),
    )
  );
}

/**
 * The persisted session, or null. A corrupt, partially-written or stale blob is
 * treated as absent rather than thrown at a visitor.
 * @returns {ChatSnapshot|null}
 */
function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isCurrentSnapshot(parsed)) return /** @type {ChatSnapshot} */ (parsed);
    }
    // Storage is readable and holds nothing current: the page has no session.
    // Preferring the in-page copy here would resurrect a session the store
    // already forgot (or an older build's blob).
    return persisted ? null : memory;
  } catch (error) {
    // storage unavailable or unreadable — the in-page copy is the fallback
    return memory;
  }
}

/**
 * Persist a snapshot: always in page memory, and to `localStorage` when the
 * browser allows it.
 * @param {ChatSnapshot} snapshot
 */
function save(snapshot) {
  memory = snapshot;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    persisted = true;
  } catch (error) {
    // private mode or a full quota — the in-page copy carries the session
    persisted = false;
  }
}

/**
 * A fresh `Dialogue` over a storage seeded with `vars` — declare defaults seed
 * around restored values, so restored ones survive.
 * @param {Record<string, unknown>} [vars]
 */
function open(vars) {
  const storage = new InMemoryVariableStorage();
  if (vars) {
    for (const [name, value] of Object.entries(vars)) storage.set(name, value);
  }
  const dialogue = new Dialogue(program, {
    variableStorage: storage,
    logError: (message) => console.error('[yarn] ' + message),
  });
  return { dialogue, storage };
}

/** The command an authored block takes: `<<block "id">>` lowers to this text. */
/**
 * `<<block "id">>` joins the current bubble; `<<block "id" new>>` opens a new
 * one. `join` is the spelled-out default. The placement is the author's call per
 * command, so the same block can sit in a run or stand alone.
 */
const BLOCK_COMMAND = /^block\s+"([^"]+)"(?:\s+(new|join))?\s*$/;

/**
 * Resolve one command into a block, or null when the command is not a block.
 * An id the inventory does not name degrades to a designed unknown block, so an
 * authoring typo costs its own block and never the turn (ticket 01's containment
 * contract). Remote URLs come from the inventory, never from the command text.
 *
 * A trailing `new` opens a fresh bubble for this block; the default (`join`)
 * keeps it in the current speaker-run. Text lines always join.
 * @param {string} command
 * @returns {ChatBlock|null}
 */
function blockFromCommand(command) {
  const match = BLOCK_COMMAND.exec(command);
  if (!match) return null;
  const id = match[1];
  const payload = CHAT_BLOCKS[id];
  /** @type {ChatBlock} */
  const block =
    payload === undefined
      ? { who: 'bot', type: 'unknown', id, reason: 'Unknown block' }
      : { who: 'bot', ...payload };
  if (match[2] === 'new') block.newMessage = true;
  return block;
}

/**
 * Drain a dialogue to its next rest state (an option set or completion),
 * reducing the ordered event stream into blocks. Order matters — a reply is a
 * sequence — so this reads events rather than the transcript's separate `lines`
 * and `commands` arrays, which lose the interleaving.
 * @param {Dialogue} dialogue
 * @returns {{ blocks: ChatBlock[], options: YarnOption[]|null, complete: boolean }}
 */
function sweep(dialogue) {
  /** @type {ChatBlock[]} */
  const blocks = [];
  /** @type {YarnOption[]|null} */
  let options = null;
  let complete = false;
  for (const event of runUntilCompleteEvents(dialogue)) {
    if (event.type === 'line') {
      blocks.push({ who: 'bot', type: 'text', text: event.text });
    } else if (event.type === 'command') {
      const block = blockFromCommand(event.command);
      if (block) blocks.push(block);
    } else if (event.type === 'options') {
      options = event.options;
    } else if (event.type === 'dialogueComplete') {
      complete = true;
    }
  }
  return { blocks, options, complete };
}

/**
 * The wire shape of one pending choice.
 * @param {YarnOption[]|null} options
 * @returns {ChatOption[]|null}
 */
function optionList(options) {
  return options ? options.map((option) => ({ index: option.index, text: option.text })) : null;
}

/**
 * Rebuild a session from a snapshot: seed the storage, re-enter the persisted
 * node at its top, and recover the live choice set the server's in-memory
 * Dialogue would still be holding. The sweep re-delivers the node's blocks
 * (already in `log`) and re-runs its statements; the recorded variables are
 * restored afterwards so restoring mutates nothing, exactly as resuming does
 * not. `pending` is resolved once, here — the choice set the session is waiting
 * on, or null when it is not waiting — so no caller repeats that branch.
 * @param {ChatSnapshot} snapshot
 * @returns {{ dialogue: Dialogue, storage: InstanceType<typeof InMemoryVariableStorage>, pending: YarnOption[]|null }}
 */
function restore(snapshot) {
  const { dialogue, storage } = open(snapshot.vars);
  /** @type {YarnOption[]|null} */
  let pending = null;
  if (!snapshot.complete && snapshot.node) {
    dialogue.setNode(snapshot.node);
    const swept = sweep(dialogue);
    pending = dialogue.isWaitingForOptionSelection ? swept.options : null;
    for (const [name, value] of Object.entries(snapshot.vars)) storage.set(name, value);
  }
  return { dialogue, storage, pending };
}

/**
 * A snapshot at its rest state: the whole block sequence so far and the choice set
 * it is waiting on (or null when it has run out). Adds no blocks — a reload, or
 * an option that resolves to nothing, hands back the conversation as it stands.
 * `pending` is the choice set a caller already resolved by restoring the
 * snapshot; omit it and this restores once to find it.
 * @param {ChatSnapshot} snapshot
 * @param {YarnOption[]|null} [pending]
 * @returns {ChatResponse}
 */
function resting(snapshot, pending) {
  const resolved = pending === undefined ? restore(snapshot).pending : pending;
  return {
    turn: { blocks: snapshot.log.slice(), options: optionList(resolved) },
    state: { node: snapshot.node, complete: snapshot.complete, vars: snapshot.vars },
  };
}

/**
 * `start` — opens this page's session. A live snapshot resumes in place (the
 * whole block sequence, the pending choice set) instead of resetting, so a stale
 * client can never blank the conversation; with none it begins one at the
 * program's entry node.
 * @returns {ChatResponse}
 */
function start() {
  const snapshot = load();
  if (snapshot) return resting(snapshot);
  const { dialogue, storage } = open();
  dialogue.setNode('Start');
  const swept = sweep(dialogue);
  const vars = Object.fromEntries(storage.entries());
  save({ vars, log: swept.blocks.slice(), node: dialogue.currentNode, complete: swept.complete });
  return {
    turn: { blocks: swept.blocks, options: optionList(swept.options) },
    state: { node: dialogue.currentNode, complete: swept.complete, vars },
  };
}

/**
 * `option` — select a pending choice and collect the reply. With no session, or
 * an index with no live option set, it hands back the rest state instead of
 * crashing; the visitor's line is echoed here (the shell never adds its own
 * copy).
 * @param {number} optionIndex
 * @returns {ChatResponse}
 */
function option(optionIndex) {
  const snapshot = load();
  if (!snapshot) return start();
  const session = restore(snapshot);
  const label = session.pending?.find((candidate) => candidate.index === optionIndex)?.text;
  if (label === undefined) return resting(snapshot, session.pending);
  session.dialogue.selectOption(optionIndex);
  const swept = sweep(session.dialogue);
  const log = snapshot.log.concat([{ who: 'me', type: 'text', text: label }, ...swept.blocks]);
  const vars = Object.fromEntries(session.storage.entries());
  save({ vars, log: log.slice(), node: session.dialogue.currentNode, complete: swept.complete });
  return {
    turn: { blocks: log, options: optionList(swept.options) },
    state: { node: session.dialogue.currentNode, complete: swept.complete, vars },
  };
}

/**
 * One turn. Returns a Promise so the shell's network-shaped
 * `turn(body).then(applyResponse)` is the same code it always was.
 * @param {ChatRequest} request
 * @returns {Promise<ChatResponse>}
 */
function turn(request) {
  if (request.type === 'option') return Promise.resolve(option(request.optionIndex));
  return Promise.resolve(start());
}

// The React shell reaches the engine only through this declared global; it is
// the whole public surface, matching the message API's one shape per request
// type.
window.__flockChatEngine = { turn };
