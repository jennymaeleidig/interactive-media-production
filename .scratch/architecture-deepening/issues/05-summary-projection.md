# 05 — The mutation log owns its summary projection

Status: resolved
Blocked by: 04

## What to build

Review candidate 6. Every pass writes its own optional slice of the log
(`pipeline/build.mjs:1105–1130`, twenty optional properties); the whole-site
summary is a hand-written reduce over it (`:1286–1338`, eleven near-identical
`servedEntries.reduce(...)` lines for embeds alone); `dedupeTree` (`:1382–1475`)
re-implements the same accounting for tree mode; `summarize` (`:1476–1528`)
re-learns every field to print it.

Create the summary module: `project(entries) → BuildSummary` and
`render(summary) → the CLI lines`. A pass's metric is declared once.

## Acceptance criteria

- [x] One projection; `runPipeline`, `--dedupe-tree`, and `summarize` read it.
- [x] No key is renamed or dropped in `build-log.json` /
      `build-summary.json` (compatibility surface) — verified by diffing the
      golden `build-log.json` and `build-summary.json`.
- [x] A new metric is declared in one place (proven by the projection's test).
- [x] `CODING_STANDARDS.md` stack/layout list names the module.

## Comments

`pipeline/summary.mjs` owns the projection. `SUMMARY_GROUPS` is the metric
table — one row per whole-site number, naming the dotted log slice it folds
(`from`) and how (`sum` / `count` / `absent`), in the exact key order
`build-summary.json` is read through. `project(entries, run)` folds the served
entries into the summary (reproducing the former literal's key names, nesting,
and order); `render(summary)` returns the CLI lines the build prints. The
two ADR groups mix log-folded numbers with files on disk, so `bodyTotals` and
`assetTotals` own that arithmetic and are shared with `--dedupe-tree`, which
previously kept its own copy of the same shape.

`build.mjs` now calls `project(log, runFacts)` instead of the 44-line literal,
 `dedupeTree` calls `assetTotals`/`bodyTotals`, and `summarize` prints
 `render(summary)`; the hand-written local reduces and the `errors` /
 `chatMounted` / `servedEntries` intermediates are gone. The `BuildSummary`
 typedef moved to the module and `build.mjs` references it.

`test/summary.test.ts` pins the fold, the frozen top-level and per-group key
order, the helper shapes, and the render lines; one test appends a row to the
metric table and sees it flow into the projection unchanged, which is the
"declared in one place" proof.

Evidence: `.tmp/golden` tree diff empty (24 files, including
`build-summary.json`, byte for byte); full suite 369 tests green in 22 files;
`tsc --noEmit` clean.
