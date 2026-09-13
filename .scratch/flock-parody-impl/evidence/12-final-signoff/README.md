# Ticket 12 evidence — final fidelity signoff

The phase-gate signoff: the Recreation is re-captured from the live site, every
automated serving gate is re-run against the new run, and the human
side-by-side / strip-visual checks are handed over as a review pack.

## Verdict

| Gate | Result |
| --- | --- |
| Full re-capture | **1,200 / 1,200 pages, 0 failed** (`capture-status.csv` reads 1,200 `saved`; the final pass's `errors.log` is empty) |
| Inventory diff | 1,279 → 1,290 rows; added 22 · removed 11 · retitled 60 · **route actions: none** |
| `npm run pipeline` | 1,181 served + 19 dropped = 1,200; every page `audit: clean`; 0 executable capture scripts |
| `npm run build` | succeeds |
| `npm run routes` | **green** — 1,290 routes, 1,181 byte-identical served pages, 2,960 assets, count identity 1,181 + 19 = 1,200 |
| Title check | **clean** — 1,200/1,200 pages carry their intended title |
| Capture pointer | `CAPTURE_RUN` → `research/flocksafety/2026-09-12` |
| Human side-by-side | **pending** — pack at [`review-checklist.md`](review-checklist.md) |
| Strip visual confirmation | **pending** — same pack |

## 1. The full re-capture

`.scratch/flock-parody/research/flocksafety/2026-09-12/` — 13 GB, 1,200 pages,
the corrected flags
(`--remove-hidden-elements=false --remove-unused-styles=false --block-videos=false
--blocked-url-pattern 'r2\.vidzflow\.com'`; the video flags are §3a).

```
node pipeline/recapture.mjs \
  --inventory .scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv \
  --fallback-inventory .scratch/flock-parody/research/01-full-site-inventory.csv \
  --date 2026-09-12 --parallel 4
```

The sweep log is [`recapture-2026-09-12.log`](recapture-2026-09-12.log): 1,159
saved / 41 failed. The 41 were one transient outage (the machine slept; every
failure is a `Load timeout`/`Capture timeout` in one burst) and were cleared by
a `--resume` retry: [`recapture-2026-09-12-resume.log`](recapture-2026-09-12-resume.log)
(41 saved, 0 failed).

The run-wide record is `capture-status.csv`: every one of the 1,200 pages ends
`saved`, and the run's `errors.log` is empty. (`errors.log` is a per-pass
diagnostic — after the fix in §3 it describes the last pass, which is why the
transient-failure burst lives in the sweep log, not in it.)

### Inventory diff (step 2)

`research/inventory/2026-09-12-diff.{md,csv}` against the 2026-09-09 baseline:

| change class | count |
| --- | ---: |
| added | 22 |
| removed | 11 |
| retitled | 60 |
| statusChanged | 0 |
| navChanged (advisory) | 7 |
| typeChanged | 0 |
| unchanged | 1,202 |

**Route actions: none** — no live page was demoted or removed. The one added
*live* page is `/reduce-guard-cost-calculator` ("Guard Cost Savings Calculator");
the other 21 added rows are redirect stubs / dead roots. The 60 retitled rows
are the empty-title drift (see §4) plus a handful of real retitles. The 11
removed rows are crawl-only paths that answered 404 in both inventories, so they
404 by absence in the Recreation, exactly as before (listed in §5).

## 2. Serving gates

`npm run pipeline` (the build pass over the new run):

- 1,181 served + 19 dropped scaffold/test pages = 1,200 requested; every page
  `audit: clean`, **0 executable capture-derived scripts**.
- Route classes: 67 redirect stubs → 301, 13 dead collection roots → 404,
  10 auth-gated stubs → 404.
- Chat census: **1,181 mounted / 0 absent** (see §3).
- Embeds: 130 live player frames on 92 pages (55 srcdoc, 22 element, 53 web
  component, 11 popover) · 5 dead-upstream medias kept as captured · 19 YouTube
  panels armed on click · 120 hidden Vidzflow documents stripped · 2 medias
  named in JSON-LD with no slot to rewrite.
- Assets: 142,631 inlined references → 2,960 content-addressed files, 508 MB
  decoded.
