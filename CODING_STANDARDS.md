# CODING_STANDARDS.md

Rules for writing and editing code in this repo. Later efforts extend this
document; they do not silently deviate from it. Follow these standards whenever
writing or editing code.

## The one invariant everything serves

**The no-ask rule** ([ADR 0005](docs/adr/0005-ask-the-viewer-for-nothing.md)):
the piece asks its viewer for nothing and keeps nothing about them — no form,
no capture, no analytics, no viewer identifier. The only persistence is the
scripted session in the viewer's own browser, and no request's target or payload
is derived from viewer input. The ADR holds the full reasoning and consequences.

## TypeScript & code style

- `strict: true`; no `any` unless the JS/TS boundary forces it (JSDoc-typed
  scripts modules are the boundary). `npx tsc --noEmit` must be clean.
- Named exports; ESM; `.mjs` for scripts/ Node modules.
- New code is CC0-1.0 (`LICENSE`); mark files with
  `// SPDX-License-Identifier: CC0-1.0` where convenient.
- **No licence headers on any Flock-derived file**, including the token block in `globals.css`. No
  `SPDX-License-Identifier` line, no CC0 stamp. The repository's own code stays CC0; these assets are
  the opposite case and must not inherit it.

## Motion

**Motion is the piece, not an accommodation.** The work is interactive media —
closer to a video game than a document — and its timing, typing, and
transitions are part of the design, not decoration layered over it. The
reduced-motion preference is therefore deliberately not consulted:

- No `prefers-reduced-motion` media query, and no `motion-reduce:` utility
  variant.
- No `useReducedMotion` (framer-motion) or equivalent hook gates an animation.
- The dialogue's typing beats and the typewriter reveal always run.

Motion is scoped to **arrival, never to render**. A message types itself out
only when it lands in a live turn (the hook stamps it `fresh`); a restored
transcript — the opening turn, a resume, a remount — renders whole, so no
re-render or reload replays the reveal. The viewer's own line is never composed
for them, and one message never lands on top of a line still typing: the
turn plan floors each hold at the previous message's reveal.

Tests that need a short clock dial `lib/pacing` and stub `typewriter-effect`;
they never reintroduce an animation gate. The one motion-adjacent preference
that is still honored is `prefers-reduced-transparency`, which affects
legibility over the frosted chrome rather than the piece's timing.

## Repo hygiene

- **Nothing a build produces is committed** — `out/`, `.next/`, `.tmp/` stay
  out of git (the two generated files above are the deliberate exceptions).
- **The piece is self-contained**: self-hosted typefaces under `public/fonts/`,
  inline SVG wordmark, the engine bundles its own dialogue runtime.
- The cleared vocabulary stays cleared — `test/vocabulary.test.ts` fails if the
  names of the old reconstruction return.

## Before finishing

1. `npm run typecheck` — clean on both projects (including `checkJs`).
2. `npm test` — full suite green, not just touched files.
3. `npm run chat:check` — generated program and runtime still follow from their
   sources.
4. `npm run build` — the production export succeeds.
5. `npm run check:artifact` — the export carries the chat.
