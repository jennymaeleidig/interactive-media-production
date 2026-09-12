# 18: The slots that stay as captured — decide, then make them honest

**What to build:** Two classes of video slot keep their captured end-state, and
both are still open decisions rather than settled ones. First, the **11 `popover`
slots** (`vt9nqarq00`, `xa0qd1v26f`, `ckurdgha9i`, `a3jqo66osk`, `77o31nkq0o`,
`r7msnpoy6p`, `98x4ka5m49`, `a8fprewcz6`, `lemqdqhqaj`, `ueo7k59ryn`,
`7flksigewi`): the capture froze Wistia's click-to-play thumbnail, so the slot
shows a poster *with a play button* — and the button does nothing, because the
runtime that would have opened the overlay is stripped. A control that invites a
click and ignores it is the "empty box" failure mode in disguise, which is the
failure the whole embed pass exists to remove. Second, the **12 JSON-LD videos no
slot markup points at** (reported per page by the pass): either the page simply
never rendered them, or a slot the original had is missing from the Capture.
Decide both with the user, then make whichever class stays captured *honest*.

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
- [ ] The 12 slot-less JSON-LD videos are classified: never rendered by the
      original, or a Capture gap. The answer distinguishes the two, per page.
- [ ] The outcome lands in ADR 0002 (or its successor) and in the spec's residual
      list with counts, so the next reader does not re-derive it.
- [ ] Anything wired up keeps `npm run routes` green and `off-allowlist frames` at 0.

## Comments

**Opened 2026-09-11** from the Tier 1 embed work (`72b1bbb`), where both classes
were skipped on purpose: the popovers because going inline is a layout change, not
just a behavior change, and the slot-less JSON-LD entries because there is no slot
to rewrite. The pass reports both per page (`popover`, `unreachable`) and the build
summary prints them, so the counts stay visible until this closes.
