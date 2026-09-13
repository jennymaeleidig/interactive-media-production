# 02 — The strip audit becomes one module

Status: resolved
Blocked by: 01

## What to build

Review candidate 2. The invariant everything serves is computed by functions in
two pipeline modules and re-derived by a third: `pipeline/build.mjs:182–196`
(`AUDIT_RES`), `:313–339` (`stripExecutableScripts`), `:357–378` (`auditHtml`),
`:380–386` (`scriptCensus`); `pipeline/embeds.mjs:62` (`MEDIA_HOSTS`), `:309`
(`srcdocScripts`), `:363` (`unclassifiedRemoteRefs`), `:604`
(`offAllowlistFrames`); `regression/routes.mjs:119–133` (`auditFailures`).

Create `pipeline/audit.mjs` whose interface is `audit(pageHtml) → findings`,
with the media allow-list as its only configuration. The build writes findings;
the serving check folds them. ADR 0002 deliberately enforces the media exception
"by the audit rather than by construction" — the allow-list stays configuration
the audit reads, and the rewrite does not gain the rule.

## Acceptance criteria

- [x] `audit.mjs` owns the residue classes, the executable-script census, the
      allow-list, the `srcdoc` script check, and the unclassified-remote-ref
      check.
- [x] `build.mjs` and `regression/routes.mjs` both call it; the check no longer
      re-derives "clean" from the build log's key names.
- [x] The build log's per-page `audit` / `scripts` fields keep their current
      shapes (the frozen tree's `served/build-log.json` is read by the check).
- [x] `CODING_STANDARDS.md` "one invariant everything serves" names the module.
- [x] Fixture output byte-identical (`.tmp/golden` diff empty).

## Comments

The audit now lives in `pipeline/audit.mjs` with the interface the ticket named
(`audit(pageHtml) → findings`), owning the residue table (`AUDIT_RES`), the
`isInertScript` rule the strip pass and the census share, the census, the
`srcdoc`-payload check, the unclassified-fetch check, and the media allow-list.
`build.mjs` deleted its local `AUDIT_RES`/`auditHtml`/`scriptCensus`/`LD_JSON_TYPE`
and calls the module; its log fields are unchanged. `embeds.mjs` now imports
`MEDIA_HOSTS`, `hostOf`, and `decodeEntities` from the module and no longer
carries the four audit functions; the audit tests moved to `test/audit.test.ts`
(a new vitest project) and `test/embeds.test.ts` keeps the embed pass.

The check is the part that changed shape: `auditFailures(page, html)` now calls
`audit()` and `scriptCensus()` on the served bytes during the HTTP walk instead
of reading the build log's `audit`/`scripts` key names and classifying them
there. The check still reads `build-log.json` for the page list and counts, so
the log's shapes stay frozen for the tree that carries them — but the residue
classes and the census have one owner, and the failure wording one home.

Evidence: `.tmp/golden` tree and mutation log byte-identical; `npm run routes`
green against the frozen tree (1,290 routes; 1,181 byte-identical pages now also
re-audited in-process; 3,118 assets); 348 tests green in 19 files (`audit` 18,
`embeds` 30, `routes` 12); `tsc --noEmit` clean.
