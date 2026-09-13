# 05 — The mutation log owns its summary projection

Status: open
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

- [ ] One projection; `runPipeline`, `--dedupe-tree`, and `summarize` read it.
- [ ] No key is renamed or dropped in `build-log.json` /
      `build-summary.json` (compatibility surface) — verified by diffing the
      golden `build-log.json` and `build-summary.json`.
- [ ] A new metric is declared in one place (proven by the projection's test).
- [ ] `CODING_STANDARDS.md` stack/layout list names the module.
