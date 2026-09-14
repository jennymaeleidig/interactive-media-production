# 07 — Split-word heading double-report (copy/chrome boundary)

Status: resolved
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

- [x] when served and live carry the same heading and differ only by the
      split-word rendering, the page reports no copy finding and no chrome finding
- [x] a genuine change to that heading still produces exactly one finding
- [x] the fix addresses the split-word pattern in general (any page, any
      heading), not one hard-coded path
- [x] ticket 04b's runtime-fill exclusions still hold: the live-run chrome count
      does not rise above its current level
- [x] the two committed tree-fed steady-state tests still diff the tree to nothing
- [x] `npm test` stays offline and green; the ticket records what the fix cannot see

## Comments

Resolved 2026-09-14. Commit `699e220` carries the projections, the tests and the
glossary change; the review fixes and this close are the commit that carries
this note.

### Evidence correction

The ticket's `What to build` names the enclosing region as `section.lpr4_wrap >
… > div.lpr4_item_desc`. The promoted shape in the committed bytes is actually
`section.lpr7_wrap > div.lpr7_contain > div.lpr7_layout > p.lp7_paragraph` — the
`lpr4` block's `lpr4_item_desc` divs are plain prose. The finding is unchanged
(the same `split-word` fragment run, same empty-p + aria-label shape), but the
fix does not depend on either path, which is the point of acceptance box 3.

### What changed

- `regression/upstream-copy.mjs`: new exported `isSplitFragment`, matching the
  animation's own class (`split-word`/`split-line`, and the `-mask` prefix).
  `collectRuns` joins an adjacent sibling run of fragments into one prose run;
  `collectText` spaces inline fragments inside a prose element so adjacent
  inline fragments do not glue (`<h2><span class=split-word>See</span><span
  class=split-word>How</span></h2>` is `See How`, not `SeeHow`). A new
  `renderedText` helper removes the prose-branch duplication the review found.
- `regression/upstream-chrome.mjs`: the chrome walker skips fragments, and the
  block-run text collector does too (`!intoBlocks` only, so the allow-list's
  masked-hit character count still measures the whole region, as its contract
  says). The 04b runtime-fill list is untouched.
- `CONTEXT.md`: a **Word/line reveal** glossary entry, and the **Copy
  projection** entry corrected — the 2026-09-13 measurement's second copy
  finding (`/products/license-plate-readers`) was this reveal false positive,
  so `/careers` is the one real copy edit the measurement actually found.

### Seams tested

- `copyRuns` / `chromeRuns` (pure projections): the promoted-fragment paragraph
  shape, the `split-line` family, and adjacent inline fragments.
- `copyFinding` / `chromeFinding` (the per-page comparison): the reveal-versus-
  plain-prose pair is silent on both tiers; a genuine heading edit produces
  exactly one copy hunk and no chrome hunk.
- the committed page (`served/products/license-plate-readers.html`): the
  sentence is one copy run and none of its 22 fragment words is a chrome run.
- the two committed tree-fed steady-state tests (copy and chrome, every served
  page as both sides) still diff to nothing, unchanged and passing.

### Measurement (offline, all 1,181 served pages)

No live run was made in this session: `npm run upstream` is the hand-run network
edge and the ticket only needs the projection change proved. The offline
measurement compared the pre-fix projection (`HEAD` at `7dbce68`) with the
post-fix one over every served page: **0 pages gained a chrome run**, 1 page lost
22 (total 60,158 → 60,136), and 1 page gained a copy run (the reveal line).
Because the only change is an added skip — for both the served and the live
projection, which share these functions — a live chrome count cannot rise; the
04b removal fixtures still strip every entry. To confirm the live report end to
end, run `npm run upstream -- --json`; the expectation is that
`/products/license-plate-readers` loses its chrome finding and its copy finding
reduces to whatever genuine edit remains.

### What the fix cannot see

- A reveal whose fragments do not carry the `split-word`/`split-line` marker
  still reads as chrome and is still missed by copy — the rule is the
  animation's class, not "a block that looks like words".
- A fragment split mid-punctuation (`safety` + `.`) would join with a space the
  plain live line does not have, a possible false positive. The committed corpus
  splits on whitespace and keeps punctuation attached.
- The animated element's own `aria-label` (the browser's record of the line) is
  deliberately not read: a line rendered only through that attribute and with no
  visible text projects to nothing on the served side.
- The reveal is a rendering, not content: a change only inside the animated DOM
  with the underlying text unchanged is invisible by construction, because both
  sides are compared as text.

### Review

Two-axis review against `7dbce68` (`git diff 7dbce68...HEAD`), two parallel
sub-agents.

**Standards — fixed:** the prose branch now calls the shared `renderedText`
helper instead of duplicating `fragmentText`; `isSplitFragment`'s guard is
narrowed to `'attrs' in node`, matching `isGenerated`'s shape; the vocabulary is
standardised on *reveal* rather than *word-reveal*, and the over-constraining
`_Avoid_: split heading` line is dropped (a pre-existing test still uses the
phrase); the **Word/line reveal** glossary entry no longer names the CSS classes
or the walker's branches, per `CONTEXT.md`'s "no implementation detail here"
rule. **Rejected:** splitting off the shared test fixture/`fragment` helper into
a module (the repo's tests pin inputs explicitly and locally, and a helper for
two files is more indirection than it removes); treating the six explanatory
docblocks as duplication (the module headers are this repo's rule-of-record
style — 04b's header does the same).

**Spec — fixed:** the ticket now records the blind spots and the measurement
(above); the real-page pin asserts all 22 fragment words, not two; the inline
case the axis demonstrated moved from "general rule" to covered by a copy test
and a `collectText` fix; the masked-hit collector no longer skips fragments, so
allow-list `chars` still measures the whole region. **Rejected:** running the
live watch to evidence box 4 — the suite and this session stay offline, the
offline all-pages measurement plus the added-skip proof is the available
evidence, and the hand-run command is recorded above. **Noted:** the `Status:
claimed` line shipping in the implementation commit is the tracker's normal
claim-then-resolve split, not a deviation.
