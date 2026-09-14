// The Chat mimic's engine: the whole conversation behind one
// message API, with no live backend and no network.
//
// Design (the Chat mimic contract; lifted from the chat-wrapper prototype):
// 1. The Yarn project compiles ONCE, at module-eval time, via the Node loader
//    (`yarnspinner-typescript/node`). Zero bundler configuration is needed —
//    this is the SSR startup-singleton shape — so the same code runs under
//    `next dev`, `next build`, and vitest. Content lives in `dialogue/` and is
//    deployment data, not part of the bundler graph.
// 2. One `Dialogue` per session lives in module-level server memory (a Map),
//    so a live session resumes across page reloads exactly the way the
//    original's server-side session does. Nothing is persisted anywhere else.
// 3. One request shape per turn: `start` | `resume` | `option`. Every response
//    carries the turn's new lines, the pending choice set (or completion), and
//    `state.vars` — literally `VariableStorage.entries()`, the whole
//    serialization seam, surfaced every turn for the Parody layer's future
//    dialogue-event binding.
// 4. ALL choices are Yarn options (`->`). The wrapper renders the pending set
//    in the composer slot; selecting one is a message send. No free text.
//
// The email gate (ratified): the demo branch asks for an email and then
// offers only "Maybe later", which returns to the hub option set. The gate
// never dead-ends, and the rendered UI carries no divergence notice — the
// intentional stop is stated only in `dialogue/flock.yarn`.
//
// SPDX-License-Identifier: CC0-1.0

import {
  Dialogue,
  EMPTY_TRANSCRIPT,
  InMemoryVariableStorage,
  runUntilStopped,
} from 'yarnspinner-typescript';
import type { DialogueOption } from 'yarnspinner-typescript';
import { loadYarnProject } from 'yarnspinner-typescript/node';
import path from 'node:path';
import type { ChatLine, ChatRequest, ChatResponse, ChatState, ChatTurn } from '../pipeline/chat-turn.mjs';

// The message API's shape is declared once, in `pipeline/chat-turn.mjs`: the
// widget that parses it, the client engine that answers it in the page
// (`pipeline/chat-engine.mjs`), and the dialogue engine below are the ends of the
// same seam. Re-exported so the seams and the route keep importing it from here.
export type { ChatLine, ChatRequest, ChatResponse, ChatState, ChatTurn };

// ---------------------------------------------------------------------------
// Program: compiled once per server process.
// ---------------------------------------------------------------------------
// The path is cwd-relative on purpose: Next bundles a route handler into
// `.next/server/…` (where `import.meta.url` no longer points at the repo), and
// vitest runs from the repo root too — cwd is the one root both agree on.
const PROJECT_FILE = path.join(process.cwd(), 'dialogue', 'flock.yarnproject');
const project = loadYarnProject(PROJECT_FILE);
if (!project.program) {
  const problems = project.diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n');
  throw new Error(`dialogue/flock.yarn failed to compile:\n${problems}`);
}
const program = project.program;

// ---------------------------------------------------------------------------
// Sessions: one Dialogue in server memory per visitor.
// ---------------------------------------------------------------------------
interface Session {
  dialogue: Dialogue;
  storage: InMemoryVariableStorage;
  /** The live option set, kept so `resume` can re-offer it after a reload. */
  pendingOptions: DialogueOption[] | null;
  /** The full conversation, replayed to a reloading client. */
  log: ChatLine[];
}

const sessions = new Map<string, Session>();

function newSession(): Session {
  const storage = new InMemoryVariableStorage();
  const dialogue = new Dialogue(program, {
    variableStorage: storage,
    logError: (message) => console.error(`[yarn] ${message}`),
  });
  return { dialogue, storage, pendingOptions: null, log: [] };
}

