# 02 — The strip audit becomes one module

Status: open
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

- [ ] `audit.mjs` owns the residue classes, the executable-script census, the
      allow-list, the `srcdoc` script check, and the unclassified-remote-ref
      check.
- [ ] `build.mjs` and `regression/routes.mjs` both call it; the check no longer
      re-derives "clean" from the build log's key names.
- [ ] The build log's per-page `audit` / `scripts` fields keep their current
      shapes (the frozen tree's `served/build-log.json` is read by the check).
- [ ] `CODING_STANDARDS.md` "one invariant everything serves" names the module.
- [ ] Fixture output byte-identical (`.tmp/golden` diff empty).
