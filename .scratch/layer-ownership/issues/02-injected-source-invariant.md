# 02 — One owner for the injected-source invariant

Status: resolved
Blocked by: none

## What to build

A module that owns the zero-outbound rule for the Recreation's own injected
bytes: a served page may load no script that references a network primitive
(`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, dynamic
`import()`), because the whole exception to zero-outbound is the Media
allow-list, which is `audit.mjs`'s half of the invariant.

The rule is currently copied verbatim into four seam tests
(`test/interactions.seam.test.ts:423`, `test/motion.seam.test.ts:74`,
`test/story-hook.seam.test.ts:198`, `test/serving.seam.test.ts:176`) and
re-implemented as a hand-written census loop in `regression/routes.mjs:161-190`.

## Correction (measured while implementing)

The last acceptance criterion below reads as if the serving check already had a
hand-written census loop. It did not: `auditFailures` calls `audit()` and
`scriptCensus()` only, and the only hand-written zero-outbound list was the
per-layer source check inside `test/serving.seam.test.ts`'s `assertSeamAboard`.
The rule was also never uniform: `chat-widget.js` legitimately `fetch`es
`/api/chat`, so strict inertness applies to every marked JS part **except**
`chat`, whose roster part declares `outbound: 'self'`.

## Acceptance criteria

- [x] one exported predicate owns the rule and names the primitives it refuses
- [x] the serving check calls it instead of re-implementing it (over every
      shipped JS member via `honoursOutbound`)
- [x] the four seam tests call it instead of carrying the regex
- [x] `test/injected-source.test.ts` pins it against a real reading of every
      marked member's shipped bytes (the rule holds for all seven)
- [x] it is not folded into `audit.mjs` (that module owns the Capture's strip
      invariant) nor into `html.mjs` (that owns markup text, not JS tokens)