// ---------------------------------------------------------------------------
// Turn plumbing: pull the dialogue to its next rest state (an option set or
// completion), sweeping past line and command stops, and shape the batch.
// ---------------------------------------------------------------------------
function collect(session: Session): ChatTurn {
  let { transcript, stopped } = runUntilStopped(session.dialogue, EMPTY_TRANSCRIPT);
  while (stopped === 'command' || stopped === 'line') {
    ({ transcript, stopped } = runUntilStopped(session.dialogue, transcript));
  }
  session.pendingOptions = transcript.options;
  const lines: ChatLine[] = transcript.lines.map((line) => ({ from: 'bot', text: line.text }));
  session.log.push(...lines);
  const pending = stopped === 'options' ? (transcript.options ?? []) : null;
  return {
    lines,
    options: pending ? pending.map((o) => ({ index: o.index, text: o.text })) : null,
    complete: stopped === 'complete',
  };
}

/** The turn shape for a session that is at rest — no new lines, just the live choice set (or completion). */
function restTurn(session: Session): ChatTurn {
  const pending = session.dialogue.isWaitingForOptionSelection ? session.pendingOptions : null;
  return {
    lines: [],
    options: pending ? pending.map((o) => ({ index: o.index, text: o.text })) : null,
    complete: session.dialogue.isComplete,
  };
}

function state(session: Session) {
  return {
    node: session.dialogue.currentNode,
    complete: session.dialogue.isComplete,
    // THE serialization seam: exactly what a DB-backed or client-side store
    // would persist (story vars + `$Yarn.Internal.*` state). What it
    // deliberately does NOT hold is VM position — a session is restored by
    // re-entering the current node at its top, which is why server memory is
    // the chosen session model.
    vars: Object.fromEntries(session.storage.entries()) as Record<string, unknown>,
  };
}

function ensureSession(sessionId: string): Session {
  const live = sessions.get(sessionId);
  if (live) return live;
  const session = newSession();
  sessions.set(sessionId, session);
  session.dialogue.setNode('Start');
  return session;
}

// ---------------------------------------------------------------------------
// Public surface — one shape per request type.
// ---------------------------------------------------------------------------
/**
 * Validate an untrusted request body into a `ChatRequest`, or null. The HTTP
 * shell uses this so a malformed POST is a 400, never a thrown `handleChat`.
 */
export function parseChatRequest(value: unknown): ChatRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const body = value as Record<string, unknown>;
  const sessionId = typeof body.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : undefined;
  switch (body.type) {
    case 'start':
      return sessionId ? { type: 'start', sessionId } : { type: 'start' };
    case 'resume':
      return sessionId ? { type: 'resume', sessionId } : null;
    case 'option':
      return sessionId && typeof body.optionIndex === 'number' && Number.isInteger(body.optionIndex)
        ? { type: 'option', sessionId, optionIndex: body.optionIndex }
        : null;
    default:
      return null;
  }
}

export function handleChat(req: ChatRequest): ChatResponse {
  switch (req.type) {
    case 'start': {
      // Idempotent: starting a live session resumes it instead of resetting —
      // a stale client must never blank the conversation. `start` with no
      // sessionId mints a fresh one.
      if (req.sessionId && sessions.has(req.sessionId)) {
        return handleChat({ type: 'resume', sessionId: req.sessionId });
      }
      const id = req.sessionId ?? crypto.randomUUID();
      const session = ensureSession(id);
      return { sessionId: id, turn: collect(session), state: state(session) };
    }
    case 'resume': {
      const session = sessions.get(req.sessionId);
      if (!session) return handleChat({ type: 'start', sessionId: req.sessionId });
      return {
        sessionId: req.sessionId,
        turn: restTurn(session),
        state: state(session),
        replay: session.log,
      };
    }
    case 'option': {
      const session = sessions.get(req.sessionId);
      if (!session) return handleChat({ type: 'start' });
      // Guard: an unknown session id, or an index with no live option set, is
      // a stale client rather than a crash — hand back the current rest state.
      const pending = session.dialogue.isWaitingForOptionSelection ? session.pendingOptions : null;
      const label = pending?.find((o) => o.index === req.optionIndex)?.text;
      if (!pending || label === undefined) {
        return { sessionId: req.sessionId, turn: restTurn(session), state: state(session) };
      }
      session.log.push({ from: 'me', text: label });
      session.pendingOptions = null;
      session.dialogue.selectOption(req.optionIndex);
      const turn = collect(session);
      turn.lines = [{ from: 'me', text: label }, ...turn.lines];
      return { sessionId: req.sessionId, turn, state: state(session) };
    }
  }
}
