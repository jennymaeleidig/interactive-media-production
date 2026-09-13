# 02 — The baseline, and the verified-in-sync date

Status: resolved
Blocked by: 01

## What to build

The watch remembers. Ticket 01 compares upstream to a frozen list that will never
change again; this ticket adds a moving baseline, so the command can report what
moved *since we last looked* — including a path added and removed between two
runs, which the frozen list cannot see.

With no baseline present, a run records one and reports nothing but the count:
the silent first run, so 1,209 URLs never register as 1,209 changes. Every run
after it diffs against the committed baseline and reports the delta. Only an
explicit `--accept` rewrites the baseline, so a check can never silently move its
own reference point.

The baseline holds one row per watched URL — path, sitemap membership, status,
redirect target, and the projection digests the later tickets add — plus the date
the run verified. It is committed state; a run's output is evidence and is not
committed, though `--out` can save it.

That date is the repo's "verified in sync as of" fact: it goes beside the
snapshot's provenance in `README.md`, and the watch's vocabulary — *upstream
watch*, *watched universe*, *copy projection*, *chrome projection*, *silent
baseline*, *verified-in-sync date* — joins `CONTEXT.md`. The frozen-snapshot
entry does not change: this ticket adds a watch, not a sync.

## Acceptance criteria

- [x] with no baseline present, a run writes one and reports only the count, with
      no findings
- [x] a second run against the same upstream reports no findings
- [x] a fixture with a path added, a path removed, and a path whose status changed
      produces exactly one finding each, grouped by class
- [x] `--accept` is the only code path that writes the baseline; a plain run never
      does
- [x] a baseline accept round-trips: what a run records is what a later run reads
      as its previous state
- [x] the baseline carries the verified date, and the baseline file is committed
- [x] no run writes anywhere in the served tree
- [x] `README.md` states the verified-in-sync date beside the snapshot's
      provenance, and `CONTEXT.md` defines the watch's vocabulary
- [x] baseline read, diff and write are pure, pinned in their own vitest project
      row, and `npm test` stays offline

## Comments

**Commits.** `9d547e3` — "Add the upstream watch's moving baseline (ticket 02)" —
ships `regression/upstream-baseline.mjs` (pure core), the committed baseline
`regression/upstream-baseline.json`, the `upstream-watch.mjs` delta vocabulary
and exit/format changes, the CLI wiring (`--accept`, `--out`, the served-tree
guard), `test/upstream-baseline.test.ts` with its own `upstream-baseline` vitest
row, the `checkJs` include, and the `README.md` / `CONTEXT.md` /
`CODING_STANDARDS.md` docs. `870c6cd` — "Fix the two-axis review findings on the
upstream baseline" — carries the review fixes below. This ticket-close commit
carries `Status: resolved`, the ticked boxes, and this note.

**Seams tested** (`test/upstream-baseline.test.ts`, 23 tests, no network):
`readBaseline`/`serializeBaseline` round-trip and schema rejection; unknown
row-field preservation; `baselineFromReport`; `diffBaseline` added/removed/
changed, including sitemap-membership and redirect-target moves and a synthetic
later-ticket digest field; `runWatch`'s silent first run, second clean run, the
recorded-date rule, and the `write` decision; the accept round-trip (what a run
records is what the next run reads); `outsideServedTree`; and the committed
baseline itself (1,220 rows, 1,209 in the sitemap, 1,200 × 200, 10 × 3xx,
10 × 401, verified 2026-09-13, no self-diff).

**The baseline is the real 2026-09-13 measurement.** `npm run upstream` was run
by hand against live flocksafety.com on 2026-09-13: 1,220 watched URLs, 1,200
live 200s identical to the Capture list, zero added and zero removed, 13 sitemap
locs not live 200 (10 × 401, 3 × 3xx), 3 demotions confirming our redirect table.
The silent first run wrote `regression/upstream-baseline.json` and printed only
the counts; a second run printed `since 2026-09-13: 0 added · 0 removed ·
0 changed` and left the file byte-identical; `--accept` rewrote it
byte-identically. `npm run typecheck`, the full `npm test` (18 files, 271 tests),
and `npm run build` all pass.

**The two boxes that read as a contradiction, resolved.** Box 1 says a run with
no baseline writes one; box 4 says `--accept` is the only code path that writes
the baseline and a plain run never does. They are reconciled the way the spec's
decisions 9 and 10 state: the first run has nothing to diff, so recording is the
only action available to it, and there is exactly one write call site in the
edge, guarded by `runWatch`'s `write` (`previous === null || accept`). Box 4's
"a plain run never does" is read as **never moves an existing baseline** — the
invariant it protects, "a check cannot silently move its own reference point",
holds. `regression/upstream-baseline.mjs`'s header states this reading.

**The ticket's "1,209 URLs" is the sitemap count, not the universe.** The silent
run's count is the 1,220-URL watched universe. The ticket and spec prose keep
their 1,209 (the effort's binding text is not the implementer's to rewrite); the
module header and `CONTEXT.md` say "the whole watched universe" instead, and the
committed baseline's test pins 1,220 rows / 1,209 in the sitemap / 1,200 live
200s.

**Review findings, both axes vs fixed point `836fc08`.** Standards — fixed:
ticket status (this close commit); the 1,209-in-the-header number;
`baselineMoved` extracted so the printed summary and `exitCode` cannot disagree;
the `--out` target resolved once and both guarded and written; one code-unit path
comparator (`byPath`) instead of `localeCompare`; the test's raw status ranges
replaced by `livenessClass`; `VERIFIED_DATE` renamed
`VERIFIED_DATE_PATTERN`. Rejected: `WatchReport.since` optional-by-construction —
ticket 01's `buildWatchReport` legitimately has no baseline section, and marking
`since` required would force the index core to fabricate one; the two consumers
must handle both report shapes, so optional is the honest type. Spec — fixed:
spec decision 15's "reviewable rule" (README now says run the watch before a
milestone or a publish, with no schedule or CI job); the verified date printed
for a run that recorded nothing (the report now carries the committed baseline's
date); the `readRow` field drop vs the "no silent misread" promise (unknown row
fields are now preserved, and `diffBaseline` compares every carried field
generically, so ticket 03's copy digest and ticket 05's asset digests are diffed
the moment they are recorded). Rejected: the first run still prints ticket 01's
index report — "reports only the count" is about the baseline delta, and
suppressing genuine index findings because no baseline exists yet would hide real
drift; the lexical `outsideServedTree` (a symlinked `--out` is a deliberate act,
`served/` is a real committed directory, and the guard's job is catching a
mistyped target — recorded here as a known limitation).

**Handed forward.** Spec decision 5 says "ticket 02's measurement decides the
allow-list's real scope"; ticket 03's acceptance says ticket 03 records that
measurement and decides ticket 04's allow-list. Ticket 02 measures no
projections, so that measurement is ticket 03's; the baseline row is ready for
its digest (versioned schema, preserved unknown fields, generic diff).