- Strip audit keys — `qualified`, `onetrust`, `account`, `known trackers`,
  `externalFormActions`, `off-allowlist frames`, `srcdoc scripts`,
  `unclassified remote refs` — **all zero on all 1,181 pages**.

`npm run routes` (the environmental serving check, against the production
server):

```
1290 route(s): 1181 served 200 · 67 stub 301 · 19 dropped/test 404 · 13 dead 404 · 10 auth-gated 404
byte-identity: 1181 served page(s) returned bytes identical to the built file
asset-identity: 2960 extracted asset(s) returned their declared content type and identical bytes
count identity: served + dropped = 1181 + 19 = 1200, against 1200 inventory page(s)
✓ Serving layer green.
```

### Title check — [`title-check.mjs`](title-check.mjs)

```
checked 1200 captured page(s); 54 used the fallback title, 0 had no title available
title check: clean — every captured page carries its intended title
```

Every captured page's `<title>` equals the fresh inventory's title; the 54 pages
the live site serves a blank title for took the prior inventory's last known
real title (see §4).

## 3. Driver defects found and fixed (they gate *this* run)

The re-capture is produced by the ticket-11 driver, and running it at
1,200-page scale surfaced four bookkeeping defects. All four are fixed in
`pipeline/recapture.mjs` with regression tests in `test/recapture.test.ts`.

1. **Serialization (blocking).** `dockerCapture` used `spawnSync`, which blocks
   Node's event loop, so the `--parallel 4` pool degraded to one container at a
   time: the first attempt projected **~33 h** instead of ~1 h
   ([`recapture-2026-09-12-serial-bug.log`](recapture-2026-09-12-serial-bug.log):
   `[20/1200] 0.00 pages/s, ~1967 min left`). Now an async `spawn` behind an
   injectable `runDocker`, awaited; the test asserts peak concurrency > 1.
   With the fix the sweep ran at ~0.2–0.3 pages/s and finished in ~6.5 h
   including the transient-failure window.
2. **`errors.log` was not truncated on resume**, so a retry that cleared every
   failure left the previous pass's errors on record. It is now written fresh
   each pass, empty when nothing failed — matching the runbook.
3. **`title-repairs.csv` was overwritten on resume**, so a retry that repaired
   nothing shrank the run's record to the retry pass. Repairs are now merged by
   URL across passes.
4. **A resume's synthetic rows clobbered real verdicts.** `fullStatusRows`
   labels pages outside a scope `skipped-stale-capture`, and a resume's
   `skipped-existing` rows overwrote earlier `saved` rows — the committed
   `capture-status.csv` briefly read as "12 saved / 1,188 skipped". A `saved`
   verdict is now sticky (`mergeRunStatus`), so the record keeps saying the
   capture came from this run.

Defect 4's damage to the already-finished run record was repaired once, with the
guard that the capture on disk is a real one, by
[`normalize-status.mjs`](normalize-status.mjs) (1,188 verdicts restored to
`saved`; 1 row's byte count differs from the status row because the title-repair
pass rewrote it afterwards). `capture-status.csv` now reads 1,200 saved.

**Consequence for `title-repairs.csv`.** The sweep pass repaired **205** titles
(its log), but defect 3 had already discarded that record before the fix landed;
the merged CSV lists the 2 repairs the later passes made (one blank-title
`from`, one `Message from Flock Safety` swap). The *outcome* is what matters and
is proven independently by `title-check.mjs` (1,200/1,200 correct); the fix
means the next run's CSV is complete.

### A capture-fidelity flake the refresh caught

The first pass captured 12 pages without Qualified's `<q-root>` launcher that
the 2026-09-11 run had captured with it (the census read 1,169 mounted / 12
absent). The pages were spread across the whole capture window — not clustered
in the outage — so this is a per-page race in the third-party launcher script
against `networkIdle + 2 s`, not a live-site change:

```
11=1 12=0  blog/5-key-insights-on-tackling-organized-retail-crime-from-law-enforcement-leaders
11=1 12=0  blog/axon-plans-to-sever-apis-with-flock
...  (all 12)
```

