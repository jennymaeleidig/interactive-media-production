# 06: Non-affiliation disclaimer and forms-disabled notice

**What to build:** The published site carries a visible non-affiliation
disclaimer and a notice that form submissions are disabled, added as a reviewed
served-byte migration rather than a host-side injection, so the published bytes
and the tree remain one artifact.

**Blocked by:** 04.

**Status:** open

- [ ] The disclaimer and the forms notice are visible on the published pages, or
      a recorded decision names exactly which pages carry them.
- [ ] The change is a committed `served/` migration whose commit message says why
      a frozen byte changed, and `npm run routes` passes.
- [ ] The two content-projection test projects still pass — no non-full-page
      `.html` file was added under `served/`.
- [ ] After the next deploy the notices appear on the live site, and post-deploy
      byte-identity against the tree still holds.
- [ ] The Chat mimic's silent no-op against a static host is either covered by
      the disclaimer or explicitly recorded as an accepted gap.
