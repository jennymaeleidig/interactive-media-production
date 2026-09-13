# Ticket 12 / §3a — CDN-video probe

Probe captures (2026-09-12) that settled the video fix. The full-page captures
are too large to keep; `inspect.mjs` re-derives the numbers from any capture.

Findings:

- With `--block-videos=false`, SingleFile keeps `<video>`/`<source>` and embeds
  each source as `data:video/…`. The five visible-HTML5 pages inline
  13 payloads: `/safe-cities` 3 (0.6/0.4/0.3 MB), `/products/flock-dfr` 4
  (12.7/8.6/2.1/1.4 MB), `/products/mobile-security-trailer` 2 (1.2/0.3 MB),
  `/gsx` 2 (29.8/21.4 MB), `/upcoming-events` 2 (30.8/17.9 MB). All extract to
  `/assets/*.mp4|webm` under the captured `media-src 'self' data:`.
- The 10 Vidzflow pages (9 `/use-case/*` plus
  `/products/flock-aerodome-drone-as-automated-security`) inline 36 copies of the
  hidden player's r2.vidzflow.com video — ~115 MB per page — and 3 of them
  stalled past the timeouts. Blocking `r2\.vidzflow\.com` returns them to a
  bounded capture with no remote video ref, and ticket 19 strips the documents
  anyway.
- The 81 Wistia `<video>` elements carry no `src` (their player is built at
  runtime), so `--block-videos=false` does not change them.
- The leftover `cdn.prod.website-files.com` URLs after the fix are
  `data-video-urls` attributes on Webflow background-video hosts (not fetcher
  attributes) or JSON-LD metadata, so `unclassified remote refs` stays 0.

Usage: `node inspect.mjs <capture.html>`
