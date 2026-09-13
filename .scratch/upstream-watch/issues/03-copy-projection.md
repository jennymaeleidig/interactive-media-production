# 03 — The copy projection

Status: resolved
Blocked by: 01

## What to build

The watch reports whose prose changed. For every URL the universe holds that the
tree serves, it fetches the live body, extracts the **copy projection** — the
prose the Recreation reproduces: headings, paragraphs, list items, blockquotes —
and compares it to the same projection of the served page.

This ticket proves the projection by measuring it, not by assuming it: the copy
projection of every served page must equal the projection of the live page it
reproduces, and the steady state is an empty report. A difference is a hard
finding — either the page's copy is out of date, or the projection is wrong — and
the first measurement decides which. That answer belongs in the module header
either way.

The offline pin is the same core called with the committed tree fed in as the
"live" side: no network, and every served page asserting the steady state.

The comparison is between two projections and never between raw bytes. The tree
is a deliberate lossy transform — the strip pass, the link rewrites, the body
dedupe, the injected layers — so live bytes and served bytes are not comparable
by construction, and the module says so where the next person will read it.

## Acceptance criteria

- [x] the copy projection is a pure function of HTML, with its rules — what counts
      as prose, how whitespace and entities normalize — declared in the module
- [x] the live-versus-served comparison yields a per-page finding naming the path
      and the differing runs, not a page-level boolean
- [x] feeding the committed tree in as both sides yields zero findings across
      every served page: the offline steady-state pin
- [x] a fixture with one changed paragraph produces exactly one finding, for that
      page
- [x] the run reports how many pages it compared and how many differed
- [x] no raw live bytes are compared to served bytes, and the module carries the
      reason and the worked false positive
- [x] the measured live-versus-served copy delta is recorded on this ticket, and
      that measurement decides ticket 04's allow-list scope
- [x] projection and comparison are pure, with their own vitest project row, and
      `npm test` stays offline

## Comments

**Commits.** `25871d6` — "Add the copy projection and its comparison (ticket
03)" — ships `regression/upstream-copy.mjs`, `test/upstream-copy.test.ts` with
its own `upstream-copy` vitest row, the `parse5` devDependency (declared
direct, not reached through jsdom), and the `checkJs` include. `7716269` —
"Carry the copy tier in the run, the baseline row and the network edge" —
ships the report/exit/format integration, the `baselineFromReport` digest, the
CLI body fetch, the integration tests, and the re-accepted committed baseline.
`0597ca7` — "Record the copy projection's rule and its measurement in the docs"
— ships `CONTEXT.md` and `CODING_STANDARDS.md`. `3d198dc` — "Fix the two-axis
review findings on the copy projection" — carries the review fixes below. This
ticket-close commit carries `Status: resolved`, the ticked boxes, and this note.

**Seams tested** (`test/upstream-copy.test.ts`, 18 tests, no network; plus 6
integration tests in `test/upstream-baseline.test.ts`). The projection as a
pure function of HTML: the declared element set, document order, entity and
whitespace normalization (named/decimal/hex/literal all project alike),
outermost-prose-only, and the three serialization invariances the measurement
forced — closed vs unclosed `<li>`, a split-word heading vs a plain one, and a
script-filled region vs its template. The comparison: identical → empty, a
changed paragraph → one hunk, an insertion → one hunk with no cascade, distant
changes → separate hunks. `copyFinding` names the path and the runs; `copyReport`
reports compared/differed and per-page live digests. The committed-tree pin:
all 1,181 served pages fed in as both sides, 1,181 compared, 0 differed, and
every page projects at least one run. The integration: the digest rides the
baseline row and round-trips read→serialize, a copy difference is a finding and
exit 1, a live copy move reports as a baseline field move, and a run with no
copy pages has no copy tier.

**The measured live-versus-served delta (2026-09-13, hand-run, not in `npm
test`).** `npm run upstream` fetched 1,181 live bodies for the watched URLs the
tree serves and compared each to its served page.

| run | fix applied | findings |
|---|---|---|
| 1 | none | 541 |
| 2 | + exclude `[data-toc]` | 11 |
| 3 | + exclude `[fs-cmsfilter-element="empty"]` | 5 |
| 4 | + exclude `[data-user]`, `[data-job-name]`, `<wistia-player>` | 2 |

The first projection was wrong, not the tree: 539 of the 541 were
runtime-filled regions the Capture froze populated while a raw live fetch
carries the template — Webflow's table of contents above all (the served page
lists 3–19 section headings, live ships one `<li>Introduction</li>`), then
Finsweet's CMS-filter empty state (moved relative to the list by script), the
Ashby-backed jobs list on `/careers/positions`, the event speaker popup
template on `/gsx`, and Wistia's preloaded transcript on `/what-is-flock`.
Excluding those regions leaves exactly 2 findings, and both are real upstream
copy edits, recorded as measured:

- `/careers` — served `We Aspire Fearlessly toBuild the Impossible` → live
  `We Work Hard toBuild the Impossible`;
- `/products/license-plate-readers` — live carries a paragraph served does not:
  `From recovering stolen vehicles to locating missing people and supporting
  investigations, learn how communities are using Flock LPR to improve public
  safety.`

Cost: 16.9 s and one GET per watched URL plus one body per served page. The
index tier was unchanged (0 added · 0 removed, 3 demotions confirming our
redirect table), so every finding above is content.

