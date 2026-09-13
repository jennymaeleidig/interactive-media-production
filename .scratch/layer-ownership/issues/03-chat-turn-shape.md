# 03 — One declaration of the chat turn shape

Status: resolved
Blocked by: none

## What to build

The one message the Chat mimic posts per turn is declared four times: `ChatTurn`
in `lib/chat-engine.ts:86`, narrowed inline at `lib/chat-engine.ts:200-218`,
re-declared as `ChatBody` in `test/serving.seam.test.ts:292`, and re-narrowed by
hand in `pipeline/chat-widget.js:241` — the one reader that ships, sitting
outside `tsconfig` so a drift is green.

Move the shape to a plain-JS module with a JSDoc typedef
(`pipeline/chat-turn.mjs`) that both languages can read: the engine imports the
type, the widget's parse is annotated against it, and the seams stop
hand-declaring it.

Bring `pipeline/**` under `checkJs` in a scoped config
(`tsconfig.checkjs.json`) driven by an `npm run typecheck` that covers the Next
build's `tsconfig.json` and the check-js project, so the widget's parse is
typechecked where it lies — no build step, no runtime change.

## Correction (measured while implementing)

Full-strict `checkJs` over all of `pipeline/**` yields 219 errors, 197 of them in
the frozen runtimes (`scroll-runtime` 86, `interactions` 47, `nav` 35,
`chat-widget` 24 before annotations, `story-hook` 5); clearing the rest would
require code edits that break the byte mirror. The config therefore includes the
owned modules — `chat-turn.mjs`, `chat-widget.js`, `injected-layers.mjs`,
`injected-source.mjs`, `globals.d.ts` — and excludes the frozen runtimes, with
the reason in the config's comment.

## Acceptance criteria

- [x] the turn shape is declared exactly once, in `pipeline/chat-turn.mjs`
- [x] `lib/chat-engine.ts` imports the typedef instead of declaring `ChatTurn`
- [x] `pipeline/chat-widget.js`'s parse is annotated against the same typedef
- [x] `test/serving.seam.test.ts` and `test/chat.seam.test.ts` stop declaring
      their own copy of the shape
- [x] `tsconfig.checkjs.json` puts `allowJs` + `checkJs` over the owned
      `pipeline/` modules (the frozen runtimes are excluded, above)
- [x] `npm run typecheck` runs both projects and is clean
- [x] the annotation changes to `pipeline/*.js` are comment-only, so the shipped
      bytes' code equality is untouched
