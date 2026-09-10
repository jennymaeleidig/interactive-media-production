# 07: Whole-site build & routing

**What to build:** The entire Recreation exists. All build passes run across the full capture run, producing the served tree at original paths. The redirect manifest serves the legacy stubs as permanent redirects to their local targets; scaffold and test pages are dropped from serving; dead collection roots return 404. A single config value points the build at a capture run. The serving check is green at full scale and the strip audit is clean site-wide.

**Blocked by:** 02, 03, 04, 05, 06.

**Status:** resolved
Label: ready-for-agent

- [x] Every live path from the inventory returns 200 and serves its captured page.
- [x] Every legacy redirect stub returns a permanent redirect to its local target.
- [x] Every dead collection root returns 404.
- [x] Scaffold and test pages are not served.
- [x] The served page count matches the inventory's live-page count.
- [x] The strip audit is clean across the whole site.
- [x] Moving to a different capture run is a one-value change.
- [x] The serving check is green at full scale.

## Comments

**Implemented** (commit on `main`): whole-site build + route classes.

- **Build**: `npm run pipeline` now defaults to the full capture list (empty
  `pipeline/pages.list`) — **1,199 requested → 1,180 served + 19 dropped, 0
  errors, ~63 s**. Every page audit clean, 0 executable scripts. Build-level
  artifacts beside the log: `served/redirects.json` (from the run's
  `manifest-uncaptured.csv`) and `served/build-summary.json` (counts, route
  classes, redirect warnings).
- **Scaffold/test drop**: `pipeline/config.mjs` `DROPPED_PAGES` (19 pages)
  dropped from serving entirely — never written, stale served files removed.
  Membership rule is explicit and evidence-based (test-slug pages with no
  inbound link from any served page, verified corpus-wide); lookalike keeps
  (`/business-template`, `/book-a-demo-layout`, `/fb-click-id`, which carry
  real captured content) are documented in the config. All 19 → 404.
- **Route classes**: the catch-all resolves 200 (served tree) → 301
  (`redirects.json`) → 404. **56 legacy stubs → 301 to local targets, 14 dead
  roots → 404, 10 auth-gated stubs → 404, 19 dropped → 404.** New
  `npm run routes` (`regression/routes.mjs`) asserts all **1,279 route classes
  over HTTP**, the served+dropped count identity against the inventory listing,
  and the **site-wide strip audit**; `regression/server.mjs` centralizes the
  server lifecycle with signal cleanup.
- **Two real strip finds, both fixed**: (1) 4 pages carried Qualified's
  header-var *references* on real elements (the Vocal Video popover's
  `top: calc(0px + var(--qualified-offer-header-inline-style-offset,
  var(--qualified-offer-header-height,0px)))`) which the assignment strip left
  behind; they now collapse to the `0px` fallback — the reclaimed header-height
  state. (2) The audit's `/qualified/i` read 16 pages' prose ("qualified
  electrician", "qualified applicants") as residue; it now keys on machinery
  markers, exactly as the `onetrust` key already did. Result: **1,180/1,180
  audits zero**.
- **Count identity**: served (1,180) + dropped (19) = the inventory's live
  count (1,199). The spec's "served page count matches the inventory" and
  "scaffold/test pages dropped" are in tension; the implementation satisfies
  both by accounting for every inventory page (`build-summary.json`,
  `countFailures`, unit-tested).
- **Single config value**: `pipeline/config.mjs` `CAPTURE_RUN` still decides
  the run; `DROPPED_PAGES` lives beside it.
- **Serving check**: `npm run routes` asserts every route class over HTTP
  **plus byte-identity** — every served page's body must equal the file the
  build wrote. All **1,279 routes + 1,180 byte-identical bodies green in
  ~10 s**. The pixel gate this ticket once carried was retired in the same
  change: its only gating comparison rendered the served bytes against
  themselves, and it cost ~2 h per sweep — byte-identity is strictly stronger
  (same bytes ⇒ same pixels) and full-coverage. See ticket 06.
- **Verification**: `npx tsc --noEmit` clean; `npm test` **132 green** across
  8 projects; `npm run build` succeeds; `npm run routes` green at full scale
  (route classes + byte-identity + strip audit). Two-axis code review
  (Standards / Spec) run in parallel sub-agents; its findings drove the
  test-decoupling, the shared `isLocalTarget` predicate, the duplicate-describe
  rename, the `lib/` build-freshness fix, the shared CLI seam, and the two
  strip fixes above.
