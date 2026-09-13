# 04 — Name and pin each layer's reduced-motion policy

Status: resolved
Blocked by: none

## What to build

Reduced motion is one idea with four different runtime policies and one layer
that ignores it, and the one seam that should reveal the difference answers every
policy identically: `test/seam-harness.ts:68`'s matchMedia stub reports
`matches: reduced` for any query, and its listeners are no-ops (so `scroll`'s
`change` subscription can never fire).

Give the harness the policy table — `read-once` (motion), `read-fresh`
(interactions, nav), `subscribe` (scroll), `none` (chat, story-hook) — and make
the stub's shape follow the layer's real query, with a setter so a seam can flip
reduced motion at runtime and observe the `change` path.

`chat · none` is settled as fidelity: the captured widget had no reduced-motion
path, so no runtime change is in scope.

## Acceptance criteria

- [x] the harness declares each layer's policy and pins it through a stub that
      counts reads and listeners (the correction below supersedes the original
      "query shape" wording)
- [x] a seam can change the reduced-motion answer at runtime and observe the
      effect, and the stub counts reads so the two policies are distinguishable
- [x] each layer's existing `*.seam.test.ts` asserts its own policy, so the
      policies are distinguishable through the seam
- [x] no injected byte changes: the runtime sources keep their current policies
- [x] `chat` and `story-hook` are pinned as `none`, not left implicit

## Correction (measured while implementing)

The plan assumed four policies and a `change` subscription on `scroll` from an
earlier reading. Measured on the actual sources, there are **three** policies and
**no** subscriptions: `motion` (:24), `nav` (init, :43) and `scroll` (:33) each
read `matches` exactly once at boot; `interactions` (:66, called from the click
path) reads it fresh at each use; `chat` and `story-hook` never read it. The
harness therefore counts reads and listeners rather than dispatching change
events, and every seam asserts `listeners() === 0` so a future subscription is a
deliberate change. The policy table is `REDUCED` in `test/seam-harness.ts`;
the file names beside it are derived from the roster
(`pipeline/injected-layers.mjs`), so the harness owns policy and the roster owns
paths.
