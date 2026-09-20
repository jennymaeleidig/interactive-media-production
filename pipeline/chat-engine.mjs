// SPDX-License-Identifier: CC0-1.0
// The chat's dialogue engine, client-side: the engine the page ships, speaking
// the same turn contract (`pipeline/chat-turn.mjs`) the vendored shell renders.
//
// Why it exists: the piece is a static export with no server behind it, so no
// route can answer a request per turn and the shell would render an empty
// column. This module keeps the session in `localStorage` instead of a server's
// module-level Map, and rebuilds the `Dialogue` from a snapshot on every turn —
// a page has no process to keep it in. The snapshot therefore holds exactly what
// the server's `state` reports (vars, node, blocks, completion) and never VM
// position: a turn re-enters the persisted node at its top, which is why the
// snapshot needs nothing more.
//
// This file is not served. `pipeline/build-chat-runtime.mjs` bundles it (plus
// its `yarnspinner-typescript` runtime, the compiled `chat-program.json`, and the
// inlined `pipeline/chat-blocks.mjs` inventory) into `pipeline/chat-runtime.js`,
// the file `/chat/runtime.js` publishes. Comments here are the review surface;
// the bundle is generated.

import programJson from './chat-program.json';
import { CHAT_BLOCKS } from './chat-blocks.mjs';
import { Dialogue, InMemoryVariableStorage, runUntilCompleteEvents } from 'yarnspinner-typescript';

// `chat-program.json` is deployment data, not source; its type — the runtime's
// `Program` — is declared beside it (`chat-program.d.json.ts`), out of the
// bundle's way.
const program = programJson;

/** Where the one client-side session lives. New key, owned by this engine. */
const STORAGE_KEY = 'flock-chat-state';

/**
 * A persisted session: the whole conversation plus the three facts `state`
 * reports. `node` is null before a dialogue starts and once it has run out of
 * content; `complete` is carried explicitly because a rebuilt dialogue's
 * `isComplete` is false until it runs again.
 * @typedef {{
 *   sessionId: string,
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
 * The persisted session, or null. A corrupt or partially-written blob is
 * treated as absent rather than thrown at a visitor.
 * @returns {ChatSnapshot|null}
 */
function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.sessionId === 'string' && Array.isArray(parsed.log)) {
        return /** @type {ChatSnapshot} */ (parsed);
      }
    }
  } catch (error) {
    // storage unavailable or unreadable — the in-page copy is the fallback
  }
  return memory;
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
  } catch (error) {
    // private mode or a full quota — the in-page copy carries the session
  }
}

/** A fresh session id, shaped like the server's `crypto.randomUUID()`. */
function newId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  } catch (error) {
    // no crypto — fall through to a weaker id
  }
  return 'flock-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
const BLOCK_COMMAND = /^block\s+"([^"]+)"\s*$/;

/**
 * Resolve one command into a block, or null when the command is not a block.
 * An id the inventory does not name degrades to a designed unknown block, so an
 * authoring typo costs its own block and never the turn (ticket 01's containment
 * contract). Remote URLs come from the inventory, never from the command text.
 * @param {string} command
 * @returns {ChatBlock|null}
 */
