# 01: App skeleton & serving tracer

**What to build:** The thinnest complete path from a Capture to a served page. The Next.js app exists with a working build/dev/test loop, the repo's coding standards are documented, and the sandbox's known environment constraints are baked into the dev setup. A catch-all serving route answers original site paths from a build output tree; the build's first two passes — strip the third-party machinery, rewrite internal links — run over a small, representative page subset. Zero-outbound is established as an invariant on the served bytes.

**Blocked by:** None (can start immediately).

**Status:** resolved
Label: ready-for-agent

- [x] The app builds, starts, and serves; the test suite runs green.
- [x] Coding standards are filled in per the repo's stated process.
- [x] Known dev-environment constraints (watchpack polling, browserslist field) are encoded so dev and build work under the sandbox.
- [x] Requests to a captured page's original path return that page with trackers and the chat widget stripped.
- [x] Internal links in the served page resolve to Recreation routes; external links are unchanged.
- [x] Served bytes contain no executable scripts and no tracker residue beyond the intentionally kept footer link.
- [x] Unknown paths return 404.
- [x] The pipeline logs every mutation it makes, per page.

## Comments

**Implemented** (commit on `main`):

- **App** at the repo root: `app/[[...path]]/route.ts` (catch-all: served tree → 200, unknown → 404, traversal-safe; `SERVED_DIR` env override for tests), `npm run dev` (WATCHPACK_POLLING baked in) / `build` / `start` / `pipeline` / `typecheck` / `test`; `browserslist` in package.json. Verified: dev smoke, prod smoke, suite.
- **Pipeline** (`pipeline/build.mjs`, plain ESM + JSDoc): pass 1 strip (prototype's converged strip list + executable-script strip — see below), pass 2 link rewrite (internal → Recreation routes, queries/fragments and the one `?q_offer_info=` param kept verbatim; external live), write pass (mirrored tree, closing tags restored for truncated captures). Single capture pointer: `pipeline/config.mjs` `CAPTURE_RUN`. Subset: `pipeline/pages.list` (7 pages, one per template family).
- **Per-page mutation log** `served/build-log.json`: stripped per target (bytes), linksRewritten, restored, warnings, post-strip audit, script census.
- **Zero-outbound invariant**: served bytes carry only `application/ld+json` scripts. The fixture suite caught a REAL find: `/products/license-plate-readers` ships a frozen shadow-DOM reparenting `<script>` — now stripped and logged (the prototype counted it as JSON-LD).
- **Tests (21, green)** at the spec's two seams: pipeline-as-pure-transformation (fixture capture run in `test/fixtures/capture-run/`, git-tracked, mirrors the real corpus incl. unquoted attrs and truncated tails) + HTTP serving seam (vitest globalSetup: fixture pipeline → `next build` → `next start` on a free port with `SERVED_DIR` → real fetches).
- Real-capture run verified: 7/7 pages audit clean, 0 executable scripts, unknown/dead paths 404 (`/ebooks`).
- **Standards** `CODING_STANDARDS.md` filled in (stack, pipeline discipline, zero-outbound, testing at seams, sandbox constraints, before-finishing checklist); `README.md` added.

Notes for later tickets: the OneTrust audit keys on consent-stack machinery markers rather than the bare brand string (the kept footer `privacyportal.onestrust.com` link must survive); 301 redirect manifest lands with ticket 07, so legacy stubs 404 for now — same as the prototype's dead roots.
