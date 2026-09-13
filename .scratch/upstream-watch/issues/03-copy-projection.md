# 03 — The copy projection

Status: open
Blocked by: 01

## What to build

The watch reports whose prose changed. For every URL the universe holds that the
tree serves, it fetches the live body, extracts the **copy projection** — the
prose the Recreation reproduces: headings, paragraphs, list items, blockquotes —
and compares it to the same projection of the served page.

This ticket proves the projection by measuring it, not by assuming it: the copy
projection of every served page must equal the projection of the live page it
reproduces, and the steady state is an empty report. A difference is a hard
finding — either the page's copy is out of date, or the projection is wrong — and
the first measurement decides which. That answer belongs in the module header
either way.

The offline pin is the same core called with the committed tree fed in as the
"live" side: no network, and every served page asserting the steady state.

The comparison is between two projections and never between raw bytes. The tree
is a deliberate lossy transform — the strip pass, the link rewrites, the body
dedupe, the injected layers — so live bytes and served bytes are not comparable
by construction, and the module says so where the next person will read it.

## Acceptance criteria

- [ ] the copy projection is a pure function of HTML, with its rules — what counts
      as prose, how whitespace and entities normalize — declared in the module
- [ ] the live-versus-served comparison yields a per-page finding naming the path
      and the differing runs, not a page-level boolean
- [ ] feeding the committed tree in as both sides yields zero findings across
      every served page: the offline steady-state pin
- [ ] a fixture with one changed paragraph produces exactly one finding, for that
      page
- [ ] the run reports how many pages it compared and how many differed
- [ ] no raw live bytes are compared to served bytes, and the module carries the
      reason and the worked false positive
- [ ] the measured live-versus-served copy delta is recorded on this ticket, and
      that measurement decides ticket 04's allow-list scope
- [ ] projection and comparison are pure, with their own vitest project row, and
      `npm test` stays offline
