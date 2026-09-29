// SPDX-License-Identifier: CC0-1.0
// The chat's dialogue engine, client-side: the engine the page ships, speaking
// the same turn contract (`lib/chat-turn.mjs`) the vendored shell renders.
//
// Why it exists: the piece is a static export with no server behind it, so no
// route can answer a request per turn and the shell would render an empty
// column. This module owns the one session, kept in a pluggable session store
// (`lib/session-store.mjs` — `localStorage`, with an in-page fallback for
// private mode) instead of a server's module-level Map, and rebuilds the
// `Dialogue` from the snapshot on every turn — a page has no process to keep it
// in. The snapshot therefore holds exactly what `state` reports (vars, node,
// blocks, completion) and never VM position: a turn re-enters the persisted
// node at its top, which is why the snapshot needs nothing more.
//
// This file is not served. `scripts/build-chat-runtime.mjs` bundles it (plus
// its `yarnspinner-typescript` runtime, the compiled `chat-program.json`, the
// session-store and engine-reach seams, and the inlined `lib/chat-blocks.mjs`
// inventory) into `scripts/chat-runtime.js`, the file `/chat/runtime.js`
// publishes. Comments here are the review surface; the bundle is generated.

import programJson from './chat-program.json';
import { CHAT_BLOCKS } from '../lib/chat-blocks.mjs';
import { DEFAULT_CHARACTER_ID } from '../lib/chat-characters.mjs';
import { CHAT_BLOCK_TYPES } from '../lib/chat-turn.mjs';
import { installEngine } from '../lib/engine-reach.mjs';
import { PACE_MARKER, PACE_PRESETS } from '../lib/pace-presets.mjs';
import { localStorageStore, memoryStore, resilientStore } from '../lib/session-store.mjs';
import { Dialogue, InMemoryVariableStorage, runUntilCompleteEvents, tryGetProperty } from 'yarnspinner-typescript';

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
        (block.who === 'me' || (block.who === 'bot' && typeof block.speaker === 'string')),
    )
  );
}

/**
 * Build the one engine over a session store. The store supplies raw text
 * (`lib/session-store.mjs`); this closure owns the JSON, the staleness check,
 * and the conversation. `createEngine` exists so a test can drive the engine
 * over an in-page store, and the page can drive it over `localStorage`.
 * @param {import('../lib/session-store.mjs').SessionStore} store
 */
