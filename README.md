# interactive-media-production

**The Recreation**: flocksafety.com — the entire site — served verbatim from
SingleFile Captures through a strip-and-rewrite pipeline, as a Next.js app.
Nothing in a served page reaches the network except the video slots' own
players (ADR 0002); every image, font, and sound is a local file.

It is a **frozen snapshot**: the site as it stood on 2026-09-12, not a
mirror that follows the live site. There is no refresh workflow, by decision
([ADR 0004](docs/adr/0004-frozen-snapshot-no-upstream-sync.md)). Domain
vocabulary and decisions: [CONTEXT.md](CONTEXT.md), [docs/adr/](docs/adr/).

## Run it

```bash
npm install

npm run pipeline   # capture run → served/ (whole site; a scoped build reads
                   #   pipeline/pages.list — one path per line). The recipe the
                   #   snapshot was built with: it needs the captures, which are
                   #   gone, and there is no re-capture path (ADR 0004)
npm run dedupe     # apply the body-dedupe pass to an existing served/ tree in
                   #   place (ADR 0003) — the same pass the build runs, for the
                   #   frozen tree when there is no capture run to rebuild from
npm run build      # production build
npm run start      # serve the captured pages at their original paths
npm run dev        # dev server (WATCHPACK_POLLING baked in — sandbox needs it)

npm test           # full suite: pipeline + HTTP serving-seam + DOM-seam +
                   #   serving-check pure-core tests
npm run typecheck  # tsc --noEmit
npm run routes     # full-scale serving check over HTTP (~10 s): every live
                   #   page 200 with a byte-identical body, every legacy stub
                   #   301, every dead root / dropped scaffold-test page 404,
                   #   every page's strip audit clean
```

## How it works

