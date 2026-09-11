# Ticket 14 evidence — header fidelity (sticky scroll morph, hover mega-menus)

Side-by-side `LIVE flocksafety.com` vs `RECREATION local` at 1440×900 (rest /
scrolled / menu open) and 390×844 (rest / scrolled / take-over open / sub-menu
open). `compare-*.png` are the stitched pairs (live left, recreation right);
`live-*.png` / `ours-*.png` are the raw viewport shots.

## Measured state (Docker chromium 152, same rig for both sides)

| state | measurement | live | recreation |
| --- | --- | --- | --- |
| desktop rest | `.header-wr` position / top | sticky / 0px | sticky / 0px |
| desktop rest | `.header__bg` opacity / radius | 0 / 8px | 0 / 8px |
| desktop menu | `.header__bg` opacity / radius | 1 / 20px 20px 0 0 | 1 / 20px 20px 0 0 |
| desktop menu | `.nav__dd.show` count | 1 | 1 |
| desktop menu | `.nav__dd-products > a` widths | flex 208 ×4 | flex 208 ×4 |
| mobile take-over | `.header__bg` opacity / radius | 1 / 0px | 1 / 0px |
| mobile take-over | `.nav__dd.show` count | 0 | 0 |
| mobile take-over | CTA row (`is-cta-mobile`) | `display:block`, "Book a demo" | `display:block`, "Book a demo" |
| mobile sub-menu | `.nav__dd-products > a` display:width | `flex:165, none:0, none:0, flex:165` | `flex:165, none:0, none:0, flex:165` |

The recreation carries no `Sign In` affordance: account surfaces are stripped,
never mocked (ADR-0001). The live shots also show the live cookie banner; the
recreation shows the chat launcher. Neither is a header difference.

Splitting the mobile take-over out as its own state is what caught the last
gap: the take-over's CTA row is hidden above 479px, so the 2026-09-09 capture
had emptied it (`<li … sf-hidden></li>`) and the take-over shipped with no Book
A Demo button while live has one. The artifact now carries the row and the pass
grafts it (1179/1179 pages).

## Graft coverage across the built tree (`audit-served-graft.mjs`)

Reads `served/build-log.json` after a full `npm run pipeline`:

| measurement | result |
| --- | --- |
| pages processed | 1180 |
| pages with a header graft | 1179 (`/brand-partner-guide` is a standalone page with no shared header) |
| `menusFilled` | 5 on every grafted page |
| `mobileChrome` | 1 on every grafted page |
| header-restore warnings | 0 |

## Scope check: does the injected rule set touch anything outside the header?

The restored CSS is a slice of the live stylesheet, and it carries whole global
classes because the mega-menu panels use them (`.w-inline-block`, `.cs_list`,
`.button`, the hide utilities — 127 selectors with no header token at all).
`probe-scope-ab.mjs` loads a page twice, disabling the injected
`style[data-flock-parody="header-restore"]` for the second pass, and compares
the computed styles of sampled elements outside the header (ancestors of the
header excluded — their box moves with it).

- **Before the fix:** real changes — e.g. `a.hero-card.is--2` flipped
  `display:flex → block`, the opposite of live (`probe-local-ab.mjs` shows the
  same element alone).
- **After the fix** (`scopeRestoreCss` prefixes every restored selector with
  `.header-wr`): **zero** changes, on `/`, `/resources` and `/trust`, at 1440
  and 390.

## Reproduce

1. Build and serve the recreation (`npm run pipeline`, then a server on the
   served tree), with Docker/colima available.
2. Start the chromium rig:
   `docker run -d --name navshot --entrypoint sh capsulecode/singlefile -c 'sleep 7200'`,
   then `npm i puppeteer-core@23` inside it.
3. Capture both sides in each state:

   ```
   docker exec navshot node /tmp/navshot.mjs <url> 1440 900 /tmp/shots live-desktop
   docker exec navshot node /tmp/navshot.mjs <url> 390 844 /tmp/shots live-mobile takeover
   docker exec navshot node /tmp/navshot.mjs <url> 390 844 /tmp/shots live-mobile menu
   ```

   The probes are vendored here (`navshot.mjs`, `probe-scope-ab.mjs`,
   `probe-mobile-panel.mjs`, `probe-local-ab.mjs`, `audit-served-graft.mjs`);
   copy them into the container with `docker cp`.
4. `docker cp navshot:/tmp/shots/. /tmp/navshots/`, then
   `python3 .scratch/flock-parody-impl/evidence/14-header-fidelity/rig-compare.py`.

## What the seams cover instead of pixels

- `test/header-restore.seam.test.ts` — the graft: panels filled and matched by
  class signature, artifact class cleared, mobile chrome, restored CSS injected
  **scoped** (with a leakage guard asserting no restored selector is left
  unscoped), hrefs Recreation-relative, no external image sources, graft counts
  logged, and the drift warnings (unmatched panel, unplaced fragment, header
  with no mobile chrome).
- `test/nav.seam.test.ts` — the runtime's class contract in jsdom: `.scroll`,
  `.scroll-up`, desktop hover `.show`, desktop click navigates (no
  preventDefault), mobile tap-toggle, outside-click/resize close, hamburger
  take-over, reduced motion instant — plus the reduced-motion coverage check
  against the restored stylesheet's transitions.
- `test/pipeline.test.ts` — the injection layers and the zero-outbound
  invariants per page.

## Extraction gotchas (why those seams exist)

The artifact generator is throwaway (`.tmp/extract-header-restore.mjs`), and
each of its first three cuts produced CSS that *looked* right and silently did
not apply:

1. de-duplicating emitted lines dropped the repeated `}` lines, so every
   `@media` block swallowed the rules after it — the desktop morph rules ended
   up inside a `max-width:479px` block;
2. jsdom exposes `.media` (and `.cssRules`) on every rule, so keying on its
   presence wrapped every rule in an empty `@media  {`;
3. a tag regex cannot inline an `<img>` whose `style` contains `>` — it
   truncated the tag and leaked attributes as visible text (DOM mutation fixed
   it).

Filtering by selector prefix also missed the classes the closed-dropdown
capture never saw: `.cs_list` (panels collapsed to a four-across row) and the
`hide-mobile-portrait` / `hide-tablet` utilities (hidden cards rendered). The
extractor now brings along the rules for every class the restored panels use —
which is exactly why the injected sheet needs the build-time scoping above.

## Known residuals

- Webflow's base `.w-condition-invisible{display:none!important}` is restored
  only inside the header (the artifact carries the rule, the build scopes it);
  the site-wide loss is ticket 15's.
- Live's nav sits under a VWO experiment, and this pins the 2026-09-11 header;
  dropdown contents may drift from the 2026-09-09 baseline.
- Live carries 9 `.nav__dd-content` panels (4 in a legacy always-hidden
  duplicate menu) versus the recreation's 5 — the legacy duplicates are
  deliberately not restored (~33 KB of dead markup per page).
