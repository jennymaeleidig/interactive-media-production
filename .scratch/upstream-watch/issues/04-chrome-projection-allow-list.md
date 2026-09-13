# 04 — The chrome projection and the allow-list

Status: open
Blocked by: 03

## What to build

Chrome drift, without our own strip showing up as noise. A live page's nav,
footer and global chrome differ from ours by exactly the regions the strip pass
removed — the sign-in link, the chat launcher, the OneTrust stack, the Qualified
offer — so a raw chrome diff is permanently non-empty and useless as an alarm.

Split the projection in two: the copy projection stays a hard finding (ticket 03),
and the **chrome projection** is diffed against an allow-list whose entries are
named after the strip table's eleven targets — `account sign-in link`, `q-root
(chat launcher)`, `q-focus-sentinel`, the two Qualified style targets, the four
OneTrust targets, `onetrust-style` — the same vocabulary `served/build-log.json`
already logs per page.

The allow-list's real scope is the delta ticket 03 measured, not a guess, and each
entry records the measurement behind it. Allow-list hits are counted, never
silently dropped: a run says how much chrome text was expected to differ, so an
entry masking real drift shows up as a growing count rather than as silence.

The motivating false positive is on the record: the live nav's
`users.flocksafety.com` sign-in link reads as drift against a tree that stripped
it by class, logged at 1,404 bytes on the homepage.

## Acceptance criteria

- [ ] the chrome projection is separate from the copy projection, and its
      comparison is a soft finding
- [ ] allow-list entries are named after the strip table's targets, each carrying
      the measurement that put it there
- [ ] with the allow-list applied, feeding the committed tree in as both sides
      yields zero findings
- [ ] allow-list hits are reported as a per-run count
- [ ] removing an entry in a fixture makes the corresponding finding reappear
- [ ] a chrome change the strip does not explain — a new nav item, a renamed menu
      — is reported as a finding
- [ ] the sign-in-link false positive is recorded with its evidence, so no future
      live-versus-ours idea has to rediscover it
- [ ] pinned in the pure watch seam's vitest project, and `npm test` stays offline