1. **Capture** — a SingleFile snapshot of every live page, taken once, on
   2026-09-12: the ground truth the Recreation reproduces and the run the
   served tree came from. It is **not refreshed** (ADR 0004), and the run
   itself is gone with the scratch tree (see [The scratch tree](#the-scratch-tree));
   what the build needs from it is recorded in
   `regression/capture-list-2026-09-12.txt`.
2. **Build** (`pipeline/build.mjs`) — per page: strip the third-party
   machinery, rewrite internal links to Recreation routes, route forms to
   local mock APIs, normalize captured animation from-states, inject the
   motion / interactions / story-hook layers, restore the closing tags
   SingleFile truncates, then ship the page's stylesheets and scripts as
   content-addressed files (ADR 0003) and log every mutation to
   `served/build-log.json`. Build-level outputs: `served/redirects.json` (the
   run manifest's legacy stubs → local targets) and `served/build-summary.json`
   (the whole-site counts). Scaffold/test pages (`pipeline/config.mjs`
   `DROPPED_PAGES`) are never written.
3. **Serve** (`app/[[...path]]/route.ts`) — a catch-all route answers
   original site paths from `served/`; a miss answers `redirects.json` with a
   permanent redirect (legacy stubs); dead collection roots, auth-gated stubs,
   and dropped scaffold/test pages 404, reproducing the live site's observed
   behavior.
4. **Verify** (`regression/routes.mjs`) — `npm run routes` starts the
   production server and asserts, over HTTP, every route class at full scale
   plus **byte-identity**: every served page's body must equal the file the
   build wrote (same bytes ⇒ same pixels, so this is the serving layer's
   whole guarantee). Visual fidelity and strip deltas are the human
   side-by-side at the phase gates (ticket 12); the per-page strip decision is
   recorded in the build log. There is no pixel gate — see
   [CODING_STANDARDS.md](CODING_STANDARDS.md) for why it was retired.

Coding rules: [CODING_STANDARDS.md](CODING_STANDARDS.md). Domain vocabulary:
[CONTEXT.md](CONTEXT.md).

## The snapshot

The ground truth is the **frozen capture**: every live page as it stood on
**2026-09-12**, taken with the `capsulecode/singlefile:latest` image's bundled
`single-file` CLI and this flag set (the image tag pins no version, so the exact
SingleFile build is not recorded — see [ADR 0004](docs/adr/0004-frozen-snapshot-no-upstream-sync.md)):

```
--remove-hidden-elements=false --remove-unused-styles=false
--save-original-urls --block-videos=false --blocked-url-pattern 'r2\.vidzflow\.com'
```

Each flag is load-bearing for fidelity, and the reasons are recorded in
[ADR 0004](docs/adr/0004-frozen-snapshot-no-upstream-sync.md): the first two
keep hidden subtrees and state CSS (without them a run is not usable ground
truth), `--block-videos=false` embeds each `<video>` source as a `data:` URI
for the assets pass to serve locally, the Vidzflow block keeps a
never-idle video.js host out of the capture, and `--save-original-urls` is what
leaves a **frame's** URL in the capture at all — SingleFile empties every
`iframe src`, and a cross-origin player cannot be inlined, so 91 frames across
74 pages would otherwise be gone.

The snapshot is not refreshed. Re-inventorying the live site, diffing drift, and
scoped re-captures were retired with the refresh workflow (ADR 0004); the
gitignored capture HTML is unrecoverable, and the tools that produced it are in
git history only. `served/` is the artifact — the reason the pipeline above is
described as a recipe rather than a runnable build.

## Publishing

The built tree is static HTML plus hashed files, so serving it needs no export
step — but two constraints come from the build's own shape:

- **It must live at a site root**, not under a path. Every reference is
  root-absolute (`/assets/<sha16>.<ext>`, `/products/gun-detection`), so a
  project-page URL (`https://<owner>.github.io/<repo>/`) 404s every asset
  unless a publish step rewrites the prefix.
- **Size is the binding limit.** GitHub Pages caps a published site at 1 GB and
the tree measured 2.36 GB before ADR 0003: 89% of it was the same stylesheets
re-encoded on all 1,181 pages. Pass 14 now ships each body once — the tree is
**660 MB** (HTML 149 MB, assets 513 MB) — and 158 body files are in
`assets.json`, so `npm run routes` verifies their bytes and content types like
any other asset.

An educational reproduction of this kind also needs a visible non-affiliation
disclaimer on the published site (it is not yet in the build), and the captured
consent/tracker machinery must stay stripped — it is: the strip audit fails the
build on tracker residue, and the tree carries no live analytics tag.

## The scratch tree

The initial effort's working tree — `.scratch/`, 34.5 GB: the 2026-09-12
capture run (1,200 pages of captured HTML, gitignored), the inventories, the
tickets and evidence, the snapshot-serving prototype, plus this repo's own
`.tmp/` build experiments — was scrapped when the effort closed (2026-09-13).
What that means:

- **`served/` is the artifact.** The built tree the captures produced is kept
  in full; nothing about serving, `npm run build`, or the DOM/HTTP test suite
  depended on the scratch tree.
- **`npm run pipeline` cannot run again.** It reads 1,200 capture files that no
  longer exist, and the snapshot is frozen, so there is nothing to re-capture
  into (ADR 0004). The build stays as the recipe the tree came from and is
  exercised by `test/pipeline.test.ts` over a fixture capture run.
- **`npm run routes` still runs.** It needs one thing from the run — the page
  listing behind its count invariant — and that listing is frozen at
  `regression/capture-list-2026-09-12.txt` (`CAPTURE_LIST` in
  `pipeline/config.mjs`).
- **The record survives in git.** The tickets, spec, evidence, and prototype
  sources were tracked (555 files), so `git show <commit>:.scratch/...` still
  has them; the retired refresh workflow — the runbook and the inventory /
  diff / re-capture / video-probe tools — is one commit further on in history,
  at the commit before the snapshot was declared final. Only the gitignored
  captures are unrecoverable.
- **New work still starts in `.scratch/`.** That is where the issue-tracker
  convention puts an effort's tickets ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md));
  the scrapped tree was that convention's first effort, not the convention.
