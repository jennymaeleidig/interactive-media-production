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
degrade to the captured end-state with JavaScript disabled. The Captures'
own CSP (`default-src 'none'`, no `connect-src`) refuses even the chat's
same-origin POST, so the chat mount is the **one** pass that touches the
policy: it appends exactly `connect-src 'self'` on launcher pages (logged per
page), and no pass may widen it beyond that — `'self'` is the Recreation
origin, so the grant cannot leave the machine.

Page assets are local, never remote. A Capture inlines every image, font, and
sound as a `data:` URI, and the build extracts each one to a content-addressed
file (`/assets/<sha16>.<ext>`, served by `app/assets/[...path]/route.ts`) rather
than pointing at an origin URL — SingleFile keeps no origin URL, and the
extraction is what makes the served tree ~2 GB instead of ~10 GB. The
**decided exception is video** (ADR 0002): the slots will play from the original
hosts' embeds, the only reason `frame-src` may ever name a remote host, and the
only place the invariant is enforced by allow-list audit rather than by
construction. Extraction runs before the injection passes, because the injected
runtimes are inlined verbatim and one of them carries `data:` URIs of its own.

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
- The serving check (`regression/routes.mjs`, one command `npm run routes`) is
  plain Node ESM + JSDoc and **environmental**: it starts the production
  server and measures it over HTTP. Its pure cores — `routeExpectations`,
  `countFailures`, `auditFailures`, `servedCandidates`, `byteMismatch` — are
  unit-tested at `test/routes.test.ts`; the check itself runs against the real
  build and capture run, never in `npm test` (the suite must stay green on a
  fresh clone).
- **The serving layer is verified in bytes, not pixels.** Every served page's
  HTTP body must be byte-identical to the file the build wrote — same bytes ⇒
  same pixels, so byte-identity is the strictly stronger guarantee, and it
  covers all 1,180 pages in ~10 s. There is **no pixel gate**: the retired
  ticket-06 harness compared served-over-HTTP against the *same* served bytes
  on disk (self-vs-self — it could not see a bad build), and rendered ~1,180
  pages × 3 viewports for ~2 h to re-prove one code path. Visual fidelity and
  strip deltas are the human side-by-side at the phase gates (ticket 12); the
  per-page strip decision is recorded machine-readably in the build log.
- One **capture pointer** (`pipeline/config.mjs` → `CAPTURE_RUN`) decides
  which capture run the build serves from. Moving to a fresh run is a
  one-value change plus a re-run of the passes. The same file's
  `DROPPED_PAGES` lists the scaffold/test pages dropped from serving; it is
  explicit so a stale entry fails review, never a runtime heuristic.

## Pipeline discipline

- **Every mutation is logged, per page** (`served/build-log.json`): strip
  targets with removed byte counts, links rewritten, closing tags restored,
  warnings for anything left in place, the post-strip audit, and the script
  census. If the build changed served bytes, the log says so. The log also
  carries the per-page **chat-mount census** (ticket 10): whether the Capture
  mounted the Qualified launcher, taken from the same `<q-root>` marker the
  strip removes, so the pages that get the mimic and the pages that lost the
  launcher can never drift apart (`build-summary.json` carries the counts).
