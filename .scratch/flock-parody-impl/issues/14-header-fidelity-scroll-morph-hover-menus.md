# 14: Header fidelity — sticky scroll morph, hover mega-menus (desktop + mobile)

**What to build:** The shared header behaves like the live site's. It stays pinned
on scroll; past the top the transparent bar morphs into the floating cream panel
(1px grey border, 8px radius) with the logo/nav text switched to dark; desktop
mega-menus open on hover with the green underline and the panel's squared bottom;
mobile uses the hamburger take-over and tap-to-expand accordion rows. This is a
restoration: the 2026-09-09 captures lost the header's menu markup, its state CSS,
and its sticky offset, and no ticket ever owned the scroll/hover behavior. The
restored header bytes come from a dated, corrected-flags SingleFile capture of the
live homepage, vendored as a tracked artifact; a build pass grafts them in and an
injected runtime drives the class vocabulary the live CSS already keys on
(`.header-z.scroll`, `.nav__dd.show`, `.header__bg.is-open`).

**Blocked by:** none.

**Status:** resolved
Label: ready-for-agent

## Why the header is broken (evidence)

The captures are **lossy for the header**, confirmed against `served/index.html`,
the raw `research/flocksafety/2026-09-09/index.html`, and live:

1. **Mega-menu content gone.** Live's server HTML carries the menus
   (`nav__dd-cols-wr` ×11, `nav__dd-heading` ×17, `nav__dd-wr` ×9); every captured
   `.nav__dd-content` is empty (`innerHTML` length 0). SingleFile removed the
   hidden elements (the dropdowns are `display:none` at capture).
2. **Nav state CSS gone.** No `.nav__dd.show …`, no
   `.header-z.scroll … .header__bg{opacity:1}`, no colour swaps, no
   `.header__bg.is-open` (grep count 0 in the raw capture). SingleFile dropped
   styles that matched nothing at capture time.
3. **Sticky offset gone.** Live bundle has
   `.header-wr{…position:sticky;top:0}`; the capture kept the rule but dropped
   `top:0` → the header scrolls away (`top:-808` at scrollY 800; live stays `0`).
4. **`sf-hidden` is a SingleFile artifact, not a site class** (0 occurrences in
   live HTML). Ticket 05 keyed the nav dropdown on it and hijacks trigger clicks
   (`defaultPrevented: true`): on desktop a click no longer navigates and instead
   opens an **empty cream bar** (`#eeeee3`, radius `0 0 20px 20px`) — the reported
   visual break. Hover does nothing.

Live's mechanism (its inline header script + CSS, fetched from the live page and
its Webflow bundle):

- scroll → `#header` (= `.header-z`) gets `scroll`; `scroll-up` when scrolling
  down (its hide rule is commented out). `.header-z.scroll .header__bg{opacity:1}`
  and `.header-z.scroll` recolours logo/nav to dark.
- desktop `mouseenter`/`mouseleave` on `.nav__dd` → `.show`;
  `.nav__dd.show .nav__dd-content{display:block}`,
  `.nav__dd.show .nav__dd-trigger{border-bottom:2px solid #3FC919}`,
  arrow `rotateZ(180deg)`, `.header-z:has(.nav__dd.show) .header__bg{opacity:1;
  border-radius:1.25rem 1.25rem 0 0}`.
- mobile (<992px): `.nav__menu-button` click → `.header__bg.is-open`; trigger tap
  → `preventDefault` + `.nav__dd.show`; outside click / resize clears.

## What to build

- **Graft source.** Run one SingleFile capture of the live homepage with
  `--remove-hidden-elements=false --remove-unused-styles=false` (Docker/colima,
  the ticket-03 method), dated. Extract the header fragment (9 `.nav__dd-wr` menu
  blocks + mobile chrome: `.nav__menu-button`/`.nav-line`, `.nav-menu-mobile-wr`)
  and the ~10 nav state CSS rules, and vendor them into a tracked
  `pipeline/header-restore/` artifact with provenance (URL, date). Build stays
  offline; serve-time makes no request.
