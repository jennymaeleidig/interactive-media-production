# Video plays from the original hosts; captured images are extracted locally

The Recreation cannot host the media it reproduces — the Wistia masters alone are
~47.7 GB — so the Wistia and YouTube video slots play from the original hosts as
plain remote embeds
(`https://fast.wistia.net/embed/iframe/<id>`), the one deliberate exception to
"served pages make zero outbound requests". Page images could not take that route:
SingleFile inlines every asset and drops its origin URL — the captures hold `0`
remote `img src`, `0` `data-src`, `0` `srcset`, and even the `--sf-img-*` custom
properties carry `data:` URIs — so there is no URL left to point at. The build
therefore extracts each inlined `data:` URI into one content-addressed file
(`/assets/<sha16>.<ext>`, served same-origin by `app/assets/[...path]/route.ts`)
and rewrites the reference, which is also what collapses the served tree from
10 GB to 2.1 GB (142,481 inline references → 2,953 files: the same logo was
re-encoded on all 1,180 pages).

**Amended 2026-09-12 (ticket 12).** That reasoning is about the ~47.7 GB of
Wistia masters. The site's small **HTML5 `<video>` sources** are a different
class: five pages paint a real `<video>`/`<source>` from
`cdn.prod.website-files.com` (the `/safe-cities` hover videos, `/gsx` and
`/upcoming-events` background videos, `/products/flock-dfr`, and
`/products/mobile-security-trailer`; tens of MB in total). SingleFile blocks
videos by default, which left a source-less `<video>` plus a SingleFile-injected
link to the CDN file — a dead box that only worked in a new tab. The capture now
runs `--block-videos=false`, embeds each source as a `data:video/…` URI, and the
assets pass extracts it to `/assets/<sha16>.mp4|webm`, which the captured
`media-src 'self' data:` plays same-origin. The hidden Vidzflow media host is
re-blocked with `--blocked-url-pattern 'r2\.vidzflow\.com'`: its video.js tech
streams and never reaches network idle, so an unblocked capture bloated to
~130 MB and stalled past the timeouts, and ticket 19 strips those documents
anyway. So the only videos still fetched from an origin host are the
allow-listed Wistia and YouTube frames.

**Amended 2026-09-12 (ticket 12, blog videos).** The rejection of "load every
YouTube frame at build time" above is about ticket 17's **hidden** click-to-arm
panels on the three `/trust` pages: their frames are invisible until a click, so
arming them at build time would fetch a player nobody asked for. The rich-text
embeds are the other case, and the opposite one. A blog post's video frame is
**visible** on load; the live page fetches it then, and the capture lost it only
by accident — SingleFile empties every `iframe src` to re-inline the frame
document, and a cross-origin player document cannot be inlined, leaving 91
src-less frames across 74 pages (the blog post the review reported among them).
The capture now passes `--save-original-urls`, so the emptied frame keeps
`data-sf-original-src` with the URL the live page had, and the embed pass points
the frame back at it: same host, same URL, same parameters as the live page, so
this reproduces live behavior rather than adding a fetch. `www.youtube-nocookie.com`
joins the host allow-list for the same reason (the privacy-enhanced embeds came
back on that host), and `MEDIA_HOSTS` remains the only thing that can gain a
`frame-src` grant. The bookkeeping attribute itself is dropped from served bytes
in the build's last pass — it prints third-party asset URLs (3,583
`data-sf-original-src`, 1,252 `srcset`, 306 `href` across the tree) that no
reader needs, and ADR 0002's own publication/rights question (ticket 11) is
reason enough not to ship them.

**Status.** Accepted 2026-09-11; **built** the same day for all four providers:

- **Wistia** — 130 live player frames across 92 pages covering 115 distinct
  medias. The three captured snapshot shapes (an inlined `srcdoc` player
  document, the JS-built player chrome, and a `<wistia-player>` web component
  with a declarative shadow root) are each swapped for the live player document,
  **including the 11 live `popover` slots**: measured, their box is already the
  captured 16:9 padding box, so inlining moves nothing and replaces a dead play
  button with a working player.
- **YouTube** — the 19 `data-video-id` iframes on three `/trust` pages (16
  distinct ids) are armed by the interactions runtime: the poster click sets
  `src="https://www.youtube.com/embed/<id>?autoplay=1"` and crossfades the
  captured panel in. The pass sets no `src` itself (the panel is hidden at rest,
  so a build-time request would fetch a frame nobody can see) and widens
  `frame-src` for `www.youtube.com` on exactly those three pages.
