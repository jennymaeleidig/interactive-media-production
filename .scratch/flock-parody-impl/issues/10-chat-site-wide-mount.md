# 10: Chat site-wide mount

**What to build:** The mimic appears wherever the original had it, and nowhere else. A census of the Captures records which pages mounted the launcher; the serving layer mounts the mimic on exactly those pages.

**Blocked by:** 07, 09.

**Status:** open
Label: ready-for-agent

- [ ] The build records, per page, whether the original mounted the chat launcher.
- [ ] The mimic is mounted on every page where the original had it.
- [ ] The mimic is absent from pages where the original did not have it.
- [ ] The launcher and its behavior are consistent across all mounted pages.
- [ ] The serving check (`npm run routes`) remains green with the mimic mounted site-wide.