- **Build-level route artifacts** sit beside the log: `redirects.json` (the
  run manifest's legacy stubs → local targets, written even when empty) and
  `build-summary.json` (requested / served / dropped / errors, the redirect
  count, dead roots, auth-gated stubs). The routes check reads them, so the
  serving layer is measured against what the build actually produced.
- **The strip audit is an invariant**: after the passes, tracker machinery
  counts (Qualified, OneTrust stack, known tracker domains) and account/auth
  host references (`users.flocksafety.com`, `login.flocksafety.com`) must be
  zero on every page. A failing audit means the strip list is incomplete —
  fix the list, never weaken the audit.
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
- The served tree is **frozen**: the serving route returns the build's bytes
  unmodified (no per-request transformation), and `npm run routes` asserts
  byte-identity over HTTP for every page — same bytes ⇒ same pixels, so the
  visual result is fixed by the build, not the request.
- **Account surfaces are stripped, never mocked** (ADR-0001). The live site's Sign In
  chrome (header button, footer link) points at `users.flocksafety.com` and
  its auth host `login.flocksafety.com`; both go, wholesale (chrome) or
  unwrapped (inline copy keeps its words). No account page, no mock login, no
  cart. Keyed on the **host**, never the word "account" — the corpus uses that
  word in ordinary copy ("Account Executive", "account representative").
- Unknown paths 404. Reproducing observed live-site behavior is the fidelity
  bar — including its dead ends. The catch-all resolves 200 (served tree) →
  301 (redirect manifest) → 404 (dead roots, auth-gated stubs, dropped
  scaffold/test pages), in that order; a served file always wins over a
  manifest entry.

## Testing

- Tests assert **external behavior only**, at the seams pre-agreed in the
  spec's Testing Decisions: the HTTP serving seam (the top seam — every route
  class plus byte-identity of every served page), the chat message API seam
  (ticket 08), the story-hook DOM seam (ticket 03), the motion DOM seam
  (ticket 04 — the injected reveal runtime's reduced-motion/one-shot contract,
  evaluated in jsdom against the exact injected bytes), and the interactions
  DOM seam (ticket 05 — the delegated click runtime's captured-class/geometry
  contract for tabs, dropdowns, accordions, and sliders, same
  jsdom-against-injected-bytes method; reduced motion never blocks function).
  **Extended by ticket 09, re-pointed by ticket 10**: the chat-widget DOM seam
  — the widget's three captured surfaces, its inert composer and chip slot,
  evaluated in jsdom against the exact injected runtime bytes
  (`pipeline/chat-widget.js`) with the message API stubbed at `fetch`. Ticket
  09 added this seam; ticket 10 mounts that same runtime site-wide, so the seam
  now reads the build's injected bytes (the motion/interactions-seam method)
  rather than a React component. **Extended by ticket 14**: the nav DOM seam
  (`test/nav.seam.test.ts` — the shared header's behavior runtime:
  `.scroll`/`.scroll-up`, desktop hover `.show`, mobile tap-toggle and
  take-over, outside-click and resize, reduced motion — in jsdom against the
  exact injected bytes `pipeline/nav-runtime.js`). **Retired by ticket 15**:
  the header-restore seam (the build's graft from the vendored corrected-flags
  header artifact). Ticket 15 moved the whole build onto a corrected-flags
  capture run whose stylesheet keeps every nav rule and whose DOM keeps every
  hidden subtree, so the graft and its artifact were retired; the header's
  remaining behavior is covered by the nav seam. **Extended by ticket 16**: the
  chat-widget seam also asserts the mimic's mobile-parity **stylesheet shape**
  (`pipeline/chat-widget.css`'s `(max-width: 767px)` block — a fullscreen panel
  with square bands, the 50px/16px launcher dock, no motion, and `.fpc-root`
  clearing the nav's `z-index: 2000`), because jsdom cannot evaluate media
  queries — the nav seam's reduced-motion check is the same method. The rendered
  mobile result is the human side-by-side at
  `evidence/16-chat-mobile-parity/`. Per this header's rule, later
  efforts extend this list here rather than adding a seam silently.
  No tests against pipeline internals or module structure;
  a test that breaks in a refactor without a behavior change is wrong.
- Tests run against **git-tracked fixtures** (`test/fixtures/`) — miniature
  capture runs mirroring the real corpus (unquoted attrs, machinery residue,
  truncated tails). The real capture run is never a test dependency: the
  suite must be green on a fresh clone.
- Red → green, one slice at a time. New behavior starts as a failing test at
  an agreed seam.
- The serving check's pure cores — expectation builder, count and audit
  invariants, file-candidate resolution, byte comparison — are tested pure
  (`test/routes.test.ts`). The check itself is the top HTTP seam exercised
  against the real capture run — an instrument, not a test-suite member.

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
  it cannot launch under the main agent sandbox. The capture run (ticket 11)
  depends on this; the serving check does not render, so it needs no Docker.
- Servers started inside a sandboxed command must die with the command
  (self-alarm or child lifecycle) — no orphaned port squatters.
- **The chat runtime depends on the sibling `yarnspinner-ts` checkout** —
  `package.json` points `yarnspinner-typescript` at it by **absolute** `file:`
  path (relative specifiers do not survive npm's workspace-root inference
  here; the package is not on npm yet — spec, "Chat mimic"). A clone without
  that sibling cannot `npm install`. Repoint the path (or move to the published
  package) when it ships; until then this is the one documented exception to
  "green on a fresh clone".

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
4. If the pipeline or served bytes changed: `npm run pipeline`, spot-check the
   mutation log and strip audit, `npm run build`, then `npm run routes` for the
   full-scale serving check (route classes + byte-identity).
5. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to
   the current branch — staging only files the ticket touched.
