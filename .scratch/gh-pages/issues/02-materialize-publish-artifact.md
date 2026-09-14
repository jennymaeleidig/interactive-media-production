# 02: Materialize the publish artifact from `served/`

**What to build:** A dependency-free publish step that turns the committed
`served/` tree into a static artifact directory. It copies the tree verbatim,
adds a route-path copy of every non-root page, generates one client-side redirect
page per entry in the redirect manifest, and writes a single `404.html` carrying
the serving layer's own not-found body. It refuses to run on a real-page
collision or an over-budget artifact, and it leaves `served/` byte-identical.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Running the step on the committed tree yields an artifact containing every
      served file at its same relative path, every non-root page additionally at
      `<route>/index.html`, one redirect page per manifest entry, and one
      `404.html` whose bytes equal the serving layer's not-found body.
- [x] `served/` is unchanged after a run (`git status` clean).
- [x] A redirect source that collides with a real page fails the run with a named
      error and writes nothing.
- [x] An artifact that would exceed the 1 GB published-site cap fails the run.
- [x] The route-mapping core is pure and unit-tested without a filesystem or
      network, in the repository's existing pure-core style.
- [x] Serving the artifact with any static file server at a site root renders the
      homepage and resolves a spot-checked deep route, with assets loading.

## Comments

**Implemented** (`pipeline/not-found.mjs`, `pipeline/publish-artifact.mjs`,
`test/publish-artifact.test.ts`, plus `lib/serving.ts` importing the shared body,
and `pipeline/served-tree.mjs`). The materializer is plain Node ESM with a pure
core — `planArtifact({ files, redirects })` → `{ entries, failures }`,
`redirectPageBytes`, `artifactBytes`, `budgetFailures` — and a thin fs edge
(`materialize`) that validates collisions and the byte budget before it writes
anything, then `rm -rf`s the output and rebuilds it. The CLI defaults to
`--served served --out .tmp/publish`.

**Verification** on 2026-09-14: `npm run typecheck`, `npm test` (24 files / 445
tests), `npm run build`, and `npm run routes` all green. The full-tree run wrote
**5,714 files / 831,402,109 bytes** (2,429 HTML = 1,181 original + 1,180 route
copies + 67 redirect pages + `404.html`), ~17% under the 1 GB cap, in ~3.9 s;
`served/` byte-identical before and after. Static-serve spot check: homepage 200,
deep route `/accessibility-plan` byte-identical to `served/accessibility-plan.html`,
a redirect source answers 200 with a meta refresh + canonical link, and `404.html`
is exactly `Not found`.

**Two review-driven corrections** (`/code-review`, two pi sub-agents):

- *Route rules live once.* The page→route and route→artifact-path mapping was a
  second copy of `pipeline/served-tree.mjs`'s `pageCandidates` rule. It now owns
  `routeOfPage` and `routeIndexFile`, and the artifact imports them, so the host's
  resolution and the artifact's route copies cannot drift.
- *Redirects mirror the serving layer.* The artifact only generates a redirect
  page for a local target (`isLocalTarget` from `run-manifest.mjs`); a non-local or
  protocol-relative target is treated as absent — exactly what `lib/serving.ts`
  does — so the artifact cannot answer a redirect the Recreation would 404, and its
  zero-outbound invariant holds. All 67 committed sources are local, so the
  acceptance count is unchanged. An absent `redirects.json` is also now read as an
  empty table rather than throwing `ENOENT`.

**Known fidelity gap** (recorded, not chased): a static host answers redirect
artifacts with 200, never the serving layer's 301. That is the cost of a static
host and is accepted by the spec.

**Follow-ups for 04/05:** the publish workflow (04) should run
`node pipeline/publish-artifact.mjs` and upload `.tmp/publish`; the post-deploy
smoke check (05) settles whether the Actions-built route resolves extensionless
paths like the branch-published route did.
