# Effort: deepen the pipeline, serving, and test seams

Follows the 2026-09-13 architecture review (seven candidates, ranked). The
Recreation is a frozen snapshot (ADR 0004): `served/` cannot be rebuilt, so
**every ticket here is behaviour-preserving**. The acceptance bar for any
build-touching ticket is a byte-identical fixture output tree — the harness is
`.tmp/golden/run.mjs` (run it into `.tmp/golden/served` before a change and
`.tmp/golden/candidate` after; `diff -r` must be empty).

## Candidates → tickets

| # | candidate | ticket |
|---|---|---|
| 1 | one module owns the capture-HTML source text | [01](issues/01-capture-html-module.md) |
| 5 | one module owns the captured policy | [03](issues/03-captured-policy-module.md) |
| 2 | the strip audit becomes one module | [02](issues/02-strip-audit-module.md) |
| 3 | the pass sequence gets a module; a layer becomes a record | [04](issues/04-pass-sequence-and-layers.md) |
| 6 | the mutation log owns its summary projection | [05](issues/05-summary-projection.md) |
| 4 | one seam owns the served-tree rules | [06](issues/06-served-tree-seam.md) |
| 7 | one harness for the injected-runtime seams | [07](issues/07-seam-harness.md) |

Issue numbers follow dependency order, not review order (01 unblocks 03 and 04).
The two lower-confidence items the review surfaced without a card — the chat
turn protocol's implicit contract, and the motion/scroll from-state
vocabularies — are **out of scope**: the first needs its own design pass, the
second is ADR-adjacent (CONTEXT.md fixes each layer's CSS/JS pair). Recorded in
the review, not here.

## Constraint carried into every ticket

`CODING_STANDARDS.md` is binding. Two of its statements become stale as these
land and are updated in the ticket that makes them stale:

- the "one pass touches the policy" claim (superseded by ADR 0002's frame-src
  grant and ADR 0003's `'self'` grant) → ticket 03;
- the testing section's seam list and the "Stack & layout" pure-core list →
  tickets 01, 02, 05, 06.
