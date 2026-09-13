# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Filled in by the
`flock-parody-impl` effort (the repo's first implementation effort under the
Next.js pivot, per `AGENTS.md`). Later efforts extend this document; they do
not silently deviate from it.

**Binding process rule:** follow these standards whenever writing or editing
code, and run the ["Before finishing"](#before-finishing) checks before
calling any change done.

## The one invariant everything serves

**Served pages make zero outbound requests — true by construction, and
re-checked on every page.** The captures carried no executable scripts, the
build stripped any executable `<script>` that survived, and the served bytes
keep only `application/ld+json` data blocks. Any code that adds network
behavior to a served page (fetch, XHR, WebSocket, remote `src`, beacon)
violates the piece. The injected layers (motion, interactions, nav, chat,
story-hook, scroll, and the page-scoped legibility patch) are inline, DOM-only,
and must degrade to the captured end-state with JavaScript disabled. `pipeline/audit.mjs` is the invariant's single home —
`audit(pageHtml) → findings`, with the media allow-list as its only
configuration. It owns the residue classes, the executable-script census (the
`isInertScript` rule that tells a data block from code), the `srcdoc`-payload
check, and the unclassified-fetch check; the serving check calls it on every
served page's bytes.

Two things a served page may still reach, both deliberate and both frozen into
the tree by the retired build:

- **Video players** (the media allow-list). A capture cannot play a video, so
  it kept an inert snapshot of the player — an inlined `srcdoc` player
  document, the JS-built player chrome, or a `<wistia-player>` web component —
  and the build swapped that snapshot for the live player, named by the page's
  own `w-json-ld` `embedUrl`. Popover slots are inlined the same way (their box
  is already the captured 16:9 padding box), and YouTube's `data-video-id`
  panels are armed by the interactions runtime on the poster click, so the
  frame is only pointed at the player then. Only those frames may reach out; the
  audit fails on any frame whose host is not on its allow-list
  (`fast.wistia.net`, `www.youtube.com`, `www.youtube-nocookie.com`). Remote
  *image* references (`poster=`, a Lottie `data-src`, a Wistia swatch in CSS)
  still appear in the captured bytes; the captured `img-src 'self' data:`
  refuses them, which is why the image half needs no grant. The hidden Vidzflow
  video.js documents are stripped, not played.
- **The chat's same-origin POST.** The captures' own CSP (`default-src 'none'`,
  no `connect-src`) refuses even that, so the build edited the policy through
  exactly one primitive — `grantSources`, which **replaces** a directive rather
  than appending a second one (two directives intersect and the resource stays
  blocked, which looks exactly like the grant never having been made). Three
  grants are in the frozen tree, each logged per page: the chat mount appends
  exactly `connect-src 'self'` on launcher pages, the embed pass widens
  `frame-src` by the hosts it used, and the dedupe pass widens
  `style-src`/`script-src` by `'self'` for the body files it wrote. No grant
  reaches further: `'self'` is the Recreation origin and the frame hosts are the
  audit's allow-list, so nothing can leave the machine.

**Serving time edits nothing.** `app/[[...path]]/route.ts` and `lib/serving.ts`
return the frozen file's bytes unmodified — no policy edit, no rewrite, no
per-request transformation. The retired build is the only thing that ever wrote
a served byte, and the serving check's byte-identity assertion is what keeps the
route honest.

Page assets are local, never remote. A capture inlines every image, font, and
sound as a `data:` URI (SingleFile keeps no origin URL), and the build extracted
each one to a content-addressed file (`/assets/<sha16>.<ext>`, served by
`app/assets/[...path]/route.ts`): the extraction is what makes the served tree
660 MB instead of ~10 GB. **Styles and scripts ship as files too** — every
`<style>`/`<script>` body of at least 1 KB became one content-addressed
`/assets/<sha16>.css|.js` with a marked `<link>`/`<script src>` left in the
position the body held, because a capture inlines the same stylesheets on all
1,181 pages (1,642 MB of CSS, 1,476 distinct bodies). Bodies under 1 KB and
non-JavaScript scripts (`application/ld+json`, an `importmap`) stay inline: a
`<script src>` of a data type is fetched and ignored. The body files live in
`served/assets.json`, so the serving check's asset-identity walk covers them
like any other asset.

## Stack & layout

- **Next.js (App Router) + React + TypeScript (strict)**, npm. The app lives
  at the repo root: `app/` for routes, `pipeline/` for the rules the serving
  layer and the checks share, `test/` for tests.
- **`pipeline/` is plain Node ESM JavaScript with JSDoc types** — no separate
  compile step, no bundler coupling. It holds the **injected browser runtimes**
  (`motion-runtime.js`, `interactions-runtime.js`, `nav-runtime.js`,
  `chat-widget.js`, `story-hook.js`, `scroll-runtime.js` and their CSS) — plain
  browser JavaScript, kept ES5-safe, delivered into the tree as
  content-addressed assets — and the **serving-time rules and checks** below.
  The build that turned captures into the tree was retired with the captures it
  read (2026-09-13); [README.md](README.md) and [CONTEXT.md](CONTEXT.md) say
  why, and there is no rebuild path.
- **The marked bytes have one owner** (`pipeline/injected-layers.mjs`): the
  seven-member roster (`motion`, `interactions`, `nav`, `chat`, `story-hook`,
  `scroll`, and the page-scoped `legibility`), each member's delivery form
  (asset-backed CSS/JS, inline CSS, or no style), the order the members appear
  in a page, and each member's maintained source. `markedMembers(pageHtml)`
  reads a page's `data-flock-parody` tags in document order (the marker's name
  comes from `pipeline/marker.mjs`, so the roster cannot drift from the audit's
  census); `mirrorFindings` compares each shipped byte-group to its maintained
  source and reports code drift (a failure) and comment-only prose drift (a
  named, non-fatal finding). Pinned at `test/injected-layers.test.ts`; the
  serving check folds it in per page.
