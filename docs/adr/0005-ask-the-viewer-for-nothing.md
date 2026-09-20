# Ask the viewer for nothing, keep nothing about them

The piece presents nothing to fill in and nothing to submit — no form, no text field, no
capture — and it carries no analytics, no tracker, and no viewer identifier. The only thing it
persists is the scripted session in the viewer's own browser
(`localStorage['flock-chat-state']`), and nothing about the viewer leaves the page.

The page may reach the network: a `frame` can render an authored page, an `image` can load an
asset, a font arrives from the host. What it may not do is reach anywhere the author did not
choose: **no request's target, and no request's payload, is derived from viewer input.** Chips
resolve to authored block sequences, and a `frame` renders only a URL in the hand-authored
allowlist, so nothing a viewer does can name a host.

This is a deliberate product decision, not a constraint inherited from the static-export shape.
Static hosting (`output: 'export'`) removes the server that could capture, but the no-ask rule
would hold even if a process existed: it is why the impersonation exposure in
[0002](0002-accept-impersonation-risk.md) carries no data-protection dimension, and why the
turn contract stays in-process ([0004](0004-turn-contract-in-process.md)).

## Consequences

- No lead capture, analytics, or viewer identifiers anywhere in the codebase; a PR that adds a
  fetch, form, or telemetry departs from this record and needs a new one.
- `localStorage['flock-chat-state']` is the single persistence point, owned by the engine.
- The network allowlist is hand-authored; a block type that computes a URL from viewer input
  cannot be merged without overturning this decision.
- `CODING_STANDARDS.md` states the rule as the one invariant everything serves; this record
  holds the reasoning behind it.
