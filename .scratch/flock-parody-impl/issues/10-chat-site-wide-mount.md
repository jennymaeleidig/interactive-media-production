# 10: Chat site-wide mount

**What to build:** The mimic appears wherever the original had it, and nowhere else. A census of the Captures records which pages mounted the launcher; the serving layer mounts the mimic on exactly those pages.

**Blocked by:** 07, 09.

## Comments

- From ticket 09 (2026-09-10): the widget stylesheet now carries the
  Capture's own `Inter var` regular face inline (~303KB of base64 in
  `components/chat-widget.css`). Mounting the widget site-wide puts that CSS
  into every served page. The original capture inlined the same fonts, so
  this is faithful and keeps the zero-outbound-requests invariant — but it is
  a site-weight line item to weigh (or subset) when this ticket lands.

**Status:** open
Label: ready-for-agent

- [ ] The build records, per page, whether the original mounted the chat launcher.
- [ ] The mimic is mounted on every page where the original had it.
- [ ] The mimic is absent from pages where the original did not have it.
- [ ] The launcher and its behavior are consistent across all mounted pages.
- [ ] The serving check (`npm run routes`) remains green with the mimic mounted site-wide.
