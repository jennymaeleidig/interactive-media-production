# 07 — Split-word heading double-report (copy/chrome boundary)

Status: open
Blocked by: 06

## What to build

The steady-state live run reports `/products/license-plate-readers` twice, in
opposite directions, for one heading that did not move:

- **copy**: served `[]` vs live `["From recovering stolen vehicles to locating
  missing people and supporting investigations, learn how communities are using
  Flock LPR to improve public safety."]`
- **chrome**: served `["From", "recovering", "stolen", "vehicles", "to",
  "locating", …, "public", "safety."]` vs live `[]`

Both sides carry the same sentence. The served page is the Capture's
**post-script** DOM: that heading is rendered as a run of `div.split-word`
fragments (the hero word-reveal animation) under `div.lpr4_item_desc`. The copy
projection reads prose elements only, so it does not see the fragments; the chrome
projection reads non-prose block text, so it does — and the two together report
one unchanged heading as a copy edit *and* a chrome change. The live fetch is
pre-script, so the same sentence is one prose block and lands in copy.

This is the capture-versus-live asymmetry ticket 04b named, in a region 04b's
exclusion list does not cover. It is a false positive on both tiers, not drift.

### Evidence

Inspection of the served bytes at `HEAD`:

- `copyRuns(served)` produces no run containing the sentence.
- `chromeRuns(served)` produces the split-word fragments listed above.
- The enclosing elements are `main > section.lpr4_wrap > … >
  div.lpr4_item_desc`, with **no** `display:none` or hidden ancestor — so the
  exclusion is not about visibility, it is about the split-word rendering.
- The two committed tree-fed steady-state tests still diff the tree to nothing,
  so the split exists only served-versus-live.

## Acceptance criteria

- [ ] when served and live carry the same heading and differ only by the
      split-word rendering, the page reports no copy finding and no chrome finding
- [ ] a genuine change to that heading still produces exactly one finding
- [ ] the fix addresses the split-word pattern in general (any page, any
      heading), not one hard-coded path
- [ ] ticket 04b's runtime-fill exclusions still hold: the live-run chrome count
      does not rise above its current level
- [ ] the two committed tree-fed steady-state tests still diff the tree to nothing
- [ ] `npm test` stays offline and green; the ticket records what the fix cannot see

## Comments
