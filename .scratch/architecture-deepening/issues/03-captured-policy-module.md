# 03 — One module owns the captured policy

Status: open
Blocked by: 01

## What to build

Review candidate 5. The served page's `content-security-policy` meta is edited
by three separate grant implementations — `pipeline/build.mjs:760–835`
(`CSP_META_RE`, `grantConnectSelf`, `grantFrameSrc`), `:1093–1097`, and
`pipeline/dedupe.mjs:65–99, 225–250` (`CSP_META_RE`, `cspMeta`, `grantSelf`) —
and the regex that finds it is copied into two modules.

Create `pipeline/csp.mjs`: parse the meta, grant a source to a directive by
**replacing** it (never appending: a second directive intersects and blocks),
and return the new bytes plus the grant it recorded. The chat pass, the embed
pass, and pass 14 all call it.

## Acceptance criteria

- [ ] One `CSP_META_RE`-equivalent in the repo.
- [ ] One grant operation; the three call sites express only *which* directive
      and *which* sources.
- [ ] The duplicate-directive invariant (exactly one `style-src` / `script-src` /
      `frame-src` after grants) is tested once, at the module.
- [ ] `CODING_STANDARDS.md`'s "the chat mount is the one pass that touches the
      policy" is corrected to name the module and the three grants.
- [ ] Fixture output byte-identical (`.tmp/golden` diff empty).
