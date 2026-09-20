# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Later efforts extend this
document; they do not silently deviate from it.

**Binding process rule:** follow these standards whenever writing or editing
code, and run the ["Before finishing"](#before-finishing) checks before calling
any change done.

## The one invariant everything serves

**The chat's bytes reach nothing.** The conversation runs in the page: the
dialogue engine is bundled into the runtime, the widget mounts it, and no file
the host publishes names a network primitive — not `fetch`, not
`XMLHttpRequest`, not a dynamic `import(`, not a remote URL in the stylesheet.
`pipeline/chat-source.mjs` owns the rule (`isInertSource`), the widget seam and
`test/chat-source.test.ts` apply it to the shipped bytes, and the artifact check
proves the published files are those bytes. Code that adds network behaviour to
the piece breaks the invariant three times over, deliberately.

The widget's surfaces are the captured design, not a re-drawing of it: its
stylesheet and its mount code carry the fidelity the widget seam pins — the
launcher, the panel, the chips in the composer slot, complete bubbles, no typing
indicator, no sound. Its bytes are generated into the runtime, so editing them
means regenerating both (`npm run chat:build`); the freshness gate is what keeps
the committed files honest.

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
  compile step, with one deliberate bundler coupling: `pipeline/chat-engine.mjs`
  plus `pipeline/chat-program.json` become `pipeline/chat-runtime.js` through
  `pipeline/build-chat-runtime.mjs` (esbuild), because a browser cannot compile
  Yarn or resolve a module graph. What that produces is ES5-safe, DOM-only and
  network-free.
- **The generated files are committed**: `pipeline/chat-program.json` and
  `pipeline/chat-runtime.js`. They are the bytes the piece ships, not build
  outputs, and `npm run chat:check` fails when they stop following from their
  sources.
- **One declaration per published path.** `pipeline/chat-assets.mjs` says which
  maintained file each published URL carries; the asset route, the artifact check
  and the widget seam read it rather than repeating it.
- `dialogue/` holds the Yarn sources. The fixture is throwaway content that
  exercises the engine end to end; authoring real dialogue is a change to those
  sources and nothing else.

## Testing

- Tests assert **external behavior only**, at the seams that exist:
  - **The engine seam** (`test/chat.seam.test.ts`) — the conversation the shipped
    engine runs, in the jsdom its one `localStorage` session needs: pinned copy,
    turn shapes, the choice sets, session persistence across calls, the email
    gate's stop, and the hub's re-offer. It drives `pipeline/chat-engine.mjs`, the
    module the runtime bundles.
  - **The widget seam** (`test/chat-widget.seam.test.ts`) — the surface the
    visitor sees, mounted from the exact bytes the host publishes: the three
    captured surfaces, the inert composer, the chips in the composer slot,
    complete bubbles with no typing indicator and no sound, session restore, the
    parity block that renders what the shipped engine returns, and the mobile
    stylesheet's shape (jsdom evaluates no media queries, so the layout is read as
    the stylesheet's shape).
  - **The artifact seam** (`regression/artifact.mjs`, `npm run check:artifact`) —
    the built export, read back over HTTP: the host page is HTML and names both
    published files, each answers with the maintained bytes, and the privacy path
    resolves. It is environmental — an instrument, not a suite member — because it
    needs a build and a server; `test/artifact.test.ts` covers its verdicts.
  - `test/seam-harness.ts` owns the window and the bytes: one `new JSDOM`, one
    `runScripts` mode, one mutable reduced-motion `matchMedia` with read and
    listener counters, and the published bytes resolved through the declaration.
    A seam adds page HTML and assertions, never another jsdom setup.
- **Pure-module seams** pin a module's declared contract where that contract is
  its behaviour: the no-network rule (`test/chat-source.test.ts`), the published
  bytes' shape (`test/chat-assets.test.ts`), and the artifact check's pure cores
  (`test/artifact.test.ts`). They are the one exception to "no tests against
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
- **Headless Chromium cannot launch under the main agent sandbox** — it needs
  Docker (the `capsulecode/singlefile` image, colima). Nothing here needs a
  browser to build, test or check: the widget seam runs in jsdom, and the
  artifact check reads the export over HTTP.
- Servers started inside a sandboxed command must die with the command
  (self-alarm or child lifecycle) — no orphaned port squatters.

## Repo hygiene

- **Nothing a build produces is committed.** `out/`, `.next/` and `.tmp/` stay
  out of git. The two exceptions are deliberate: `pipeline/chat-program.json` and
  `pipeline/chat-runtime.js` are the bytes the piece ships, and
  `npm run chat:check` is what keeps them tied to their sources.
- **The piece is self-contained.** No captured page bytes, no content-addressed
  mirror, no vendored third-party runtime: the widget's stylesheet carries its
  own typeface and images as data URIs, and the engine bundles its own dialogue
  runtime.
- **A cleared vocabulary.** The names of the reconstruction this repo used to
  carry — its tree, its roster of injected files, the checks that watched them —
  are gone from the tracked files, and `test/vocabulary.test.ts` fails if any of
  them comes back.
- Domain vocabulary comes from `CONTEXT.md` (widget, chat runtime, published
  path, no-network rule…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).
- **Known follow-up — ticket numbers inside the widget's own bytes.** The
  widget's stylesheet and mount code cite the tickets that produced them. Those
  bytes are frozen on purpose (the widget seam and the artifact check pin them),
  so clearing the comments means editing the widget and regenerating the runtime
  — a fidelity decision, not a comment edit. The non-shipped sources are already
  free of such references.

## Before finishing

1. `npm run typecheck` — `tsc --noEmit` clean plus `tsc -p tsconfig.checkjs.json`
   (the `checkJs` project over the chat's own JavaScript).
2. `npm test` — full suite green (not just the files you touched).
3. `npm run chat:check` — the generated program and runtime still follow from the
   dialogue and the engine.
4. `npm run build` — the production export succeeds.
5. `npm run check:artifact` — the export carries the chat: the host page names
   both published files, they are the maintained bytes, and the privacy path
   resolves.
6. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to the
   current branch — staging only files the ticket touched.

The gate steps (1–5) are also the **deploy gate**: `.github/workflows/publish.yml`
runs them on every push to `main` and then uploads `out/` to GitHub Pages, so a
failure stops before anything is published. That workflow is the repository's only
CI — a check added to this list does not join it on its own, so change both
together.
