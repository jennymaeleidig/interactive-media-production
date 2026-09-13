# 12: Final fidelity signoff

**What to build:** The signed-off Recreation. A full re-capture refreshes ground truth; the serving check (`npm run routes`) is re-run against the new run — every route class, every served page's byte-identity, the count identity, and the site-wide strip audit — and a human side-by-side over a representative sample confirms runtime feel (animations, chat overlay, pounce timing) and that the strip visually reads as intended. The result is the phase-gate signoff that the fidelity bar is met.

**Blocked by:** 10, 11.

**Status:** claimed
Label: ready-for-agent

- [x] A full re-capture produces a fresh run folder and inventory diff.
- [x] `npm run routes` is green against the new run (route classes + byte-identity + strip audit).
- [ ] A human side-by-side confirms runtime feel on representative pages.
- [ ] The strip's visual result is confirmed by eye on representative pages — the Qualified offer bar, the OneTrust consent card, and the reclaimed header-height reflow are gone, and the page otherwise reads identically to the Capture.
- [x] The signed-off build's capture pointer references the final run.
- [x] Any accepted dead paths are recorded in the signoff.

## Review sample

The human side-by-side (the only check covering runtime feel and the visual
strip result) covers one page per template family plus the largest and hardest
cases. Verified present in the signed-off `2026-09-12` run (the checklist pack
is generated from it):

- index: `/`, `/blog`, `/customers`, `/resources`, `/trust`, `/press-center`, `/upcoming-events`
- marketing: `/industries/retail`, `/gsx`, `/flock-ecosystem`, `/what-is-flock`
- product: `/products/license-plate-readers`, `/products/video-cameras`, `/products/flock-os`, `/products/gunshot-detection`, `/products/mobile-security-trailer`, `/products/flock-dfr`, `/safe-cities`
- post: `/blog/how-effective-is-flock`, `/blog/tips-for-leaving-town`, `/blog/why-flock`, `/customers/how-spring-branch-independent-school-district-is-stopping-crime-with-a-flock-safety-falcon-and-raven-system`
- resource: `/ebooks/apartment-security`, `/webinar/product-launch`, `/podcast`
- legal: `/legal/terms-and-conditions`, `/legal/privacy-policy`
- utility: `/book-a-demo`, `/thank-you`, `/newsletter`, `/partner-inquiry`, `/refer`, `/chilipiper-2`, `/accessibility-plan`
- campaign LP: `/lp/proven-where-it-matters`, `/abm/amazon`
- long-form utility: `/implementation-guide`

A human review of a sample, not an automated sweep: the retired pixel gate
(ticket 06) rendered ~1,180 pages × 3 viewports for ~2 h and only ever compared
the served output against itself.

## Implementation (2026-09-12)

Signoff record: `.scratch/flock-parody-impl/evidence/12-final-signoff/README.md`.

**Run.** `research/flocksafety/2026-09-12/`, 13 GB, **1,200 / 1,200 pages, 0
failed** (one transient-outage pass cleared by `--resume`). Inventory diff
1,279 → 1,290 rows, **no route actions**. `CAPTURE_RUN` now points here.

**Gates.** `npm run pipeline` (1,181 served + 19 dropped = 1,200, every page
`audit: clean`, 0 executable capture scripts, chat census 1,181/0); `npm run
build` succeeds; `npm run routes` **green** (1,290 routes, 1,181 byte-identical
pages, 2,960 assets, count identity). A new `title-check.mjs` proves every
captured page carries its intended title.

**Four driver defects found at scale, fixed and tested** (`pipeline/recapture.mjs`
+ `test/recapture.test.ts`): the blocking `spawnSync` that made `--parallel 4`
serial (~33 h projected — the reason this ticket stalled), `errors.log` not
truncated on resume, `title-repairs.csv` overwritten on resume, and a resume's
synthetic rows overwriting real verdicts. The run's `capture-status.csv` was
normalized once for the last of these. The refresh also caught a third-party
launcher race: 12 pages captured without Qualified's `<q-root>`, re-captured,
census now 1,181/0.

**Open:** the two human checks (§5 of the signoff record; review pack at
`evidence/12-final-signoff/review-checklist.md`). Ticket stays `claimed` until a
human runs the side-by-side and the strip confirmation.

### Addendum (2026-09-12): the human review's first finding

The human review began with "looks mostly good"; its first concrete finding was
that the `/safe-cities` hover videos did not play inline (the CDN URL worked only
in a new tab). Root cause: SingleFile's default `--block-videos=true` kept a
source-less `<video>` plus an injected link to the CDN mp4, which the captured
`media-src 'self' data:` refused. Fixed by capturing with
`--block-videos=false --blocked-url-pattern 'r2\.vidzflow\.com'`, re-capturing
the five visible-HTML5 pages (scoped `--resume`, 5 saved / 0 failed), and
building the two latent regex stack overflows the larger values exposed
(`OPEN_TAG` in `pipeline/embeds.mjs`; the bare-value pattern in
`pipeline/assets.mjs`) with regression tests. Served pages now play
`/assets/*.mp4|webm`; assets are 2,960 files / 508 MB and `npm run routes` stays
green. Full record: `evidence/12-final-signoff/README.md` §3a.

