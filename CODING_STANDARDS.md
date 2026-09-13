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
same-origin POST, and the policy is edited in exactly one place —
`pipeline/csp.mjs`, whose `grantSources` **replaces** a directive rather than
appending a second one (two directives intersect and the resource stays
blocked, which looks exactly like the grant never having been made). Three
passes make a grant, each logged per page: the chat mount appends exactly
`connect-src 'self'` on launcher pages, the embed pass widens `frame-src` by
the hosts it used (ADR 0002), and pass 14 widens `style-src`/`script-src` by
`'self'` (ADR 0003). No grant may reach further: `'self'` is the Recreation
origin, and the frame hosts are the audit's allow-list, so nothing can leave
the machine.

Page assets are local, never remote. A Capture inlines every image, font, and
sound as a `data:` URI, and the build extracts each one to a content-addressed
file (`/assets/<sha16>.<ext>`, served by `app/assets/[...path]/route.ts`) rather
than pointing at an origin URL — SingleFile keeps no origin URL, and the
extraction is what makes the served tree ~2 GB instead of ~10 GB. Extraction
runs before the injection passes, because the injected runtimes are inlined
verbatim and one of them carries `data:` URIs of its own.

**Styles and scripts ship as files too** (ADR 0003). Extraction moves a page's
`data:` URIs out; pass 14 (`pipeline/dedupe.mjs`) moves its *bodies* out — every
`<style>`/`<script>` body of at least 1 KB becomes one content-addressed
`/assets/<sha16>.css|.js` with a marked `<link>`/`<script src>` left in the
position the body held, because a Capture inlines the same stylesheets on all
1,181 pages (1,642 MB of CSS, 1,476 distinct bodies). It runs **last**, after
every injection pass, so the bodies it moves are the final ones; it stays pure
HTML-in/HTML-out, and a body whose `style-src`/`script-src` could not be granted
`'self'` — replaced, never appended, or the directives intersect — stays inline
with a per-page warning rather than becoming a request the browser refuses.
Bodies under 1 KB and non-JavaScript scripts (`application/ld+json`, an
`importmap`) stay inline: a `<script src>` of a data type is fetched and ignored.
The body files live in `assets.json`, so the serving check's asset-identity walk
covers them like any other asset.

**The one exception is a video slot** (ADR 0002): a Capture cannot play a video,
so it keeps an inert snapshot of the player — an inlined `srcdoc` player
document, the JS-built player chrome, or a `<wistia-player>` web component — and
the embed pass swaps that snapshot for the live player, named by the page's own
`w-json-ld` `embedUrl`. Popover slots are inlined the same way (their box is
already the captured 16:9 padding box), and YouTube's `data-video-id` panels are
armed by the interactions runtime on the poster click, so the frame is only
pointed at the player then. Only those frames may reach out: the pass widens the
captured `frame-src` by exactly the hosts it used, and the audit fails the build
on any frame whose host is not on `pipeline/audit.mjs`'s allow-list. Remote
*image* references (`poster=`, a Lottie `data-src`, a Wistia swatch in CSS) still
appear in captured bytes; the captured `img-src 'self' data:` refuses them, which
is why the image half needs no grant. The audit now also reads inside `srcdoc`
payloads (`srcdoc scripts`) and refuses any remote reference outside the classes
ADR 0002 accepts as inert (`unclassified remote refs`); the hidden Vidzflow
video.js documents are stripped, not played (ticket 19).

