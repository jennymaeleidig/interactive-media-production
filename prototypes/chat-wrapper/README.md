# PROTOTYPE: chat wrapper binding (wayfinder ticket 04)

**Throwaway.** This app answers one question — *how does the cloned Qualified
chat widget bind to yarnspinner-ts?* — and then dies. It is not production
code and not the piece.

## Run it

```bash
npm install
npm run dev        # → http://localhost:3000
```

Scroll the host page to trigger the pounce, click the CTAs, type freely,
reload the page (the session must survive, like the original). The top-right
panel exposes the server-side session state.

## The decisions it embodies (see ticket 04's ## Answer)

1. **Runtime is server-side.** `lib/chat-engine.ts` compiles the yarn project
   once at module load via `loadYarnProject()` (`yarnspinner-typescript/node`)
   — the SSR startup-singleton from yarnspinner-ts's own docs. Zero bundler
   integration: identical under Turbopack and webpack, dev and build.
   *Ratified by the user, 2026-09-09.*
2. **Message API.** One POST endpoint (`app/api/chat`): request
   `{type: start|resume|option, …}` → response carries the turn batch (lines /
   pending choice set / complete) plus a state snapshot whose `vars` is
   literally `VariableStorage.entries()` — the whole serialization seam,
   surfaced every turn. Shape may be adjusted later without touching the
   decisions. *Ratified by the user, 2026-09-09.*
3. **`.yarn` enters the build via the SSR path**, not the vite plugin (ticket
   07: Turbopack has no loader seam; content here is deployment data — the
   plugin's own doc names this exact division). The compile happens at
   request-module load; swapping content needs no rebuild of the bundler graph.
4. **yarnspinner-ts is a local `file:` dependency** — an absolute system path
   to the sibling repo (`/Users/jennyleidig/…/yarnspinner-ts`), referenced via
   npm like any dependency. User direction 2026-09-09: local for now, publish
   to npm later. Relative `file:../../…` specifiers do NOT survive npm's
   resolution here (workspace-root inference produces a dangling symlink);
   absolute paths do. Dev servers read the sibling live, so its edits need no
   reinstall.
5. **No composer, no persistent chips.** UI direction from the user
   (2026-09-09): every choice is a Yarn option (`->`) authored in the script;
   the wrapper renders the pending set as user-style bubbles sitting in the
   composer slot — clicking one reads as sending your own typed message.
   Clicks are `selectOption()`; sessions live in server memory, so the
   node-top-restart caveat only bites across server restarts.

## Yarn authoring gotcha (bites the user's future script)

A `//` comment placed between options (at option-indent level) makes the
compiler silently DROP every option after it — no diagnostic fires. Put
comments at line level or node top. Verified 2026-09-09.

## Environment facts hit while building (sandbox)

- **`WATCHPACK_POLLING=true` is required for `next dev` under the pi sandbox**:
  the native file watcher is denied (FSEvents/kqueue fence) and a silently
  empty dev route manifest 404s everything while the layout still renders.
  Polling mode avoids the native watcher. Baked into the `dev` script.
- **A `browserslist` field is required** in any Next app under the sandbox:
  without one, the CSS pipeline's config walk climbs past the workspace and
  dies on `EPERM: stat /Users/<user>/package.json`. Same fix belongs in the
  real app's package.json.

## Fixture

`dialogue/flock.yarn` transcribes one observed live session (PINNED strings:
s9 greeting, s10 support/general walk, s12 demo ask — evidence in
`.scratch/flock-parody/research/evidence/06-qualified-conversation-ux/`).
GLUE-marked strings and choices are structural filler, not observed copy. The
demo path stops at the email gate, mirroring the research covenant. Every
node ends in a Yarn option set; choices loop back through demo/support or
exit to `end` (dialogueComplete).
