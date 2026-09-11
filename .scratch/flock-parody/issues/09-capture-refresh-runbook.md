Status: resolved
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

## Answer

Resolved 2026-09-10. The runbook below references the proven methods rather than restating them; any future session can execute it top to bottom. Headless-Chromium work runs via Docker (sandbox fact — see map Notes), so every capture step is runnable by the main agent or a herdr-spawned pane.

## Capture refresh runbook

**Invariants** (never violate): captures are ground truth — never edit a capture to match a build; run folders are dated and append-only; HTML stays out of git (`.gitignore` already wired: `research/flocksafety/**/*.html` ignored, all CSVs/MD tracked).

### 1. Re-inventory

Re-run ticket 01's method exactly as documented in [research/01-full-site-inventory.md](../research/01-full-site-inventory.md) (§ "Sitemap sources used" = robots.txt → sitemap.xml in full → homepage header+footer nav crawl → listing pagination walks (`/blog`, `/customers`, `/resources`, `/press-center`) → one verification pass over the union; ~1,700 requests). Produce a fresh CSV in **the same column format** (path, title, nav, type, status, redirect_target, url) at:

```
.scratch/flock-parody/research/inventory/<run-date>-full-site-inventory.csv
```

(`research/inventory/` is new — inventories are tracked artifacts independent of capture runs. The 2026-09-09 original stays where it is as the baseline.)

### 2. Diff pass

Diff the fresh CSV against the previous one (row key: `path`):

| Change class | Detection | Action it drives |
|---|---|---|
| **added** | path in new, not in old | re-capture (step 3) + new Recreation route |
| **removed** | path in old, not in new | drop Recreation route or map to 301 per manifest |
| **retitled** | `title` differs | re-capture (step 3); title repair pass uses the NEW inventory as ground truth |
| **status-changed** | `status` / `redirect_target` differs | regenerate the 301 manifest; re-capture only if the path became live 200 |
| **nav/type drift** | `nav` or `type` differs | no capture action; feeds the build pass (drop lists, form routing) |

Output: `<run-date>-diff.md` + `<run-date>-diff.csv` beside the fresh inventory. **Scope rule: added + retitled + newly-live pages get re-captured immediately; everything else waits for a full re-capture gate.** Sitemap/nav membership changes alone are not page changes — check the `path` set and `title` column, not the `nav` column, when counting drift.

### 3. Re-capture

Re-run ticket 03's pipeline exactly as documented in [research/flocksafety/2026-09-09/README.md](../research/flocksafety/2026-09-09/README.md) (image/CLI/flags, pilot batch of ~13 pages spanning template families verified end-to-end before any walk, 4 parallel containers, `--browser-capture-max-time 45000`). **Corrected flags are the default (ticket 15):** add `--remove-hidden-elements=false --remove-unused-styles=false`. SingleFile's defaults strip two classes of ground truth site-wide — subtrees not rendered at capture time (closed menus, take-overs, modal panels) and CSS rules matching no element at capture time (every open/active state). Ticket 14 hit that on the shared header; ticket 15 confirmed it in every component family, so the Recreation serves from the corrected run `2026-09-11` and every future run keeps the flags. New dated run folder `research/flocksafety/<run-date>/` with the same artifacts: `capture-list.txt`, per-page captures, `capture-status.csv`, `manifest-uncaptured.csv`, `title-repairs.csv`, `errors.log`.

- **Scoped refresh**: capture only the diff-driven page list; still write the full per-page status CSV (rows for skipped pages marked `skipped-stale-capture`). A scoped run does NOT overwrite an earlier run folder — the build's capture pointer moves to the new run folder only when the scoped pages have all been processed through the build passes (step 5).
- **Full re-capture** (at the gates below): capture the entire fresh live-200 list, exactly like 2026-09-09 (~77 min at 4 containers), then run the runtime title-swap repair pass against the new inventory's static titles.
- Always regenerate `manifest-uncaptured.csv` fresh (redirect stubs / auth-gated / dead roots move between runs) — ticket 05's 301 manifest derives from it.

### 4. Refresh policy — FOR USER RATIFICATION AT SPEC

| Trigger | Action |
|---|---|
| Spec freeze | Full re-inventory + diff; scoped re-capture of the drift |
| Each build phase gate | Full re-inventory + diff; scoped re-capture immediately |
| Before final screenshot-diff signoff | Full re-capture (whole site), then re-run the serving gate against the new run |
| Never during a phase | No refresh mid-phase — a refresh invalidates routes; do it between phases |

Rationale for the ratifier: full inventory is cheap (~1,700 requests, minutes); full capture is the expensive step (~77 min, 5.5 GB/run) — hence scoped re-captures between gates and one full pass before the final fidelity signoff.

### 5. Linkage with the build

- A **changed page invalidates its Recreation route**: re-run ticket 05's five-pass build (strip → link rewrite → form actions → story-hook seam) on that page from the fresh capture, then re-run its serving-gate diff (served vs capture minus strip list, 0 px, 3 viewports; see ticket 05's answer).
- **Removed pages**: drop the route; add a 301 (to its parent hub) or 410 to the redirect manifest from the fresh `manifest-uncaptured.csv`.
- **Served-vs-capture drift** between refreshes is caught by the same serving gate — if the site changed underneath an unrefreshed capture, the gate stays green (it compares against the capture, not the live site); only the inventory diff exposes live drift. This is why the policy ties refreshes to gates instead of watching the live site continuously.
- The capture pointer (which run folder the build serves from) is a single config value recorded in the spec — one switch moves the whole build to a new run.
