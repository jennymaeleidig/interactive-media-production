Status: open
Type: task
Blocked by:

## Question

Nothing to decide alone — assemble the refresh runbook that keeps the inventory and captures live with www.flocksafety.com as it drifts, so any future session (or the build phases) can re-sync without re-deriving method. Both halves of the pipeline already exist and are proven; this ticket welds them into one repeatable procedure and proposes a default refresh policy for the user to ratify at spec time.

The runbook (written into the answer, referencing existing docs rather than restating them) must cover:

1. **Re-inventory** (from [ticket 01](01-full-site-inventory.md)'s method): robots.txt → sitemap.xml walk, nav crawl, pagination walks; output a fresh dated CSV in the same column format.
2. **Diff pass**: old inventory vs new — added / removed / retitled / status-changed paths; the diff drives what gets re-captured (added + retitled pages minimum; full re-capture at major gates).
3. **Re-capture** (from [ticket 03](03-full-site-capture.md)'s pipeline): new dated run folder `research/flocksafety/<run-date>/`, pilot batch → full walk, per-page status, uncaptured manifest, title-repair pass.
4. **Policy proposal** (user ratifies at spec): recommended triggers — e.g. re-inventory at spec freeze and at each build phase gate; re-capture added/changed pages immediately, full re-capture once before the final screenshot-diff signoff — plus where run folders live so git isn't fed 5+ GB per run (see the map's out-of-git note).
5. **Linkage**: how a refresh interleaves with the build (a changed page invalidates its Recreation route; ticket 05's diff check catches served-vs-capture drift).