export function createEngine(store) {
  /**
   * The persisted session, or null. A corrupt, partially-written or stale blob
   * is treated as absent rather than thrown at a visitor.
   * @returns {ChatSnapshot|null}
   */
  function load() {
    const raw = store.read();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isCurrentSnapshot(parsed)) return /** @type {ChatSnapshot} */ (parsed);
      } catch {
        // a corrupt or partially-written blob: the page has no session
      }
    }
    // The store holds nothing current: the page has no session.
    return null;
  }

  /**
   * Persist a snapshot through the store, which decides where it survives.
   * @param {ChatSnapshot} snapshot
   */
  function save(snapshot) {
    store.write(JSON.stringify(snapshot));
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

  /** The authored line tag that ends a reply's bubble at that line:
   * `Cam: First half. #newmessage` starts a fresh bubble for this line, the text
   * counterpart of `<<block "id" new>>`. Read off the line event's tags, which the
   * runtime already carries, so it is stateless and ordering-safe; Yarn strips the
   * tag from the spoken text. */
  const NEW_MESSAGE_TAG = 'newmessage';

  // `<<block "id">>` joins the current bubble; `<<block "id" new>>` opens a new
  // one. `join` is the spelled-out default. The placement is the author's call
  // per command, so the same block can sit in a run or stand alone.
  const BLOCK_COMMAND = /^block\s+"([^"]+)"(?:\s+(new|join))?\s*$/;

  /** The character a line's parsed speaker names, lowercased into an id; a line
   * with no prefix falls back to the piece's default character. The build's
   * freshness gate fails an undeclared speaker before the runtime ships, so an
   * id here is always one `lib/chat-characters.mjs` declares.
   * @param {string} [speaker] */
  function speakerId(speaker) {
    return speaker === undefined ? DEFAULT_CHARACTER_ID : speaker.toLowerCase();
  }

  /**
   * A line's parsed text split at its `[pace=...]` boundaries, or one unmarked
   * stretch when the line carries none. Positions and lengths are the runtime's,
   * relative to the text it hands over (the speaker prefix already stripped); a
   * value outside the closed preset vocabulary is ignored here and rejected by
   * the build's freshness gate, so only a preset ever reaches a block.
   * @param {string} text
   * @param {import('yarnspinner-typescript').MarkupParseResult} [markup]
   * @returns {{ text: string, pace?: string }[]}
   */
  function segmentsFrom(text, markup) {
    const markers = (markup?.attributes ?? []).filter((attribute) => attribute.name === PACE_MARKER);
    if (markers.length === 0) return [{ text }];
    /** @type {(string|undefined)[]} */
    const paces = new Array(text.length).fill(undefined);
    for (const marker of markers) {
      const value = tryGetProperty(marker, PACE_MARKER)?.stringValue;
      if (typeof value !== 'string' || !PACE_PRESETS.includes(value)) continue;
      const start = Math.max(0, marker.position);
      const end = Math.min(text.length, marker.position + marker.length);
      for (let index = start; index < end; index += 1) paces[index] = value;
    }
    /** @type {{ text: string, pace?: string }[]} */
    const segments = [];
    for (let index = 0; index < text.length; index += 1) {
      const last = segments.at(-1);
      if (last && last.pace === paces[index]) last.text += text[index];
      else segments.push({ text: text[index], pace: paces[index] });
    }
    return segments;
  }

  /**
   * Resolve one command into a block, or null when the command is not a block.
   * An id the inventory does not name degrades to a designed unknown block, so an
   * authoring typo costs its own block and never the turn (the containment
   * contract). Remote URLs come from the inventory, never from the command text.
   *
   * A trailing `new` opens a fresh bubble for this block; the default (`join`)
   * keeps it in the current speaker-run. Text lines always join.
   * @param {string} command
   * @param {string} speaker
   * @returns {ChatBlock|null}
   */
  function blockFromCommand(command, speaker) {
    const match = BLOCK_COMMAND.exec(command);
    if (!match) return null;
    const id = match[1];
    const payload = CHAT_BLOCKS[id];
    /** @type {ChatBlock} */
    const block =
      payload === undefined
        ? { who: 'bot', speaker, type: 'unknown', id, reason: 'Unknown block' }
        : { who: 'bot', speaker, ...payload };
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
    // The speaker the sweep is currently in: a bot line's own name, so every
    // block a line produces — a link, a frame, an unknown — is attributed to
    // whoever spoke last. A line with no prefix inherits the default.
    let speaker = DEFAULT_CHARACTER_ID;
    for (const event of runUntilCompleteEvents(dialogue)) {
      if (event.type === 'line') {
        speaker = speakerId(event.speaker);
        blocks.push({
          who: 'bot',
          speaker,
          type: 'text',
          text: event.text,
          segments: segmentsFrom(event.text, event.markup),
          // `#newmessage` on the line cuts the bubble before it, exactly as the
          // `new` placement on a block command does.
          ...(event.tags?.includes(NEW_MESSAGE_TAG) ? { newMessage: true } : {}),
        });
      } else if (event.type === 'command') {
        const block = blockFromCommand(event.command, speaker);
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
    return options
      ? options.map((option) => ({ index: option.index, text: option.text.split(' ~ ')[0] }))
      : null;
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
   * copy). A label containing ` ~ ` echoes as several bubbles: each segment is
   * its own `me` text block, cut at `newMessage` — the user-side counterpart of
   * the bot's `newMessage` boundary, so one authored choice can read as two
   * messages.
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
    const echo = label.split(' ~ ').map((part, index) => ({
      who: 'me',
      type: 'text',
      text: part,
      segments: [{ text: part }],
      ...(index > 0 ? { newMessage: true } : {}),
    }));
    const log = snapshot.log.concat([...echo, ...swept.blocks]);
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

  /**
   * `reset` — forget the session entirely and begin again at the entry node. The
   * store is cleared (which drops both the persisted snapshot and the in-page
   * copy), and the reply is the fresh opening turn, exactly as a first visit
   * would have received it.
   * @returns {Promise<ChatResponse>}
   */
  function reset() {
    store.clear();
    return Promise.resolve(start());
  }

  return { turn, reset };
}

// The React shell reaches the engine only through the global declared once in
// `lib/engine-reach.mjs`; it is the whole public surface, matching the message
// API's one shape per request type. The default store is `localStorage`, with
// the in-page copy the resilient wrapper prefers when a browser in private mode
// refuses it.
installEngine(createEngine(resilientStore(localStorageStore(STORAGE_KEY), memoryStore())));
