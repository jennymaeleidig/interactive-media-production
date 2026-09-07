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

Verification: `npm run check` (0/0), `npm test` (5/5, including a new `src/lib/components/layering.test.ts` that pins the contract — strict token ordering and token consumption in the two fixed components, so a future bare `z-50` regression fails CI), `npm run build` passes, and the compiled client CSS was inspected to confirm all three utilities emit `z-index: var(--z-index-*)`. Stacking check on a phone-shaped viewport by construction: the take-over is `fixed inset-0` on the take-over layer; the assistant wrapper is fixed on the assistant layer, so bubble and open panel always paint above it and receive pointer events (higher stacking order, siblings, no pointer-events overrides); the header stays above the take-over so the close control survives.

Deviations: (1) the phone-viewport verification is by compiled-CSS inspection + the layering contract test + stacking-order reasoning — no browser automation is available in this environment for a literal screenshot/click pass; (2) `@types/node` was added as a devDependency so the contract test can read source files without svelte-check errors; (3) the header moved z-50 → 40 and the take-over z-40 → 30 under the new tokens — behavior-preserving renumbering (relative order unchanged), so the assistant is now strictly above both rather than tied with the header.