The audit is one module — `pipeline/audit.mjs`, whose interface is
`audit(pageHtml) → findings`, with the media allow-list as its only
configuration. It owns the residue classes, the executable-script census (and
the `isInertScript` rule the strip pass and the census share), the `srcdoc`
payload check, and the unclassified-fetch check. The build writes those findings
into the log; the serving check (`regression/routes.mjs`) calls the same module
on the served bytes and folds the findings, so neither tier re-derives "clean"
and the log's key names are not an interface between them.

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
- The passes that read the capture HTML's **source text** share one core
  (`pipeline/html.mjs`) instead of deriving their own scanning rules: the tag
  and slot views (`openTags`, `replaceTags`, `contentSegments`, `bodySlots`,
  `srcdocSpans`) and the attribute readers. It **keeps** the dialects the
  frozen tree's bytes were built under (ADR 0004) rather than merging them;
  each one is named in the module and pinned at `test/html.test.ts`.
- The serving check (`regression/routes.mjs`, one command `npm run routes`) is
  plain Node ESM + JSDoc and **environmental**: it starts the production
  server and measures it over HTTP. Its pure cores — `routeExpectations`,
  `countFailures`, `auditFailures`, `byteMismatch` — are
  unit-tested at `test/routes.test.ts`; the check itself runs against the real
  build and capture run, never in `npm test` (the suite must stay green on a
  fresh clone).
- **The served tree's rules live once, in plain JavaScript**
  (`pipeline/served-tree.mjs`), for the same reason `pipeline/run-manifest.mjs`
  does: both tiers need them and only one is TypeScript. `pageCandidates` (the
  `<rel>.html` then `<rel>/index.html` resolution), `insideTree` (the traversal
  guard) and `mimeForExt` (the extension → content-type table) are read by the
  Next page route, by `lib/serving.ts`'s asset read, and by the serving check —
  so the check cannot resolve a route differently from the server that answers
  it, which byte-identity alone would never catch. Pinned at
  `test/served-tree.test.ts`.
- **The serving layer is verified in bytes, not pixels.** Every served page's
  HTTP body must be byte-identical to the file the build wrote — same bytes ⇒
  same pixels, so byte-identity is the strictly stronger guarantee, and it
  covers all 1,180 pages in ~10 s. There is **no pixel gate**: the retired
  ticket-06 harness compared served-over-HTTP against the *same* served bytes
  on disk (self-vs-self — it could not see a bad build), and rendered ~1,180
  pages × 3 viewports for ~2 h to re-prove one code path. Visual fidelity and
  strip deltas are the human side-by-side at the phase gates (ticket 12); the
  per-page strip decision is recorded machine-readably in the build log.
