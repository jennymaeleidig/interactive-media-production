Status: open
Type: task
Blocked by: 01

## Question

Nothing to decide — run the full-site capture so every page has ground truth. Walk the capture list from ticket 01 and save each page with the Docker SingleFile pipeline (`capsulecode/singlefile`, output mounted at `.scratch/flock-parody/research/flocksafety/<run-date>/`, one file per page preserving URL hierarchy, `index.html` for `/`). Record per-page capture status (saved / failed / redirected) in the run folder; failed pages surface for retry or escalation (bladebro-assisted capture in a herdr pane) rather than dropping silently. This ticket only produces captures — no building.

Scope of the capture list (from ticket 01's inventory):

- Capture the **1,199 live pages** only. The 56 redirect stubs and 10 auth-gated `/events/test-*` stubs are **not captured** — they become manifest entries (source URL → status) so the link-rewriter (ticket 05) can resolve them.
- **Pilot batch first**: ~12 pages spanning the template families (homepage, one product page, one post, one resource, one campaign LP, one legal, one utility) captured and verified end-to-end before the full walk — catches per-page-type failures (lazy-load, video, bot-walls) at 12-page cost, not 1,199.
- The 14 dead collection roots (`/ebooks`, `/webinar`, `/video`, `/events`) stay uncaptured — reproduce-or-drop is ticket 05's decision.