All 12 were re-captured (`recapture-2026-09-12-chat-census-retry.log`, 12 saved,
0 failed) and every one now carries the launcher; the rebuilt census is
**1,181 mounted / 0 absent**. This is exactly the gap the human side-by-side
cannot see (both sides would simply lack the launcher), and why the capture
census is checked against the previous run.

## 3a. The CDN-video fix (human review, 2026-09-12)

The human review's first finding was that `/safe-cities`' three hover videos did
not play inline — the CDN URL worked only when opened in a new tab. Root cause:
SingleFile blocks videos by default, so the capture kept a source-less `<video>`
plus an injected link to the `cdn.prod.website-files.com` mp4, and the captured
CSP (`media-src 'self' data:`) refused the remote file. Five pages carry a real
HTML5 `<video>` (`/safe-cities`, `/gsx`, `/products/flock-dfr`,
`/products/mobile-security-trailer`, `/upcoming-events`); the other video-bearing
pages are Wistia internals (81 pages) or the hidden Vidzflow documents ticket 19
strips (10 pages).

The fix:

- `pipeline/recapture.mjs` now passes `--block-videos=false`, so each of the five
  pages' sources is embedded as a `data:video/…` URI and the assets pass extracts
  it to `/assets/*.mp4|webm`. It also passes
  `--blocked-url-pattern 'r2\.vidzflow\.com'`: the Vidzflow video.js streams
  never reach network idle, so an unblocked capture of those 10 pages bloated to
  ~130 MB and stalled past the timeouts (the probe is
  [`video-probe/`](video-probe/)). Ticket 19 strips those documents anyway.
- The five pages were re-captured into the run by a scoped `--resume`
  ([`recapture-2026-09-12-video.log`](recapture-2026-09-12-video.log): 5 saved /
  0 failed / 3 title repairs); the run is back to 1,200 `saved`.
- Running the build at that size exposed two latent regex stack overflows on the
  multi-megabyte values: `OPEN_TAG` in `pipeline/embeds.mjs` (now a quote-aware
  `openTags` scanner) and the bare-value pattern in `pipeline/assets.mjs` (its
  CSS escapes factored out of the repeated group). Both have regression tests in
  `test/embeds.test.ts` and `test/assets.test.ts`.

Result: the served pages reference `/assets/*.mp4|webm` under `media-src 'self'
data:`, the SingleFile CDN links are gone, and `unclassified remote refs` is
still 0 on every page. Assets rose from 2,955 files / 408 MB to 2,960 / 508 MB.

## 4. Accepted dead paths and deliberate divergences

Route-level, all asserted by `npm run routes`:

- **19 dropped scaffold/test pages → 404.** Webflow test scaffolding that is not
  site content; the list is explicit in `pipeline/config.mjs` (`DROPPED_PAGES`),
  and no served page links to any of them.
- **13 dead collection roots → 404** (`/blog-audiences/*`, `/use-case-filters/*`,
  one on-demand webinar) and **10 auth-gated event stubs → 404**
  (`/events/test-*`).
- **67 redirect stubs → 301** to their local targets (the ticket-05 manifest).
- **11 crawl-only paths 404 by absence**: `/abm`, `/ebooks`, `/events`,
  `/industries`, `/lp`, `/use-case`, `/video`, `/vs`, `/webinar`, `/webinars`,
  `/whitepaper` — 404 in both inventories, never live and never captured.
- **`/chilipiper-2`** ships with its third-party scheduler frame frozen in the
  captured `srcdoc` (SingleFile already stripped its scripts; no form action
  anywhere on the page).

Content-level, the divergences the spec accepts (recorded so they are not read
as defects):

- **5 dead Wistia medias** (`77o31nkq0o`, `gayegdwaii`, `imr6vzeawt`,
  `ueo7k59ryn`, `tthkbjay3c`) — Wistia answers their media JSON with
  `{"error":true}`, so there is nothing upstream to play; the slots keep their
  captured end-state (the one place a captured play button answers no click).
- **2 slot-less named medias** — `x4p8hk2p57` on
  `/webinar/preventing-crime-at-your-properties` (a body-copy link, alive
  upstream) and `ah1n072ovb` on
  `/blog/vehicle-and-catalytic-converter-theft-…` (named only inside the
  captured CSS rule `wistia-player[media-id=…]:not(*)`, which matches nothing).
  No slot markup to rewrite.
