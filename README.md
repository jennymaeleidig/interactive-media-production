# interactive-media-production

**The Recreation**: flocksafety.com — the entire site — served verbatim from a
frozen SingleFile capture, as a Next.js app. Nothing in a served page reaches
the network except the video slots' own players (the media allow-list); every
image, font, and sound is a local file.

It is a **frozen snapshot**: the site as it stood on 2026-09-12, not a mirror
that follows the live site — and the tree that snapshot produced is committed at
`served/`. Nothing here can rebuild it: the captures are gone, and the build that
read them is retired. Domain vocabulary: [CONTEXT.md](CONTEXT.md).

## Run it

```bash
npm install

npm run build      # production build
npm run start      # serve the captured pages at their original paths
npm run dev        # dev server (WATCHPACK_POLLING baked in — sandbox needs it)

npm test           # full suite: the HTTP serving seam + a DOM seam per injected
                   #   runtime + the serving-check pure cores
npm run typecheck  # tsc --noEmit
npm run routes     # full-scale serving check over HTTP (~10 s): every live
                   #   page 200 with a byte-identical body, every legacy stub
                   #   301, every dead root / dropped scaffold-test page 404,
                   #   every page's strip audit clean
npm run upstream   # the upstream watch: is live flocksafety.com still matching
                   #   the snapshot? hand-run; reads upstream, writes only the
                   #   committed baseline (and --out evidence), never served/

node pipeline/publish-artifact.mjs   # materialize the Publish artifact into
                   #   .tmp/publish (gitignored) — what the workflow uploads
```

