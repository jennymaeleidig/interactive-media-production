Status: open
Type: task
Blocked by: 01

## Question

Nothing to decide — run the full-site capture so every page has ground truth. Walk the capture list from ticket 01 and save each page with the Docker SingleFile pipeline (`capsulecode/singlefile`, output mounted at `.scratch/flock-parody/research/flocksafety/<run-date>/`, one file per page preserving URL hierarchy, `index.html` for `/`). Record per-page capture status (saved / failed / redirected) in the run folder; failed pages surface for retry or escalation (bladebro-assisted capture in a herdr pane) rather than dropping silently. This ticket only produces captures — no building.
