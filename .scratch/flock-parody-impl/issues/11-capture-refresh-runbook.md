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