- **2 tier-3 pages** — `/safe-cities` and `/products/flock-dfr` carry real
  scroll-scrubbed GSAP timelines (`scrub:.8`); they ship as captured, with their
  scrub-driven labels frozen at `scale(0,0)`.
- **Wheel-driven smooth scrolling** beyond CSS anchor behaviour is not
  CSS-reproducible; accepted.
- **54 pages with a blank live `<title>`** (a Webflow republish regression) took
  the prior inventory's title; `title-check.mjs` verifies the result.
- **`/safe-cities` legibility CSS** — the build injects a page-scoped `<style>`
  (pass 12, `config.LEGIBILITY_PATCHES`) that paints the dark-on-dark
  `.t-subhead-1` copy white inside the `.bg-screen.scroller` sections. The
  page's own `.t-subhead-1{color:#304833}` rule fights the `#061602` background
  (true on the live page too). Scoped so the FAQ subheads on white stay dark.
  Ticket 12's human review asked for this; the markers stay clear of the rest of
  the page. (The section's scrub-word headings were part of the same finding;
  ticket 21's scroll layer now owns their color — the build drops the captured
  dark from-color, so the heading's own light color is the end-state and the
  runtime animates the sequence — and this patch no longer covers them.)

## 5. Human review (the remaining signoff step)

The ticket's review sample — one page per template family plus the largest and
hardest cases, 37 pages — is laid out as a side-by-side pack in
[`review-checklist.md`](review-checklist.md): each row links the **served** page
and the **capture** (`file://`, self-contained) with the capture's size. Open
two windows and compare.

To serve the build under review:

```
npm run build && npm start      # http://localhost:3000
```

What only the human eye can confirm:

- **Strip result** — no Qualified offer bar, no OneTrust consent card, no
  reclaimed header-height gap; the page otherwise reads identically to the
  capture.
- **Runtime feel** — animations and reveals, the header morph on scroll, menus /
  tabs / accordions / sliders, the chat launcher and panel, YouTube slots
  revealing and playing.
- **Divergences seen match §4** — the dead Wistia facades, the inert
  source-less player videos, and the deliberately-stripped hidden Vidzflow
  player documents, nothing else.
- **CDN videos play.** The `/safe-cities` hover videos and the `/gsx`,
  `/upcoming-events`, `/products/flock-dfr`, `/products/mobile-security-trailer`
  HTML5 videos now play from same-origin `/assets` files (§3a); no CDN link
  remains.
- **`/safe-cities` text is legible.** The dark screen-section subheads render
  white (§4).
- **`/safe-cities` scroll behavior and modal (ticket 21).** The scrub headings
  (Detect / Investigate / Respond) run their dark → green → white sequence on
  scroll and reverse on scroll-back; the label markers pop in; the hover videos
  play in view; the "see it in action" button sticks to the viewport bottom and
  opens the **Safe City Action** timeline, whose route draws as the modal
  scrolls with a marker at each stop. The sticky control must sit still while
  you scroll: it is pinned to the viewport bottom from the moment its section
  is on screen for the rest of the page (the human review caught it flickering,
  then scrolling away with the content; the stick decision now reads its parent
  only, the section's frozen `scale(0.9)` from-state is normalized away so
  `position: fixed` is not hijacked, and the runtime re-places the button
  itself if a containing-block ancestor captures it after all — see ticket 21's
  addenda).

## Reproduce

```
node pipeline/recapture.mjs --inventory .scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv \
  --fallback-inventory .scratch/flock-parody/research/01-full-site-inventory.csv --date 2026-09-12 --parallel 4
npm run pipeline && npm run build && npm run routes
node .scratch/flock-parody-impl/evidence/12-final-signoff/title-check.mjs \
  --run .scratch/flock-parody/research/flocksafety/2026-09-12 \
  --inventory .scratch/flock-parody/research/inventory/2026-09-12-full-site-inventory.csv \
  --fallback-inventory .scratch/flock-parody/research/01-full-site-inventory.csv
node .scratch/flock-parody-impl/evidence/12-final-signoff/review-checklist.mjs
```
