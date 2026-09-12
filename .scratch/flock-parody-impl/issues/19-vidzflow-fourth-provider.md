# 19: Vidzflow — the fourth video provider

**What to build:** Ten pages carry a video.js slot whose runtime is stripped: 120
`<video-js>` wrappers in all (12 per page), each holding an inner
`<video class=vjs-tech>` whose poster is a **local, already-extracted**
`/assets/<sha>.jpg`, plus `<source>` elements with no `src`. They render the
captured artwork and then do nothing: no runtime, no playable source, and a
`vjs-controls-disabled` class on the wrapper. No inventory, pass or ADR had ever
mentioned the provider — the embed pass matches Wistia's three captured shapes and
the inventory keys on Wistia and YouTube hosts — so this is the fourth provider,
and the only one whose slots are inert without anyone having decided they should
be. Inventory it, decide mimic-or-strip with the user, and build the decision.

**Blocked by:** none. **Related:** 20 (the poster reference is one of its classes),
18 (the shared question of what a slot that cannot play should show).

**Status:** open
Label: ready-for-agent

- [ ] `pipeline/video-inventory.mjs` covers the provider, or the inventory states
      plainly why it does not — either way a *fifth* provider cannot hide the same
      way, so the criterion is a completeness check, not just this host.
- [ ] The slot shape is documented: element, poster, sources, the surrounding
      layout box, and whether a playable embed URL exists for this provider at all
      (the Wistia pass works because the capture carries the player's own
      `embedUrl`; nothing here is known to carry one).
- [ ] The user's call is recorded and implemented — mimic in place (needs a
      playable source and a runtime), link out, or strip with the surrounding layout
      accounted for. Inert-but-showing-artwork is a resting state the user accepts
      explicitly, not one that happened.
- [ ] If the host is kept live: `MEDIA_HOSTS` names it, `frame-src`/`img-src` are
      widened on exactly those pages, `off-allowlist frames` stays 0, browser
      evidence on one page.
- [ ] ADR 0002's "Vidzflow, uncovered" open item is closed and the spec updated.

## Comments

**Opened 2026-09-11** from the Tier 1 embed work (`72b1bbb`), found while checking
the pass's coverage rather than while looking for it.

Measured on the built tree: 120 `<video-js>` elements on 10 pages
(`products/flock-aerodome-drone-as-automated-security`, `use-case/emergency-response`,
`use-case/event-security`, …). The markup, verbatim:

```html
<video-js id=vidzflow-player class="video-js vjs-paused vjs-fluid … vjs-controls-disabled …"
  poster=https://r2.vidzflow.com/thumbnails/sV3zFI7L2S_1745266257.jpg role=region …>
  <video poster="/assets/e5c9d6514bb16a4a.jpg" class=vjs-tech id=vidzflow-player_html5_api preload=metadata loop muted>
    <source type=video/mp4 size=576 label=576p>   <!-- no src: video.js set them at runtime -->
```

The pages also carry a **malformed** `og:image` —
`content=https://r2.vidzflow.com/https://r2.vidzflow.com/thumbnails/<hash>.jpg`,
the URL doubled, broken on the live site too and captured as-is (240 such metas
across the 10 pages, part of ticket 20's census).

**Correction (two-axis review of `e1a68af`, 2026-09-11):** this ticket first said
these render as "black boxes with no artwork — the most visible failure state in
the piece". That is wrong, and the check that produced it was wrong the same way
as an earlier one this session: it matched `poster=` values assuming plain quotes,
so it missed `poster=&quot;/assets/…&quot;` on the inner `<video>`. The remote
poster sits on the `<video-js>` wrapper (a custom element, so nothing fetches it,
and `img-src 'self' data:` would refuse it), while the artwork the visitor sees is
the local extracted one. Corrected premise: inert but *showing artwork*.
