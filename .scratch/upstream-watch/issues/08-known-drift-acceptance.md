# 08 — Known-drift acceptance and refresh candidates

Status: open
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

- [ ] a plain run whose only differences are recorded ones reports them as
      accepted and exits 0
- [ ] a difference matching no recorded entry is a finding and exits 1
- [ ] a recorded difference whose live side changes again re-alarms (the entry no
      longer matches)
- [ ] the accepted set is committed, reviewable in the diff, and only
      `--accept-drift` writes it; a plain run never moves it
- [ ] the report carries a refresh-candidate rollup naming every page with a
      non-accepted finding, and the index added/removed pages
- [ ] media liveness participates in the same acceptance despite being report-only
- [ ] `npm test` stays offline and green; the driver stays hand-run; the ticket
      records the blind spot that acceptance creates

## Comments
