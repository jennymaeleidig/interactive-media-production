# 07 — One harness for the injected-runtime seams

Status: resolved
Blocked by: 04

## What to build

Review candidate 7. Six seam tests each re-derive "evaluate the injected
runtime's exact bytes in a jsdom window" and disagree about the window:
`test/motion.seam.test.ts:11–60`, `test/interactions.seam.test.ts:10–128`,
`test/scroll.seam.test.ts:9–74`, `test/nav.seam.test.ts:9–45`,
`test/story-hook.seam.test.ts:9–57`, `test/chat-widget.seam.test.ts:17–78`.
`runScripts` is `dangerously` in four and `outside-only` in nav; the
reduced-motion `matchMedia` stub has three different shapes; two files wire a
`virtualConsole`.

Create `test/seam-harness.ts`: owns the window (url, `runScripts` choice, the
reduced-motion stub, the geometry / IntersectionObserver stubs) and the step that
loads the runtime bytes the build injects (by layer, from the ticket-04 table).
Each seam test keeps its page HTML and assertions.

## Acceptance criteria

- [x] One window builder (`test/seam-harness.ts`: `seamWindow`) — the six
      seam tests no longer construct their own JSDOM or install the runtime
      by hand.
- [x] `runScripts` (`dangerously`) and the `matchMedia` stub have one shape,
      so a runtime's reduced-motion behaviour is comparable across layers.
- [x] The runtime bytes load through the layer table (`layerSource` reads
      `pipeline/layers.mjs`'s `layerFile`), not six hand-written
      `readFileSync` paths.
- [x] Every existing seam assertion still passes (369 tests green; no seam
      behaviour changed).

## Comments

Implemented as a test-infrastructure change only — no pipeline source moved,
so the golden fixture tree and mutation log are byte-identical (verified).

`test/seam-harness.ts` owns: `layerSource(layer, kind)` (bytes via the
layer table), `installRuntime(window, source)`, `seamWindow(layer, html, opts)`
(the one window: `runScripts: 'dangerously'`, `pretendToBeVisual`, the
Recreation origin, one reduced-motion `matchMedia` shape, optional
`prep`/`beforeParse`/`captureConsole`), `releaseDomReady`, `onceReady`,
`installDomGeometryShims` (SVG path lengths, `<dialog>`, media playback), and
`captureConsole`. Page HTML, page-specific geometry, and assertions stayed in
their tests.

The one behaviour-bearing unification was nav's `runScripts: 'outside-only'`
moving to the shared `'dangerously'`; nav already manually released
DOMContentLoaded and its page carries no inline scripts, so its 12 assertions
and the full suite pass unchanged. `seam-harness.ts` matches no vitest project
include, so it is not collected as a test file (the test count is unchanged at
369 across 22 files).

Verified: `npx tsc --noEmit` clean, full `npx vitest run` 369 tests green in
22 files, golden tree `diff -r` empty, mutation log identical.