function blockFromCommand(command) {
  const match = BLOCK_COMMAND.exec(command);
  if (!match) return null;
  const id = match[1];
  const payload = CHAT_BLOCKS[id];
  if (payload === undefined) {
    return { who: 'bot', type: 'unknown', id, reason: 'Unknown block' };
  }
  return /** @type {ChatBlock} */ ({ who: 'bot', ...payload });
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
 * node at its top, and recover the live option set the server's in-memory
 * Dialogue would still be holding. The sweep re-delivers the node's blocks
 * (already in `log`) and re-runs its statements; the recorded variables are
 * restored afterwards so a resume mutates nothing, exactly as the server's
 * resume does not.
 * @param {ChatSnapshot} snapshot
 */
function rebuild(snapshot) {
  const { dialogue, storage } = open(snapshot.vars);
  /** @type {YarnOption[]|null} */
  let pendingOptions = null;
  if (!snapshot.complete && snapshot.node) {
    dialogue.setNode(snapshot.node);
    const swept = sweep(dialogue);
    pendingOptions = swept.options;
    for (const [name, value] of Object.entries(snapshot.vars)) storage.set(name, value);
  }
  return { dialogue, storage, pendingOptions };
}

/**
 * `start` — idempotent the way the server's is: naming a live session resumes
 * it instead of resetting, so a stale client can never blank the conversation.
 * `start` with no session id mints a fresh one.
 * @param {string} [sessionId]
 * @returns {ChatResponse}
 */
function start(sessionId) {
  const live = sessionId ? load() : null;
  if (live && sessionId && live.sessionId === sessionId) return resume(sessionId);
  const id = sessionId ?? newId();
  const { dialogue, storage } = open();
  dialogue.setNode('Start');
  const swept = sweep(dialogue);
  const blocks = swept.blocks;
  const vars = Object.fromEntries(storage.entries());
  save({ sessionId: id, vars, log: blocks.slice(), node: dialogue.currentNode, complete: swept.complete });
  return {
    sessionId: id,
    turn: { blocks, options: optionList(swept.options), complete: swept.complete },
    state: { node: dialogue.currentNode, complete: swept.complete, vars },
  };
}

/**
 * `resume` — unknown or absent session state starts one, as the server does.
 * A live one replays the whole conversation and re-offers the pending set
 * without adding blocks.
 * @param {string} sessionId
 * @returns {ChatResponse}
 */
function resume(sessionId) {
  const snapshot = load();
  if (!snapshot || snapshot.sessionId !== sessionId) return start(sessionId);
  const session = rebuild(snapshot);
  const pending = session.dialogue.isWaitingForOptionSelection ? session.pendingOptions : null;
  return {
    sessionId,
    turn: { blocks: [], options: optionList(pending), complete: snapshot.complete },
    state: { node: snapshot.node, complete: snapshot.complete, vars: snapshot.vars },
    replay: snapshot.log.slice(),
  };
}

/**
 * `option` — select a pending choice and collect the reply. A stale session or
 * an index with no live option set hands back the rest state instead of
 * crashing; the visitor's line is echoed the way the server echoes it (the
 * shell never adds its own copy).
 * @param {string} sessionId
 * @param {number} optionIndex
 * @returns {ChatResponse}
 */
function option(sessionId, optionIndex) {
  const snapshot = load();
  if (!snapshot || snapshot.sessionId !== sessionId) return start();
  const session = rebuild(snapshot);
  const pending = session.dialogue.isWaitingForOptionSelection ? session.pendingOptions : null;
  const label = pending ? pending.find((candidate) => candidate.index === optionIndex)?.text : undefined;
  if (!pending || label === undefined) {
    return {
      sessionId,
      turn: { blocks: [], options: optionList(pending), complete: snapshot.complete },
      state: { node: snapshot.node, complete: snapshot.complete, vars: snapshot.vars },
    };
  }
  const log = snapshot.log.slice();
  log.push({ who: 'me', type: 'text', text: label });
  session.dialogue.selectOption(optionIndex);
  const swept = sweep(session.dialogue);
  log.push(...swept.blocks);
  const vars = Object.fromEntries(session.storage.entries());
  save({ sessionId, vars, log, node: session.dialogue.currentNode, complete: swept.complete });
  return {
    sessionId,
    turn: { blocks: [{ who: 'me', type: 'text', text: label }, ...swept.blocks], options: optionList(swept.options), complete: swept.complete },
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
  if (request.type === 'resume') return Promise.resolve(resume(request.sessionId));
  if (request.type === 'option') return Promise.resolve(option(request.sessionId, request.optionIndex));
  return Promise.resolve(start(request.sessionId));
}

// The React shell reaches the engine only through this declared global; it is
// the whole public surface, matching the message API's one shape per request
// type.
window.__flockChatEngine = { turn };
