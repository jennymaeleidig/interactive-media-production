# 02 — The baseline, and the verified-in-sync date

Status: open
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

- [ ] with no baseline present, a run writes one and reports only the count, with
      no findings
- [ ] a second run against the same upstream reports no findings
- [ ] a fixture with a path added, a path removed, and a path whose status changed
      produces exactly one finding each, grouped by class
- [ ] `--accept` is the only code path that writes the baseline; a plain run never
      does
- [ ] a baseline accept round-trips: what a run records is what a later run reads
      as its previous state
- [ ] the baseline carries the verified date, and the baseline file is committed
- [ ] no run writes anywhere in the served tree
- [ ] `README.md` states the verified-in-sync date beside the snapshot's
      provenance, and `CONTEXT.md` defines the watch's vocabulary
- [ ] baseline read, diff and write are pure, pinned in their own vitest project
      row, and `npm test` stays offline
