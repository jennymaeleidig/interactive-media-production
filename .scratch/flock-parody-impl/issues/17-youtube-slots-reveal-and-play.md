# 17: YouTube slots — reproduce the reveal, then play

**What to build:** The `/trust` pages carry **19** YouTube slot iframes holding
**16 distinct** video ids, and not one of them plays. Each is a `src`-less
`<iframe data-video-id=<id> class=th_video>` inside a hidden reveal panel
(`div.th_video-wrapper[data-youtube-video]` carrying `inert` +
`opacity:0;visibility:hidden`). The original's JS set the frame's `src` and
revealed the panel; neither survives the Capture, and nothing in the injected
runtimes opens those panels — so the slot is invisible *and* empty. Reproduce the
reveal as delegated-interaction work in ticket 05's shape (captured DOM + one
runtime, no per-page logic), then let the embed pass point each revealed frame at
`https://www.youtube.com/embed/<id>` under the same allow-list and audit the Wistia
slots already use.

**Blocked by:** none — `MEDIA_HOSTS` already names `www.youtube.com` and the
`frame-src` grant is host-driven, so the pass needs no new mechanism.

**Status:** open
Label: ready-for-agent

- [ ] `pipeline/video-inventory.mjs` can see attribute-form slots. It detects a
      video only through URL forms (`youtube.com/embed`, watch links, Wistia embed
      URLs and media links), so it counts **3** of these 16 ids and the other 13 are
      absent from `videos.json` entirely. The same gap hides
      `<wistia-player media-id=<id>>` slots — proven, not theorised: the inventory
      reported 179 videos until this session's embed pass rewrote one attribute-form
      slot into a live embed URL, and the count became 180
      (`wistia:tthkbjay3c`, `webinar/prepared-for-anything-…`), with the old
      extractor agreeing once the tree changed. **That media turned out to be dead
      upstream**, which is the sharp edge of this gap: because the inventory could
      not see the slot, the dead-media list never had the id, and the pass had
      already made a live frame to a dead player (a visible error box where the
      captured poster used to be). The probe caught it only after the inventory
      grew; the list gained a fifth entry and the live count went 120 → 119.
      Detection keys on the captured
      `data-video-id` / `media-id` attributes, bounded so `podcast.html`'s 24-char
      episode-button ids cannot match.
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
inert one. Re-measuring the built tree found 19 iframes / 16 ids on three pages,
which is what makes this its own ticket rather than a line in that commit.

Slots by page: `trust.html` 3, `trust/compliance-tools.html` 4,
`trust/myths-facts.html` 12. Ids include `czWZT0qQ5HU`, `yBQN9orr_Ho`,
`MSElcwBMm-k`, `lV1WCvNGnmM`, `Qq1eaw86JWw`, `j2haBJmgerY`, `J0omZcIxKQc`.

**Correction (two-axis review of `e1a68af`, 2026-09-11):** this ticket first said
"16 slots" (distinct ids, not iframes) and "13 ids the inventory cannot see" — both
were counts of ids where the tree carries iframes.