- One **capture pointer** (`pipeline/config.mjs` → `CAPTURE_RUN`) names the
  capture run the served tree came from. It is a record, not a switch any more:
  the snapshot is frozen (ADR 0004), so there is no second run to move to and
  the pointer only decides which run a rebuild *would* read. The same file's
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
  **Extended by ticket 21**: the scroll DOM seam (`test/scroll.seam.test.ts` —
  the scroll choreography + modal runtime's contract: the `[animate=scrub-word]`
  color sequence plays on scroll-in and reverses, the `.line-label` reveal
  lands, `[data-scroll-video]` plays in view and pauses out, `#stickme` stays
  in its captured in-flow position (never pinned — the live page's own sticky
  script throws before the element exists, so the button simply sits under the
  intro paragraph),
  `dialog.c-modal` opens/closes and arms its route draw with markers
  placed opposite their events, and reduced motion keeps the function while
  leaving the decoration at the build end-state — in jsdom against the exact
  injected bytes `pipeline/scroll-runtime.js`).
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
  `evidence/16-chat-mobile-parity/`. **Extended by the media work (ADR 0002)**:
  pure-module seams, each its own vitest project — the strip-audit core
  (`test/audit.test.ts` — `pipeline/audit.mjs`: the residue classes, the
  `isInertScript` rule the strip pass and the census share, the `srcdoc`-payload
  script check, the unclassified-fetch check, and the frame allow-list — the
  invariant the build writes and the serving check folds) and the data-URI extraction
  core (`test/assets.test.ts` — `pipeline/assets.mjs`: the attribute and `url()`
  value classes, CSS unescaping, the MIME tables, and the payload shapes the
  corpus actually contains) and the captured-policy core
  (`test/csp.test.ts` — `pipeline/csp.mjs`: the policy read/write pair, the
  grant branches the frozen tree actually reaches, and the invariant that a
  directive is replaced rather than appended — pinned by granting three times
  and counting directives, for all three grants) and the live-embed pass
  (`test/embeds.test.ts` — `pipeline/embeds.mjs`: the five slot shapes
  including popover inlining and the frames the Capture emptied but remembered
  via `data-sf-original-src`, the YouTube `data-video-id` detection, the
  Vidzflow strip, the `data-sf-original-*` bookkeeping sweep and its linear-time
  bound, the skip rules, idempotence, and the
  frame/srcdoc/remote-reference audits) and the body-deduplication pass
  (`test/dedupe.test.ts` — `pipeline/dedupe.mjs`: the body-slot scan it shares
  with `pipeline/html.mjs` — which refuses to read a `srcdoc` payload as markup
  — the keep-inline rules, the carried attributes, the `'self'` grant, the
  blocked reasons, and idempotence) and the capture-HTML source-text core
  (`test/html.test.ts` — `pipeline/html.mjs`: the open-tag scan and its two
  name/tag-end dialects, the three attribute-name rules that must not be merged
  (a real page carries `data-style=bottomright` before its `style=`, so the loose
  rule is the one the frozen bytes were built with), the slot scan that steps
  over comments and SVG subtrees, and the two ticket-12 regressions — a
  multi-megabyte unquoted attribute value, and a nested `srcdoc` document whose
  stylesheets must not be rewritten). All are
  pure HTML-in/HTML-out cores the build calls; none reaches over HTTP, and
  the built result of each is covered end-to-end by the serving seam and its
  asset-identity check. **Extended by ticket 17**: the video-inventory detection
  seam (`test/video-inventory.test.ts` — `pipeline/video-inventory.mjs`'s
  attribute-form sweeps and their boundary rules, because an id the inventory
  cannot see is an id the build cannot act on). The network and Docker drivers
  that used to live beside these tools (the re-inventory walk, the drift diff,
  the scoped re-capture, the upstream video probe) were retired with the refresh
  workflow — the Recreation is a frozen snapshot (ADR 0004) — so no suite member
  reaches the live site. Per this header's rule, later efforts extend this list
  here rather than adding a seam silently.
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
  it cannot launch under the main agent sandbox. The capture recipe (ADR 0004)
  depends on this; the frozen snapshot needs no Docker to serve, and the serving
  check does not render.
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

- **Build outputs stay out of git** (`.gitignore`): `served/`, `.tmp/`. The
  snapshot's own records stay tracked: the frozen page listing
  (`regression/capture-list-2026-09-12.txt`), `served/build-log.json`,
  `served/build-summary.json`.
- **The snapshot is frozen** (ADR 0004): the Recreation reproduces
  flocksafety.com as it stood on 2026-09-12 and does not follow the live site,
  so nothing in the repo — tool, test, or doc — reaches upstream. The retired
  refresh procedure (re-inventory → diff → scoped re-capture, and the video
  liveness probe) is in git history only.
- Domain vocabulary comes from `CONTEXT.md` (Capture, Recreation, Chat
  mimic, Link policy…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).

## Before finishing

1. `npx tsc --noEmit` — clean.
2. `npm test` — full suite green (not just the files you touched).
3. `npm run build` — production build succeeds.
4. If the pipeline or served bytes changed: `npm run pipeline`, spot-check the
   mutation log and strip audit, `npm run build`, then `npm run routes` for the
   full-scale serving check (route classes + byte-identity). With no capture run
   to rebuild from, `npm run dedupe` applies pass 14 to the existing `served/`
   tree in place and updates its manifests — the same pass the build runs —
   so `npm run routes` still measures what a visitor gets (ADR 0003).
5. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to
   the current branch — staging only files the ticket touched.
