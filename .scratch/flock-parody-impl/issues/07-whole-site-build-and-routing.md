# 07: Whole-site build & routing

**What to build:** The entire Recreation exists. All build passes run across the full capture run, producing the served tree at original paths. The redirect manifest serves the legacy stubs as permanent redirects to their local targets; scaffold and test pages are dropped from serving; dead collection roots return 404. A single config value points the build at a capture run. The serving gate is green at full scale and the strip audit is clean site-wide.

**Blocked by:** 02, 03, 04, 05, 06.

**Status:** claimed
Label: ready-for-agent

- [ ] Every live path from the inventory returns 200 and serves its captured page.
- [ ] Every legacy redirect stub returns a permanent redirect to its local target.
- [ ] Every dead collection root returns 404.
- [ ] Scaffold and test pages are not served.
- [ ] The served page count matches the inventory's live-page count.
- [ ] The strip audit is clean across the whole site.
- [ ] Moving to a different capture run is a one-value change.
- [ ] The serving gate is green at full scale.
