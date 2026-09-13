# The Recreation is a frozen snapshot

The Recreation was built under a policy of matching upstream: a Capture was
ground truth, and the piece was kept in step with the drifting live site through
a refresh workflow — re-inventory the live site, classify the drift, re-capture
what changed, at every phase gate and before final signoff. That workflow is
documented in full in the now-deleted `docs/capture-refresh-runbook.md`: three
hand-run ops tools (`pipeline/inventory.mjs`, `pipeline/inventory-diff.mjs`,
`pipeline/recapture.mjs`), the corrected SingleFile flag set as the default of
every run, drift classes with the route action each drives, and a policy tying
refreshes to gates.

The effort is over and the piece is done, so the policy is retired: **the
Recreation is a frozen snapshot of flocksafety.com as it stood on
2026-09-12, and it does not follow the live site.** Freshness is no longer a
goal, so there is no workflow to keep a copy in sync, no cadence, and no gate
that asks whether the live site has moved.

**Status.** Accepted 2026-09-13, retiring the capture-refresh policy the runbook
ratified.

**What the decision removes.**

- **`docs/capture-refresh-runbook.md`** — the procedure and the ratified policy.
- **The three ops tools and their tests** — `pipeline/inventory.mjs` (the
  live-site inventory walk), `pipeline/inventory-diff.mjs` (drift
  classification), `pipeline/recapture.mjs` (the Docker/SingleFile driver), and
  the `capture-refresh` vitest project over them.
- **The upstream probe** — `pipeline/video-probe.mjs` (Wistia media JSON,
  YouTube oembed, `yt-dlp --simulate`) and its playability output.
- **The `.gitignore` capture-run rules** — they existed to keep a future run's
  heavy HTML out of git.

Almost two thousand lines of live-site and registry-driving code, none of which
any suite member ran (they were hand-run ops tools by design, so nothing tests
them any more) and none of which can run at all any more: the captures are gone
and the snapshot is frozen, so a re-run could only produce a *different* site.

**What stays, and why.**

- **The build.** `npm run pipeline` and the build passes are the recipe the
  served tree came from, they are covered by `test/pipeline.test.ts` over a
  git-tracked fixture capture run, and `npm run build` / `npm run routes`
  exercise the served bytes. Deleting the pipeline would delete the only
  executable description of what the Recreation is.
- **The capture pointer** (`pipeline/config.mjs` → `CAPTURE_RUN`) — now a
  record of which run the tree came from rather than a switch to a fresh one.
- **The frozen page listing** (`regression/capture-list-2026-09-12.txt`, copied
  out before the scratch tree was scrapped) — the serving check's count
  invariant (served + dropped = the pages the build was asked for) compares the
  built tree against what it was built from, and a frozen snapshot can supply
  that record no other way.
- **`DEAD_VIDEO_IDS`** (`pipeline/config.mjs`) — frozen data. Five Wistia
  medias answer `{"error":true}` upstream, so the embed pass leaves those slots
  in their captured end-state (ADR 0002). The list was measured by the probe
  once; nothing re-derives it now, and no stale entry can be *corrected* by a
  later run, only by reading the served tree.
- **`pipeline/video-inventory.mjs`** — the detection module, not an inventory
  tool any more: pure string-in/IDs-out, it reaches no network, and its
  `wistiaFromPage` extractor is imported by the embed pass. The dated
  `videos.json` / `inventory.csv` / `yt-dlp-urls.txt` writer it used to carry —
  the download list the probe workflow fed — is gone with the workflow.

**Provenance.** How the snapshot was taken: the method has to outlive the
runbook, and the capture HTML is unrecoverable (gitignored, scrapped
2026-09-13), so the recipe is recorded here.

One full run — **1,200/1,200 pages saved, 0 failed** — on **2026-09-12**
through the `capsulecode/singlefile:latest` image, whose bundled `single-file`
CLI was invoked by `npx`; 4 parallel containers,
with the corrected flag set:

```
--remove-hidden-elements=false --remove-unused-styles=false
--save-original-urls --block-videos=false --blocked-url-pattern 'r2\.vidzflow\.com'
```

Every flag is load-bearing for fidelity:

- `--remove-hidden-elements=false` / `--remove-unused-styles=false` — SingleFile's
  defaults drop every hidden subtree and every state CSS rule, site-wide; a run
  without them is not usable ground truth (ticket 15).
- `--block-videos=false` — blocking video (the default) leaves a source-less
  `<video>` plus a link to the CDN file, so the page cannot play inline;
  unblocking embeds the `mp4` as a `data:` URI for the assets pass to serve
  from `/assets`.
- `--blocked-url-pattern 'r2\.vidzflow\.com'` — the Vidzflow media host streams
  video.js and never reaches network idle (the capture bloats to ~130 MB and
  stalls); ticket 19 strips those hidden player documents anyway.
- `--save-original-urls` — SingleFile empties every `iframe src` and re-inlines
  the frame document, and a cross-origin player (a YouTube embed) cannot be
  inlined, so without the flag the page keeps a src-less frame and the video is
  simply gone: 91 such frames across 74 pages in this run. With it, the emptied
  frame carries `data-sf-original-src`, `pipeline/embeds.mjs` points the frame
  back at it, and the build's bookkeeping pass drops the attribute from served
  bytes.

Two related methods died with the workflow and are recorded here for the same
reason: the **title fallback** (when the live site served an empty `<title>`,
the previous inventory's title was used instead — a Webflow republish
regression), and the **in-place refresh** (back up and delete an already-captured
page's file, then `--resume` with a `--scope`, because the skip rule was
unconditional; that is how the 2026-09-12 run's 74 lost frame URLs were
recovered after `--save-original-urls` was added).

**Considered options.** Keep the tools and the runbook, marked dormant —
rejected: a documented procedure is an invitation, the tools' live-site and
Docker drivers cannot run without the captures they would overwrite, and nothing
in the suite exercises them, so they would rot into misleading scaffolding.
Keep the runbook only, as history — rejected: a procedure whose tools are gone
is a trap, and git history holds both. Keep refreshing on demand rather than at
gates — rejected: that is the same workflow with a weaker trigger, and it still
makes "does our copy match the live site?" a question the piece answers.

**Consequences.**

- **`served/` is the permanent artifact.** Nothing re-derives it. The served
  tree is 660 MB (ADR 0003) and is what gets published; the phase-gate
  signoff (ticket 12) covers exactly these bytes.
- **Freshness has no owner.** If upstream changes, our copy does not — and
  that is the point, not a drift to detect. The retired vocabulary is recorded
  in `CONTEXT.md` so a reader meeting an old reference in git history knows it
  was retired deliberately.
- **The docs now describe a recipe, not a process.** `README.md` frames the
  pipeline as how the snapshot was made, `CODING_STANDARDS.md` drops the ops-tool
  seams and states the snapshot is frozen, and this ADR replaces the runbook as
  the record of the capture method.
- **Re-capturing is a new decision.** If the piece ever needed to follow
  upstream again, that is a fresh effort with a fresh ADR — the flag set above
  and the image tag are the starting point, and the tools are one `git show`
  away. The image tag (`latest`) pins no SingleFile version, so pin one before
  re-capturing.
