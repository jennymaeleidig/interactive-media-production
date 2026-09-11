# Capture run — 2026-09-09

Full-site capture of www.flocksafety.com for wayfinding ticket [03-full-site-capture](../../../issues/03-full-site-capture.md) (map: [map.md](../../map.md)). Ground truth for the Recreation: one SingleFile snapshot per live page.

## Pipeline

- Docker image `capsulecode/singlefile:latest` (colima; 4 CPUs / 6 GiB), 4 parallel containers.
- CLI: `npx single-file --browser-executable-path /usr/bin/chromium-browser --browser-wait-until networkIdle --browser-wait-delay 2000 --browser-load-max-time 45000 --browser-capture-max-time 45000 <url> /data/<rel>`.
- Pilot batch first: 13 pages spanning template families (homepage, product, post, 2 resource pages, campaign LP, legal, 2 utility, 2 marketing, customers hub, press hub), verified end-to-end before the full walk.

## Layout

- `capture-list.txt` — the 1,199 live pages (from ticket 01's inventory, `status=200` only).
- `index.html`, `<path>.html` — captures, one per page, URL hierarchy preserved (`/` → `index.html`).
- `capture-status.csv` — per-page result: url, rel, exit, bytes, secs, verdict (saved / failed / empty / skipped-existing).
- `manifest-uncaptured.csv` — the 80 pages intentionally not captured: 56 redirect stubs, 10 auth-gated `/events/test-*` stubs, 14 dead roots. Feeds ticket 05's link-rewrite pass (and its 301s).
- `title-repairs.csv` — captures whose `<title>` was rewritten at runtime and restored (see below).
- `errors.log` — stderr of failed captures, if any.

## Result

**1,199 / 1,199 pages captured, 0 failed** — 5.45 GB (min 829 KB, max 33.2 MB; customer hub largest). Full walk ~77 min at 0.26 pages/s with 4 parallel containers.

- Titles: 939 captured matching ticket 01's ground truth; 260 runtime-swapped (below) and repaired; every capture now carries its inventory title.
- Source pages emit **no `rel=canonical`** at all, so per-capture redirect drift can't be detected that way; exact title match across all 1,199 is the corroboration that each capture landed on its own page.

## Findings

- **Runtime title swap**: a site script sometimes rewrites `document.title` to "Message from Flock Safety" before capture (260 of 1,199 pages; 6 of 13 pilot pages). Captured DOM is otherwise complete (real H1, full body; og:title unaffected). Titles were restored from ticket 01's static-HTML ground truth and every repair logged in `title-repairs.csv`. The swap itself is a behavioral fact — likely tied to the "headline banner" announcement element present on every page — relevant to ticket 02's behavioral inventory.
- Page mass: homepage ~12 MB, customer hub ~21 MB, typical post 3–4 MB (SingleFile inlines all assets).
