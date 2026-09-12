# 19: Vidzflow — the fourth video provider

**What to build:** Ten pages carry a video.js player whose runtime is stripped: 12
`<video class="video-js ...">` elements per page, 120 in total, whose `poster` and
sources point at `https://r2.vidzflow.com/…`. The captured `img-src 'self' data:`
refuses that poster, so these render as **black boxes with no artwork** — 120 of
them, the most visible failure state in the piece — and no inventory, pass or ADR
has ever mentioned the provider. Inventory it, decide mimic-or-strip with the user,
and build the decision.

**Blocked by:** none. **Related:** 20 (the poster references are one of its
classes), 18 (the shared question of what a slot that cannot play should show).

**Status:** open
Label: ready-for-agent

- [ ] `pipeline/video-inventory.mjs` covers the provider, or the inventory states
      plainly why it does not — either way a *fifth* provider cannot hide the same
      way, so the criterion is a completeness check, not just this host.
- [ ] The slot shape is documented: element, poster, sources, the surrounding
      layout box, and whether a playable embed URL exists for this provider at all
      (the Wistia pass works because the capture carries the player's own
      `embedUrl`; nothing here is known to carry one).
- [ ] The user's call is recorded and implemented — mimic in place (needs a local
      poster and a player), link out, or strip with the surrounding layout
      accounted for. A black box is not an acceptable resting state.
- [ ] If the host is kept live: `MEDIA_HOSTS` names it, `frame-src`/`img-src` are
      widened on exactly those pages, `off-allowlist frames` stays 0, browser
      evidence on one page.
- [ ] ADR 0002's "Vidzflow, uncovered" open item is closed and the spec updated.

## Comments

**Opened 2026-09-11** from the Tier 1 embed work (`72b1bbb`), found while checking
the pass's coverage rather than while looking for it: the embed pass matches
Wistia's three captured shapes and nothing else, and the inventory keys on Wistia
and YouTube hosts only.

Measured on the built tree: 120 `<video>` elements on 10 pages
(`products/flock-aerodrome-drone-as-automated-security`, `use-case/emergency-response`,
`use-case/event-security`, …), each element naming the host about six times (poster,
sources, setup JSON) for 720 references in all. The pages also carry a **malformed**
`og:image` — `content=https://r2.vidzflow.com/https://r2.vidzflow.com/thumbnails/<hash>.jpg`,
the URL doubled, which is broken on the live site too and captured as-is.
