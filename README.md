# interactive-media-production

**The Recreation**: flocksafety.com — the entire site — served verbatim from
SingleFile Captures through a strip-and-rewrite pipeline, as a Next.js app.
Zero outbound requests from any served page, by construction. Spec:
`.scratch/flock-parody-impl/spec.md`.

## Run it

```bash
npm install

npm run pipeline   # capture run → served/ (subset from pipeline/pages.list)
npm run build      # production build
npm run start      # serve the captured pages at their original paths
npm run dev        # dev server (WATCHPACK_POLLING baked in — sandbox needs it)

npm test           # full suite: pipeline unit tests + HTTP serving-seam tests
npm run typecheck  # tsc --noEmit
npm run gate       # fidelity gate: control renders + serving gate (0 px,
                   #   3 viewports, reduced motion) + strip report — needs
                   #   Docker/colima, the capture run, and a fresh build
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
3. **Serve** (`app/[[...path]]/route.ts`) — a catch-all route answers
   original site paths from `served/`; unknown paths 404, reproducing the
   live site's observed behavior.
4. **Verify** (`regression/`, one command: `npm run gate`) — the serving
   gate renders the served tree over HTTP and from disk in the same headless
   chromium at 1440×900 / 768×1024 / 390×844 (reduced motion forced) and
   compares pixels at zero tolerance; control renders of identical content
   prove the renderer is deterministic first; the strip report diffs each raw
   Capture against its served page for human review.

Coding rules: [CODING_STANDARDS.md](CODING_STANDARDS.md). Domain vocabulary:
[CONTEXT.md](CONTEXT.md).
