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
