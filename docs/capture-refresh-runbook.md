# Capture refresh runbook

How the Recreation stays synced to the drifting live site: re-inventory, diff,
scoped re-capture. The method is ticket 01 (inventory) and ticket 03 (capture),
re-run through the tools in `pipeline/`; this file is the procedure, the policy,
and the invariants, not a restatement of how the tools work.

Source of the method and the policy's rationale:
[`.scratch/flock-parody/issues/09-capture-refresh-runbook.md`](../.scratch/flock-parody/issues/09-capture-refresh-runbook.md)
(wayfinding). The policy below is the one the spec ratified (spec, Quality
bar 35 / "The capture refresh runbook governs drift").

## Invariants — never violate

- **Captures are ground truth.** Never edit a capture to match the build. When
  served and capture disagree, the capture wins.
- **Run folders are dated and append-only.** A refresh writes a new
  `research/flocksafety/<run-date>/`; it never overwrites an earlier run. The
  driver refuses an occupied run folder (`assertFreshRunDir`).
- **Heavy HTML stays out of git.** `.gitignore` ignores
  `research/flocksafety/**/*.html` and `walk.log`; inventories, diff reports,
  capture lists, status CSV, and manifests stay tracked.
- **Corrected SingleFile flags are the default** — every run, scoped or full,
  passes `--remove-hidden-elements=false --remove-unused-styles=false
  --block-videos=false --blocked-url-pattern 'r2\.vidzflow\.com'` (tickets 15,
  12). The hidden/unused defaults drop every hidden subtree and every state CSS
  rule, site-wide; a run without them is not usable ground truth. Blocking
  videos (SingleFile's default) leaves a source-less `<video>` plus a link to
  the CDN file, so the page cannot play inline; unblocking them embeds the mp4
  as a `data:` URI for the assets pass to serve from `/assets`. The Vidzflow
  media host is re-blocked because its video.js tech streams and never reaches
  network idle — the capture bloats to ~130 MB and stalls — and ticket 19 strips
  those hidden player documents anyway.

## The tools

| Step | Tool | Needs |
| --- | --- | --- |
| 1. Re-inventory | `pipeline/inventory.mjs` | network |
| 2. Diff | `pipeline/inventory-diff.mjs` | — |
| 3. Re-capture | `pipeline/recapture.mjs` | Docker (`capsulecode/singlefile`) |

All three are ops tools: run by hand, never by `npm test`. Their pure
parsers/diff/bookkeeping are unit-tested (`test/inventory*.test.ts`,
`test/recapture.test.ts`).

## 1. Re-inventory

Re-runs ticket 01's method: robots.txt → sitemap.xml in full → homepage
header/footer nav crawl → listing pagination walks (`/blog`, `/customers`,
`/resources`, `/press-center`, stepping Webflow's `w-pagination-next` to the
last page) → one verification pass over the union. Output: a dated CSV in the
established column format (`path,title,nav,type,status,redirect_target,url`) at:

```
.scratch/flock-parody/research/inventory/<run-date>-full-site-inventory.csv
```

```bash
node pipeline/inventory.mjs --date 2026-09-12
```

Inventories are tracked artifacts independent of capture runs, so they live in
`research/inventory/`, not inside a capture run. The 2026-09-09 original
(`research/01-full-site-inventory.csv`) stays put as the baseline.
`--limit N` verifies only the first N discovered URLs (smoke testing).

## 2. Diff

Diffs the fresh inventory against the previous one, keyed on `path`:

```bash
node pipeline/inventory-diff.mjs \
  --old .scratch/flock-parody/research/01-full-site-inventory.csv \
  --new .scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv \
  --date 2026-09-12 --old-label 2026-09-09
```

| Change class | Detection | Action it drives |
| --- | --- | --- |
| **added** | path in new, not in old | re-capture (step 3) + new Recreation route |
| **removed** | path in old, not in new | drop the route (404/410) or map the new redirect |
| **retitled** | `title` differs | re-capture; title repair uses the NEW inventory as ground truth |
| **status-changed** | `status` / `redirect_target` differs | regenerate the manifest; re-capture only if the path became live `200` |
| **nav/type drift** | `nav` or `type` differs | no capture action; feeds the build pass (drop lists, form routing) |

Outputs, beside the fresh inventory:

- `<run-date>-diff.md` — counts, the immediate re-capture list, the route
  actions, advisory drift.
- `<run-date>-diff.csv` — one row per changed path.
- `<run-date>-recapture.txt` — the re-capture scope, one URL per line.

**Scope rule:** added + retitled + newly-live pages (a path that was not live
`200` and now is) are re-captured immediately. Everything else waits for a full
re-capture gate. Sitemap/nav membership changes alone are not page changes —
count drift on the `path` set and the `title` column, not the `nav` column.

Because only live `200` pages are captured, the diff's class counts can exceed
the scope list on their face: added redirect stubs or dead roots, and `retitled`
rows whose new status is no longer `200`, are classified but never captured (a
stub or dead page is a route action, not a capture). The scope file is the
capture list; the diff table is the full drift record.

**Removed pages** are route actions, not captures: a page that was live and is
gone yields `drop-route`; one that now redirects yields `redirect` with its new
target. The tool emits these in the diff report and CSV; the build turns them
into the serving route's 404s and `redirects.json`.

**Empty-title drift.** The live site currently serves an empty static
`<title>` on ~54 pages (a Webflow republish regression), and the runtime
"Message from Flock Safety" swap still fires on some of them, so the diff
reports them as `retitled` with an empty new title. The inventory stays the
ground truth, but an empty title is a regression, not the page's real static
title (spec user story 7): pass `--fallback-inventory` (the previous inventory)
to the re-capture so the title repair keeps the last known real title instead
of blanking the capture. The diff's retitled rows are the record of the drift.

## 3. Re-capture

Re-runs ticket 03's pipeline: a pilot batch spanning template families verified
end-to-end first, then 4 parallel `capsulecode/singlefile` containers. Artifacts
in `research/flocksafety/<run-date>/`: `capture-list.txt`, per-page captures,
`capture-status.csv`, `manifest-uncaptured.csv`, `title-repairs.csv`,
`errors.log`.

```bash
# scoped refresh (the diff's re-capture list)
node pipeline/recapture.mjs \
  --inventory .scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv \
  --scope .scratch/flock-parody/research/inventory/2026-09-12-recapture.txt \
  --fallback-inventory .scratch/flock-parody/research/01-full-site-inventory.csv \
  --date 2026-09-12 --parallel 4

# full re-capture at a gate: omit --scope
node pipeline/recapture.mjs --inventory ... --fallback-inventory ... --date 2026-12-01 --parallel 4
```

- The driver never overwrites an earlier run folder; a scoped run gets its own
  dated folder. Re-run a partial run with `--resume` (merges retries by URL and
  appends only capture-list URLs not already listed).
- `--dry-run` prints the capture list and manifest without writing.
- The title repair pass restores each capture's static `<title>` from the fresh
  inventory (the live script swaps it to "Message from Flock Safety" on some
  pages) and logs every repair in `title-repairs.csv`. When the fresh inventory
  title is empty, `--fallback-inventory`'s non-empty title is used instead (see
  empty-title drift above); with no fallback the empty title is kept, matching
  what the live static HTML serves.
