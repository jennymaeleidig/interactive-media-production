# Capture run — 2026-09-11 (corrected flags)

Full-site re-capture of www.flocksafety.com for ticket
[15-capture-config-hidden-content-and-unused-styles](../../../flock-parody-impl/issues/15-capture-config-hidden-content-and-unused-styles.md).
Same 1,199-page list as [2026-09-09](../2026-09-09/README.md), but captured with
SingleFile's two ground-truth-preserving flags instead of its defaults:

```
--remove-hidden-elements=false   keep subtrees not rendered at capture time
--remove-unused-styles=false     keep CSS rules that match no live element
```

The defaults had stripped every closed menu, take-over and modal panel, and every
open/active CSS rule, site-wide. This run is now the build's capture pointer
(`CAPTURE_RUN` in `pipeline/config.mjs`); the corrected flags are the default for
every future run (see [the refresh runbook](../../../flock-parody/issues/09-capture-refresh-runbook.md), step 3).

## Pipeline

- Same proven ticket-03 pipeline: Docker image `capsulecode/singlefile:latest`
  (colima; 4 CPUs / 6 GiB), 4 parallel containers, `npx single-file
  --browser-executable-path /usr/bin/chromium-browser --browser-wait-until
  networkIdle --browser-wait-delay 2000 --browser-load-max-time 45000
  --browser-capture-max-time 45000`, plus the two corrected flags.
- Driver: `.tmp/capture15.py` (throwaway, gitignored) — the ticket-03 driver plus
  the corrected flags.
- 13-page pilot across template families verified before the full walk.
- 17 blog pages failed transiently mid-walk (`Unreachable URL`): re-captured with
  the same driver and folded back into `capture-status.csv` (one row per page).

## Layout

- `capture-list.txt` — the 1,199 live pages, copied verbatim from 2026-09-09.
- `index.html`, `<path>.html` — captures, URL hierarchy preserved.
- `capture-status.csv` — per-page result (url, rel, exit, bytes, secs, verdict).
- `manifest-uncaptured.csv` — the same 80 intentionally-uncaptured pages as
  2026-09-09 (56 redirect stubs, 10 auth-gated `/events/test-*` stubs, 14 dead
  roots); it is inventory-derived, not capture-derived, so it is copied forward.
- `title-repairs.csv` — captures whose `<title>` was runtime-swapped and restored.
- `errors.log` — stderr of the transient failures that were retried.

## Result

**1,199 / 1,199 pages captured, 0 failed.** 13.94 GB (min 7.7 MB, max 66.5 MB,
median 10.8 MB) — **2.56× the 2026-09-09 run's 5.45 GB** (min 0.8 MB, max
33.2 MB, median 4.3 MB). The growth is the recovered ground truth: every hidden
subtree (the mega-menu panels' inlined lazy images ride along as SingleFile
`--sf-img-N` background custom properties), every state rule, and — through them —
more inlined assets.

- Titles: 1,094 matched the static ground truth on capture; **105** were
  runtime-swapped to "Message from Flock Safety" and restored from the
  2026-09-09 run's already-repaired titles, each logged in `title-repairs.csv`.
  (The swap fired on a different, smaller page set than on 2026-09-09 — it is
  the live VWO headline-banner behavior, not a fixed list.)

## What the corrected flags recovered

Measured by `.scratch/flock-parody-impl/evidence/15-capture-config/audit-capture.mjs`
(full report and JSON beside it):

| marker | 2026-09-09 | 2026-09-11 |
| --- | ---: | ---: |
| SingleFile `sf-hidden` occurrences | 84,334 | **0** |
| `.sf-hidden` hide rule | 1,199 pages | **0** |
| `.w-condition-invisible{display:none}` | 0 | 1,199 |
| `.nav__dd.show` | 0 | 1,197 |
| `.header-z.scroll` / `.header__bg.is-open` | 0 | 1,197 |
| `.header-wr{…position:sticky;top:0}` | 0 | 1,199 |
| `.w-dropdown-list` base + `.w--open` rules | 0 | 1,199 |
| `.w-tab-pane{display:none}` / `.w--tab-active{display:block}` | 0 / 2 | 1,199 / 1,199 |
| mega-menu panels (`nav__dd-content`) | 5,985 (all empty) | 10,773 (0 empty) |
| mobile take-over CTA rows | 1,197 | 2,394 |
| slider controls | 117 | 128 |
| condition-hidden elements | 22,876 | 52,209 |

The build's own audit stays clean on the rebuilt tree: 1,180 served pages, zero
executable capture-derived scripts, zero tracker residue, every page
`audit: clean`.
