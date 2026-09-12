# 17: YouTube slots — reproduce the reveal, then play

**What to build:** The `/trust` pages carry **16** YouTube slots and not one of them
plays. Each is a `src`-less `<iframe data-video-id=<id> class=th_video>` inside a
hidden reveal panel (`div.th_video-wrapper[data-youtube-video]` carrying
`inert` + `opacity:0;visibility:hidden`). The original's JS set the frame's `src`
and revealed the panel; neither survives the Capture, and nothing in the injected
runtimes opens those panels — so the slot is invisible *and* empty. Reproduce the
reveal as delegated-interaction work in ticket 05's shape (captured DOM + one
runtime, no per-page logic), then let the embed pass point each revealed frame at
`https://www.youtube.com/embed/<id>` under the same allow-list and audit the Wistia
slots already use.

**Blocked by:** none — `MEDIA_HOSTS` already names `www.youtube.com` and the
`frame-src` grant is host-driven, so the pass needs no new mechanism.

**Status:** open
Label: ready-for-agent

- [ ] `pipeline/video-inventory.mjs` can see these slots. It detects YouTube only
      through `youtube.com/embed` URLs and watch links, so it counts **3** of the
      16 and the other 13 ids are absent from `videos.json` entirely — a whole slot
      class the inventory cannot see, in the one place video coverage is claimed.
      Detection keys on the captured `data-video-id` attribute, bounded so
      `podcast.html`'s 24-char episode-button ids cannot match.
- [ ] The reveal is reproduced: a click on the page's own trigger opens the panel
      and starts the player, at desktop and mobile, with no new copy and no new
      visual vocabulary (the panel's own captured markup supplies both).
- [ ] Every revealed frame loads `https://www.youtube.com/embed/<id>`; the pass
      widens `frame-src` for `www.youtube.com` on exactly the pages that use it.
- [ ] The alternative is answered rather than left implicit: keep the slot inert
      but *visible* as a poster (which needs a local poster — the JSON-LD
      `thumbnailUrl` is `i.ytimg.com`, refused by `img-src 'self' data:`), or make
      the slot a link out. The answer is recorded here before the work starts.
- [ ] `npm run routes` green, `off-allowlist frames` audit 0, browser evidence for
      `trust.html` and `trust/compliance-tools.html`.

## Comments

**Opened 2026-09-11** out of the Tier 1 embed work (`72b1bbb`). Scope was cut there
deliberately on the recon's count of **3** YouTube slots — the ids the inventory
could see — with the reasoning that loading a frame nobody can see is worse than an
inert one. Re-measuring the built tree found **16** slots across three pages, which
is what makes this its own ticket rather than a line in that commit.

Slots: `czWZT0qQ5HU`, `yBQN9orr_Ho`, `MSElcwBMm-k` on `trust.html` and
`trust/myths-facts.html`; 13 further ids on `trust/myths-facts.html` and
`trust/compliance-tools.html` (e.g. `lV1WCvNGnmM`, `Qq1eaw86JWw`, `j2haBJmgerY`,
`J0omZcIxKQc`).