- **The injected-source outbound rule has one owner**
  (`pipeline/injected-source.mjs`): every marked JS part must reference no
  network primitive, except `chat`, whose single same-origin `POST /api/chat`
  is its whole purpose and is declared as such in the roster. Pinned at
  `test/injected-source.test.ts`; the serving check applies it to every shipped
  JS part.
- **The chat turn shape is declared once** (`pipeline/chat-turn.mjs`): the JSDoc
  typedefs that the widget (`pipeline/chat-widget.js`, under `checkJs`), the
  dialogue engine (`lib/chat-engine.ts`), and the seam tests all derive from. See
  `tsconfig.checkjs.json`.
- **The served tree's rules live once, in plain JavaScript**
  (`pipeline/served-tree.mjs`), for the same reason `pipeline/run-manifest.mjs`
  does: both tiers need them and only one is TypeScript. `pageCandidates` (the
  `<rel>.html` then `<rel>/index.html` resolution), `insideTree` (the traversal
  guard) and `mimeForExt` (the extension → content-type table) are read by the
  Next page route, by `lib/serving.ts`'s asset read, and by the serving check —
  so the check cannot resolve a route differently from the server that answers
  it, which byte-identity alone would never catch. Pinned at
  `test/served-tree.test.ts`.
- **The marker on the Recreation's own bytes lives on its own**
  (`pipeline/marker.mjs`): every style/script the Recreation injects carries
  `data-flock-parody="<layer>"`, and two readers use that attribute to tell our
  bytes from a capture's — the audit's script census and the injected-byte
  roster. The name is the one fact they share, so it lives here; the census does
  not reach into a builder's table.
- The capture HTML's **source-text readers** (`pipeline/html.mjs`) are the
  audit's alone now: `openTags`, `srcdocSpans`, `attrOf`, and the tag-end rule
  behind them. The extra attribute-name dialects and the slot/edit views the
  build needed were deleted with it — keep this surface minimal, and pin the
  rules it does own at `test/html.test.ts`.
