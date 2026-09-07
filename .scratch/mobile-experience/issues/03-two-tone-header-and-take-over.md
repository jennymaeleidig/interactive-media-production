# Two-tone header and take-over

Type: task
Status: resolved
Blocked by:

## Question

The subject vendor's mobile menu uses two distinct grounds: a lighter header strip over a slightly darker menu body (see `.scratch/ai-assistant/flock-source/` screenshots). Our take-over currently paints everything one cream (`bg-paper`) with the header panel transparent while open.

Restated decision: while the nav take-over is open, the floating header panel carries its own solid fill (`paper` #faf9f5) while the take-over body ground drops to the deeper `stone` (#ddd9cc) — our palette's analog of the vendor's strip-over-body two-tone. Header geometry stays our rounded floating panel; ink stays the light tone (forest on paper). Update the now-stale "melts into the take-over's cream ground" comments in `Nav.svelte` and anywhere else they appear. Keep z-index token usage intact (`layering.test.ts` must stay green).

Resolved when: on a phone-shaped viewport the open state shows the header panel on `paper` above a `stone` take-over body, per the `plume-design-language` skill; `npm run check && npm test` pass.

## Answer

All changes in `src/lib/components/Nav.svelte` (the two-tone lives in the open-state branches of the header's `ink`/`panelClass` derivations plus the take-over body fill):

- **Header strip (open state)**: `panelClass` now returns a solid `bg-paper` panel with a `border-forest/16` hairline and the light-theme shadow (`shadow-lg shadow-forest/10`) when `open` — the rounded floating geometry is kept, and the fill is opaque, not translucent. The `open || !scrolled` shortcut is split: open wins with the paper fill; plain resting (not scrolled) stays the invisible panel.
- **Take-over body**: the full-screen panel dropped from `bg-paper` to `bg-stone` (#ddd9cc), so the paper strip reads one tone lighter above it — the vendor's strip-over-body analog. Hairline rows (`divide-forest/16`), forest ink, and the full-width pill CTA are untouched.
- **Ink**: unchanged — light tone (forest on paper) while open, which is now correct against the solid paper strip; previously the forced-light ink sat on a transparent panel over stone.
- **Stale comments**: all three "melts into the take-over's cream ground"/"cream" comments in `Nav.svelte` were rewritten to describe the two-tone (top-of-file header comment, `ink` derivation, `panelClass` derivation) plus the take-over markup comment. They appear nowhere else in `src/`; the phrase survives only as a historical record in ticket 01's Answer, which is a log, not living documentation.
- **z-index**: untouched — same `z-(--z-index-take-over)` / `z-(--z-index-nav)` tokens; `layering.test.ts` green.

**Checks**: prettier applied; `npm run check` 0 errors/0 warnings; `npm test` 5/5 (both suites); `npm run build` passes.

**Visual verification (Playwright, mobile viewport emulation)**: chromium headless-shell installed locally (sandbox forced `PLAYWRIGHT_BROWSERS_PATH` into the repo dir and `--single-process` launch — mach-port rendezvous is denied under sandbox-exec; see `.scratch/verify-ticket03.mjs`, throwaway, not committed). On a 390×844 viewport with the take-over open on `/home`: take-over body computes `rgb(221, 217, 204)` (stone), header panel computes `rgb(250, 249, 245)` (paper) at 11.6px radius, wordmark ink `rgb(19, 60, 85)` (forest) — screenshot at `.scratch/ticket03-open.png` matches the vendor's two-tone (paper strip over deeper ground). At 320×690: no horizontal overflow while open. One measurement note: the header panel's `transition-all duration-300` means the paper fill is mid-fade for ~300ms after opening; the solid end-state was verified after the transition settles.

Deviation: none of substance. Judgment calls: (1) the open-state panel also carries the light-theme hairline border + shadow so it reads as the floating panel over the deeper body rather than a flush bar — geometry per the ticket's "header geometry stays our rounded floating panel"; (2) the assistant bubble was verified still visible above the take-over in the screenshot (assistant layer untouched).
