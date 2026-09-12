# 12: Final fidelity signoff

**What to build:** The signed-off Recreation. A full re-capture refreshes ground truth; the serving check (`npm run routes`) is re-run against the new run — every route class, every served page's byte-identity, the count identity, and the site-wide strip audit — and a human side-by-side over a representative sample confirms runtime feel (animations, chat overlay, pounce timing) and that the strip visually reads as intended. The result is the phase-gate signoff that the fidelity bar is met.

**Blocked by:** 10, 11.

**Status:** claimed
Label: ready-for-agent

- [x] A full re-capture produces a fresh run folder and inventory diff.
- [x] `npm run routes` is green against the new run (route classes + byte-identity + strip audit).
- [ ] A human side-by-side confirms runtime feel on representative pages.
- [ ] The strip's visual result is confirmed by eye on representative pages — the Qualified offer bar, the OneTrust consent card, and the reclaimed header-height reflow are gone, and the page otherwise reads identically to the Capture.
- [x] The signed-off build's capture pointer references the final run.
- [x] Any accepted dead paths are recorded in the signoff.

## Review sample

The human side-by-side (the only check covering runtime feel and the visual
strip result) covers one page per template family plus the largest and hardest
cases. Verified present in the signed-off `2026-09-12` run (the checklist pack
is generated from it):

- index: `/`, `/blog`, `/customers`, `/resources`, `/trust`, `/press-center`, `/upcoming-events`
- marketing: `/industries/retail`, `/gsx`, `/flock-ecosystem`, `/what-is-flock`
- product: `/products/license-plate-readers`, `/products/video-cameras`, `/products/flock-os`, `/products/gunshot-detection`, `/products/mobile-security-trailer`, `/products/flock-dfr`, `/safe-cities`
- post: `/blog/how-effective-is-flock`, `/blog/tips-for-leaving-town`, `/blog/why-flock`, `/customers/how-spring-branch-independent-school-district-is-stopping-crime-with-a-flock-safety-falcon-and-raven-system`
- resource: `/ebooks/apartment-security`, `/webinar/product-launch`, `/podcast`
- legal: `/legal/terms-and-conditions`, `/legal/privacy-policy`
- utility: `/book-a-demo`, `/thank-you`, `/newsletter`, `/partner-inquiry`, `/refer`, `/chilipiper-2`, `/accessibility-plan`
- campaign LP: `/lp/proven-where-it-matters`, `/abm/amazon`
- long-form utility: `/implementation-guide`

A human review of a sample, not an automated sweep: the retired pixel gate
(ticket 06) rendered ~1,180 pages × 3 viewports for ~2 h and only ever compared
the served output against itself.

## Implementation (2026-09-12)

Signoff record: `.scratch/flock-parody-impl/evidence/12-final-signoff/README.md`.

**Run.** `research/flocksafety/2026-09-12/`, 13 GB, **1,200 / 1,200 pages, 0
failed** (one transient-outage pass cleared by `--resume`). Inventory diff
1,279 → 1,290 rows, **no route actions**. `CAPTURE_RUN` now points here.

**Gates.** `npm run pipeline` (1,181 served + 19 dropped = 1,200, every page
`audit: clean`, 0 executable capture scripts, chat census 1,181/0); `npm run
build` succeeds; `npm run routes` **green** (1,290 routes, 1,181 byte-identical
pages, 2,955 assets, count identity). A new `title-check.mjs` proves every
captured page carries its intended title.

**Four driver defects found at scale, fixed and tested** (`pipeline/recapture.mjs`
+ `test/recapture.test.ts`): the blocking `spawnSync` that made `--parallel 4`
serial (~33 h projected — the reason this ticket stalled), `errors.log` not
truncated on resume, `title-repairs.csv` overwritten on resume, and a resume's
synthetic rows overwriting real verdicts. The run's `capture-status.csv` was
normalized once for the last of these. The refresh also caught a third-party
launcher race: 12 pages captured without Qualified's `<q-root>`, re-captured,
census now 1,181/0.

**Open:** the two human checks (§5 of the signoff record; review pack at
`evidence/12-final-signoff/review-checklist.md`). Ticket stays `claimed` until a
human runs the side-by-side and the strip confirmation.
