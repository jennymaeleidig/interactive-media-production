Status: resolved
Type: prototype
Blocked by: 03

## Question

What is the repeatable pipeline from the capture run to a served page that hits the fidelity bar with minimum work? Prototype it once on the hardest single page — the homepage (split-text animations, the chat-widget mount point, the densest script payload):

- **Strip pass**: remove the Qualified widget (scripts + DOM), all trackers/telemetry, Marketo and every external-API call, OneTrust, and scaffold forms. Target: zero outbound requests from any served page. Seed strip list: ticket 02's tracker inventory + the map Notes.
- **Forms**: main-flow forms keep identical markup but POST to local mock Next.js API routes, which swallow submissions and redirect to the captured thank-you pages. Scaffold/test pages (`form-test`, `book-a-demo-layout`, `thank-you-*`, …) are dropped from serving entirely.
- **Link rewrite**: internal hrefs → local Recreation routes; external links stay live; the 56 redirect stubs become real 301s (from the run's `manifest-uncaptured.csv`); dead roots: reproduce-or-drop decided here.
- **Story-hook seam**: inject a dormant `story-hooks.js` into every served page exposing `window.flockParody.apply([{selector, text|html|src|style}…])` — the contract yarnspinner dialogue events will drive in the parody phase. Ship dormant; write the contract down for the spec.
- **Serving**: all 1,199 static snapshots at their URL paths via Next.js (5.45 GB in `research/flocksafety/2026-09-09/`, HTML gitignored, reproducible via ticket 09's runbook).
- **Regression diff**: automated screenshot diff (2–3 viewports) proving served == capture minus the strip list; the human side-by-side at the phase gate covers runtime behavior (animations, chat overlay).

Product: the pipeline, proven once, that the spec describes as the build method for every page — plus the story-hook contract written down for the parody effort.

## Answer

Resolved 2026-09-09 — pipeline built, verified end-to-end, and walked. Prototype (throwaway, runnable): `.scratch/flock-parody/prototype/snapshot-serving/` — full decision write-out in its [README](../prototype/snapshot-serving/README.md); every per-page mutation logged in `served/build-log.json`.

- **Pipeline**: strip DOM → rewrite links → inject form actions → inject story-hook seam → write. Captures carry **zero executable scripts** (SingleFile stripped them at capture time), so zero-outbound is true by construction. Post-strip audit: `qualified=0`; `onetrust=1` (footer "Your Privacy Choices" link — site content, stays per link policy). Strip finds: the chat launcher lives in a separate `<q-root>` element (~1.8 MB/page); the "Message from Flock Safety" title-swap was Qualified's pounce script — closed; captures are truncated before `</body>` (the pass appends closing tags back).
- **Serving**: optional catch-all route (served tree → 200) + `redirects.json` from the run manifest (56 stubs → 301, targets already local) + mock form route (swallow POST → 303 to captured thank-you). Dead collection roots **404** — ratified: the live site 404s them; item pages stay served.
- **Regression**: two comparisons, three renders per viewport through the same chromium (control: identical renders = 0 px). **Serving gate** (http vs disk, ~0 tolerance): **0 px at 1440×900, 768×1024, 390×844**. **Strip report** (raw vs served, informational + diff PNGs): deltas confined to the Qualified offer bar, the OneTrust consent card, and a 52 px header-offset reflow; hero/nav/stat cards/mobile pixel-identical.
- **Ratified by user (2026-09-09)**: dead roots 404; story-hook contract (`flockParody.apply([{selector, text|html|src|style}…])`, queued pre-DOM, never throws, dormant in Recreation); **static-frozen pages as the fidelity floor** — served pages are fully static, animations sit at captured end-state. Motion returns as a cheap mimic layer (CSS + IntersectionObserver annotations, original GSAP/Lenis runtime excluded), ticketed as [10-motion-mimicry-tier](10-motion-mimicry-tier.md), blocked by ticket 08's animation-pattern census. Marketo forms: **static styled mock of the rendered end-state posting to local mock routes**; delay-injecting real Marketo ruled out (violates never-live/zero-outbound).
