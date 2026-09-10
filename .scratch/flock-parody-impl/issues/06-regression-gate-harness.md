# 06: Regression gate harness

**What to build:** The automated fidelity instrument. The serving gate renders the served tree twice — once over HTTP and once from disk — in the same headless browser at three viewports, with reduced motion forced, and compares pixels at zero tolerance; control renders first prove the renderer is deterministic. The strip report compares each raw Capture against its served page and produces human-reviewable diffs whose deltas are confined to the reviewed strip regions. The harness runs from a single command.

**Blocked by:** 01, 04.

**Status:** resolved
Label: ready-for-agent

- [x] Control renders of identical content are 0 px apart, proving determinism.
- [x] The serving gate reports 0 px at all three viewports with the motion layer aboard.
- [x] Gate shots force reduced motion so the static contract is measured.
- [x] The strip report produces reviewable diff images and a summary.
- [x] The strip report's deltas are confined to the offer bar, consent card, and reclaimed header reflow.
- [x] The whole check runs from one command and exits non-zero on failure.

## Comments

**Implemented, then retired (2026-09-10).** `regression/` shipped the full
harness — `gate.mjs` (control → per-page × viewport raw/srvfile/srvhttp shots),
`compare.mjs` (pure PNG-diff core, `test/gate.test.ts`), `shoot.mjs` +
`cdp-shot.mjs` (Docker chromium, forced reduced motion, convergence settle).
It ran green, including the ticket-07 whole-site scale-up.

**Retired: the instrument was self-vs-self and cost ~2 h per sweep.** Its only
gating comparisons were `ctrlA` vs `ctrlB` (the same file, twice) and `srvhttp`
vs `srvfile` (the *same served bytes*, over HTTP vs from disk). It could
therefore not see a bad build, a blank page, or over-stripping — every gating
comparison rendered the served output against itself. The one comparison that
*could* see a bad build (raw Capture vs served) was explicitly non-gating. And
"the HTTP route returns the file's bytes" is one code path, provable directly:
**byte-identity is strictly stronger than a screenshot diff** (same bytes ⇒
same pixels) and covers all 1,180 pages in ~10 s.

**Replaced by the serving check** (`npm run routes`, `regression/routes.mjs`,
ticket 07): every route class over HTTP, the count identity, the site-wide
strip audit, and byte-identity of every served page. The strip decision stays
recorded, machine-readably, in `served/build-log.json` (removed byte counts per
target); visual fidelity and strip deltas are the human side-by-side at the
phase gates (ticket 12). Deleted: `gate.mjs`, `compare.mjs`, `shoot.mjs`,
`cdp-shot.mjs`, `regression/sample-pages.txt`, `test/gate.test.ts`, the `gate`
vitest project, the `npm run gate` script, and the gate-only `pngjs` /
`pixelmatch` devDependencies. Docker remains only for the capture run.
