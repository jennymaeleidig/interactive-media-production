# Video inventory — 2026-09-11

Pass across all 1,180 served pages (capture run `2026-09-11`) to inventory
every embedded video and verify it still plays upstream, ahead of issues 11
(capture refresh runbook) and 12 (final fidelity signoff).

**Extractor:** `pipeline/video-inventory.mjs` (pure, no network) — `node
pipeline/video-inventory.mjs --served served` regenerates `videos.json`,
`inventory.csv`, `yt-dlp-urls.txt` in a dated folder here.
**Probe:** one-off fetch of each Wistia media JSON (`fast.wistia.com/embed/medias/<id>.json`)
and each YouTube oembed record → `playability.csv`.

## Results

| Category | Count | Playing upstream |
|---|---|---|
| Wistia media | 119 | 115 ok · **4 gone** (`{"error":true}` from Wistia) |
| YouTube | 59 | 59 ok |
| **Total unique videos** | **178** | **174 ok · 4 gone** |

Zero orphan delivery assets: every `.m3u8`/poster referenced by the inline
Wistia player markup resolves to a `w-json-ld` VideoObject → hashed media ID,
so `wistia:<id>` covers everything.

## The 4 dead Wistia medias (dead upstream, not just for us)

| Hashed ID | Page(s) |
|---|---|
| `77o31nkq0o` | `served/webinar/introducing-flock-os.html` |
| `gayegdwaii` | `served/webinar/elevate-your-response-with-flockos-r-911.html` |
| `imr6vzeawt` | `served/webinar/video-without-limitations.html` |
| `ueo7k59ryn` | `served/webinar/the-future-of-policing-is-real-time.html` |

All four are old `webinar/*` popover embeds (`wistia_async_<id> popover=true`);
Wistia answers their media JSON with HTTP 200 + `{"error":true,"iframe":true}`
— the media was deleted or made private in the Wistia account, so the embed is
broken on the live site too. yt-dlp confirms: `ERROR: Error while getting the
playlist: True`. No download possible; a fidelity pass should treat these
thumbnails/popovers as the captured end-state (they already render inert under
the zero-outbound-request invariant).

## Downloading (user-run)

```sh
cd .scratch/flock-parody-impl/video-inventory/2026-09-11

# everything that resolves (174 URLs; Wistia entries use yt-dlp's wistia: extractor)
yt-dlp -a yt-dlp-urls.txt \
  -o "%(extractor)s/%(title).80s-%(id)s.%(ext)s" \
  --download-archive archive.txt -ci

# the 4 dead ones fail fast and are skipped; re-run the same command any time
```

With `--download-archive`, completed items are skipped on re-runs, so this
doubles as the drift check for ticket 11: new lines added to
`yt-dlp-urls.txt` after a re-capture are exactly what needs downloading.

## Files

- `videos.json` — full model: 178 videos with title/duration/contentUrl (Wistia JSON-LD) + referencing pages
- `inventory.csv` — one row per video, dated-CSV convention (tracked)
- `playability.csv` — probe results (status + upstream title per video)
- `yt-dlp-urls.txt` — the flat download list (59 YouTube watch URLs, 119 `wistia:<id>`)
