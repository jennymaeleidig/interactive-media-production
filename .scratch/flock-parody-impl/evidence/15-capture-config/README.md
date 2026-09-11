# Ticket 15 evidence — corrected-flags capture, sf-hidden retirement

The 2026-09-09 capture ran SingleFile's defaults, which discard hidden subtrees
and unused styles. Ticket 14 worked around that for the shared header; ticket 15
fixed the root cause: re-capture the site with `--remove-hidden-elements=false
--remove-unused-styles=false`, then route the interaction layer off the
`sf-hidden` artifact class onto the live Webflow vocabulary.

## 1. Corrected run

`.scratch/flock-parody/research/flocksafety/2026-09-11/` (does not overwrite
2026-09-09). **1,199 / 1,199 pages, 0 failed**, 13.94 GB (2.56× the baseline's
5.45 GB). `pipeline/config.mjs`'s `CAPTURE_RUN` now points here; the flags are the
runbook default. See the run's [README](../../../../research/flocksafety/2026-09-11/README.md).

## 2. Capture-recovery audit

`audit-capture.mjs <oldRun> <newRun> [--json <path>]` pairs every page present in
both runs (1,199), counts markers by **class attribute** so inlined CSS selectors
are not miscounted as elements, and prints a site-wide table plus a per-family
table. Full output: [`audit-report.md`](audit-report.md), raw data:
[`audit-report.json`](audit-report.json).

Site-wide markers (select rows):

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| SingleFile `sf-hidden` occurrences | 84,334 | **0** |
| `.sf-hidden` hide rule | 1,199 pages | **0** |
| `.w-condition-invisible{display:none}` | 0 | 1,199 |
| `.nav__dd.show` (mega-menu open) | 0 | 1,197 |
| `.header-z.scroll` / `.header__bg.is-open` | 0 | 1,197 |
| `.header-wr{…position:sticky;top:0}` | 0 | 1,199 |
| `.w-dropdown-list` base / `.w-dropdown-list.w--open` | 0 / 0 | 1,199 / 1,199 |
| `.w-tab-pane{display:none}` / `.w--tab-active{display:block}` | 0 / 2 | 1,199 / 1,199 |
| `nav__dd-content` panels | 5,985 (all empty) | 10,773 (0 empty) |
| mobile take-over CTA rows | 1,197 | 2,394 |
| slider controls | 117 | 128 |
| condition-hidden elements | 22,876 | 52,209 |

Per family (`audit-report.md` has the full tables): shared header mega-menu
(5 → 9 populated panels, 5 empty → 0); mobile take-over (state rule 0 → 1);
Webflow dropdown/FAQ and press-center filters (base/open rules 0 → 1); Webflow
tabs (`w-tab-link` 2 → 4, base rule 0 → 1); custom `data-tabs` tabs (9 elements,
unchanged — the corrected run only adds the `[data-tabs=…]` CSS rules the
defaults had dropped); accordions (unchanged); sliders (unchanged at
`/press-center`); condition-hidden variants (rule 0 → 1).

## 3. Every `sf-hidden` key site, routed

| site | what it did | now |
| --- | --- | --- |
| `pipeline/interactions-runtime.js` `setDropdown` | added/removed `sf-hidden` to hide the list | toggles `w--open` only; the captured `.w-dropdown-list` base/open rules do the hiding |
| `pipeline/interactions-runtime.js` `hideTabPane` / `showTabPane` | added/removed `sf-hidden` | toggles `w--tab-active` only; the captured `.w-tab-pane` base rule and `.w--tab-active` rule do the hiding |
| `pipeline/build.mjs` `headerRestorePass` (`restoredClass`, `panelKey`, graft) | filled empty `nav__dd-content` panels and stripped `sf-hidden` from nav chrome/CTA | **pass retired** (see §4) |
| `test/interactions.seam.test.ts` fixtures/assertions | asserted `sf-hidden` add/remove | rewritten to the corrected-capture shapes (base display rules, `w--open` / `w--tab-active` assertions) |
| `.scratch/flock-parody/prototype/snapshot-serving/pipeline/motion-runtime.js` | the discarded prototype's own runtime | out of scope — a historical prototype whose served tree was generated from the 2026-09-09 captures; it is not the shipped pipeline or an injected layer of the Recreation |

`grep -rn sf-hidden pipeline/ test/` finds only code comments and the
`test/fixtures/capture-run/account.html` fixture (a hand-built fixture modeling a
captured page). No served byte carries it.

## 4. Header-restore pass retired

