# 07 — One harness for the injected-runtime seams

Status: open
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

- [ ] One window builder; the six seam tests no longer construct their own.
- [ ] `runScripts` and the `matchMedia` stub have one shape, so a runtime's
      reduced-motion behaviour is comparable across layers.
- [ ] The runtime bytes load through the layer table, not six hand-written
      `readFileSync` paths.
- [ ] Every existing seam assertion still passes (this ticket changes the
      harness, not the behaviour under test).
