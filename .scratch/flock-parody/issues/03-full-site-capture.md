Status: resolved
Type: task
Blocked by: 01

## Question

Nothing to decide — run the full-site capture so every page has ground truth. Walk the capture list from ticket 01 and save each page with the Docker SingleFile pipeline (`capsulecode/singlefile`, output mounted at `.scratch/flock-parody/research/flocksafety/<run-date>/`, one file per page preserving URL hierarchy, `index.html` for `/`). Record per-page capture status (saved / failed / redirected) in the run folder; failed pages surface for retry or escalation (bladebro-assisted capture in a herdr pane) rather than dropping silently. This ticket only produces captures — no building.

Scope of the capture list (from ticket 01's inventory):

- Capture the **1,199 live pages** only. The 56 redirect stubs and 10 auth-gated `/events/test-*` stubs are **not captured** — they become manifest entries (source URL → status) so the link-rewriter (ticket 05) can resolve them.
- **Pilot batch first**: ~12 pages spanning the template families (homepage, one product page, one post, one resource, one campaign LP, one legal, one utility) captured and verified end-to-end before the full walk — catches per-page-type failures (lazy-load, video, bot-walls) at 12-page cost, not 1,199.
- The 14 dead collection roots (`/ebooks`, `/webinar`, `/video`, `/events`) stay uncaptured — reproduce-or-drop is ticket 05's decision.

## Answer

Captured 2026-09-09. **1,199 / 1,199 live pages saved, 0 failed** — 5.45 GB of SingleFile snapshots at [research/flocksafety/2026-09-09/](../research/flocksafety/2026-09-09/) (method + findings in its [README.md](../research/flocksafety/2026-09-09/README.md)). Pipeline: `capsulecode/singlefile` via colima, 4 parallel containers, ~77 min for the full walk after a 13-page pilot spanning all template families verified end-to-end. Per-page status in [capture-status.csv](../research/flocksafety/2026-09-09/capture-status.csv) (`saved` × 1,199; no `failed`/`empty`). The 80 non-captured pages (56 redirect stubs, 10 auth-gated `/events/test-*`, 14 dead roots) are manifest entries in [manifest-uncaptured.csv](../research/flocksafety/2026-09-09/manifest-uncaptured.csv) for ticket 05's link-rewriter.

Two facts for the behavioral inventory: (1) a site script rewrites `document.title` to "Message from Flock Safety" at runtime on some pages (260 of 1,199 captures) — likely tied to the "headline banner" announcement element present on every page; captured titles were restored from ticket 01's static-HTML ground truth, every repair logged in [title-repairs.csv](../research/flocksafety/2026-09-09/title-repairs.csv). (2) Source pages emit no `rel=canonical`, so title-match across all 1,199 is the corroboration that each capture landed on its own page.

This unblocks the snapshot-serving pipeline prototype (ticket 05) and makes per-template behavior researchable offline — graduated to ticket [08-per-template-behavioral-contracts](08-per-template-behavioral-contracts.md) with brief.