- **Build pass.** Inject the restored markup into each served page's
  `.nav__dd-content`/mobile chrome keyed on position/trigger (the header is
  shared), and inject the state CSS + the sticky `top:0`. Do not edit captures.
- **Runtime.** Replace ticket 05's nav branch: drop the `sf-hidden` toggle and the
  `preventDefault` on desktop triggers; drive `.scroll`/`.scroll-up`,
  `.nav__dd.show` (hover ≥992px, tap <992px), `.header__bg.is-open`, outside-click
  and resize, using the captured class vocabulary only. Reduced motion suppresses
  transitions, never function.
- **Mobile reveal.** Reverse-engineer the live whole-list reveal from the same
  ground-truth run (`.nav__menu-list` is `display:none` at ≤991px with no readable
  open rule — it is script-driven) and reproduce it. Sign In chrome inside
  `.nav-menu-mobile-wr` is stripped per ADR-0001; the hamburger stays.
- **Chat.** No chat changes — mobile chat parity is its own ticket
  (`16-chat-mobile-parity`). The launcher's `z-index: 2147483000` already clears
  the nav.

## Acceptance criteria

- [x] The header stays pinned to the viewport top at any scroll offset on every
      served page.
- [x] Past the top the header shows the cream panel (`#eeeee3`, 1px `grey-300`
      border, 8px radius) with dark logo/nav; at the top it reverts to transparent
      with white text (light-variant pages).
- [x] Desktop hover opens the mega-menu (≥992px) with restored content, the
      `#3FC919` underline on the open trigger, arrow rotation, and the
      `.header__bg` cream fill + squared bottom; mouseleave closes it.
- [x] A desktop click on a nav trigger navigates — no `preventDefault`, and the
      empty cream bar can never appear.
- [x] Mobile (<992px): hamburger toggles the live open state; rows are
      accordion-style; a trigger tap toggles `.nav__dd.show` and does not
      navigate; outside click and resize close.
- [x] The restored header markup + state CSS come from the dated corrected-flags
      capture and are vendored with provenance; the build makes no network
      request.
- [x] Ticket 05's `sf-hidden` nav toggle is gone; the runtime keys only on the
      live class vocabulary.
- [x] Reduced motion and no-JS both leave a working, statically-correct header.
- [x] The header behaves identically on every served page (checked on the real
      subset).
- [x] Evidence: three-state side-by-side vs live at 1440 (rest / scrolled /
      menu-open) and 390×844 (closed / take-over open / sub-menu open) under
      `evidence/`; jsdom seam tests over the injected runtime bytes; a pipeline
      test that the restored CSS/content is present on served pages.
- [x] The chat launcher stays layered above the open mobile nav (no code change).

## Implementation

- **Artifact** — `pipeline/header-restore/` (`nav.css` 344 KB, 406 rules;
  `header-fragments.json` ~1.1 MB; `README.md` with provenance). Generated by the
  throwaway `.tmp/extract-header-restore.mjs` from the dated corrected-flags
  capture. Beyond the state CSS, two more capture losses had to come along:
  the design-system/utility classes the panels use (`.cs_list`,
  `.hide-mobile-portrait`, `.hide-tablet`, the blog-card shapes) and the lazy
  mega-menu images (no `src` in the closed-dropdown capture, recovered from the
  CDN and inlined as data URIs). `Sign In` chrome stripped per ADR-0001.
- **Build passes** — `headerRestorePass` (pass 2, before the link rewrite so the
  grafted hrefs are rewritten) fills the five empty `.nav__dd-content` panels and
  the mobile chrome, clears the `sf-hidden` artifact class, and injects the
  restored CSS verbatim; `navPass` (pass 7) injects `pipeline/nav.css` +
  `pipeline/nav-runtime.js`. `interactions-runtime.js` lost its nav branch.
- **Served-tree cost** — ~1.4 MB/page of restored header bytes; `served/` grew
  3.2 GB → 4.8 GB, in family with the 5.45 GB capture corpus.
