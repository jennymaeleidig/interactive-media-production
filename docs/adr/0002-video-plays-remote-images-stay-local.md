# Video plays from the original hosts; captured images are extracted locally

The Recreation cannot host the media it reproduces — the 115 Wistia masters alone
are ~47.7 GB — so the video slots will play from the original hosts as plain
remote embeds (`https://fast.wistia.net/embed/iframe/<id>`,
`https://www.youtube.com/embed/<id>`), the one deliberate exception to "served
pages make zero outbound requests". Page images could not take that route:
SingleFile inlines every asset and drops its origin URL — the captures hold `0`
remote `img src`, `0` `data-src`, `0` `srcset`, and even the `--sf-img-*` custom
properties carry `data:` URIs — so there is no URL left to point at. The build
therefore extracts each inlined `data:` URI into one content-addressed file
(`/assets/<sha16>.<ext>`, served same-origin by `app/assets/[...path]/route.ts`)
and rewrites the reference, which is also what collapses the served tree from
10 GB to 2.1 GB (143,959 inline references → 3,010 files: the same logo was
re-encoded on all 1,180 pages).

**Status.** Accepted 2026-09-11. The **images half is built**; the **video half
is decided and not yet built** — until it lands, served pages still make zero
outbound requests, because extracted assets are same-origin.

**Considered options.** Host the videos ourselves — rejected: ~47.7 GB of
masters to store, re-encode, and keep live for a piece that never needed to own
them. Re-capture with `--browser-script` stashing `img.currentSrc` before
inlining, to recover real image URLs — rejected: it invalidates the verified
captures and re-opens every fidelity gate to trade same-origin files for remote
ones. Leave the slots inert behind a liveness gate (the earlier plan) — rejected:
empty boxes are the piece's most visible failure mode.

**Consequences.** The invariant becomes **allow-list enforced rather than true
by construction** for video: the captured CSP is `default-src 'none'` with
`frame-src 'self' data:`, so the embeds need explicit `frame-src` grants for
`fast.wistia.net` and `www.youtube.com`, and the audit — not the build — is what
keeps every other host out. Video then makes a served page network-dependent at
view time and reintroduces third-party frames that can set cookies and emit
telemetry, which sits in tension with the piece's no-tracker posture. Images stay
fully offline, so the CSP needs no `img-src` change at all. The extraction pass
must run **before** the injection passes: the Recreation's own runtimes are
inlined verbatim, and `chat-widget.css` carries three `data:` URIs of its own.
