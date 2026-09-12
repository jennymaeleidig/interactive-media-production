# 11: Capture refresh runbook

**What to build:** The procedure and tooling that keep ground truth current as the live site drifts. A re-inventory walk (robots, sitemaps, navigation crawl, pagination walks) produces a dated inventory in the established column format; a diff against the previous inventory classifies added, removed, retitled, and status-changed paths; a scoped re-capture driver captures the drift into a new dated run folder. Heavy capture artifacts stay out of version control while inventories and markdown stay tracked.

**Blocked by:** None (can start immediately).

**Status:** resolved
Label: ready-for-agent

- [x] Re-inventory produces a dated CSV in the established column format.
- [x] The diff classifies changed paths and identifies exactly what needs re-capturing.
- [x] A scoped re-capture writes a new dated run folder without overwriting earlier runs.
- [x] Removed pages yield route or redirect actions.
- [x] Heavy capture HTML stays gitignored; inventories and reports stay tracked.
- [x] The runbook records the policy: re-inventory at spec freeze and each phase gate, scoped re-capture immediately, one full re-capture before final signoff, never mid-phase.

## Comments

**Corrected flags are the capture default (ticket 15, 2026-09-11).** Every run — full or scoped — must pass `--remove-hidden-elements=false --remove-unused-styles=false` to SingleFile. The 2026-09-09 run used the defaults, which dropped every subtree not rendered at capture time (closed menus, take-overs, modal panels) and every CSS rule matching no element (all open/active state rules), so the Recreation lost its interaction ground truth site-wide; ticket 14 hit it on the shared header, ticket 15 confirmed it in every component family. The canonical procedure now lives in [the wayfinding runbook answer](../../flock-parody/issues/09-capture-refresh-runbook.md), step 3, which records the flags and the reason; the corrected run `2026-09-11` is the build's capture pointer (`pipeline/config.mjs`).

**Resolved 2026-09-12.** Three ops tools under `pipeline/`, each with pure
cores unit-tested (`test/inventory.test.ts` 33, `test/inventory-diff.test.ts`
13, `test/recapture.test.ts` 17) and a hand-run CLI: `pipeline/inventory.mjs`
(the robots → sitemap → nav/pagination walk, writing
`research/inventory/<date>-full-site-inventory.csv`),
`pipeline/inventory-diff.mjs` (added/removed/retitled/status/nav/type classes,
the re-capture scope, and route actions), and `pipeline/recapture.mjs` (the
scoped `capsulecode/singlefile` driver into a fresh dated run folder behind the
non-overwrite guard). Ran the tool end to end: the 2026-09-12 re-inventory
wrote 1,290 rows (1,200 live) and the 2026-09-09 → 2026-09-12 diff wrote
`2026-09-12-diff.md` / `-diff.csv` / `-recapture.txt` (22 added, 11 removed, 60
retitled, 0 status/type changed, 7 nav advisory, 0 route actions); the Docker
capture path was smoke-tested with the corrected ticket-15 flags on. The durable
policy lives in `docs/capture-refresh-runbook.md`, with `README.md` linking it.

**Title ground truth (found while diffing, fixed here).** The live site now
serves a literally empty static `<title>` on ~54 pages (a Webflow republish
regression confirmed in the browser: empty `document.title` and `og:title`, H1
still real). The fresh inventory is still title ground truth, but an empty
title is a regression, not the page's real static title (user story 7), so
`runRecapture` gained `--fallback-inventory`: when the fresh title is empty it
uses the prior inventory's non-empty title instead of blanking the capture; a
missing fallback keeps the empty title (what the live static HTML serves). The
diff records the regression as retitled rows either way.
