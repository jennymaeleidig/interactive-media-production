# 11: Capture refresh runbook

**What to build:** The procedure and tooling that keep ground truth current as the live site drifts. A re-inventory walk (robots, sitemaps, navigation crawl, pagination walks) produces a dated inventory in the established column format; a diff against the previous inventory classifies added, removed, retitled, and status-changed paths; a scoped re-capture driver captures the drift into a new dated run folder. Heavy capture artifacts stay out of version control while inventories and markdown stay tracked.

**Blocked by:** None (can start immediately).

**Status:** open
Label: ready-for-agent

- [ ] Re-inventory produces a dated CSV in the established column format.
- [ ] The diff classifies changed paths and identifies exactly what needs re-capturing.
- [ ] A scoped re-capture writes a new dated run folder without overwriting earlier runs.
- [ ] Removed pages yield route or redirect actions.
- [ ] Heavy capture HTML stays gitignored; inventories and reports stay tracked.
- [ ] The runbook records the policy: re-inventory at spec freeze and each phase gate, scoped re-capture immediately, one full re-capture before final signoff, never mid-phase.

## Comments

**Corrected flags are the capture default (ticket 15, 2026-09-11).** Every run — full or scoped — must pass `--remove-hidden-elements=false --remove-unused-styles=false` to SingleFile. The 2026-09-09 run used the defaults, which dropped every subtree not rendered at capture time (closed menus, take-overs, modal panels) and every CSS rule matching no element (all open/active state rules), so the Recreation lost its interaction ground truth site-wide; ticket 14 hit it on the shared header, ticket 15 confirmed it in every component family. The canonical procedure now lives in [the wayfinding runbook answer](../../flock-parody/issues/09-capture-refresh-runbook.md), step 3, which records the flags and the reason; the corrected run `2026-09-11` is the build's capture pointer (`pipeline/config.mjs`).
