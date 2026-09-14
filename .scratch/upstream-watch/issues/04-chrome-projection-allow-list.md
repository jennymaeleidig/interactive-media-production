# 04 — The chrome projection and the allow-list

Status: resolved
Blocked by: 03

## What to build

Chrome drift, without our own strip showing up as noise. A live page's nav,
footer and global chrome differ from ours by exactly the regions the strip pass
removed — the sign-in link, the chat launcher, the OneTrust stack, the Qualified
offer — so a raw chrome diff is permanently non-empty and useless as an alarm.

Split the projection in two: the copy projection stays a hard finding (ticket 03),
and the **chrome projection** is diffed against an allow-list whose entries are
named after the strip table's eleven targets — `account sign-in link`, `q-root
(chat launcher)`, `q-focus-sentinel`, the two Qualified style targets, the four
OneTrust targets, `onetrust-style` — the same vocabulary `served/build-log.json`
already logs per page.

The allow-list's real scope is the delta ticket 03 measured, not a guess, and each
entry records the measurement behind it. Allow-list hits are counted, never
silently dropped: a run says how much chrome text was expected to differ, so an
entry masking real drift shows up as a growing count rather than as silence.

The motivating false positive is on the record: the live nav's
`users.flocksafety.com` sign-in link reads as drift against a tree that stripped
it by class, logged at 1,404 bytes on the homepage.

## Acceptance criteria

- [x] the chrome projection is separate from the copy projection, and its
      comparison is a soft finding
- [x] allow-list entries are named after the strip table's targets, each carrying
      the measurement that put it there
- [x] with the allow-list applied, feeding the committed tree in as both sides
      yields zero findings
- [x] allow-list hits are reported as a per-run count
- [x] removing an entry in a fixture makes the corresponding finding reappear
- [x] a chrome change the strip does not explain — a new nav item, a renamed menu
      — is reported as a finding
- [x] the sign-in-link false positive is recorded with its evidence, so no future
      live-versus-ours idea has to rediscover it
- [x] pinned in the pure watch seam's vitest project, and `npm test` stays offline

## Comments

**Status: resolved.** Hand-off and close are the same state (per
`docs/agents/issue-tracker.md`); this ticket-close commit carries the ticked
boxes and this note.

**What was built.** `regression/upstream-chrome.mjs` holds the chrome projection
and the allow-list. A **chrome run** is the inline text of every non-prose block
element (its direct text plus inline descendants, stopping at nested blocks,
prose, skipped and generated regions), in document order — the complement of
ticket 03's copy projection, which `test/upstream-chrome.test.ts` now pins in
both directions. The allow-list is data — eleven entries named after the strip
table's targets, each `{name, measured: {pages, bytes}, match}` — applied by
removing matched subtrees from the **live** DOM before projecting. The served
side is never masked, so a strip target accidentally retained in our tree
surfaces as a served-only finding. A masked region is recorded, not dropped:
each entry's hits total `{name, regions, chars}` across the run.
`chromeFinding`/`chromeReport` reuse ticket 03's `copyDiff`, so the two tiers
cannot disagree on what a difference is. `runWatch` gains an optional
`chromePages` input and `report.chrome`; the CLI passes the same fetched page
array as both `copyPages` and `chromePages`.

**The eleven targets, and the two zero measurements.** The ticket prose names
`account sign-in link`, `q-root (chat launcher)`, `q-focus-sentinel`, the two
Qualified style targets, the four OneTrust targets and `onetrust-style` (ten by
the prose's own count); the eleventh, `qualified-offer-host`, is implied by the
"eleven targets" count and named in the strip table. `onetrust-banner-sdk` and
`onetrust-pc-sdk` are named by the strip table but never appear in
`served/build-log.json` because `stripPass` logged only nonzero removals; their
`measured` is `{pages: 0, bytes: 0}` — that zero *is* the cross-checked
measurement, asserted against the log rather than assumed. The two
`qualified header-*` keys the homepage row carries are attribute cleanups, not
strip targets, and are deliberately not entries. Worst case in the corpus:
`q-root` 2,367,944 bytes at
`/video/two-families-one-frightening-night-and-how-flock-helped-bring-answers`.

**The false positive, on the record.** The live nav's `users.flocksafety.com`
"Sign In" link is absent from our tree because the strip pass removed it by
class, not because we are stale. `served/build-log.json`'s homepage row logs it
at 1,404 bytes; the allow-list entry masks it and reports the hit
(`{name: 'account sign-in link', regions: 1, chars: 7}`), and removing the entry
from the list in the fixture makes the finding reappear.

**"Soft" means allow-list-filtered, not non-failing.** Spec decision 5 calls
copy the hard findings and chrome the soft ones; decision 11 is explicit that
zero means no findings and one means findings, and box 6 requires an unexplained
chrome change (a new nav item, a renamed menu) to be reported as a finding. So a
chrome difference that survives the allow-list sets exit 1 alongside the copy
tier — the alternative would let a site-wide nav edit pass with a zero exit and
no alarm, against user story 10. The soft/hard distinction is the allow-list
comparison itself, not exit-code exclusion.

**No chrome baseline digest, deliberately.** The tier is report-only: it carries
no per-page digest, because adding a live chrome digest would make the first
plain run after this commit read every row's new field as changed (the one-time
artifact ticket 03 hit), and repopulating the baseline needs a live `--accept`
the offline sandbox cannot run. Ticket 05 must re-accept the baseline for the
asset digests anyway, so a chrome digest joins it there.

**What was measured (2026-09-13, offline).** With the allow-list applied and the
committed tree fed in as both sides, the run is silent: 1,181 compared, 0
differed, 0 hits. The prototype projection over the same corpus made 63,088 runs
(avg 53.4/page, max 278), and every served page projects at least one run. The
allow-list's measurements are cross-checked entry by entry against
`served/build-log.json` (pages and homepage bytes), so the literal cannot drift
from the log; `grep` over `served/*.html` confirms the tree carries none of the
eleven targets, so masked hits on the served side are zero.

**Review findings, two axes vs fixed point `04ed3d6`.** Standards — fixed: the
`Ten of the eleven` arithmetic in the allow-list header (the log carries nine,
not ten); `chromeDiff`, a one-line alias whose only caller was a tautological
test (deleted, with an explicit complement test replacing it); two near-identical
text walkers (`collectRegionText`/`collectInline`) collapsed to one
`collectText(..., intoBlocks)`; a duplicated `pages()` fixture hoisted; and
`CODING_STANDARDS.md` extended with the module, the watch's pure seam test files
and the chrome projection term. Rejected: the cross-file test-fixture duplication
(`run`/`steady` copied from the baseline test) — the convention for these seams
is a self-contained test file, and a shared `upstream-fixtures.ts` is a
cross-ticket refactor beyond this ticket; the `chromePages?: CopyPage[]` name —
`CopyPage` is the shared page-pair type, and renaming it is churn against a
closed ticket; `PROSE = new Set(PROSE_ELEMENTS)` — a one-line derived constant,
not the rules duplicated. Spec — fixed: the missing explicit both-directions
projection test (added, importing `copyRuns`). Rejected: "chrome is wired as a
hard finding" — the soft/hard decision above; "the two zero measurements are a
guess" — the ticket names the four OneTrust targets and the measured zero is the
cross-checked result; the no-baseline-digest deferral and the report/exit
integration are the decisions recorded above.

**What this tier cannot see.** A chrome change inside a runtime-filled region
(the table of contents, the filter empty state) — those are ticket 03's
projection exclusions, deliberately *not* allow-list entries, so real chrome
drift can never hide behind them. A restyle that changes no text is ticket 05's
signal, not this one.
