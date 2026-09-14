# 06 — Media liveness

Status: claimed
Blocked by: 04, 04b

## What to build

The one class of rot a page edit cannot explain. The media allow-list is the whole
of the exception to the tree's zero-outbound rule, so the frames a served page
carries still reach the network at runtime — the served tree (the 2026-09-12
capture) holds 217 allow-listed slots across 162 pages. When a
media dies upstream, the served page shows a dead player and nobody edited
anything.

This ticket adds the second check to the same report: enumerate every media slot
the tree serves, ask the media host whether each media is alive, and report a slot
whose media is gone as a finding naming the page and the slot. It produces the
same staleness artifact as the index, content and chrome tiers, so the report
stays one artifact rather than two.

The retired workflow's version of this probe reached a media API, an oembed
endpoint and a download tool. The smallest useful version is decided while
building, and the ticket records what it settled for and why — including whether
a media that resolves but refuses to play is in or out of scope.

## Acceptance criteria

- [ ] every media slot the tree serves is enumerated from the served bytes, as a
      pure function of a page's HTML
- [ ] a slot whose media no longer resolves produces a finding naming the page and
      the slot
- [ ] a slot whose media resolves produces no finding
- [ ] the check runs over the served tree, not a hand-listed inventory, and
      reports the same slot count the tree holds
- [ ] the report stays one artifact: a media finding appears beside index, content
      and chrome findings
- [ ] the check reaches no network while `npm test` runs; its driver is hand-run
      like the rest
- [ ] the ticket records which liveness signal it settled for and what that signal
      cannot see
