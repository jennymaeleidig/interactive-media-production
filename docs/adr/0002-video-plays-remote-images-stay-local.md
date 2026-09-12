# Video plays from the original hosts; captured images are extracted locally

The Recreation cannot host the media it reproduces — the 115 Wistia masters alone
are ~47.7 GB — so the video slots play from the original hosts as plain remote
embeds (`https://fast.wistia.net/embed/iframe/<id>`), the one deliberate
exception to "served pages make zero outbound requests". Page images could not
take that route: SingleFile inlines every asset and drops its origin URL — the
captures hold `0` remote `img src`, `0` `data-src`, `0` `srcset`, and even the
`--sf-img-*` custom properties carry `data:` URIs — so there is no URL left to
point at. The build therefore extracts each inlined `data:` URI into one
content-addressed file (`/assets/<sha16>.<ext>`, served same-origin by
`app/assets/[...path]/route.ts`) and rewrites the reference, which is also what
collapses the served tree from 10 GB to 2.1 GB (143,959 inline references → ~2,900
files: the same logo was re-encoded on all 1,180 pages).

**Status.** Accepted 2026-09-11; **built** for Wistia (115 live players on 82
pages). Still open, each for a stated reason: YouTube's three panels sit
`inert`/`opacity:0` until a site script reveals them and that reveal is not
reproduced, so a live `src` would load a frame nobody can see; the 11 `popover`
slots keep their captured click-to-play thumbnail because going inline would
change the layout, not just the behavior; and 10 pages carry a **Vidzflow**
video.js player (120 `r2.vidzflow.com` poster references) that no pass covers —
found while building this, not previously inventoried.

**Considered options.** Host the videos ourselves — rejected: ~47.7 GB of
masters to store, re-encode, and keep live for a piece that never needed to own
them. Re-capture with `--browser-script` stashing `img.currentSrc` before
inlining, to recover real image URLs — rejected: it invalidates the verified
captures and re-opens every fidelity gate to trade same-origin files for remote
ones. Leave the slots inert behind a liveness gate (the earlier plan) — rejected:
empty boxes are the piece's most visible failure mode. A click-through anchor
over the captured poster (no frame at all, invariant intact) — rejected for now:
it leaves the site mid-experience, where the original played in place.

**Consequences.** The invariant becomes **allow-list enforced rather than true by
construction** for video: the captured CSP is `default-src 'none'` with
`frame-src 'self' data:`, so the pass *replaces* that directive with the hosts it
actually used (appending a second `frame-src` would intersect with the first and
keep the players blocked), and the strip audit counts every frame pointed
elsewhere — `off-allowlist frames` must be 0 on every page, which is what keeps
the exception from spreading. Video then makes those 82 pages network-dependent
at view time and reintroduces third-party frames that can set cookies and emit
telemetry, in tension with the piece's no-tracker posture. Images stay fully
offline, so the CSP needs no `img-src` change at all — and that is what holds the
line on the remote image references the captures do still carry (a captured
`poster=`, a Lottie `data-src`, a Wistia swatch in CSS): `img-src 'self' data:`
refuses every one of them, so the bytes are not honest but the behavior is.
