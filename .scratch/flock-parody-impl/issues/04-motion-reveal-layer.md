# 04: Motion reveal layer

**What to build:** The scroll- and load-driven motion the original site has, restored cheaply. The build normalizes every captured from-state to its static end-state, then injects a shared snippet and declarative annotations. The hero split re-fires the original visibility class so the captured transition CSS plays verbatim; scroll word-splits (including the masked variant), fades, and clip reveals fire one-shot with per-element stagger; a generic pass normalizes any inline zero-opacity from-state it finds. With reduced motion requested, or with JavaScript disabled, every page renders as the static end-state.

**Blocked by:** 01.

**Status:** open
Label: ready-for-agent

- [ ] The homepage hero split animates on load and reveals animate on scroll.
- [ ] Word-split staggering matches the captured timing.
- [ ] Fades and clip reveals play once and settle at the captured end-state.
- [ ] The generic zero-opacity normalization covers elements no explicit rule names, logged per page.
- [ ] Reduced-motion renders fully static pages.
- [ ] JavaScript-disabled renders fully static pages.
- [ ] No per-page bespoke motion logic exists — annotations only.
- [ ] Every normalization is logged for human review.
