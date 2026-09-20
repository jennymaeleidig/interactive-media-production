# Retire the no-network rule

`CODING_STANDARDS.md` used to make one invariant the thing everything served: *the chat's bytes
reach nothing*. `pipeline/chat-source.mjs` enforced it as a static scan of the shipped runtime — its
source text could not name `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or a
dynamic `import(`, and `test/chat-source.test.ts` pinned that scan.

The content-block seam makes the rule impossible, not merely inconvenient. A reply is a sequence of
blocks, and the piece renders `frame` and `image` blocks: the frame ladder embeds authored pages,
and the design admits frames, fonts, and third-party embedding. Those are network. A byte scan that
forbids the word `fetch` cannot coexist with a widget that renders iframes.

**The rule is scrapped, and its machinery with it.** `pipeline/chat-source.mjs` and
`test/chat-source.test.ts` are deleted, the "network-free" claim leaves the stack section, and
`CONTEXT.md`'s *No-network rule* term becomes the *No-ask rule*.

The replacement is the piece's actual privacy posture, stated as what it protects:

**The piece asks its viewer for nothing, and keeps nothing about them.** It presents nothing to fill
in and nothing to submit — no form, no text field, no capture — and it carries no analytics, no
tracker, and no viewer identifier. The only thing it persists is the scripted session in the
viewer's own browser, and nothing about the viewer leaves the page.

The page may reach the network. What it may not do is reach anywhere the author did not choose:
**no request's target, and no request's payload, is derived from viewer input.** Chips resolve to
authored block sequences, and a `frame` renders only a URL in the hand-authored allowlist, so
nothing the viewer does can name a host. That allowlist is the audited artifact — every host the
piece can reach is declared and reviewed by hand — which is what gives the "no analytics" clause
teeth: a tracker has nowhere to live but an allowlist entry a human approved.

What was traded away is absolute network silence, which a chat that shows real content cannot keep.
What is kept is the reason the old rule was worth having: no ask, no capture, no identifier, and no
target the author did not choose. The enforceable core moves from a source-text scan to the seam,
where it already lived.

## Consequences

- There is no byte-scan test. A rule with no check is a comment; this one's check is the seam test
  that a non-allowlisted `frame` URL issues no request, plus the allowlist inventory a reviewer
  reads.
- `regression/artifact.mjs` is unchanged: it proves the export carries the maintained bytes and the
  privacy path resolves, and it never depended on the invariant.
- Rewriting the remaining seam and artifact tests for block sequences, and clearing the retired
  rule's residual names from the code (`tsconfig.checkjs.json`, `vitest.config.ts`,
  `pipeline/chat-engine.mjs`, `pipeline/chat-widget.js` and the runtime regenerated from it,
  `pipeline/globals.d.ts`), is the build effort's work, tracked on the map.
