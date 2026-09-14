# 08 — Known-drift acceptance and refresh candidates

Status: resolved
Blocked by: 06

## What to build

Spec user story 5: "a steady-state run to produce an empty report, so that a
non-empty report is an alarm I will actually read." The tree stays frozen (spec
Out of Scope: no re-capture), and it is honestly stale. After ticket 07 the live
run still reports real upstream changes — `/careers` prose and the `/faq`,
`/press-center`, `/resources`, `/upcoming-events` filter-label renames — so every
run is non-empty and the alarm is permanently on. That is the failure ticket 04b
fixed for projection **noise**, now caused by real, **accepted** drift the
maintainer has chosen not to act on.

Add an explicit acceptance path and a target rollup:

1. **`--accept-drift`** records the differences the current run reports
   (copy, chrome — including restyle — and media) as *known*. A plain run treats
   a difference that matches a recorded entry as **accepted**: it is still shown
   (a count, and the page/tier), never silently dropped, but it is not a finding
   and does not set exit 1. Any difference that matches no recorded entry — new
   drift, or a recorded difference whose live side has changed again — is a
   finding and exits 1.
2. **A refresh-candidate rollup** in the report names every page a future
   re-capture would need: the union of pages carrying a non-accepted finding,
   plus the index tier's added/removed set. This is the report answering "what
   would we re-fetch", not a recapture tool — the watch still never writes to
   `served/`.

State lives in the committed baseline (spec decision 9: one committed baseline),
following the `--accept` precedent: only `--accept-drift` writes it, and a plain
run never moves it.

## Acceptance criteria

- [x] a plain run whose only differences are recorded ones reports them as
      accepted and exits 0
- [x] a difference matching no recorded entry is a finding and exits 1
- [x] a recorded difference whose live side changes again re-alarms (the entry no
      longer matches)
- [x] the accepted set is committed, reviewable in the diff, and only
      `--accept-drift` writes it; a plain run never moves it
- [x] the report carries a refresh-candidate rollup naming every page with a
      non-accepted finding, and the index added/removed pages
- [x] media liveness participates in the same acceptance despite being report-only
- [x] `npm test` stays offline and green; the driver stays hand-run; the ticket
      records the blind spot that acceptance creates

## Comments

Resolved in `0bf5dd8` (implementation, tests, review fixes) plus the closure
commit that carries this note.

### What landed

- `regression/upstream-accept.mjs` — the pure acceptance core: `AcceptanceEntry`
  (`PageAcceptance` / `AssetAcceptance` / `MediaAcceptance`),
  `acceptanceIdentity` (restyle by URL, media by page + slot, copy/chrome by
  tier + path), `mediaSlotIdentity`, `acceptanceEntries` (dedupe + normalize +
  sort), `partitionAccepted` (accepted only on identity **and** live-fingerprint
  match), and the committed `byAcceptance` order.
- `regression/upstream-baseline.mjs` — `readBaseline`/`serializeBaseline` carry
  an `accepted` array (omitted when empty, sorted); `runWatch` collects the
  run's differences, partitions them, shrinks each tier's findings/differed to
  the active set, sets `report.accepted` only when non-empty, and sets
  `report.refreshCandidates`.
- `regression/upstream-watch.mjs` — `WatchReport.accepted` /
  `refreshCandidates` and the human-view blocks.
- `regression/upstream-watch-cli.mjs` — `--accept-drift` wiring.
- `regression/upstream-baseline.json` — the committed accepted set: copy
  `/careers`; chrome `/faq`, `/press-center`, `/resources`, `/upcoming-events`.
- `CONTEXT.md` "Accepted drift" glossary term; `CODING_STANDARDS.md`'s
  pure-module seam list, exception module list, watch flow, and term list.

### Seams tested (`test/upstream-accept.test.ts`, 17 tests, offline)

Pure module: identity (restyle by URL, media by slot, copy/chrome by path),
identity match and re-alarm on a moved fingerprint, normalization/sort order,
replacement dedupe. Baseline round-trip: `accepted` survives read→serialize, is
omitted when empty, and a malformed entry throws. `runWatch`: accept-drift
records and quiets, a plain run keeps the set without writing, a changed live
side re-alarms, a new difference still exits 1, media acceptance, restyle
acceptance, `refreshCandidates` (including a `since` removal), plus the
formatter blocks.

### Live evidence

`npm run upstream` against the committed baseline (hand-run): exit 0, 5
accepted (copy `/careers`; chrome `/faq`, `/press-center`, `/resources`,
`/upcoming-events`), `since` 0/0/0, refresh candidates empty — the steady state
spec user story 5 asks for. `--accept-drift` produced the committed accepted
set.

### Blind spots acceptance creates (recorded per the ticket)

- A recorded entry is keyed on the **live** side alone. Once accepted, a change
  to the **served** side that leaves live bytes untouched still matches and
  stays quiet; acceptance answers "has live moved since we looked", not "does
  served still equal live".
- The **restyle** tier names an asset, not a page, so it contributes nothing to
  the refresh rollup. An accepted restyle is cleared by a plain `--accept`
  (which advances the asset set), not by `--accept-drift`; on `--accept-drift`
  the previous asset set is kept so the restyle difference keeps being shown.
- Stale recorded entries that match nothing persist until the next
  `--accept-drift` replaces the set; a plain run never prunes.
- Index added/removed are never accept-able and always stay findings.

### Review (FIXED_POINT 07d543d, both axes in parallel sub-agents)

Standards — fixed:
- **CODING_STANDARDS.md not extended (hard).** Added
  `test/upstream-accept.test.ts` to the pure-module seam list (otherwise the new
  test was an unlicensed internals test), `regression/upstream-accept.mjs` to
  the deliberate-exception module list, and `--accept-drift` / **accepted drift**
  to the watch flow and term list.
- **Duplicated identity shape.** The media active-key and finding-filter now use
  `mediaSlotIdentity` from the acceptance module instead of re-spelling the
  `path\0slot` key.
- **`?? ''` fingerprint sentinel.** Replaced with `liveFingerprint`, which throws
  on a missing digest, so an empty string can never be recorded as an
  always-matching entry.

Standards — rejected:
- **Repeated tier cascades / Shotgun Surgery.** The three sites differ in
  purpose (identity, active filtering, presentation) and one shared `describe`
  would be an abstraction for a fifth tier the spec does not have — Speculative
  Generality. The concrete duplication (the media key) is fixed.
- **`readAccepted` re-validating the entry shape.** Repo precedent puts
  baseline-schema reading in `upstream-baseline.mjs`; a validator beside the
  writer is the intentional home.

Spec — fixed:
- **AC7: the ticket did not record the blind spot.** Recorded above.
- **Refresh rollup missed baseline (`since`) drift.** `refreshCandidates` now
  also names `since.added/removed/changed` pages, so every exit-1 page is named;
  pinned by a new test.

Spec — rejected:
- **"No test asserts on stdout text."** The new formatter assertions follow the
  existing seam in `test/upstream-watch.test.ts` ("prints the same findings the
  JSON report carries"), which asserts the human view shows the reported facts,
  not the formatting. Kept intentionally.
- **`--accept-drift` advances `verified`/row digests.** The accepted set says the
  baseline matches live while the served tree is known stale; advancing the
  reference on an explicit accept-family verb is what lets the plain run after
  it exit 0 (decision 10's baseline-dependent tiers). A plain run never stamps a
  date.
- **Restyle has no re-accept path.** Covered by the blind-spot note; the
  previous asset set is deliberately kept so an accepted restyle stays visible.