- The **routes' own rules** are shared with the app the same way: a local
  redirect target is `pipeline/run-manifest.mjs`'s `isLocalTarget`
  (`app/api/forms/[...key]/route.ts`), never a second copy of "starts with `/`
  and not `//`".
- The serving check (`regression/routes.mjs`, one command `npm run routes`) is
  plain Node ESM + JSDoc and **environmental**: it starts the production
  server and measures it over HTTP. Its pure cores — `routeExpectations`,
  `countFailures`, `auditFailures`, `byteMismatch` — are
  unit-tested at `test/routes.test.ts`; the check itself runs against the
  committed `served/` tree, never in `npm test` (the suite must stay green on a
  fresh clone).
- **The serving layer is verified in bytes, not pixels.** Every served page's
  HTTP body must be byte-identical to its file in the tree — same bytes ⇒ same
  pixels, so byte-identity is the strictly stronger guarantee, and it covers all
  1,181 pages in ~10 s. There is **no pixel gate**: the retired ticket-06
  harness compared served-over-HTTP against the *same* served bytes on disk
  (self-vs-self — it could not see a bad tree), and rendered ~1,180 pages × 3
  viewports for ~2 h to re-prove one code path. Visual fidelity and strip deltas
  are the human side-by-side at the phase gates; the per-page strip decision is
  recorded machine-readably in `served/build-log.json`.
- One **page list** (`pipeline/config.mjs` → `CAPTURE_LIST`) names the listing
  the 2026-09-12 capture run recorded, and the same file's `DROPPED_PAGES` lists
  the scaffold/test pages dropped from serving. Both are records of the frozen
  tree rather than switches: the serving check's count invariant (served pages +
  dropped list = the captured inventory) is what keeps them load-bearing.
  `DROPPED_PAGES` is explicit so a stale entry fails review, never a runtime
  heuristic.

## The frozen tree's records

- **Every mutation the build made is logged, per page**
  (`served/build-log.json`): strip targets with removed byte counts, links
  rewritten, closing tags restored, warnings for anything left in place, the
  post-strip audit, the script census, and the per-page chat-mount census
  (whether the capture mounted the Qualified launcher, taken from the same
  `<q-root>` marker the strip removed, so the pages that got the mimic and the
  pages that lost the launcher can never drift apart).
