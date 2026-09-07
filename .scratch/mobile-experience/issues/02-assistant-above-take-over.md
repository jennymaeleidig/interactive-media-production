# Assistant rides above the nav take-over

Type: task
Status: resolved
Blocked by: 01

## Question

The Plume AI Sales Assistant and the nav take-over would both naturally claim the top layer (the widget is `fixed z-50`). The standing decision: the assistant is **always on top** — the nav take-over opens beneath it and never covers the bubble or panel.

- Establish explicit z-index ordering between header/take-over and `AssistantWidget.svelte` (token or documented values, not bare magic numbers scattered in components).
- Verify on a phone-shaped viewport: with the take-over open, the widget bubble stays visible and clickable, and the open assistant panel still sits above the take-over.

Resolved when the layering is explicit in code and verified as above.

## Answer

Layering is now tokenized, not scattered: three systemic z-index tokens live in `src/app.css` `@theme` (`--z-index-take-over: 30` → `--z-index-nav: 40` → `--z-index-assistant: 50`), with a comment block documenting the bottom-to-top order and the standing decision (assistant ALWAYS on top). Components consume them via Tailwind v4's documented arbitrary-property syntax — `z-(--z-index-*)` — in exactly three places: `Nav.svelte`'s fixed header (`z-(--z-index-nav)`, above the take-over so the hamburger/close stays visible and clickable), the full-screen take-over (`z-(--z-index-take-over)`), and `AssistantWidget.svelte`'s fixed bubble+panel wrapper (`z-(--z-index-assistant)`). No bare `z-<number>` remains in either component.

Verification: `npm run check` (0/0), `npm test` (5/5, including a new `src/lib/components/layering.test.ts` that pins the contract — strict token ordering and token consumption in the two fixed components, so a future bare `z-50` regression fails CI), `npm run build` passes, and the compiled client CSS was inspected to confirm all three utilities emit `z-index: var(--z-index-*)`.

Browser pass on a phone-shaped viewport (Playwright, iPhone 13 emulation — 390×844 @3x, touch, mobile): with the take-over open, the widget bubble is visible and clickable (`elementFromPoint` at the bubble's center hits the bubble, and a click opens the assistant panel over the take-over), and the open assistant panel still sits above the take-over (computed z-index 50 vs 30; `elementFromPoint` at the panel's center resolves inside the panel, so it receives pointer events). The same pass re-confirmed ticket 01's contract: hamburger opens/closes with `aria-expanded`, body scroll locks, Escape closes, focus lands on the first link on open and returns to the hamburger on close, Tab cycles within the take-over, link clicks navigate and close it. 16/16 checks passed.

Deviations: (1) the contract test is beyond the literal ask ("token or documented values"): it pins the ordering by reading source text — a deliberate no-browser-environment compromise that verifies what source says, not what compiles (compiled-CSS emission was checked once by hand); `@types/node` was added as a devDependency so it can read files without svelte-check errors; (2) the header moved z-50 → 40 and the take-over z-40 → 30 under the new tokens — behavior-preserving renumbering (relative order unchanged), so the assistant is now strictly above both rather than tied with the header.
