// SPDX-License-Identifier: CC0-1.0
// The Chat mimic's dialogue engine, client-side: the browser twin of
// `lib/chat-engine.ts`, with the same turn contract (`pipeline/chat-turn.mjs`)
// and the same semantics.
//
// Why it exists: the Recreation ships as a static tree (GitHub Pages has no
// server), so the message API's `POST /api/chat` cannot answer and the widget
// rendered an empty panel on the deployed site. This module replaces the
// server's module-level session Map with `localStorage`, and rebuilds the
// `Dialogue` from a snapshot on every turn — a client has no process to keep it
// in. The snapshot therefore holds exactly what the server's `state` reports
// (vars, node, log, completion) and never VM position: a turn re-enters the
// persisted node at its top, which is why the snapshot needs nothing more.
//
// This file is not served. `pipeline/build-chat-runtime.mjs` bundles it (plus
// its `yarnspinner-typescript` runtime and the compiled `chat-program.json`)
// into `pipeline/chat-runtime.js`, which is the chat/js asset the tree ships
// beside the widget. Comments here are the review surface; the bundle is
// generated.
//
// The bundled bytes must name no network primitive (`injected-source.mjs`), so
// this file avoids the string `fetch` even in prose and never writes a dynamic
// `import(` — the global type aliases in `pipeline/globals.d.ts` exist for the
// same reason.

import programJson from './chat-program.json';
import { Dialogue, EMPTY_TRANSCRIPT, InMemoryVariableStorage, runUntilStopped } from 'yarnspinner-typescript';

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
 *   log: ChatLine[],
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
 * A fresh `Dialogue` over a storage seeded with `vars` — the same construction
 * `lib/chat-engine.ts` performs (declare defaults seed around restored values,
 * so restored ones survive).
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

/**
 * Pull a dialogue to its next rest state (an option set or completion), the same
 * sweep `lib/chat-engine.ts` performs past line and command stops.
 * @param {Dialogue} dialogue
 */
function sweep(dialogue) {
  let { transcript, stopped } = runUntilStopped(dialogue, EMPTY_TRANSCRIPT);
  while (stopped === 'command' || stopped === 'line') {
    ({ transcript, stopped } = runUntilStopped(dialogue, transcript));
  }
  return { transcript, stopped };
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
 * The mimic's half of one line.
 * @param {{ text: string }} line
 * @returns {ChatLine}
 */
function botLine(line) {
  return { from: 'bot', text: line.text };
}

/**
 * Rebuild a session from a snapshot: seed the storage, re-enter the persisted
 * node at its top, and recover the live option set the server's in-memory
 * Dialogue would still be holding. The sweep re-delivers the node's lines
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
    const { transcript, stopped } = sweep(dialogue);
    pendingOptions = stopped === 'options' ? transcript.options ?? null : null;
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
  const { transcript, stopped } = sweep(dialogue);
  const lines = transcript.lines.map(botLine);
  const complete = stopped === 'complete';
  const pending = stopped === 'options' ? transcript.options ?? [] : null;
  const vars = Object.fromEntries(storage.entries());
  save({ sessionId: id, vars, log: lines.slice(), node: dialogue.currentNode, complete });
  return {
    sessionId: id,
    turn: { lines, options: optionList(pending), complete },
    state: { node: dialogue.currentNode, complete, vars },
  };
}

/**
 * `resume` — unknown or absent session state starts one, as the server does.
 * A live one replays the whole conversation and re-offers the pending set
 * without adding lines.
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
    turn: { lines: [], options: optionList(pending), complete: snapshot.complete },
    state: { node: snapshot.node, complete: snapshot.complete, vars: snapshot.vars },
    replay: snapshot.log.slice(),
  };
}

/**
 * `option` — select a pending choice and collect the reply. A stale session or
 * an index with no live option set hands back the rest state instead of
 * crashing; the visitor's line is echoed the way the server echoes it (the
 * widget never adds its own copy).
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
      turn: { lines: [], options: optionList(pending), complete: snapshot.complete },
      state: { node: snapshot.node, complete: snapshot.complete, vars: snapshot.vars },
    };
  }
  const log = snapshot.log.slice();
  log.push({ from: 'me', text: label });
  session.dialogue.selectOption(optionIndex);
  const { transcript, stopped } = sweep(session.dialogue);
  const lines = transcript.lines.map(botLine);
  log.push(...lines);
  const complete = stopped === 'complete';
  const nextPending = stopped === 'options' ? transcript.options ?? [] : null;
  const vars = Object.fromEntries(session.storage.entries());
  save({ sessionId, vars, log, node: session.dialogue.currentNode, complete });
  return {
    sessionId,
    turn: { lines: [{ from: 'me', text: label }, ...lines], options: optionList(nextPending), complete },
    state: { node: session.dialogue.currentNode, complete, vars },
  };
}

/**
 * One turn. Returns a Promise so the widget's network-shaped
 * `turn(body).then(applyResponse)` is the same code it always was.
 * @param {ChatRequest} request
 * @returns {Promise<ChatResponse>}
 */
function turn(request) {
  if (request.type === 'resume') return Promise.resolve(resume(request.sessionId));
  if (request.type === 'option') return Promise.resolve(option(request.sessionId, request.optionIndex));
  return Promise.resolve(start(request.sessionId));
}

// The widget (concatenated after this bundle) calls this global; it is the
// whole public surface, matching the message API's one shape per request type.
window.__flockChatEngine = { turn };