- **Deliberate residual** — Webflow's `.w-condition-invisible{display:none!important}`
  is restored only inside the header (the artifact carries the rule and the
  build scopes it); the site-wide loss is ticket 15's.
- **Evidence** — `.scratch/flock-parody-impl/evidence/14-header-fidelity/`.

### Review fixes (2026-09-11, after the work was first reported done)

A two-axis review of this ticket found real defects; each is fixed and covered:

- **The injected CSS changed pages outside the header.** The restored rule set
  carries global classes (`.w-inline-block`, `.cs_list`, `.button`, the hide
  utilities — 127 selectors with no header token). Injected unscoped and last,
  they won the cascade tie against the page's own copy: measured in the chrome
  rig, the home page's hero cards flipped from live's `display:flex` to
  `block`. The build now prefixes every restored selector with `.header-wr`
  (`scopeRestoreCss`), which bounds the rule set to the header by construction;
  an A/B that disables the injected sheet now shows **zero** computed-style
  changes outside the header on three pages at two widths. Placing the sheet
  *first* instead was tried and rejected — it handed the tie to the page's own
  lossy copies of the panel rules and the mobile panel layout broke again.
- **Reduced motion did not suppress the morph.** The vendored CSS keeps its 13
  live transitions; `pipeline/nav.css` now cancels the header's own six under
  `@media (prefers-reduced-motion: reduce)`, and a seam test fails if a
  regenerated artifact introduces a header transition that isn't cancelled.
- **The panel graft was positional.** Panels are now matched on their class
  signature, and a page with an extra/missing/reordered panel reports it
  instead of silently shifting every later menu; a shared header with no mobile
  chrome to fill warns too.
- **Per-page claim was unverified.** Audit of the built tree: 1179 of 1180
  pages carry the graft, every one with 5 panels filled and 1 mobile chrome, 0
  warnings; `/brand-partner-guide` is the one page without a shared header.
- **Docs.** The artifact README said "pass 4" (it is pass 2), and the inline
  `// ---- pass N` section comments still numbered the pre-reorder passes; both
  now match the pass list at the top of `pipeline/build.mjs`, and
  `CODING_STANDARDS.md`'s seam list names the nav and header-restore seams.
- **Evidence gap hid a real defect.** The mobile evidence was one state rather
  than the acceptance criteria's take-over *and* sub-menu states. Split apart,
  the take-over shot showed the recreation with no `BOOK A DEMO` button while
  live has one: the capture had emptied that row (`<li … sf-hidden></li>`,
  hidden above 479px) and the pass never filled it. The artifact now carries
  the row (`mobileCta`) and the pass grafts it on all 1179 header pages; the
  seam test asserts the link text and that it points at `/book-a-demo`.
- **Small stuff.** The nav runtime's `10` ms back-link delay is a named
  constant, and it uses `classList` for the motion class instead of string
  concatenation.

## Notes / caveats

- This **pins today's shared header**; the five top-level items match the
  2026-09-09 captures, but dropdown contents may have drifted, and the live nav
  sits under a VWO test — we freeze one observed variant.
- The systemic root cause (SingleFile dropping hidden elements and unused styles)
  is site-wide and is tracked by the companion ticket
  `15-capture-config-hidden-content-and-unused-styles`.

## Comments

**The header-restore graft was retired by ticket 15 (2026-09-11).** Ticket 15
moved the build onto a corrected-flags capture run whose stylesheet keeps every
nav rule and whose DOM keeps every hidden subtree, so the pass/artifact this
ticket built has no work left to do: `pipeline/header-restore/`, its seam test
and its fixtures were deleted and the pass removed from `pipeline/build.mjs`.
The remaining header behavior (scroll morph, hover/tap menus, mobile take-over,
hamburger) is covered by `test/nav.seam.test.ts` over `pipeline/nav.css` +
`pipeline/nav-runtime.js`. This ticket's evidence measures the retired graft in
its `Graft coverage` section — kept as the historical record and annotated as
such.
