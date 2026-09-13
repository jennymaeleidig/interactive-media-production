# 01 — Retire the capture-refresh workflow

Status: resolved
Blocked by: none

## What to build

Revert the policy that the Recreation always matches upstream: it is a frozen
snapshot (ADR 0004). Remove the workflow that kept it synced and everything
that only existed to serve it — the runbook, the live-site inventory walk and
drift diff, the scoped re-capture driver, the upstream video probe, their tests
and vitest project, and the `.gitignore` capture-run rules — and update the
docs and config so the repo still typechecks and the suite stays green.

## Acceptance criteria

- [x] `docs/capture-refresh-runbook.md`, `pipeline/inventory.mjs`,
      `pipeline/inventory-diff.mjs`, `pipeline/recapture.mjs`,
      `pipeline/video-probe.mjs` and their tests (plus the `capture-refresh`
      vitest project) are deleted, and nothing tracked still references them.
- [x] `pipeline/video-inventory.mjs` is kept — the embed pass imports its
      `wistiaFromPage` — but trimmed to that detection module: the dated
      `videos.json` / `inventory.csv` / `yt-dlp-urls.txt` writer and the
      upstream download list are gone.
- [x] `DEAD_VIDEO_IDS` stays, frozen, with its comment no longer presenting the
      retired inventory/probe as live tools.
- [x] `CAPTURE_RUN` and the frozen page listing (`CAPTURE_LIST`) stay, so
      `npm run routes`'s count invariant still runs without any capture.
- [x] Docs record the reversal: ADR 0004, `CONTEXT.md` terms, `README.md`'s
      snapshot section, `CODING_STANDARDS.md`'s seams and env constraints.
- [x] Green: `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run routes`.

## Comments

- `pipeline/video-inventory.mjs` was nearly deleted with the other ops tools;
  the build coupling (`pipeline/embeds.mjs` imports `wistiaFromPage`) is why it
  survives. Code review then caught the retained CLI still writing a `yt-dlp`
  download list — an upstream artifact with no consumer on a frozen snapshot.
