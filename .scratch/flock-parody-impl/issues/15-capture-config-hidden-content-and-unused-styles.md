# 15: Capture config — hidden content and unused styles

**What to build:** The 2026-09-09 capture run used SingleFile's defaults, which
strip two classes of ground truth site-wide: **hidden elements** (any subtree not
rendered at capture time — closed menus, take-overs, modal panels) and **unused
styles** (CSS rules matching no element at capture time — every open/active state).
Ticket 14 hit this on the shared header; this ticket fixes the root cause. Re-run
the capture with `--remove-hidden-elements=false --remove-unused-styles=false`
(the proven ticket-03 pipeline), audit what across all component families the
corrected run recovers, and repair the interaction layer that was built on the
`sf-hidden` artifact class.

**Blocked by:** none.

**Status:** resolved
Label: ready-for-agent

- [x] A corrected-flags capture run produces a dated run folder without
      overwriting 2026-09-09; heavy HTML stays gitignored.
- [x] A diff/audit against 2026-09-09 reports, per component family, the recovered
      hidden subtrees and state CSS (closed dropdowns, mobile menus, take-overs,
      hidden panels, active/open state rules).
- [x] The audit names every place the pipeline or an injected layer keys on the
      SingleFile `sf-hidden` artifact (ticket 05's dropdown/accordion/tab
      toggles) and routes each to the live class vocabulary instead.
- [x] `served/` is rebuilt from the corrected run and the serving gate + strip
      audit stay clean; capture size growth is measured and noted.
- [x] The `sf-hidden`-keyed toggles on non-header families (FAQ lists, tabs,
      filters, sliders) are re-verified against the now-present captured state CSS,
      with per-family evidence.
- [x] The refresh runbook (`issues/11`) records the corrected flags as the new
      default and the reason.

## Comments

**Resolved 2026-09-11.** Full record with tables and browser evidence:
[`evidence/15-capture-config/`](../evidence/15-capture-config/README.md),
[`audit-report.md`](../evidence/15-capture-config/audit-report.md),
[`browser/family-results.json`](../evidence/15-capture-config/browser/family-results.json).

- Corrected run `.scratch/flock-parody/research/flocksafety/2026-09-11/`: 1,199 /
  1,199 pages, 0 failed, 13.94 GB (2.56× the baseline 5.45 GB). It is the build's
  `CAPTURE_RUN`; the flags are the runbook default.
- Audit: `sf-hidden` 84,334 → 0; the `.sf-hidden` rule 1,199 pages → 0; and rules
  absent site-wide become present on ~every page (`.w-condition-invisible`,
  `.nav__dd.show`, `.header-z.scroll`, `.header__bg.is-open`, sticky header,
  `.w-dropdown-list` base/open, `.w-tab-pane` base, `.w--tab-active`).
- Routed every key: `interactions-runtime.js` toggles `w--open` / `w--tab-active`
  only; the ticket-14 `headerRestorePass` is retired (deleted with
  `pipeline/header-restore/`, its seam test and fixtures) because the corrected
  capture carries the header natively; the vitest project entry is removed.
- Closed an account-strip gap the corrected capture exposed: the icon-only
  `a.sign-in` header link now matches the class-keyed strip target.
- Per-family browser check (Docker Chromium) confirms all nine families: header
  menu, mobile take-over, FAQ height dropdown, filter dropdown, accordion,
  Webflow tabs, custom `data-tabs` tabs, Swiper slider, condition-hidden.
- `npm run pipeline` audit clean on all 1,180 served pages; `npm run routes`
  green (1,180 served byte-identical, count identity 1,180 + 19 = 1,199);
  full test suite green.

## Comments

Opened as the companion to `14-header-fidelity-scroll-morph-hover-menus`: the
header ticket restores the shared header from a scoped corrected-flags capture,
while this ticket applies the corrected config to the whole corpus and retires the
`sf-hidden` vocabulary. Not a blocker for 14 — the header fix is narrow and
self-contained; this one is the systemic repair.

Concrete losses ticket 14 found and worked around, to seed this ticket's audit:

- **Rules for classes that lived only inside hidden subtrees.** The closed nav
  panels meant `removeUnusedStyles` dropped not just the state vocabulary but
  also `.cs_list{display:flex}` (the Tools-style list), `.hide-mobile-portrait`,
  `.hide-tablet`, and the blog-card shapes the Resources panel uses. The header
  artifact had to carry them; a site-wide audit should expect the same pattern
  in every other hidden family.
- **Webflow's base `.w-condition-invisible{display:none!important}`** is absent
  from the 2026-09-09 capture even though elements carry the class. Ticket 14
  restores it inside the shared header (the rule rides along in the header
  artifact because the nav panels' hidden variants use it); the site-wide loss
  is still live on the rest of every page.
- **Lazy media inside hidden subtrees: SingleFile inlines it anyway.** The
  corrected capture keeps each lazy `<img>` as a transparent placeholder whose
  `background-image:var(--sf-img-N)` resolves to a real, inlined data URI declared
  in a global `:root` block (e.g. 15 distinct `--sf-img-N` on the homepage, zero
  external references), so the mega-menu product images render natively. No
  panel-open-before-capture or post-capture fetch step was needed.
