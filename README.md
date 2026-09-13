# interactive-media-production

**The Recreation**: flocksafety.com — the entire site — served verbatim from
SingleFile Captures through a strip-and-rewrite pipeline, as a Next.js app.
Nothing in a served page reaches the network except the video slots' own
players (ADR 0002); every image, font, and sound is a local file. Domain
vocabulary and decisions: [CONTEXT.md](CONTEXT.md), [docs/adr/](docs/adr/).

## Run it

```bash
npm install

npm run pipeline   # capture run → served/ (whole site; a scoped build reads
                   #   pipeline/pages.list — one path per line). Needs the
                   #   captures, which are gone — see "The scratch tree" below
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

1. **Capture** — SingleFile snapshots of every live page (ground truth; out
   of git, reproducible via the
   [capture refresh runbook](docs/capture-refresh-runbook.md)). The build reads
   the run named by the capture pointer (`pipeline/config.mjs`). The
   signed-off run behind the current `served/` tree has been scrapped — see
   [The scratch tree](#the-scratch-tree).
2. **Build** (`pipeline/build.mjs`) — per page: strip the third-party
   machinery, rewrite internal links to Recreation routes, route forms to
   local mock APIs, normalize captured animation from-states, inject the
   motion / interactions / story-hook layers inline, restore the closing tags
   SingleFile truncates, and log every mutation to `served/build-log.json`.
   Build-level outputs: `served/redirects.json` (the run manifest's legacy
   stubs → local targets) and `served/build-summary.json` (the whole-site
   counts). Scaffold/test pages (`pipeline/config.mjs` `DROPPED_PAGES`) are
   never written.
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

## Refreshing ground truth

As the live site drifts, sync the Recreation between build phases — see
[docs/capture-refresh-runbook.md](docs/capture-refresh-runbook.md) for the
procedure and the ratified policy. The three ops tools (network + Docker; run
by hand, never by `npm test`):

```bash
node pipeline/inventory.mjs --date <run-date>                  # re-inventory
node pipeline/inventory-diff.mjs --old <prev.csv> --date <run-date>   # classify drift
node pipeline/recapture.mjs --inventory <fresh.csv> --scope <recapture.txt> \
  --fallback-inventory <prev.csv> --date <run-date>
```

`--fallback-inventory` keeps the real static title on the pages the live site
currently serves with an empty `<title>` (a Webflow republish regression); see
the runbook's title ground-truth note.

## The scratch tree

The initial effort's working tree — `.scratch/`, 34.5 GB: the 2026-09-12
capture run (1,200 pages of captured HTML, gitignored), the inventories, the
tickets and evidence, the snapshot-serving prototype, plus this repo's own
`.tmp/` build experiments — was scrapped when the effort closed (2026-09-13).
What that means:

- **`served/` is the artifact.** The built tree the captures produced is kept
  in full; nothing about serving, `npm run build`, or the DOM/HTTP test suite
  depended on the scratch tree.
- **`npm run pipeline` needs a fresh capture.** It reads 1,200 capture files
  that no longer exist, so a full re-inventory + re-capture (the runbook's
  procedure, ~77 min) is a precondition for running it again. The same goes
  for the ops tools (`pipeline/inventory*.mjs`, `recapture.mjs`,
  `video-inventory.mjs`, `video-probe.mjs`): they work, and they now write to
  `research/` at the repo root instead of `.scratch/`.
- **`npm run routes` still runs.** It needs one thing from the run — the page
  listing behind its count invariant — and that listing is frozen at
  `regression/capture-list-2026-09-12.txt` (`CAPTURE_LIST` in
  `pipeline/config.mjs`).
- **The record survives in git.** The tickets, spec, evidence, and prototype
  sources were tracked (555 files), so `git show <commit>:.scratch/...` still
  has them; only the gitignored captures are unrecoverable.
- **New work still starts in `.scratch/`.** That is where the issue-tracker
  convention puts an effort's tickets ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md));
  the scrapped tree was that convention's first effort, not the convention.
