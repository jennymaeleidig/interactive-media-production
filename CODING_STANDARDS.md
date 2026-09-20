# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Later efforts extend this
document; they do not silently deviate from it.

**Binding process rule:** follow these standards whenever writing or editing
code, and run the ["Before finishing"](#before-finishing) checks before calling
any change done.

## The one invariant everything serves

**The piece asks its viewer for nothing, and keeps nothing about them.** It
presents nothing to fill in and nothing to submit — no form, no text field, no
capture — and it carries no analytics, no tracker, and no viewer identifier. The
only thing it persists is the scripted session in the viewer's own browser
(`localStorage['flock-chat-state']`), and nothing about the viewer leaves the
page.

The page may reach the network: a `frame` can render an authored page, an
`image` can load an asset, a font arrives from the host. What it may not do is
reach anywhere the author did not choose: **no request's target, and no
request's payload, is derived from viewer input.** Chips resolve to authored
block sequences, and a `frame` renders only a URL in the hand-authored
allowlist, so nothing a viewer does can name a host.

The rule this replaces, "the chat's bytes reach nothing", could not survive the
block seam's frames; its byte scan is retired. The reversal, with the old text,
is
[ADR 0003](docs/adr/0003-retire-the-no-network-rule.md).

The shell is the vendored vercel/chatbot chrome with Flock's identity over it
(`components/NOTICE.md`). Its structural chrome — the transcript column, the
frame/figure styling, the composer row, the message-part switch — survives; the
tokens, type and ground are Flock's. The block adapter table in
`components/chat/message.tsx` **is** the seam ticket 01 settled: adding a block
type is one entry there, and a throwing adapter degrades to a designed fallback
instead of costing the transcript.

Static hosting is the deployment shape, and it is why the engine exists at all:
there is no server to answer a turn. `next build` writes the whole site into
`out/` (`output: 'export'` in `next.config.ts`); nothing is rendered per request,
and nothing is rewritten on the way out. Anything that needs a process — a
server-side route, middleware, a rewrite — is out of scope for this repo.

## Stack & layout

- **Next.js (App Router) + React + TypeScript (strict)**, npm. The app lives at
  the repo root: `app/` for routes, `pipeline/` for the chat's own modules and
  the checks they share, `test/` for tests, `regression/` for the artifact check.
- **`pipeline/` is plain Node ESM JavaScript with JSDoc types** — no separate
  compile step, with one deliberate bundler coupling: `pipeline/chat-engine.mjs`,
  `pipeline/chat-blocks.mjs` and `pipeline/chat-program.json` become
  `pipeline/chat-runtime.js` through `pipeline/build-chat-runtime.mjs` (esbuild),
  because a browser cannot compile Yarn or resolve a module graph. What that
  produces is ES5-safe and DOM-only. The React shell ships in the page's own
  Next bundle and reaches the engine only through `window.__flockChatEngine`, the
  interface the drift seam pins.
- **The generated files are committed**: `pipeline/chat-program.json` and
  `pipeline/chat-runtime.js`. They are the bytes the piece ships, not build
  outputs, and `npm run chat:check` fails when they stop following from their
  sources.
- **One declaration per published path.** `pipeline/chat-assets.mjs` says which
  maintained file each published URL carries; the asset route, the artifact check
  and the shell seam read it rather than repeating it. The roster holds the
  runtime alone, because the shell is not a published file.
- `dialogue/` holds the Yarn sources. The fixture is throwaway content that
  exercises the engine end to end; authoring real dialogue is a change to those
  sources and nothing else.

## Testing

- Tests assert **external behavior only**, at the seams that exist:
  - **The engine seam** (`test/chat.seam.test.ts`) — the conversation the shipped
    engine runs, in the jsdom its one `localStorage` session needs: pinned copy,
    the block sequence each turn produces, the choice sets, session persistence
    across calls, the email gate's stop, the hub's re-offer, and an unresolvable
    block id degrading without costing the turn. It drives
    `pipeline/chat-engine.mjs`, the module the runtime bundles.
  - **The shell seam** (`test/chat-shell.seam.test.tsx`) — the surface the
    visitor sees, mounted in jsdom against the exact bytes the host publishes:
    the greeting and chip row, the assistant's mark once per run and the day
    divider's stamp, the inert composer with no input anywhere, the
    resume round trip, the block adapters, containment of a throwing adapter, a
    frame URL outside the derived allowlist issuing no request, and the `?`
    disclosure opening.
  - **The inventory suite** (`test/chat-blocks.test.ts`) — the hand-reviewed
    declaration: unique ids, every type in the locked vocabulary, the derived
    allowlist equal to the set of `src` values, no frame combining
    `allow-scripts` with `allow-same-origin`, and every `<<block>>` id in the
    compiled program resolving.
  - **The interface-shape seam** (`test/chat-interface.test.ts`) — the drift
    guard: the published runtime installs exactly the `turn` surface the shell
    calls and answers with a block-carrying turn.
  - **The artifact seam** (`regression/artifact.mjs`, `npm run check:artifact`) —
    the built export, read back over HTTP: the host page is HTML and names the
    published path, carries the honest preview metadata and the `?` disclosure,
    the path answers with the maintained bytes, and the privacy path resolves. It
    is environmental — an instrument, not a suite member — because it needs a
    build and a server; `test/artifact.test.ts` drives its serving seam (`probe`)
    over a temporary directory and covers its verdicts.
  - `test/seam-harness.ts` resolves the published bytes through the declaration,
    so a seam cannot test a file the host does not serve. jsdom itself is vitest's
    `environment: 'jsdom'`, and `test/setup-jsdom.ts` installs the in-memory
    `localStorage` this Node runtime shadows.
- **Pure-module seams** pin a module's declared contract where that contract is
  its behaviour: the published bytes' shape (`test/chat-assets.test.ts`), the
  artifact check's serving seam and pure verdicts (`test/artifact.test.ts`), and
  the day divider's format (`test/time.test.ts`). They are the one exception to "no tests against
  internals"; apart from them no test targets incidental structure, and a test
  that breaks in a behaviour-preserving refactor is wrong.
- Red → green, one slice at a time. New behaviour starts as a failing test at an
  agreed seam.
- **Heavyweight checks stay out of `npm test`.** `npm test` is the fast suite a
  developer runs on every edit; `npm run chat:check` and `npm run check:artifact`
  are the instruments that need a build, and CI runs them.

## TypeScript & code style

- `strict: true`; no `any` unless the JS/TS boundary forces it (JSDoc-typed
  pipeline modules are the boundary). `npx tsc --noEmit` must be clean.
- Named exports; ESM (`import`/`export`); `.mjs` for pipeline Node scripts.
- Comments explain **why** (decisions, constraints, fidelity rules) — the code
  states what. Reference the artifact that owns the rule — a module, a test, or a
  glossary term in `CONTEXT.md` — where a rule comes from somewhere.
- New code is CC0-1.0 (repo default, `LICENSE`); mark files with
  `// SPDX-License-Identifier: CC0-1.0` where convenient.

## Environment constraints (sandbox) — never remove

These are proven workarounds for the dev sandbox; removing them breaks
dev/build for everyone:

- **`WATCHPACK_POLLING=true`** is baked into `npm run dev`. Without it the
  file watcher dies (EMFILE) and every dev route 404s with an empty manifest.
- **`browserslist`** in `package.json` is required by `next build` (caniuse
  data resolution). Don't delete the field.
- **The workspace root is pinned in `next.config.ts`** (`outputFileTracingRoot`).
  There is an unrelated `package-lock.json` above this repo, and without the pin
  every `next build` warns that it guessed the workspace root.
- **Headless Chromium cannot launch under the main agent sandbox** — it needs
  Docker (the `capsulecode/singlefile` image, colima). Nothing here needs a
  browser to build, test or check: the shell seam runs in jsdom, and the
  artifact check reads the export over HTTP.
- Servers started inside a sandboxed command must die with the command
  (self-alarm or child lifecycle) — no orphaned port squatters.

## Repo hygiene

- **Nothing a build produces is committed.** `out/`, `.next/` and `.tmp/` stay
  out of git. The two exceptions are deliberate: `pipeline/chat-program.json` and
  `pipeline/chat-runtime.js` are the bytes the piece ships, and
  `npm run chat:check` is what keeps them tied to their sources.
- **The piece is self-contained.** No copied page bytes, no content-addressed
  mirror, no vendored third-party runtime. The three typefaces are self-hosted
  under `public/fonts/`, the wordmark is inline SVG, and the engine bundles its
  own dialogue runtime. The vendored shell is the one deliberate third-party
  dependency tree, with its license in `components/LICENSE` and its
  modifications in `components/NOTICE.md`.
- **A cleared vocabulary.** The names of the reconstruction this repo used to
  carry — its tree, its roster of injected files, the checks that watched them —
  are gone from the tracked files, and `test/vocabulary.test.ts` fails if any of
  them comes back.
- Domain vocabulary comes from `CONTEXT.md` (chat surface, block, inventory,
  published path, no-ask rule…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).

## Before finishing

1. `npm run typecheck` — `tsc --noEmit` clean plus `tsc -p tsconfig.checkjs.json`
   (the `checkJs` project over the chat's own JavaScript).
2. `npm test` — full suite green (not just the files you touched).
3. `npm run chat:check` — the generated program and runtime still follow from the
   dialogue and the engine.
4. `npm run build` — the production export succeeds.
5. `npm run check:artifact` — the export carries the chat: the host page names
   the published path, carries the honest preview metadata and the `?`, its bytes
   are the maintained source, and the privacy path resolves.
6. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to the
   current branch — staging only files the ticket touched.

The gate steps (1–5) are also the **deploy gate**: `.github/workflows/publish.yml`
runs them on every push to `main` and then uploads `out/` to GitHub Pages, so a
failure stops before anything is published. That workflow is the repository's only
CI — a check added to this list does not join it on its own, so change both
together.
