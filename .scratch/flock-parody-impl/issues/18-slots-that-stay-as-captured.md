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

**Status:** open
Label: ready-for-agent

- [ ] The popover call is made and recorded: inline player (changes the layout,
      which is why it was left alone), the captured click-to-play facade made real
      (a delegated click opens the player — the interaction layer's shape), or the
      facade made honest another way (e.g. an external link to the real media, which
      the link policy already permits).
- [ ] If anything stays inert, the *inert control* is dealt with: no captured
      control is left inviting a click it cannot answer, or the residual is named
      in the spec as an accepted divergence with its reason.
- [ ] `/webinar/preventing-crime-at-your-properties` is classified — never rendered
      by the original, or a Capture gap — and the answer distinguishes the two.
- [ ] The outcome lands in ADR 0002 (or its successor) and in the spec's residual
      list with counts, so the next reader does not re-derive it.
- [ ] Anything wired up keeps `npm run routes` green and `off-allowlist frames` at 0.

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
