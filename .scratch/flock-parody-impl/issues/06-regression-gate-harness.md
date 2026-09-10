# 06: Regression gate harness

**What to build:** The automated fidelity instrument. The serving gate renders the served tree twice — once over HTTP and once from disk — in the same headless browser at three viewports, with reduced motion forced, and compares pixels at zero tolerance; control renders first prove the renderer is deterministic. The strip report compares each raw Capture against its served page and produces human-reviewable diffs whose deltas are confined to the reviewed strip regions. The harness runs from a single command.

**Blocked by:** 01, 04.

**Status:** resolved
Label: ready-for-agent

- [x] Control renders of identical content are 0 px apart, proving determinism.
- [x] The serving gate reports 0 px at all three viewports with the motion layer aboard.
- [x] Gate shots force reduced motion so the static contract is measured.
- [x] The strip report's deltas are confined to the offer bar, consent card, and reclaimed header reflow.
- [x] The strip report produces reviewable diff images and a summary.
- [x] The whole check runs from one command and exits non-zero on failure.

## Comments

**Implemented** (commit on `main`): `regression/` at the repo root, one command — `npm run gate`.

- **Flow**: preconditions (docker up, fresh `npm run build`, `npm run pipeline` products present, served tree ↔ capture run in sync) → production `next start` on a free port (dies with the command) → **control** renders (served page over `file://` twice, per viewport, 0 px required — a failure aborts before the matrix) → per page × viewport (pages from `served/build-log.json`; 8 today, whole site at ticket 07): **raw** (capture, `file://`), **srvfile** (served, `file://`), **srvhttp** (served over HTTP via `host.docker.internal`) → **gate** = srvhttp vs srvfile, exactly 0 px required; **strip** = raw vs srvhttp, informational. Exit 0 only when control + gate are all 0 px. Full run: ~72 s for the subset.
- **`regression/compare.mjs`** — the pure core: PNG pair in → px count, pct, and contiguous **bands** (row-clustered diff regions with x-extents — the human-review geometry for "deltas confined to the strip regions"); report in → verdict out (control ≠ 0 or gate ≠ 0 or a missing determinism proof fails; strip never fails). Unit-tested on synthetic PNGs at `test/gate.test.ts` (11 tests, vitest project `gate`) — the only CI-testable part; the shot mechanics are the gate run itself and stay out of `npm test` (fresh-clone rule).
- **`regression/shoot.mjs` + `cdp-shot.mjs`** — every render through the same Docker chromium (`capsulecode/singlefile`, colima), same flags, reduced motion forced (`--force-prefers-reduced-motion`) so the gate measures the static contract with the motion layer aboard (inert under reduced motion). The CDP shooter runs inside the container (its node 24 speaks WebSocket): navigate → settle → capture.
- **Real find, fixed in the instrument**: the prototype's `--screenshot --virtual-time-budget=8000` method is NOT deterministic at ticket-06 coverage — the budget expires on *virtual* time while the capture's data-URI fonts decode on *real* threads. `/chilipiper-2`'s frozen scheduler srcdoc carries four Inter faces whose late load/relayout left the shot in a random one of several layouts (the gate correctly reported 1198/2412 px; a same-URL bisect showed the file side itself wobbling). The shot now settles by **convergence**: fonts.ready + image decode (recursively into accessible srcdoc iframes; `loading=lazy` off-screen images excluded — their `decode()` never resolves) + double rAF, then capture repeatedly until two consecutive shots are byte-identical, and write that frame. A page that never stabilizes fails its shot loudly instead of flapping silently. After the fix: file × 3, localhost-http × 2, and host.docker.internal-http pairs all 0 px apart, including across schemes.
- **Results (two consecutive full runs, both green)**: control 0 px at all three viewports; gate 0 px on all 8 pages × 3 viewports (1440×900, 768×1024, 390×844) — the serving layer is pixel-invisible with the motion layer aboard. Strip numbers reproduce the prototype's homepage report exactly (490,166 / 247,208 / 169,891 px) and land, per the bands, in the reviewed regions: the offer bar/header-reflow band at the top, the OneTrust consent card bands bottom-left, plus the motion pass's logged from-state normalizations surfaced per spec. The human signoff on the diff images is the phase-gate review (ticket 12); artifacts land in `.tmp/gate/` (gitignored): `report.json`, `report.md` (bands + diff-image paths per page × viewport), `shots/` (raw/srvfile/srvhttp + red-marked `diff_strip_*` overlays, `diff_gate_*` diagnosis images on failures).
- **Docs**: README (verify step + `npm run gate`), CODING_STANDARDS (the `regression/` dir's not-pure exception, gate-test line), CONTEXT.md (Serving gate, Strip report terms).