- **The tree's route artifacts** are committed beside it: `redirects.json` (the
  run manifest's legacy stubs → local targets, written even when empty),
  `assets.json` (every content-addressed file), `forms-manifest.json` (captured
  form → page / formId / redirect target, the mock form API's only input), and
  `build-summary.json` (requested / served / dropped / errors, the redirect
  count, dead roots, auth-gated stubs). The routes check reads them, so the
  serving layer is measured against what the tree says.
- **The strip audit is an invariant**: tracker machinery counts (Qualified,
  OneTrust stack, known tracker domains) and account/auth host references
  (`users.flocksafety.com`, `login.flocksafety.com`) are zero on every page. A
  failing audit means the tree is wrong — fix the tree, never weaken the audit.
- The log is a **record, not a regenerable artifact**: nothing in the repo can
  rebuild the tree, so a log that no longer describes the bytes beside it is a
  lie. A served byte changes only as a deliberate, reviewed tree migration, and
  the commit says why.
- Captures were **truncated before `</body></html>`** (the SingleFile CLI never
  emits closing tags); the build restored them, and served pages end
  `</body></html>`. Anything that rewrites a served page's tail must keep that.
- There is **no in-place migration command** any more: the one that existed
  (`npm run dedupe`) applied the dedupe pass to `served/` in place and was
  retired with the build.

## Served bytes & fidelity

- **No new copy** anywhere in the Recreation (milestone rule). Code-owned
  strings (log keys, route names, a11y labels in injected runtimes) are not
  page copy; anything a visitor reads on a captured page comes from the
  Capture, verbatim.
- **Link policy**: internal hrefs rewrite to Recreation routes (queries and
  fragments preserved verbatim, including the one Qualified tracking
  parameter); external links stay live; asset/meta/JSON-LD URLs are untouched.
- Served pages are **static end-states**. Motion and interaction return only
  through the injected runtimes, never by un-freezing the captured DOM.
- The served tree is **frozen**: the serving route returns the tree's bytes
  unmodified (no per-request transformation), and `npm run routes` asserts
  byte-identity over HTTP for every page — same bytes ⇒ same pixels, so the
  visual result is fixed by the tree, not the request.
- **Account surfaces are stripped, never mocked.** The live site's Sign In
  chrome (header button, footer link) pointed at `users.flocksafety.com` and its
  auth host `login.flocksafety.com`; both are gone from the tree, wholesale
  (chrome) or unwrapped (inline copy keeps its words). No account page, no mock
  login, no cart. Keyed on the **host**, never the word "account" — the corpus
  uses that word in ordinary copy ("Account Executive", "account
  representative").
- Unknown paths 404. Reproducing observed live-site behavior is the fidelity
  bar — including its dead ends. The catch-all resolves 200 (served tree) →
  301 (redirect manifest) → 404 (dead roots, auth-gated stubs, dropped
  scaffold/test pages), in that order; a served file always wins over a
  manifest entry.

## Testing

- Tests assert **external behavior only**, at the seams pre-agreed in the
  spec's Testing Decisions:
  - **The HTTP serving seam** (`test/serving.seam.test.ts`, the top seam) —
    every route class (200 / 301 / 404) against the committed tree, plus
    byte-identity of served pages and the forms mock's POST → 303.
  - **A DOM seam per injected runtime**, evaluated in jsdom against the exact
    injected bytes: motion (`test/motion.seam.test.ts` — the reveal runtime's
    reduced-motion / one-shot contract), interactions
    (`test/interactions.seam.test.ts` — the delegated click runtime's
    captured-class and geometry contract for tabs, dropdowns, accordions,
    sliders), nav (`test/nav.seam.test.ts` — the shared header's
    `.scroll`/`.scroll-up`, hover `.show`, mobile tap-toggle and take-over,
    outside-click and resize, reduced motion), chat-widget
    (`test/chat-widget.seam.test.ts` — the widget's three captured surfaces, its
    inert composer and chip slot, the message API stubbed at `fetch`, and the
    mobile-parity stylesheet shape, because jsdom cannot evaluate media
    queries), story-hook (`test/story-hook.seam.test.ts` — the
    `window.flockParody.apply` patch contract), and scroll
    (`test/scroll.seam.test.ts` — the scroll choreography + modal runtime:
    `[animate=scrub-word]` color sequences, `[data-scroll-video]` play/pause,
    `#stickme` staying in its captured in-flow position, `dialog.c-modal`
    open/close).
  - **The composition seam** (`test/composition.seam.test.ts`) — all seven
    members installed in one document, over `served/safe-cities.html` (the only
    page carrying every marker and a `<dialog>`): the document click-listeners'
    registration order, the `<html>` class writes each layer owns, and which
    layer owns a modal's open state. `test/seam-harness.ts` carries one
    reduced-motion policy per layer (`read-once`, `read-fresh`, or `none`), so a
    layer cannot be added without declaring the policy its seam pins.
  - **The chat message API seam** (`test/chat.seam.test.ts`) — the dialogue
    engine behind `app/api/chat/route.ts`.
  All six runtime DOM seams share `test/seam-harness.ts` — one window builder
  (`runScripts: 'dangerously'`, `pretendToBeVisual`, the Recreation origin),
  one reduced-motion `matchMedia` shape (mutable, with read/listener counters,
  so a layer's reduced-motion path is comparable across layers and pinned at its
  read count), and one layer→file table, so the injected bytes are read in one
  place rather than six. A new runtime seam adds page HTML and assertions, never
  another jsdom setup.
- **Pure-module seams** pin a module's declared contract — its table, its
  invariant, its fold — which for these data modules *is* the behavior they
  own: the strip audit (`test/audit.test.ts`), the served-tree rules
  (`test/served-tree.test.ts`), the check's pure cores (`test/routes.test.ts`),
  the capture-HTML readers (`test/html.test.ts`), and the CLI locals
  (`test/cli.test.ts`). They are the one exception to "no tests against
  internals": apart from them, no test targets incidental pipeline internals or
  module structure, and a test that breaks in a behavior-preserving refactor is
  wrong.
- **The suite runs against the committed tree.** There are no fixtures: the real
  `served/` tree is the artifact, so `npm test` is green on a fresh clone by
  construction, and a DOM seam evaluates the same bytes the tree ships.
- Red → green, one slice at a time. New behavior starts as a failing test at
  an agreed seam.
- The serving check's pure cores — expectation builder, count and audit
  invariants, file-candidate resolution, byte comparison — are tested pure
  (`test/routes.test.ts`). The check itself is the top HTTP seam exercised
  against the committed tree — an instrument, not a test-suite member.
- **The check cannot see a hand edit**: byte-identity compares the response to
  the file it came from, so editing `served/` passes it. That is the point (the
  tree is the source of truth) and the trap (a silent edit makes the build log a
  lie) — so served bytes change only deliberately, with the log's record
  updated in the same commit.
- The network and Docker drivers that used to live beside these tools (the
  re-inventory walk, the drift diff, the scoped re-capture, the upstream video
  probe) were retired with the refresh workflow — the Recreation is a frozen
  snapshot — so no suite member reaches the live site.

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
  it cannot launch under the main agent sandbox. That is how the 2026-09-12
  capture was taken; serving the frozen snapshot needs no Docker, and the
  serving check does not render.
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

- **`served/` is tracked** — it is the artifact, not a build output, and it is
  large (660 MB, 4,466 files). `.tmp/` (scratch experiments) stays out of git.
  The tree's records are committed beside it: `served/build-log.json`,
  `served/build-summary.json`, `served/assets.json`, `served/redirects.json`,
  `served/forms-manifest.json`, plus the frozen page listing
  (`regression/capture-list-2026-09-12.txt`).
- **The snapshot is frozen**: the Recreation reproduces flocksafety.com as it
  stood on 2026-09-12 and does not follow the live site, so nothing in the repo
  — tool, test, or doc — reaches upstream. The retired refresh procedure
  (re-inventory → diff → scoped re-capture, and the video liveness probe) is in
  git history only. **One deliberate exception**: the **upstream watch**
  (`npm run upstream`, `regression/upstream-watch.mjs` plus its thin network
  edge) is a hand-run tool that reads upstream's sitemap and homepage and
  reports index drift; it never writes `served/` or any tree record, and it is
  not the refresh workflow — it exists so the "should the snapshot move?"
  decision can be made on evidence. Its own doc lives in the ticket and the
  module header; see `CONTEXT.md` for **upstream watch**, **watched universe**,
  and **demotion**.
- **No ADR record**: decisions live inline — in `CONTEXT.md` terms, in this
  file, and in the comments beside the code they constrain. Don't cite a
  retired decision document; say what the rule is and why.
- Domain vocabulary comes from `CONTEXT.md` (Capture, Recreation, Chat
  mimic, Link policy…). Use it in names, comments, and tickets.
- Tickets live at `.scratch/<effort>/issues/` (see `docs/agents/issue-tracker.md`).

## Before finishing

1. `npm run typecheck` — `tsc --noEmit` clean plus `tsc -p tsconfig.checkjs.json`
   (the `checkJs` project over the owned `pipeline/` modules).
2. `npm test` — full suite green (not just the files you touched).
3. `npm run build` — production build succeeds.
4. If anything under `served/` changed: `npm run routes` for the full-scale
   serving check (route classes + byte-identity + the strip audit on every
   page), and say in the commit why a frozen byte changed. There is no rebuild
   path — the pipeline that wrote the tree was retired with the captures it
   read.
5. Ticket status updated (`docs/agents/issue-tracker.md`), work committed to
   the current branch — staging only files the ticket touched.
