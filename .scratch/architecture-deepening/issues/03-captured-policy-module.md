# 03 — One module owns the captured policy

Status: resolved
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

- [x] One `CSP_META_RE`-equivalent in the repo.
- [x] One grant operation; the three call sites express only *which* directive
      and *which* sources.
- [x] The duplicate-directive invariant (exactly one `style-src` / `script-src` /
      `frame-src` after grants) is tested once, at the module.
- [x] `CODING_STANDARDS.md`'s "the chat mount is the one pass that touches the
      policy" is corrected to name the module and the three grants.
- [x] Fixture output byte-identical (`.tmp/golden` diff empty).

## Comments

Measured the frozen tree before writing the module, which settled which branches
are live and how to word the invariant: 1,181 pages, **22 with no CSP meta at
all** (that warning path is real, not defensive), none missing a `content`
attribute, **no page with a duplicate directive**, and six distinct policy
values that all end in the appended `connect-src 'self';` — so the captured
policy carries no `connect-src` and every served `connect-src` is the chat
mount's append.

The one behavioural change, unreachable in the corpus and a strict improvement:
the chat mount used to leave an *existing* `connect-src` untouched; it now
widens it with `'self'` like the other two grants, which is what the POST needs.
No served page has a captured `connect-src` (proven above), so the bytes do not
move.

Evidence: `.tmp/golden` tree and mutation log both identical; 334 tests green in
17 files.