There is no rebuild step and no build input: `served/` — 660 MB, 4,466 files,
1,181 pages — is the artifact, committed like the source that serves it.
Publishing copies it and never re-derives it; see
[Publishing](#publishing).

## How it works

1. **The capture** — a SingleFile snapshot of every live page, taken once, on
   2026-09-12: the ground truth the Recreation reproduces. It is **not
   refreshed**, and the run itself is gone with the scratch tree (see
   [The scratch tree](#the-scratch-tree)); the page listing it recorded is kept
   at `regression/capture-list-2026-09-12.txt`.
2. **The tree** (`served/`) — what a retired build made from that capture, kept
   as the artifact: per page, the third-party machinery stripped, internal links
   rewritten to Recreation routes, forms routed to local mock APIs, captured
   animation from-states normalized, the motion / interactions / nav / chat /
   story-hook / scroll layers injected as marked content-addressed assets (plus
   the page-scoped `legibility` patch on `/safe-cities`), the closing tags
   SingleFile truncates restored, and every stylesheet/script body
   of at least 1 KB shipped once instead of re-encoded on all 1,181 pages. The
   build's own record of each page is `served/build-log.json`; the whole-site
   counts are `served/build-summary.json`, and the redirect table is
   `served/redirects.json`. Scaffold/test pages (`pipeline/config.mjs`
   `DROPPED_PAGES`) were never written.
3. **Serve** (`app/[[...path]]/route.ts`) — a catch-all route answers original
   site paths from `served/`; a miss answers `redirects.json` with a permanent
   redirect (legacy stubs); dead collection roots, auth-gated stubs, and dropped
   scaffold/test pages 404, reproducing the live site's observed behavior.
4. **Verify** (`regression/routes.mjs`) — `npm run routes` starts the production
   server and asserts, over HTTP, every route class at full scale plus
   **byte-identity**: every served page's body must equal the file in the tree
   (same bytes ⇒ same pixels, so this is the serving layer's whole guarantee).
   Visual fidelity and strip deltas are the human side-by-side at review time;
   the per-page strip decision is recorded in the build log. There is no
   pixel gate — see [CODING_STANDARDS.md](CODING_STANDARDS.md) for why it was
   retired. The suite's serving seam serves the same committed tree, so what it
   asserts is what ships.

Coding rules: [CODING_STANDARDS.md](CODING_STANDARDS.md). Domain vocabulary:
[CONTEXT.md](CONTEXT.md).

## The snapshot

The ground truth is the **frozen capture**: every live page as it stood on
**2026-09-12**, taken with the `capsulecode/singlefile:latest` image's bundled
`single-file` CLI and this flag set (the image tag pins no version, so the exact
SingleFile build is not recorded):

```
--remove-hidden-elements=false --remove-unused-styles=false
--save-original-urls --block-videos=false --blocked-url-pattern 'r2\.vidzflow\.com'
```

Each flag is load-bearing for fidelity: the first two keep hidden subtrees and
state CSS (without them a run is not usable ground truth), `--block-videos=false`
embeds each `<video>` source as a `data:` URI for the assets pass to serve
locally, the Vidzflow block keeps a never-idle video.js host out of the capture,
and `--save-original-urls` is what leaves a **frame's** URL in the capture at all
— SingleFile empties every `iframe src`, and a cross-origin player cannot be
inlined, so 87 frames across 71 pages would otherwise be gone.

The snapshot is not refreshed: re-inventorying the live site, diffing drift, and
scoped re-captures were retired with the refresh workflow. The gitignored capture
HTML is unrecoverable, and the tools that produced it are in git history only.
`served/` is therefore the artifact, committed — and the build that produced it
retired with the captures it read.

**Index verified in sync as of 2026-09-14.** The upstream watch (`npm run
upstream`) measured the live site against the frozen Capture list on 2026-09-13:
1,220 watched URLs, 1,200 live 200s identical to the list, zero added and zero
removed — the page set and statuses still match. The committed baseline
(`regression/upstream-baseline.json`) records 2026-09-14 as the date it was last
accepted, once the per-page chrome digests joined it, and the watch diffs against
it from then on. The watch also compares a page's prose and chrome live-versus-
served, and those are **not** in step. The tree stays frozen exactly as dated and
its copy is known to have moved on since; those differences are recorded as
**accepted drift** in the committed baseline, so a plain run shows them as
accepted and exits 0, while any new or changed difference is a finding and exits
1. `npm run upstream -- --accept-drift` re-records the accepted set when that
judgement changes, and the report names the pages a future re-capture would need
under "refresh candidates". Run it before a milestone or a publish; it is
deliberate and hand-run — there is no schedule, no CI job, and no notification
channel. That is a check, not a refresh — the watch reports staleness and never
moves the snapshot.

Accepted known drift, recorded 2026-09-14 (the watch shows these as accepted,
not as findings):

- `/careers` — the hero reads “We Work Hard” upstream; the tree holds “We Aspire
  Fearlessly”.
- `/faq` — the “General” filter is now “Agreements and Policies”.
- `/press-center` — the “Region” filter is now “Location”.
- `/resources` — the “Industry” filter is now “Audiences”.
- `/upcoming-events` — “Industry” → “Event Type” and “Resource Type” →
  “Audience”.

## Publishing

**The site is live at <https://flocksafety.cam/>**, published from this
repository by `.github/workflows/publish.yml`. A push to `main` — or dispatching
the workflow by hand — runs the repository's own gate (`npm ci`, `npm run
typecheck`, `npm test`, `npm run build`), materializes the **Publish artifact**
with `node pipeline/publish-artifact.mjs --out .tmp/publish`, asserts it carries
no symlink or hard link, uploads it, and deploys it to GitHub Pages under the
`pages` concurrency group. A failing check stops before materialization, so the
live site is never the debugging surface. It is the repository's only CI and
needs no stored secret.

The host reaches a **URL root** rather than a project subpath: Pages takes GitHub
Actions as its source, `flocksafety.cam` is attached as the custom domain (apex
`A`/`AAAA` plus a `www` CNAME pointed at GitHub), and Enforce HTTPS is on, so
`http://` and `www` both 301 to `https://flocksafety.cam/`. The old project URLs
(`https://jennymaeleidig.github.io/interactive-media-production/…`) 301 there
too, with the path preserved.

Why the published directory is not just `served/`:

- **It must live at a site root**, not under a path. Every reference is
  root-absolute (`/assets/<sha16>.<ext>`, `/products/flock-os`), so a
  project-page URL (`https://<owner>.github.io/<repo>/`) 404s every asset. A
  publish-time prefix rewrite would fix that and break the guarantee that
  published bytes equal served bytes, so the site moves to a root instead.
- **`/<route>` must resolve.** The tree holds `foo.html`, and the host serves
  `/<route>` from `/<route>.html` by an appending rule nobody documents. The
  artifact therefore also carries a **Route copy** of every non-root page, so
  correctness never rests on that rule.
- **Size is the binding limit.** GitHub Pages caps a published site at 1 GB and
  the tree's HTML was 1.84 GB before its style and script bodies were deduped —
  the same stylesheets re-encoded on all 1,181 pages. Shipping each body once
  brought the tree to about **660 MB**, and 158 body files are in `assets.json`,
  so `npm run routes` verifies their bytes and content types like any other
  asset. The artifact is **831 MB over 5,714 files**, about 17% under the cap,
  and the materializer refuses to write one that would exceed it.

**Measured against the host on 2026-09-14**, the first real deploy:

- an extensionless route serves its `.html` twin with a **200 and no redirect** —
  the appending rule does fire on the Actions build route, so the route copies'
  value is the hop, never correctness;
- a **Redirect page** answers 200 (GitHub Pages never answers 301 for one — the
  recorded fidelity gap), and its source 301s once to the trailing slash first;
- a dead path answers **404** with the tree's own `Not found` body;
- a **form POST** answers **405**, so a form breaks visibly — which is what the
  forms notice belongs in the tree's own bytes to disclose, and does not yet.

An educational reproduction of this kind also needs a visible non-affiliation
disclaimer on the published site (it is not yet in the tree), and the captured
consent/tracker machinery must stay stripped — it is: the strip audit fails the
serving check on tracker residue, and the tree carries no live analytics tag.

## The scratch tree

The initial effort's working tree — `.scratch/`, 34.5 GB: the 2026-09-12
capture run (1,200 pages of captured HTML, gitignored), the inventories, the
tickets and evidence, the snapshot-serving prototype, plus this repo's own
`.tmp/` build experiments — was scrapped when the effort closed (2026-09-13).
What that means:

- **`served/` is the artifact, and it ships in the repo.** The tree the captures
  produced is committed in full, so a fresh clone serves the site and
  `npm run routes` has something to check.
- **Nothing rebuilds it.** The pipeline that read the captures was retired with
  them: `npm run pipeline` and `npm run dedupe` no longer exist, and the modules
  only the build used (its pass table, the embed / dedupe / asset passes, the
  captured-policy editor, the layer table) are deleted. What the build left
  behind stays, because the tree and the tests still need it: the injected
  layers, the strip audit, the served-tree rules.
- **The record survives in git.** The scrapped effort's tickets, spec, evidence,
  prototype sources, and the build itself were tracked, so `git show <commit>:...`
  still has them; the retired refresh workflow — the runbook and the inventory /
  diff / re-capture / video-probe tools — is one commit further on in history.
  Only the gitignored captures are unrecoverable.
- **New work still starts in `.scratch/`.** That is where the issue-tracker
  convention puts an effort's tickets ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md));
  the scrapped tree was that convention's first effort, not the convention.
