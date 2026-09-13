# 01 — Inline bodies ship as files (the size limit)

Status: resolved
Blocked by: none

## What to build

Pass 14 of the build: move every `<style>`/`<script>` body of at least 1 KB out
of the page into a content-addressed file (`/assets/<sha16>.css|.js`), leave a
marked `<link>`/`<script src>` where the body was, and widen the captured
`style-src`/`script-src` by exactly `'self'` so the browser will load it. Pure
HTML-in/HTML-out core (`pipeline/dedupe.mjs`) called from the build's per-page
chain, plus a tree mode that applies the pass to an existing `served/` tree —
the capture run behind it was scrapped, and the limit does not wait for a fresh
capture. Decision and trade-offs: [ADR 0003](../../../docs/adr/0003-bodies-ship-as-files.md).

## Acceptance criteria

- [x] Bodies ≥ 1 KB become one file each, keyed by the sha256 of their bytes, with
      a stand-in carrying every original attribute (so the script census and the
      `data-flock-parody` markers read the same).
- [x] Identical bodies across pages dedupe to one file: 13,384 style + 7,086
      script body references → 158 files (18.7 MB).
- [x] Bodies under 1 KB and non-JavaScript script types stay inline.
- [x] A body inside a `srcdoc` payload is never treated as an element.
- [x] The pass is idempotent, and changes nothing outside the bodies plus the two
      CSP directives (both asserted per page over the whole tree).
- [x] The body files are in `assets.json` / `build-summary.json`, so the serving
      check verifies their bytes and content type over HTTP.
- [x] The tree fits with room to spare: 2.36 GB → 660 MB (HTML 1,843.8 → 149.1 MB).
- [x] Pages still work in a browser under the captured CSP — external sheets
      parse (5,328 rules off one of them), the six externalized runtimes run
      (`html.fpm-scroll` on the homepage), the chat mimic opens, the blog video
      frame keeps its `https://www.youtube.com/embed/...` src, and the
      `/safe-cities` button is still in flow.

## Comments

- The first implementation externalized bodies and then applied the slot edits
  back-to-front against offsets computed *before* the CSP grant, which shifted
  every edit after the meta tag and corrupted the served bytes (a `<link>` in the
  middle of an unquoted attribute value). The pass now builds one edit list —
  CSP grant and bodies together — and applies it back-to-front in one pass.
- The scanner's first version also treated a `"` inside an *unquoted* attribute
  value (`style=background-image:url("x.png")`) as the opening quote of a quoted
  value and swallowed 83 KB, walking into a `srcdoc` payload and rewriting the
  nested document's stylesheets. A tag-end finder now distinguishes quoted from
  unquoted values; the reCAPTCHA `srcdoc` on `connected-workflows-demo.html` is
  the page that caught both.
- Serving check after the in-place tree dedupe: 1,290 routes green, 1,181 pages
  byte-identical, 3,118 assets verified (2,960 + the 158 body files).
