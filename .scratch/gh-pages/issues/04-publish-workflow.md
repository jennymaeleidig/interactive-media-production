# 04: Publish workflow — gate, materialize, deploy

**What to build:** An Actions workflow that, on a push to the main branch and on
manual dispatch, runs the repository's typecheck, full test suite and production
build, then materializes the artifact and deploys it to GitHub Pages under the
`pages` concurrency group. A failing gate blocks the deploy, so the live site is
never the debugging surface. The workflow needs no manually stored secrets.

**Blocked by:** 01 (installs), 02 (materializer), 07 (this repo under the
porkbun domain — the host path chosen 2026-09-14; the alternative, 03, was
closed as not taken).

**Status:** resolved

- [x] A push to main triggers the workflow, and a failing test or build stops
      before materialization and leaves the live site unchanged.
- [x] A green run deploys the artifact and the site is reachable at its URL
      root — the bare host under 03, the custom domain under 07.
- [x] The homepage renders with its styles, images and media, and a sampled deep
      route resolves as a page (not a download or a listing).
- [x] The repository's existing typecheck, test and build are the gate; no second
      test pipeline is introduced.
- [x] The published artifact contains no symlinks or hard links.
- [x] Nothing from the build output is committed; the repository stays free of a
      materialized copy of the tree.
- [x] The first successful deploy's notes record the observed HTTP status for an
      extensionless deep route and for a POST to a form endpoint.

## Comments

**Implemented**: `.github/workflows/publish.yml` (commit `7e15671`, plus
`3637705` and `105c8d7`). The `build` job runs the repository's own gate —
`npm ci`, `npm run typecheck`, `npm test`, `npm run build` — then materializes
with `node pipeline/publish-artifact.mjs --out .tmp/publish`, asserts the artifact
carries no symlink or hard link, configures Pages and uploads it. The `deploy` job
(`needs: build`, the only holder of `pages: write` and `id-token: write`) publishes.
Actions are pinned to commit SHAs because the deploy job holds `id-token: write`.

**The gate is proven, not asserted.** The first run (2026-09-14, run
34856714952) failed at `Test`; `Build`, `Materialize`, `Assert no links`,
`Configure Pages`, `Upload` and the whole `deploy` job were **skipped**, so the
live site was untouched. The second run (34857106263) was green: `build` 2m41s,
`deploy` 30s.

**Two fixes the runner forced.** The first run failed on the clock, not on a
finding: `upstream-chrome` took 47.9 s against a 30 s per-test budget, while
`upstream-copy` passed at 25.6 s with one test at 18.5 s. Those budgets were
calibrated on a developer machine where the same work takes ~24 s and ~15 s.
`vitest.config.ts` now gives both tree-scanning projects `TREE_SCAN_TIMEOUT`
(120 s); the tests themselves are untouched and still have to pass. Separately,
the gate would have run on Node 20, which reached end-of-life in April 2026 — it
runs on Node 24.

**Measured on the live site** (`https://flocksafety.cam/`):

- `/` → 200, byte-identical to `served/index.html`
- `/accessibility-plan` → **200 directly, no 301 hop**, byte-identical to
  `served/accessibility-plan.html`
- `http://` → 301 → `https://`; `www` → 301 → the apex
- **a POST to a form endpoint** (`/api/forms/video-form/mktoForm_1009`) → **405**

**The spec's key unknown is settled.** The Actions build route resolves an
extensionless path exactly as the branch-published route did: `/<route>` is
served from the byte-identical `.html` sibling with a 200 and no redirect, so
Decision 3's directory fallback was never needed. Ticket 05 can build on this.

**No test surface was added**, per the spec's Testing Decisions: the pre-deploy
gate is the existing suite.

**Review, two axes (2026-09-14).** Both axes independently found the same real
defect: the link assertion passed *vacuously* when `.tmp/publish` was absent —
against a missing directory `find` errors and the substitution expands empty, so
"nothing to check" read exactly like "clean". Fixed in `e769fc4`: the step fails
first on an absent artifact and names the offending path, and the two `find`
predicates collapse into one union query. The predicate must be
`\( -type l -o -type f -links +1 \)` — bare `-links +1` matches every directory,
since each subdirectory raises its parent's link count. Verified against all four
cases: a real artifact passes; a missing artifact, a fixture symlink and a
fixture hard link each fail.

Standards also asked the no-links rule to cite its owner (now `spec.md`), and for
the gate's hand-restatement of `CODING_STANDARDS.md` "before finishing" to be
recorded as a coupling (a check added there does not join CI on its own). Spec
asked why `configure-pages` runs after the build, now explained in place: no base
path is consumed when the site is served from a URL root (Decision 7b).

Spec's one open judgement call — the gate runs Node 24 while `package.json` still
`engines: >=20` — is left as is. `engines` states the compatibility floor;
20 is EOL, so the gate runs the active LTS rather than an unsupported runtime.

Spec also noted crit 3 proved only HTML at the page level; assets were measured
afterwards over HTTPS and match their declared types byte-for-byte:
`image/webp`, `image/jpeg`, `image/svg+xml`, `font/woff2`, `text/css`.
