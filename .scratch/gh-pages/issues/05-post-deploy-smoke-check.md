# 05: Post-deploy smoke check against the live site

**What to build:** A hand-run check that takes the deployed host and asserts the
live site still matches the tree: sampled page routes answer 200 with bodies
byte-identical to their served files, assets answer with the content type their
extension declares, a redirect source answers 200 and reaches its target, and a
dead path answers 404 with the site's own not-found words. This is the only seam
that touches the network, and it exists because the in-repo byte-identity check
is self-referential and cannot see a publish that altered bytes.

**Blocked by:** 04.

**Status:** open

- [ ] The check reports each sampled route's status and its byte comparison, and
      exits non-zero on any mismatch.
- [ ] The redirect result records the actual status (expected **200**, not 301)
      and the destination reached.
- [ ] The output records whether the Actions build route resolves extensionless
      paths the way the observed branch-published route does — settling the one
      unconfirmed platform fact.
- [ ] Running it against the live site passes; running it against a deliberately
      altered fixture fails with a named first-differing byte.