**The baseline was re-accepted, deliberately, with the digests.** After the
first plain run the committed baseline (ticket 02, no projection digests) read
every row's new `copy` field as a change — 1,181 changed rows, a one-time
artifact of the schema addition, not drift. `npm run upstream -- --accept`
rewrote it on the same date (2026-09-13): 1,220 rows, of which the 1,181 live
200s the tree serves now carry a 16-hex `copy` digest. The 39 rows without one
are the 19 served-page gaps and the 10 × 3xx and 10 × 401 paths, which have no
page copy to project. **Schema decision: version stays 1.** Ticket 02's rows
are additive and `readBaseline` preserves unknown row fields by design, so a
digest is a new optional field, not a new version; a bump would force every
future projection digest (ticket 05's asset digests among them) through a
version gate for no reader benefit. A plain run after the accept prints
`since 2026-09-13: 0 added · 0 removed · 0 changed` and leaves the file
byte-identical — the digest round-trips.

**What the measurement decides for ticket 04's allow-list scope.** The copy
delta names no chrome region at all. Every false positive was a runtime-filled
region — and those are *outside* the strip table's eleven targets, because the
strip pass never touched them; the Capture froze them filled and the raw live
fetch cannot carry that fill. So ticket 04's allow-list keeps the strip table's
eleven targets as its whole scope and must **not** grow to absorb the
runtime-filled regions: they are a projection exclusion (ticket 03's, above),
not a permission for chrome text to differ, and allow-listing them would let
real chrome drift hide behind them. The same asymmetry applies to the chrome
projection, which will see the table of contents and the filter empty state
too, so ticket 04 should apply the same exclusion before diffing chrome. That
is the decision the measurement supports; the copy tier itself contributes no
allow-list entries.

**Why raw bytes are never compared, and the worked false positive** (box 6).
Both are in `regression/upstream-copy.mjs`'s header. The tree is a deliberate
lossy transform — the strip pass, the link rewrites, the body dedupe, the
injected layers — so live and served bytes cannot match by construction. The
worked false positive is the live nav's `users.flocksafety.com` "Sign In" link:
the strip pass removes it (logged at 1,404 bytes on the homepage under "account
sign-in link" in `served/build-log.json`), so a raw-byte or whole-page-text diff
fires on every page carrying the nav. The copy projection does not, because the
link is `<div>Sign In</div>` inside `button_group is-nav` — layout, not a
heading, paragraph, list item or blockquote. The homepage measurement confirms
it: 0 hunks.

**The parser, and why it is a dependency.** `copyRuns` reads the tree with
parse5's HTML5 tree construction. The Capture (SingleFile re-serialization of a
live DOM) and upstream (Webflow) ship the same visible page with different tag
balance — the served homepage leaves `<li>` unclosed where live closes it, and
the Capture froze a GSAP split-word heading as `<h2><div class=word>…</div></h2>`
where live ships plain `<h2>text</h2>`, both measured. A tag-by-tag scanner
reads those serialization differences as prose differences; the tree
constructor applies the same implied end tags to both. parse5 was already
resolved in `package-lock.json` (jsdom's parser, 8.0.1, `"dev": true`), and this
ticket promotes it to a direct devDependency with a one-line lockfile change
rather than reaching through jsdom.

**Review findings, two axes vs fixed point `6fbaa27`.** Standards — fixed: the
ticket hand-off (this close); the module header's arithmetic (541 → 11 → 5 → 2,
now reconciled); the drift boolean written twice in `exitCode` and
`formatWatchReport` (one `reportMoved(report)` behind both, so the print and
the exit cannot disagree on the copy tier); the copy tier's shape spelled out
in three places (one `CopyTier` typedef); three different meanings of `copy`
along one seam (`RunInputs.copyPages`, `report.copy`, `baselineFromReport`'s
`copyDigests`); `PROSE_ELEMENTS` and `copyFinding` exported without a caller
(the seam test now asserts the declared set, and `copyFinding` is the one-page
public function); and the committed 200 row pinned with a weakened
`toMatchObject` (now exact, with an asymmetric matcher for the digest). Rejected:
`coarseHunk` called unreachable complexity — kept deliberately as a memory
bound, so a page with a pathological run count cannot allocate an unbounded LCS
table (4 M cells = 16 MB; the corpus's largest page projects 289 runs). Spec —
fixed: box 7 (this Comments records the delta and the ticket-04 decision); the
reconciliation above. Rejected: the new copy-tier test asserting on
`formatWatchReport` output as "stdout text" scope creep — it asserts the
formatter's contract, not the network driver's stdout, exactly as ticket 01's
`formatWatchReport` and ticket 02's delta-printing tests already do, and it
serves ticket 01's box "human output and `--json` report the same findings";
`data-user`'s breadth and `collectText` dropping a runtime-filled subtree from
its parent run — deliberate and documented, because the region's fill is
exactly what the live side cannot carry; and `readBaseline` preserving `copy`
unvalidated — ticket 02's v1 rows are deliberately additive and unvalidated so
ticket 05's digests need no reader change, and a per-field validator would
contradict that decision.

**What this tier cannot see.** A change inside a runtime-filled region (the
table of contents, the ATS jobs list, the event speaker popup, Wistia's
transcript) — the live side the watch can fetch never carries one; rendering
live pages to compare them needs a browser and is out of scope. Chrome
(nav/footer) text that lives in non-prose containers — ticket 04's chrome
projection. And a copy change whose text is byte-identical but whose structure
moved is invisible, by design: the projection compares normalized runs, not
layout.
