# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Later efforts extend this
document; they do not silently deviate from it. Follow these standards whenever
writing or editing code, and run ["Before finishing"](#before-finishing) before
calling any change done.

## The one invariant everything serves

**The no-ask rule** ([ADR 0005](docs/adr/0005-ask-the-viewer-for-nothing.md)):
the piece asks its viewer for nothing and keeps nothing about them — no form,
no capture, no analytics, no viewer identifier. The only persistence is the
scripted session in the viewer's own browser, and no request's target or payload
is derived from viewer input. The ADR holds the full reasoning and consequences.

Two further decisions shape every change:

- **Static hosting.** `next build` writes the whole site into `out/`
  (`output: 'export'`); nothing renders per request. Anything needing a process
  — a server route, middleware, a rewrite — is out of scope for this repo.
- **The vendored shell.** vercel/chatbot chrome with Flock's identity over it
  (`components/NOTICE.md`). Its structural chrome survives; tokens, type and
  ground are Flock's. Adding a block type is one entry in the adapter table in
  `components/chat/message.tsx`; a throwing adapter degrades to a designed
  fallback instead of costing the transcript.

## Stack & layout

- **Next.js (App Router) + React + TypeScript (strict)**, npm. `app/` routes,
  `scripts/` the chat's own modules, `test/` tests, `test/` the artifact
  check, `dialogue/` the Yarn sources (authoring real dialogue is a change to
  those sources and nothing else).
- **`scripts/` is plain Node ESM with JSDoc types** — no compile step, except
  the deliberate bundler coupling: `chat-engine.mjs`, `chat-blocks.mjs` and
  `chat-program.json` become `chat-runtime.js` via `build-chat-runtime.mjs`
  (esbuild), ES5-safe and DOM-only, because a browser cannot compile Yarn or
  resolve a module graph. The React shell reaches the engine only through
  `window.__flockChatEngine`, the interface the drift seam pins.
- **The generated files are committed** — `chat-program.json` and
  `chat-runtime.js` are the bytes the piece ships, not build outputs;
  `npm run chat:check` fails when they stop following from their sources.
- **One declaration per published path.** `scripts/chat-assets.mjs` says which
  maintained file each published URL carries; the asset route, artifact check
  and shell seam read it rather than repeating it.

## Testing

Tests assert **external behavior only, at the seams that exist**; a test that
breaks in a behavior-preserving refactor is wrong. Red → green, one slice at a
time: new behaviour starts as a failing test at an agreed seam.

- **Engine seam** (`test/chat.seam.test.ts`) — the conversation the shipped
  engine runs, in the jsdom its one `localStorage` session needs: pinned copy,
  block sequences per turn, choice sets, session persistence, the email gate's
  stop, the hub's re-offer, an unresolvable block id degrading without costing
  the turn. Drives `scripts/chat-engine.mjs`, the module the runtime bundles.
- **Shell seam** (`test/chat-shell.seam.test.tsx`) — the visitor's surface,
  mounted against the exact bytes the host publishes: greeting and chip row,
  the assistant's mark and day divider, the inert composer with no input
  anywhere, the resume round trip, the block adapters and containment of a
  throwing one, a frame URL outside the derived allowlist issuing no request,
  the `?` disclosure.
- **Inventory suite** (`test/chat-blocks.test.ts`) — the hand-reviewed
  declaration: unique ids, the locked type vocabulary, the derived allowlist
  equal to the `src` set, no frame combining `allow-scripts` with
  `allow-same-origin`, every `<<block>>` id resolving.
- **Interface-shape seam** (`test/chat-interface.test.ts`) — the drift guard:
  the published runtime installs exactly the `turn` surface the shell calls.
- **Artifact seam** (`test/artifact.mjs`, `npm run check:artifact`) — the
  built export read back over HTTP: host page names the published path, carries
  the honest preview metadata and the `?` disclosure, the path answers with the
  maintained bytes, the privacy path resolves. Environmental — an instrument,
  not a suite member; `test/artifact.test.ts` covers its verdicts via its
  serving seam over a temporary directory.
- `test/seam-harness.ts` resolves published bytes through the declaration, so a
  seam cannot test a file the host does not serve. jsdom is vitest's
  environment; `test/setup-jsdom.ts` installs the in-memory `localStorage`.
- **Pure-module seams** pin a declared contract that *is* the behaviour
  (`chat-assets`, `artifact` verdicts, the day divider's format). They are the
  one exception to "no tests against internals".
- **Heavyweight checks stay out of `npm test`** — the fast suite runs on every
  edit; `chat:check` and `check:artifact` need a build and run in CI.

## TypeScript & code style

- `strict: true`; no `any` unless the JS/TS boundary forces it (JSDoc-typed
  scripts modules are the boundary). `npx tsc --noEmit` must be clean.
- Named exports; ESM; `.mjs` for scripts/ Node modules.
- Comments explain **why** — the code states what — and reference the artifact
  that owns the rule (a module, a test, a `CONTEXT.md` glossary term).
- New code is CC0-1.0 (`LICENSE`); mark files with
  `// SPDX-License-Identifier: CC0-1.0` where convenient.

## Environment constraints (sandbox) — never remove

Proven workarounds; removing any breaks dev/build for everyone:

- `WATCHPACK_POLLING=true` is baked into `npm run dev`; without it the watcher
  dies (EMFILE) and every dev route 404s with an empty manifest.
- `browserslist` in `package.json` is required by `next build`.
- `outputFileTracingRoot` is pinned in `next.config.ts` (an unrelated
  `package-lock.json` sits above this repo).
- Headless Chromium needs Docker (`capsulecode/singlefile`, colima); nothing
  here needs a browser — the shell seam runs in jsdom, the artifact check reads
  the export over HTTP.
- A server started inside a sandboxed command dies with it — no orphaned port
  squatters.

## Repo hygiene

- **Nothing a build produces is committed** — `out/`, `.next/`, `.tmp/` stay
  out of git (the two generated files above are the deliberate exceptions).
- **The piece is self-contained**: self-hosted typefaces under `public/fonts/`,
  inline SVG wordmark, the engine bundles its own dialogue runtime. The vendored
  shell is the one third-party tree, licensed in `components/LICENSE`.
- The cleared vocabulary stays cleared — `test/vocabulary.test.ts` fails if the
  names of the old reconstruction return.
- Domain vocabulary comes from `CONTEXT.md` (chat surface, block, inventory,
  published path, no-ask rule…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).

## Before finishing

1. `npm run typecheck` — clean on both projects (including `checkJs`).
2. `npm test` — full suite green, not just touched files.
3. `npm run chat:check` — generated program and runtime still follow from their
   sources.
4. `npm run build` — the production export succeeds.
5. `npm run check:artifact` — the export carries the chat.
6. Ticket status updated (`docs/agents/issue-tracker.md`); work committed to the
   current branch, staging only files the ticket touched.

Steps 1–5 are the **deploy gate**: `.github/workflows/publish.yml` runs them on
every push to `main` before uploading `out/` to GitHub Pages. It is the
repository's only CI — a check added to this list does not join it on its own,
so change both together.
