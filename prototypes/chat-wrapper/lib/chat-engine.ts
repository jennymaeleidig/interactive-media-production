// PROTOTYPE (wayfinder ticket 04) — throwaway, but this module is the part
// worth lifting: it is the entire answer to "how does the cloned chat widget
// bind to yarnspinner-ts".
//
// Pinned decisions this code embodies (see ticket 04's ## Answer):
// 1. Runtime lives SERVER-SIDE. `loadYarnProject()` runs once at module load
//    (the SSR startup-singleton from yarnspinner-ts's own docs — zero bundler
//    integration, works identically under Turbopack and webpack), and one
//    `Dialogue` per session lives in a module-level Map (server memory; fine
//    for a local art piece). Session state survives page reloads exactly the
//    way Qualified's server-side session does.
// 2. Message API: one POST endpoint carrying {type: start|resume|option};
//    every response carries a turn batch (lines / pending options / complete)
//    + a state snapshot whose `vars` is literally `VariableStorage.entries()`
//    — the whole documented serialization seam.
// 3. ALL choices are Yarn options (`->`), authored in the script. The wrapper
//    renders the pending set as user-style bubbles in the composer slot;
//    clicking one is `selectOption()`. No composer, no free text, no
//    persistent CTA row — the user's UI direction, 2026-09-09.
// 4. yarnspinner-ts is depended on via npm `file:` — an absolute system path
//    to the local sibling repo (nothing is on npm yet, ticket 07; the user
//    will publish later). `file:../../…` relative specifiers don't survive
//    npm's resolution here; absolute does.

import { Dialogue, EMPTY_TRANSCRIPT, InMemoryVariableStorage, runUntilStopped } from "yarnspinner-typescript";
import type { DialogueOption, TranscriptLine } from "yarnspinner-typescript";
import { loadYarnProject } from "yarnspinner-typescript/node";
import path from "node:path";

// ---------------------------------------------------------------------------
// Program: compiled once per deploy (module-eval time in the API route).
// ---------------------------------------------------------------------------
const project = loadYarnProject(path.join(process.cwd(), "dialogue", "flock.yarnproject"));
if (!project.program) {
  const problems = project.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n");
  throw new Error(`flock.yarn failed to compile:\n${problems}`);
}

// ---------------------------------------------------------------------------
// Sessions: one Dialogue in server memory per visitor.
// ---------------------------------------------------------------------------
interface Session {
  dialogue: Dialogue;
  storage: InMemoryVariableStorage;
  lastOptions: DialogueOption[] | null;              // pending inline options, for resume
  log: { from: "bot" | "me"; text: string }[];       // replay for resume across reloads
}

const sessions = new Map<string, Session>();

function newSession(): Session {
  const storage = new InMemoryVariableStorage();
  const dialogue = new Dialogue(project.program!, {
    variableStorage: storage,
    logError: (m) => console.error(`[yarn] ${m}`),
  });
  return { dialogue, storage, lastOptions: null, log: [] };
}

// ---------------------------------------------------------------------------
// Turn plumbing: pull to the next rest state and shape the chat batch.
// The chat-turn sweep is the WRAPPER's job, not the helpers': keep pulling
// across "line"/"command" stopping points until the dialogue rests at an
// options block (selectOption path) or completion.
// ---------------------------------------------------------------------------
export interface ChatTurn {
  lines: { speaker: string | null; text: string }[];
  options: DialogueOption[] | null; // pending choice set — render as user bubbles
  complete: boolean;
}

function collect(session: Session): ChatTurn {
  let { transcript, stopped } = runUntilStopped(session.dialogue, EMPTY_TRANSCRIPT);
  while (stopped === "command" || stopped === "line") {
    ({ transcript, stopped } = runUntilStopped(session.dialogue, transcript));
  }
  session.lastOptions = transcript.options;
  for (const line of transcript.lines) session.log.push({ from: "bot", text: line.text });
  return {
    lines: transcript.lines.map((l: TranscriptLine) => ({ speaker: l.speaker ?? null, text: l.text })),
    options: stopped === "options" ? transcript.options : null,
    complete: stopped === "complete",
  };
}

function state(session: Session) {
  return {
    node: session.dialogue.currentNode,
    complete: session.dialogue.isComplete,
    // THE serialization seam: this object is exactly what a client-side or
    // DB-backed store would persist (story vars + $Yarn.Internal.* state).
    // What it deliberately does NOT hold: VM position (the pending option
    // set / mid-node progress) — restored sessions re-enter the current node
    // at its top, which is why server-memory sessions are the chosen model.
    vars: Object.fromEntries(session.storage.entries()),
  };
}

function ensure(sessionId: string | undefined): { id: string; session: Session } {
  if (sessionId && sessions.has(sessionId)) return { id: sessionId, session: sessions.get(sessionId)! };
  const id = sessionId ?? crypto.randomUUID();
  const session = newSession();
  sessions.set(id, session);
  session.dialogue.setNode("Start");
  return { id, session };
}

// ---------------------------------------------------------------------------
// Public surface — one shape per request type.
// ---------------------------------------------------------------------------
export type ChatRequest =
  | { type: "start"; sessionId?: string }                  // fresh session
  | { type: "resume"; sessionId: string }                  // page reload: replay, no side effects
  | { type: "option"; sessionId: string; optionIndex: number }; // choice-bubble click

export interface ChatResponse {
  sessionId: string;
  turn: ChatTurn;
  state: ReturnType<typeof state>;
  replay?: { from: "bot" | "me"; text: string }[]; // resume only
}

export function handleChat(req: ChatRequest): ChatResponse {
  switch (req.type) {
    case "start": {
      // Idempotent: starting a live session resumes it instead of resetting —
      // the widget only sends start with no sessionId, but a stale client
      // must never blank the conversation.
      if (req.sessionId && sessions.has(req.sessionId)) return handleChat({ type: "resume", sessionId: req.sessionId });
      const { id, session } = ensure(req.sessionId);
      return { sessionId: id, turn: collect(session), state: state(session) };
    }
    case "resume": {
      const session = sessions.get(req.sessionId);
      if (!session) return handleChat({ type: "start", sessionId: req.sessionId });
      return {
        sessionId: req.sessionId,
        turn: {
          lines: [],
          options: session.dialogue.isWaitingForOptionSelection ? session.lastOptions : null,
          complete: session.dialogue.isComplete,
        },
        state: state(session),
        replay: session.log,
      };
    }
    case "option": {
      const session = sessions.get(req.sessionId);
      if (!session) return handleChat({ type: "start" });
      const label = session.lastOptions?.find((o) => o.index === req.optionIndex)?.text;
      if (label) session.log.push({ from: "me", text: label });
      session.dialogue.selectOption(req.optionIndex);
      return { sessionId: req.sessionId, turn: collect(session), state: state(session) };
    }
  }
}