The same review asked for the `/safe-cities` text to be legible. Two things left
it unreadable on the dark `#061602` screen sections: the Capture froze the GSAP
scrub labels (`Detect` / `Investigate` / `Respond`) at their dark start colour
(the live page paints them the section's light content colour), and the page's
own `.t-subhead-1{color:#304833}` rule puts dark body copy on that background.
Build pass 12 (`config.LEGIBILITY_PATCHES`) injects a page-scoped, inert
`<style>` that paints both white inside `.bg-screen.scroller`, leaving the same
classes on the white FAQ accordion dark. `npm run routes` stays green and the
override is recorded as a deliberate divergence (§4).

### Addendum (2026-09-12): the review's second finding — a blog video that did not load

The review's next finding was `/blog/flock-guardrails-address-lpr-privacy-concerns-and-police-transparency`:
its video is an empty box, on the live URL as well as the served one. Live, that
page serves `<iframe src="https://www.youtube.com/embed/s2c1wtb8U7g">`; none of
the three captures holds that id anywhere, and a fresh capture with the run's
flags reproduced the src-less frame byte for byte, so the loss was not staleness.
Cause, read out of SingleFile 2.10.0's `resolveFrameURLs()`: it unconditionally
removes every `iframe`/`frame` `src` and `srcdoc` so it can re-inline the frame
document, and a cross-origin player document (YouTube) cannot be inlined — the
src is simply gone. `--save-original-urls` is the tool's own answer: the emptied
frame then carries `data-sf-original-src` with the absolute URL. A scan of the
whole run put the reported page in a set, not alone: **91 frames without any URL
across 74 pages** (blog, customers, lp, solvedstories, video).

Fix, three parts. (1) `--save-original-urls` joins the default flags in
`singleFileArgs`, with a test in `test/recapture.test.ts`. (2) The 74 pages were
re-captured **in place** into the 2026-09-12 run (back up each capture, delete
it, `--resume --scope`, 74 saved / 0 failed — the skip rule is unconditional, so
an already-captured page must be removed first); all 74 now carry the attribute,
92 recovered URLs, the reported id among them. (3) `pipeline/embeds.mjs` gained a
fifth embed shape: a src-less frame that carries the attribute is pointed back at
the URL the Capture remembered, verbatim when it is a clean absolute URL on an
allow-listed host (so `?start=`/`controls=0` survive), canonical
`https://www.youtube.com/embed/<id>` for the four Embedly-escaped values, and
left alone for `app.qualified.com` (the chat host the project deliberately does
not restore). `www.youtube-nocookie.com` joins `MEDIA_HOSTS`; the frame's host
still reaches `frame-src` only through `grantFrameSrc`. 87 frames were
re-pointed and 5 left src-less, matching the 92 recovered URLs.

Because `--save-original-urls` also records every inlined **image, stylesheet,
and link** URL, the build gained a last pass (`originalUrlsPass` →
`stripOriginalUrls`) that drops the remaining `data-sf-original-*` attributes
from served bytes: 5,141 across the tree, printing `cdn.prod.website-files.com`,
`cdnjs.cloudflare.com`, and `unpkg.com` URLs no reader needs (ADR 0002's
publication/rights question, ticket 11). Captures stay ground truth; only the
built output is cleaned.

**Caught by the totals, worth recording.** The first `originalUrlsPass` was
tag-scoped, masking `<script>`/`<style>` bodies before scanning so markup-looking
text inside code could not be read as a tag. Its rebuilt totals came back
142,488 references / 2,924 files against the previous run's 142,631 / 2,960 —
143 fewer references, 36 fewer files, with the strip as the only code change. An
A/B over the 74 re-captured pages (pass on vs. pass off, same captures, separate
out-dirs) showed the pass itself was the cause: 121 references / 90 files on the
reported page against 150 / 117 with the pass off, a missing 675 KB of inlined
stylesheet (including Chrome's injected `#cancel-save-page-button` rules) and 71
assets the extractor never saw. Rebuilding the edit text out of the masked tag
had produced a malformed tag, and the mask's backtracking regex is pathological
on a multi-megabyte inlined stylesheet (a direct call on the 12 MB capture did
not finish in five minutes). The pass is now a plain attribute sweep — linear,
86 ms on that capture, and nothing in served bytes carries the literal string
`data-sf-original-` except the attributes themselves, since the capture's scripts
are stripped before it runs. With it, the 74 pages' asset set is **identical**
with the pass on and off (314 files, same shas) and the full build is back to
142,631 references / 2,960 files / 508 MB, with `npm run routes` green on all
2,960 asset-identity checks. The failure mode is recorded in
`test/embeds.test.ts` (a linear-time test over a 3 MB synthetic stylesheet, and a
test that documents the sweep's deliberate lack of tag scoping).
