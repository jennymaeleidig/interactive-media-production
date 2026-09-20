# Reproduce Flock Safety's brand identity

The piece is a deliberately faithful imitation: it carries Flock Safety's name, wordmark,
palette, typefaces, and shape language on a domain Flock does not own. We considered an
original identity merely "inspired by" the palette's feel, and referring to Flock by plain
nominative text only, and rejected both: the imitation *is* the work, and a piece that
paraphrases the brand instead of reproducing it is a different, lesser piece. The likeness is
therefore treated as a settled requirement, not a default.

This decision is knowingly a trademark risk. The liability it creates is recorded and accepted
in [ADR 0002](0002-accept-impersonation-risk.md); what to reproduce is specified in
[`docs/brand.md`](../brand.md).

## Consequences

- Fidelity is a *checkable property*, not a vibe: the brand doc's token ramp exists so the look
  can be diffed against Flock's compiled stylesheet mechanically.
- Nothing derived from Flock may carry a licence header or a `SPDX-License-Identifier` line —
  the mechanical form of "no rights are claimed."
- The research's own recommendation (do not replicate the marks) is consciously overridden here.
  A future reader should not "fix" this by switching to an original identity.

## Amendment, 2026-02-18

The piece's ground is the homepage's **light** surface, not the default theme's dark ground:
`--color-surface` `#fefdfb` (revised from the homepage's `#f2efea`), the chrome (capsule header
and composer tray) `#eeeee3`, text
`#304833`, the capsule header's wordmark and text `#061602`, edge `#bbc0b9`. The accent is `#304833` too, revised from `#5bd640`; the chips and
the link-out block take `#183129`, the captured widget's own value; the focus ring stays `#84da6c`. Message bubbles carry the captured widget's own backgrounds — assistant
`#f1f4f7`, viewer `#ecefeb` — over one shared text colour, `#183129`. The full role tables are in
[`docs/brand.md`](../brand.md).

The identity decision above is unchanged. This only narrows *which* of Flock's own surfaces is
reproduced — it is not a new decision, and it does not license any asset the Assets table rules out.