With a corrected capture the pass's premise inverts: the panels are already
populated, there is no `sf-hidden` to strip, and the capture's own stylesheet
keeps every nav rule (sticky offset, `.nav__dd.show`, `.header-z.scroll`,
`.header__bg.is-open`, `:has()` selectors). The pass matched only **empty** panels
and keyed mobile chrome/CTA on `sf-hidden`, so it misfired on all 1,180 pages.
Ticket 15 deletes `pipeline/header-restore/` (nav.css + header-fragments.json),
`test/header-restore.seam.test.ts` and its fixtures, and the vitest project entry.
The nav **behavior** layer (`pipeline/nav.css` + `nav-runtime.js`) stays: the
captures carry no scripts, so the hamburger/motion behavior still has to be
injected.

## 5. Account strip gap closed

The corrected homepage reintroduced an icon-only
`<a href=https://users.flocksafety.com/ class="sign-in w-inline-block">` whose
`sign-in` class the class-keyed strip target did not match; the broad unwrap that
catches leftover account anchors kept the inner SVG, so a stray Sign-In icon
survived while the account audit still read clean (the audit checks host
residue, not icons). The strip target's `contentRe` now includes `sign-in`
alongside `button` and `footer-5_link`. Verified: raw homepage has 1 `.sign-in`
element, the served homepage has 0.

## 6. Per-family browser evidence

`family-probe.mjs` runs in the `capsulecode/singlefile` container (Chromium at
`/usr/bin/chromium-browser`, puppeteer-core mounted from the host rig), serves the
built tree from the same process, and drives each family. Raw results:
[`browser/family-results.json`](browser/family-results.json); screenshots beside
it.

| family | page | before → after |
| --- | --- | --- |
| shared header menu | `/` | hover → `.nav__dd.show` 1, `.header__bg` opacity 1, panel `display:block` |
| mobile take-over | `/` | tap hamburger → `.header__bg.is-open` true, CTA row `display:block` "Book a demo" |
| FAQ dropdown (animated height) | `/products/flock-os` | list height `0px` → `146.8px`, `aria-expanded=true`, `w--open` |
| filter dropdown (`display:none`) | `/press-center` | list `display:none` → `block`, `w--open` |
| accordion (LPR) | `/trust` | status `not-active`→`active`, panel rows `0px`→`92.0px` |
| Webflow tabs | `/products/video-cameras` | click inactive tab → `w--current` on link, `w--tab-active` on pane, `display:block` |
| custom `data-tabs` tabs | `/flock-ecosystem` | active button/pane moves 2nd → 3rd; pane opacity `0` → `1` |
| slider (Swiper) | `/press-center` | wrapper transform `0` → `translate3d(-1009px,…)` |
| condition-hidden | `/resources` | `.w-condition-invisible` present, `display:none` |

Every case is exactly the behavior the `sf-hidden`-keyed runtime used to fake, now
produced by the capture's own state CSS.

## 7. Serving gate and size

- `npm run pipeline`: 1,180 served + 19 dropped = 1,199 requested; 56 redirect
  stubs → 301, 14 dead + 10 auth-gated → 404; every page `audit: clean`, zero
  executable capture-derived scripts, zero tracker residue.
- `npm run routes`: **green** — 1279 routes, 1,180 served pages byte-identical
  over HTTP, count identity 1,180 + 19 = 1,199.
- Served tree: 10 GB (was ~4.8 GB from the baseline). Capture growth 5.45 GB →
  13.94 GB (2.56×).

## Reproduce

```
# capture (needs colima + docker; HTML is gitignored)
python3 .tmp/capture15.py .scratch/flock-parody/research/flocksafety/2026-09-11/capture-list.txt \
  .scratch/flock-parody/research/flocksafety/2026-09-11 \
  .scratch/flock-parody/research/flocksafety/2026-09-11/capture-status.csv 4
node .tmp/repair-titles15.mjs .scratch/flock-parody/research/flocksafety/2026-09-11

# audit
node .scratch/flock-parody-impl/evidence/15-capture-config/audit-capture.mjs \
  .scratch/flock-parody/research/flocksafety/2026-09-09 \
  .scratch/flock-parody/research/flocksafety/2026-09-11

# build + serve
npm run pipeline && npm run build && npm run routes

# browser evidence (rig = puppeteer-core in .tmp/rig, mounted under the home dir)
docker run --rm --entrypoint node -v "$PWD/.tmp/rig:/rig" -v "$PWD/served:/served:ro" \
  -v "$PWD/.scratch/flock-parody-impl/evidence/15-capture-config:/probe:ro" \
  -v "$PWD/.scratch/flock-parody-impl/evidence/15-capture-config/browser:/out" \
  capsulecode/singlefile:latest /probe/family-probe.mjs /served /out 8099
```
