# 12: Final fidelity signoff

**What to build:** The signed-off Recreation. A full re-capture refreshes ground truth; the serving check (`npm run routes`) is re-run against the new run — every route class, every served page's byte-identity, the count identity, and the site-wide strip audit — and a human side-by-side over a representative sample confirms runtime feel (animations, chat overlay, pounce timing) and that the strip visually reads as intended. The result is the phase-gate signoff that the fidelity bar is met.

**Blocked by:** 10, 11.

**Status:** open
Label: ready-for-agent

- [ ] A full re-capture produces a fresh run folder and inventory diff.
- [ ] `npm run routes` is green against the new run (route classes + byte-identity + strip audit).
- [ ] A human side-by-side confirms runtime feel on representative pages.
- [ ] The strip's visual result is confirmed by eye on representative pages — the Qualified offer bar, the OneTrust consent card, and the reclaimed header-height reflow are gone, and the page otherwise reads identically to the Capture.
- [ ] The signed-off build's capture pointer references the final run.
- [ ] Any accepted dead paths are recorded in the signoff.

## Review sample

The human side-by-side (the only check covering runtime feel and the visual
strip result) covers one page per template family plus the largest and hardest
cases. Verified present in the 2026-09-09 run:

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
