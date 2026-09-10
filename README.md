# interactive-media-production

**The Recreation**: flocksafety.com — the entire site — served verbatim from
SingleFile Captures through a strip-and-rewrite pipeline, as a Next.js app.
Zero outbound requests from any served page, by construction. Spec:
`.scratch/flock-parody-impl/spec.md`.

## Run it

```bash
npm install

npm run pipeline   # capture run → served/ (whole site; a scoped build reads
                   #   pipeline/pages.list — one path per line)
npm run build      # production build
npm run start      # serve the captured pages at their original paths
npm run dev        # dev server (WATCHPACK_POLLING baked in — sandbox needs it)

npm test           # full suite: pipeline + HTTP serving-seam + DOM-seam +
                   #   route-check pure-core tests
npm run typecheck  # tsc --noEmit
npm run routes     # full-scale route check over HTTP: every live page 200,
                   #   every legacy stub 301, every dead root / dropped
                   #   scaffold-test page 404
npm run gate       # fidelity gate: full-scale route check, then control
                   #   renders + serving gate (0 px, 3 viewports, reduced
                   #   motion) + strip report — needs Docker/colima, the
                   #   capture run, and a fresh build. On a constrained
                   #   machine, run the full-family pixel sample instead:
                   #     npm run gate -- --list regression/sample-pages.txt --no-strip
                   #   (the route check still covers all 1,180 pages; the
                   #   exhaustive strip sweep is the ticket-12 phase gate)
```

## How it works

1. **Capture** — SingleFile snapshots of every live page (ground truth; out
   of git, reproducible via the refresh runbook). The build reads the run
   named by the capture pointer (`pipeline/config.mjs`).
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
4. **Verify** (`regression/`) — `npm run routes` asserts every route class
   over HTTP at full scale; `npm run gate` adds the serving gate (the served
   tree over HTTP vs from disk in the same headless chromium at 1440×900 /
   768×1024 / 390×844, reduced motion forced, zero-tolerance pixels) after a
   determinism proof, plus the strip report diffing each raw Capture against
   its served page for human review.

Coding rules: [CODING_STANDARDS.md](CODING_STANDARDS.md). Domain vocabulary:
[CONTEXT.md](CONTEXT.md).