- **Vidzflow** — the 120 hidden video.js player documents on 10 pages (12 per
  page, in `.video-desktop`/`.video-tablet.is-hidden` wrappers) are **stripped**,
  not played: their visible content is a sibling still image and the capture
  carries no playable embed URL for the provider (ticket 19).
- **Dead-upstream medias** — the 5 Wistia medias Wistia answers with
  `{"error":true}` (`config.DEAD_VIDEO_IDS`) keep their captured end-state; there
  is nothing to play, so the captured poster is the honest end-state. This is the
  one place a captured play button still answers no click, and it is recorded as
  an accepted divergence (ticket 18).

Two medias are named with no slot to rewrite and are likewise accepted residuals:
`x4p8hk2p57` is a body-copy link on `/webinar/preventing-crime-at-your-properties`
(the page's own affordance, and the link works), and `ah1n072ovb` on
`/blog/vehicle-and-catalytic-converter-theft-flock-safetys-solutions-for-businesses`
is named only inside a captured CSS rule
(`wistia-player[media-id="ah1n072ovb"]:not(*)`) whose `:not(*)` selector matches
nothing — the `<wistia-player>` element was never captured. Ticket 17's
attribute-form detection is what made both visible; neither invites a click.

**Considered options.** Host the videos ourselves — rejected: ~47.7 GB of masters
to store, re-encode, and keep live for a piece that never needed to own them.
Re-capture with `--browser-script` stashing `img.currentSrc` before inlining, to
recover real image URLs — rejected: it invalidates the verified captures and
re-opens every fidelity gate to trade same-origin files for remote ones. Leave the
slots inert behind a liveness gate (the earlier plan) — rejected: empty boxes are
the piece's most visible failure mode. A click-through anchor over the captured
poster (no frame at all, invariant intact) — rejected: it leaves the site
mid-experience, where the original played in place. Load every YouTube frame at
build time — rejected: it fetches third-party frames that stay hidden until a
click. Inline the popovers only after accepting a layout change — overtaken by
measurement: the popover box is already the captured 16:9 padding box, so there is
no layout change to accept.

**Consequences.** The invariant becomes **allow-list enforced rather than true by
construction** for video: the captured CSP is `default-src 'none'` with
`frame-src 'self' data:`, so the pass appends the hosts it actually used to that
one directive (adding a *second* `frame-src` would intersect with the first and
keep the players blocked), and the strip audit counts every absolute `<iframe src>`
pointed elsewhere — `off-allowlist frames` must be 0 on every page. The audit now
also looks inside `srcdoc` payloads (`srcdoc scripts`: an executable script there
fails the invariant rather than relying on what SingleFile happened to drop) and
counts any **remote reference outside a known class** (`unclassified remote
refs`). Every remaining remote reference is accepted in writing as inert:

| class | why it costs no request |
|---|---|
| allow-listed `<iframe src>` | the deliberate exception above |
| `<video poster>` / `poster=` | `img-src 'self' data:` refuses it, or the element never asks (a custom element) |
| Lottie `data-src` | `connect-src 'self'` refuses it |
| CSS `url(https://…)` | `img-src 'self' data:` refuses it |
| JSON-LD `thumbnailUrl`, `og:image`/`twitter:image` | data inside a script / metadata a browser never fetches |

The metadata classes are a **separate question from requests**: they are never
fetched, but they do print the original's asset URLs into our HTML, which the
publication/rights revisit (ticket 11) must answer; this ADR records them as inert
for the *network* invariant and flags them for that revisit. The `srcdoc` class is
the one with teeth — the captured third-party **VocalVideo** widget documents stay
in place (their runtime is stripped and their sandbox has no `allow-scripts`, so
they render as thin inert slivers on their pages); the single captured
`allow-scripts` `srcdoc` (`/flock-forward`, a cvt-embed widget) carries only an
`ld+json` data block, so `srcdoc scripts` is 0 site-wide.

Video then makes those 92 pages network-dependent at view time and reintroduces
third-party frames that can set cookies and emit telemetry, in tension with the
piece's no-tracker posture. Images stay fully offline, so the CSP needs no
`img-src` change at all — and that is what holds the line on the remote image
references the captures do still carry.
