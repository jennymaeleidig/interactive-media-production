# Video inventory — 2026-09-11

Pass across all 1,180 served pages (capture run `2026-09-11`) to inventory
every embedded video and verify it still plays upstream, ahead of issues 11
(capture refresh runbook) and 12 (final fidelity signoff).

**Extractor:** `pipeline/video-inventory.mjs` (pure, no network) — `node
pipeline/video-inventory.mjs --served served` regenerates `videos.json`,
`inventory.csv`, `yt-dlp-urls.txt` in a dated folder here (the **local** date —
the UTC date is already tomorrow after 20:00 local, which silently files the run
under a second folder). Each entry carries `context`: `embed` (renders as a
video slot), `link` (body copy pointing at the video), or `both`.
**Probe:** `node pipeline/video-probe.mjs --inv <dir>` — upstream liveness of
each Wistia media JSON (`fast.wistia.com/embed/medias/<id>.json`), each YouTube
oembed record, and a HEAD on each delivery stream → `playability.csv`;
`--tier deep` adds `yt-dlp --simulate` per URL and writes `playability-deep.csv`.

## Results

| Category | Count | Playing upstream |
|---|---|---|
| Wistia media | 121 | 116 ok · **5 gone** (`{"error":true}` from Wistia) |
| YouTube | 59 | 59 ok |
| **Total unique videos** | **180** | **175 ok · 5 gone** |

Context split: **123 reference a video slot** (120 Wistia + 3 YouTube) and
**64 are body-copy links** (59 YouTube + 5 Wistia). That distinction is what
makes a failure report meaningful — a dead slot is a blank box, a dead link is
broken copy.

Zero orphan delivery assets: every `.m3u8`/poster referenced by the inline
Wistia player markup resolves to a `w-json-ld` VideoObject → hashed media ID,
so `wistia:<id>` covers everything.

## The 5 dead Wistia medias (dead upstream, not just for us)

| Hashed ID | Page(s) |
|---|---|
| `77o31nkq0o` | `served/webinar/introducing-flock-os.html` |
| `gayegdwaii` | `served/webinar/elevate-your-response-with-flockos-r-911.html` |
| `imr6vzeawt` | `served/webinar/video-without-limitations.html` |
| `ueo7k59ryn` | `served/webinar/the-future-of-policing-is-real-time.html` |
| `tthkbjay3c` | `served/webinar/prepared-for-anything-how-cities-prepare-for-planned-and-unplanned-events-video.html` |

All four are old `webinar/*` popover embeds (`wistia_async_<id> popover=true`);
Wistia answers their media JSON with HTTP 200 + `{"error":true,"iframe":true}`
— the media was deleted or made private in the Wistia account, so the embed is
broken on the live site too. yt-dlp confirms: `ERROR: Error while getting the
playlist: True`. No download possible. Under the zero-outbound invariant these
thumbnails already render inert; once the slots play from the original hosts
(ADR 0002) these four are the ones with nothing to play, so they keep the
captured end-state — a known, bounded exception rather than a new failure.

## Downloading (user-run)

```sh
cd .scratch/flock-parody-impl/video-inventory/2026-09-11

# everything that resolves (175 URLs; Wistia entries use yt-dlp's wistia: extractor)
yt-dlp -a yt-dlp-urls.txt \
  -o "%(extractor)s/%(title).80s-%(id)s.%(ext)s" \
  --download-archive archive.txt -ci

# the 5 dead ones fail fast and are skipped; re-run the same command any time
```

With `--download-archive`, completed items are skipped on re-runs, so this
doubles as the drift check for ticket 11: new lines added to
`yt-dlp-urls.txt` after a re-capture are exactly what needs downloading.

## Files

- `videos.json` — full model: 180 videos with context/title/duration/contentUrl (Wistia JSON-LD) + referencing pages
- `inventory.csv` — one row per video, dated-CSV convention (tracked); the `context` column is the slot-vs-link split
- `playability.csv` — probe results (status + upstream title per video)
- `playability-deep.csv` — same plus `yt-dlp --simulate` per URL (generated on demand by `--tier deep`)
- `yt-dlp-urls.txt` — the flat download list (59 YouTube watch URLs, 121 `wistia:<id>`)
