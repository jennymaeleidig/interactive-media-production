# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Filled in by the
`flock-parody-impl` effort (the repo's first implementation effort under the
Next.js pivot, per `AGENTS.md`). Later efforts extend this document; they do
not silently deviate from it.

**Binding process rule:** follow these standards whenever writing or editing
code, and run the ["Before finishing"](#before-finishing) checks before
calling any change done.

## The one invariant everything serves

**Served pages make zero outbound requests — true by construction, not by
audit alone.** Captures carry no executable scripts; the build strips any
executable `<script>` that survives; served bytes keep only
`application/ld+json` data blocks. Any code that adds network behavior to a
served page (fetch, XHR, WebSocket, remote `src`, beacon) violates the piece.
Injected runtimes (motion, story-hook, chat) are inline, DOM-only, and must
degrade to the captured end-state with JavaScript disabled.

## Stack & layout

- **Next.js (App Router) + React + TypeScript (strict)**, npm. The app lives
  at the repo root: `app/` for routes, `pipeline/` for the capture→served
  build, `test/` for tests.
- The build pipeline (`pipeline/`) is **plain Node ESM JavaScript with JSDoc
  types** — no separate compile step, no bundler coupling. It is a **pure
  transformation**: capture run in → served tree + per-page mutation log out.
  No network access, no live-site calls, no wall-clock input. The injected
  browser runtimes it inlines (e.g. `pipeline/story-hook.js`, ticket 03) are
  the documented exception: plain browser JavaScript, kept ES5-safe, read as
  text and inlined verbatim — no `.mjs`/JSDoc requirement, no bundling.
- The fidelity gate (`regression/`, one command `npm run gate`) is plain Node
  ESM + JSDoc too, but **not a pure transformation**: it drives headless
  chromium in Docker, starts the production server, and compares real pixels.
  Its pure core (`regression/compare.mjs` — PNG pair in → diff stats out,
  report in → verdict out) is unit-tested at `test/gate.test.ts`; the shot
  mechanics (`regression/shoot.mjs` + `cdp-shot.mjs`) are the gate run
  itself, verified against the real capture run, never in `npm test` (the
  suite must stay green on a fresh clone). The full-scale route check
  (`regression/routes.mjs`) is part of the gate's preflight and also runs
  standalone (`npm run routes`); its pure core is `test/routes.test.ts`.
- **Known bottleneck — the pixel gate does not scale on a laptop.** The 0-px
  gate renders every shot through headless chromium in Docker, and the work is
  CPU-bound in the Docker/colima layer, so it barely parallelizes (4 shards buy
  ~2x). Measured: **~1.1 s per shot, ~0.93 s/shot wall for a 37-page run, and a
  full 1,180-page × 3-viewport sweep is roughly 2 hours** on a MacBook Air.
  Do **not** run the full sweep as a per-change check. Use it as a *localized*
  instrument:
  - `npm run routes` is the cheap full-coverage check — all ~1,280 route
    classes over HTTP plus the site-wide strip audit, ~8 s. Run it every time.
  - The 0-px pixel proof runs over `regression/sample-pages.txt` (one page per
    template family + the largest and hardest cases) with `--no-strip`, which
    skips the informational strip render — the serving-gate comparison is
    unchanged. That is ~6 min and is the per-ticket pixel check:
    `npm run gate -- --list regression/sample-pages.txt --no-strip`.
  - The exhaustive 1,180-page raw-vs-served strip sweep (and the full pixel
    matrix) is the **ticket-12 phase-gate run** on adequate hardware — a
    deliberate, occasional sign-off, not a routine step. `--no-strip` is the
    only sanctioned cost reduction; never weaken the 0-px gate itself.
- One **capture pointer** (`pipeline/config.mjs` → `CAPTURE_RUN`) decides
  which capture run the build serves from. Moving to a fresh run is a
  one-value change plus a re-run of the passes. The same file's
  `DROPPED_PAGES` lists the scaffold/test pages dropped from serving; it is
  explicit so a stale entry fails review, never a runtime heuristic.

## Pipeline discipline

- **Every mutation is logged, per page** (`served/build-log.json`): strip
  targets with removed byte counts, links rewritten, closing tags restored,
  warnings for anything left in place, the post-strip audit, and the script
  census. If the build changed served bytes, the log says so.
- **Build-level route artifacts** sit beside the log: `redirects.json` (the
  run manifest's legacy stubs → local targets, written even when empty) and
  `build-summary.json` (requested / served / dropped / errors, the redirect
  count, dead roots, auth-gated stubs). The routes check reads them, so the
  serving layer is measured against what the build actually produced.
- **The strip audit is an invariant**: after the passes, tracker machinery
  counts (Qualified, OneTrust stack, known tracker domains) must be zero on
  every page. A failing audit means the strip list is incomplete — fix the
  list, never weaken the audit.
- Regex strip targets are **tag-scoped and content-keyed** where collapse
  risk exists; new passes follow the same shape (find → bounded scan → remove
  → count → log) and rescan after shifts.
- Captures are **truncated before `</body></html>`** (SingleFile CLI never
  emits closing tags). Passes that anchor near EOF must restore them.

## Served bytes & fidelity

- **No new copy** anywhere in the Recreation (milestone rule). Code-owned
  strings (log keys, route names, a11y labels in injected runtimes) are not
  page copy; anything a visitor reads on a captured page comes from the
  Capture, verbatim.
- **Link policy**: internal hrefs rewrite to Recreation routes (queries and
  fragments preserved verbatim, including the one Qualified tracking
  parameter); external links stay live; asset/meta/JSON-LD URLs are untouched.
- Served pages are **static end-states**. Motion and interaction return only
  through the injection passes (tickets 03/04/05), never by un-freezing the
  captured DOM.
- Unknown paths 404. Reproducing observed live-site behavior is the fidelity
  bar — including its dead ends. The catch-all resolves 200 (served tree) →
  301 (redirect manifest) → 404 (dead roots, auth-gated stubs, dropped
  scaffold/test pages), in that order; a served file always wins over a
  manifest entry.

## Testing

- Tests assert **external behavior only**, at the seams pre-agreed in the
  spec's Testing Decisions: the rendered-pixel seam (ticket 06), the HTTP
  serving seam, the chat message API seam (ticket 08), the story-hook DOM
  seam (ticket 03), the motion DOM seam (ticket 04 — the injected reveal
  runtime's reduced-motion/one-shot contract, evaluated in jsdom against the
  exact injected bytes), and the interactions DOM seam (ticket 05 — the
  delegated click runtime's captured-class/geometry contract for tabs,
  dropdowns, accordions, and sliders, same jsdom-against-injected-bytes
  method; reduced motion never blocks function). No tests against pipeline
  internals or module structure;
  a test that breaks in a refactor without a behavior change is wrong.
- Tests run against **git-tracked fixtures** (`test/fixtures/`) — miniature
  capture runs mirroring the real corpus (unquoted attrs, machinery residue,
  truncated tails). The real capture run is never a test dependency: the
  suite must be green on a fresh clone.
- Red → green, one slice at a time. New behavior starts as a failing test at
  an agreed seam.
- The gate's compare/verdict logic is tested on synthetic PNGs
  (`test/gate.test.ts`); the route check's expectation builder and count
  invariant are tested pure (`test/routes.test.ts`). The full gate run and the
  full-scale route check are the rendered-pixel and HTTP seams exercised
  against the real capture run — instruments, not test-suite members.

## TypeScript & code style

- `strict: true`; no `any` unless the JS/TS boundary forces it (JSDoc-typed
  pipeline modules are the boundary). `npx tsc --noEmit` must be clean.
- Named exports; ESM (`import`/`export`); `.mjs` for pipeline Node scripts.
- Comments explain **why** (decisions, constraints, fidelity rules) — the
  code states what. Reference tickets/spec where a rule comes from somewhere.
- New code is CC0-1.0 (repo default, `LICENSE`); mark files with
  `// SPDX-License-Identifier: CC0-1.0` where convenient.

## Environment constraints (sandbox) — never remove

These are proven workarounds for the dev sandbox; removing them breaks
dev/build for everyone:

- **`WATCHPACK_POLLING=true`** is baked into `npm run dev`. Without it the
  file watcher dies (EMFILE) and every dev route 404s with an empty manifest.
- **`browserslist`** in `package.json` is required by `next build` (caniuse
  data resolution). Don't delete the field.
- **Headless Chromium runs via Docker** (`capsulecode/singlefile`, colima) —
  it cannot launch under the main agent sandbox. Captures and the pixel gate
  (ticket 06) depend on this.
- Servers started inside a sandboxed command must die with the command
  (self-alarm or child lifecycle) — no orphaned port squatters.

## Repo hygiene

- **Captures and build outputs stay out of git** (`.gitignore`): capture run
  HTML, `served/`, `.tmp/`. Inventories, CSVs, logs, and markdown stay
  tracked. Captures are reproducible via the capture-refresh runbook
  (ticket 11).
- Domain vocabulary comes from `CONTEXT.md` (Capture, Recreation, Chat
  mimic, Link policy…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).

## Before finishing

1. `npx tsc --noEmit` — clean.
2. `npm test` — full suite green (not just the files you touched).
3. `npm run build` — production build succeeds.
4. If the pipeline or served bytes changed: `npm run pipeline` + spot-check
   the mutation log and strip audit; run `npm run routes` for the full-scale
   route classes (build first).
5. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to
   the current branch — staging only files the ticket touched.