- `manifest-uncaptured.csv` is regenerated fresh every run — redirect stubs,
  dead roots, and auth-gated stubs move between runs, and ticket 05's 301
  manifest derives from it.
- `capture-status.csv` is the **full per-page** status even on a scoped run:
  pages outside the scope are recorded as `skipped-stale-capture` (their
  capture comes from the previous run), so the run folder always describes the
  whole live set. `errors.log` is written every run, empty when nothing failed.
- A scoped run does **not** move the build's capture pointer. The pointer moves
  only when every scoped page has been processed through the build passes
  (step 5).

## 4. Policy

| Trigger | Action |
| --- | --- |
| Spec freeze | Full re-inventory + diff; scoped re-capture of the drift |
| Each build phase gate | Full re-inventory + diff; scoped re-capture immediately |
| Before final side-by-side signoff | Full re-capture (whole site), then re-run the serving gate against the new run |
| Never during a phase | No refresh mid-phase — a refresh invalidates routes; do it between phases |

Full inventory is cheap (~1,300 requests, minutes); full capture is the
expensive step (~77 min, 5.5–14 GB/run) — hence scoped re-captures between
gates and one full pass before the final fidelity signoff.

## 5. Linkage with the build

- **A changed page invalidates its Recreation route.** Re-run the build passes
  (`npm run pipeline`) on that page from the fresh capture, move
  `CAPTURE_RUN` in `pipeline/config.mjs` to the new run folder, rebuild
  (`npm run build`), and re-run `npm run routes`.
- **Removed pages:** drop the route; add the diff's `redirect` action to the
  serving table or let it 404 per the new status.
- **Served-vs-capture drift** between refreshes stays green — the serving gate
  compares served bytes against the capture, not the live site, so only the
  inventory diff exposes live drift. That is why refreshes are tied to gates
  rather than watching the live site continuously.
- The capture pointer is a single config value: one switch moves the whole
  build to a new run.
