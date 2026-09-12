# 18: The slots that stay as captured — decide, then make them honest

**What to build:** Two classes of video slot keep their captured end-state, and
both are open decisions rather than settled ones. First, the **13 `popover` slots**
(11 distinct medias: `vt9nqarq00`, `xa0qd1v26f`, `ckurdgha9i`, `a3jqo66osk`,
`77o31nkq0o`, `r7msnpoy6p`, `98x4ka5m49`, `a8fprewcz6`, `lemqdqhqaj`,
`ueo7k59ryn`, `7flksigewi` — two of them dead upstream): the capture froze Wistia's
click-to-play thumbnail, so the slot shows a poster *with a play button* — and the
button does nothing, because the runtime that would have opened the overlay is
stripped. A control that invites a click and ignores it is the "empty box" failure
mode in disguise, which is the failure the whole embed pass exists to remove.
Second, the medias a page's JSON-LD names that **no slot markup rewrote** (the
pass's `unreachable` count, 12 site-wide): 11 of those are the popover slots' own
medias, so the only genuinely slot-free one is
`/webinar/preventing-crime-at-your-properties` — either the page simply never
rendered a slot, or one the original had is missing from the Capture. Decide both
with the user, then make whichever class stays captured *honest*.

**Blocked by:** none.

**Status:** resolved
Label: ready-for-agent

- [x] The popover call is made and recorded: inline player (changes the layout,
      which is why it was left alone), the captured click-to-play facade made real
      (a delegated click opens the player — the interaction layer's shape), or the
      facade made honest another way (e.g. an external link to the real media, which
      the link policy already permits). **Call: inline.** Measured on the built
      tree, the popover box is already the captured 16:9 `wistia_responsive_padding`
      box (thumbnail 1065.66×599.422 = 0.562), so inlining moves nothing — which
      removes the only reason the ADR gave to leave them. `embedPass` now rewrites
      `popover=true` slots like any other chrome slot (11 live across 11 pages).
- [x] If anything stays inert, the *inert control* is dealt with: no captured
      control is left inviting a click it cannot answer, or the residual is named
      in the spec as an accepted divergence with its reason. **The 2 dead popover
      medias** (`77o31nkq0o`, `ueo7k59ryn`, Wistia answers `{"error":true}`) keep the
      captured facade, because there is nothing upstream to play; this is recorded
      as an accepted divergence in ADR 0002 (the one place a captured play button
      still answers no click), alongside the 2 slot-less named medias.
- [x] `/webinar/preventing-crime-at-your-properties` is classified — never rendered
      by the original, or a Capture gap — and the answer distinguishes the two.
      **Classified: never rendered a slot.** The page names `x4p8hk2p57` only as a
      body-copy link (`flocksafety.wistia.com/medias/x4p8hk2p57`, context `link`,
      alive upstream) — the page's own affordance, which the link policy permits.
      A second slot-less media turned up with the attribute detection:
      `ah1n072ovb` on `/blog/vehicle-and-catalytic-converter-theft-…`, named only
      inside the captured CSS rule `wistia-player[media-id="ah1n072ovb"]:not(*)`,
      whose `:not(*)` matches nothing (the element was never captured). Both are
      recorded in ADR 0002.
- [x] The outcome lands in ADR 0002 (or its successor) and in the spec's residual
      list with counts, so the next reader does not re-derive it. ADR 0002's Status
      and residual paragraph, and `spec.md`'s video bullet + Out of Scope, now carry
      the numbers.
- [x] Anything wired up keeps `npm run routes` green and `off-allowlist frames` at 0.
      All audit keys 0 on all 1,180 pages; serving check green.

## Comments

**Opened 2026-09-11** from the Tier 1 embed work (`72b1bbb`), where both classes
were skipped on purpose: the popovers because going inline is a layout change, not
just a behavior change, and the slot-less JSON-LD entries because there is no slot
to rewrite. The pass reports both per page (`popover`, `unreachable`) and the build
summary prints them, so the counts stay visible until this closes.

**Correction (two-axis review of `e1a68af`, 2026-09-11):** this ticket first said
"11 popover slots" (that is the distinct-*media* count; the tree has 13 slots) and
"12 JSON-LD videos no slot markup points at" — the pass's `unreachable` means "not
rewritten", and 11 of the 12 are the popover slots' own medias. The build summary's
line said "no slot points at" too; it now reads "media(s) named in JSON-LD without
a slot rewrite".

**Resolved 2026-09-11.** `pipeline/embeds.mjs` no longer skips `popover=true`
slots: it counts them (`reshaped.popover`) and inlines them. The build now reports
**130 live Wistia frames on 92 pages (115 distinct medias)**, 11 of them popovers,
with `unreachable` down from 12 to 2 (the two slot-less medias above). Browser
check on `/webinar/de-risk-your-response-with-ai-powered-audio-detection`: one
`fast.wistia.net` iframe at 1112×626 (16:9), no `wistia_click_to_play` facade, no
console CSP error.
