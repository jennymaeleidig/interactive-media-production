# 06: Regression gate harness

**What to build:** The automated fidelity instrument. The serving gate renders the served tree twice — once over HTTP and once from disk — in the same headless browser at three viewports, with reduced motion forced, and compares pixels at zero tolerance; control renders first prove the renderer is deterministic. The strip report compares each raw Capture against its served page and produces human-reviewable diffs whose deltas are confined to the reviewed strip regions. The harness runs from a single command.

**Blocked by:** 01, 04.

**Status:** open
Label: ready-for-agent

- [ ] Control renders of identical content are 0 px apart, proving determinism.
- [ ] The serving gate reports 0 px at all three viewports with the motion layer aboard.
- [ ] Gate shots force reduced motion so the static contract is measured.
- [ ] The strip report's deltas are confined to the offer bar, consent card, and reclaimed header reflow.
- [ ] The strip report produces reviewable diff images and a summary.
- [ ] The whole check runs from one command and exits non-zero on failure.
