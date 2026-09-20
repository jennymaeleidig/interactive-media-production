# Keep the turn contract in-process

The chat's turn contract (`lib/chat-turn.mjs`) was written against a server that no longer
exists: a static export has no process to answer a turn, so the engine was rebuilt client-side but
kept the server's shape — a conversation id minted per session and round-tripped on every request,
a separate `resume` verb, a `replay` field carrying the resumed block sequence, and `Promise`-wrapped handlers
so the shell's `turn(body).then(…)` would look like network code. That shape split one concept, the
session, across two modules and two `localStorage` keys (`flock-chat-session` held by the shell,
`flock-chat-state` held by the engine), and the shell sent `start` with a stored id precisely
because the engine's `start` would not otherwise resume.

The contract is now in-process. The engine owns the session end to end, behind one key; `start`
opens the page's session (resuming a live snapshot, beginning one when there is none) and `option`
selects a pending choice. The response carries the whole block sequence, the choice set, and the
session's report — no conversation id, no `resume` verb, no `replay`. What the server shape was
traded for is the reason it existed at all: there is no network, nothing to identify, and one owner
for the one conversation.

## Consequences

- `localStorage['flock-chat-session']` is orphaned. Nothing reads it; no migration or cleanup code
  exists, because nothing derives a request from it.
- The shell's `useDialogue` keeps no storage and no id and simply renders the last response; the
  interface-shape seam still pins exactly one method, `turn`.
- The session snapshot no longer carries an id, so `isCurrentSnapshot` validates an old blob by
  its variables, node, block log and completion. The engine also prefers its in-page copy of the
  session only when `localStorage` refused the last write; an empty store is a fresh page rather
  than a resurrection of that module-level copy.
- A future reader who wonders where the server went will find the static export decision
  (`output: 'export'`) and this record; reintroducing a server-shaped contract means removing the
  engine entirely, not restoring a route.
