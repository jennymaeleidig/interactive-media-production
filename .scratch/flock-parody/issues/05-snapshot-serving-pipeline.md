Status: claimed
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
