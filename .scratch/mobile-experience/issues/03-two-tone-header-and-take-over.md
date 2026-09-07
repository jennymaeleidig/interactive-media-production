# Two-tone header and take-over

Type: task
Status: open
Blocked by:

## Question

The subject vendor's mobile menu uses two distinct grounds: a lighter header strip over a slightly darker menu body (see `.scratch/ai-assistant/flock-source/` screenshots). Our take-over currently paints everything one cream (`bg-paper`) with the header panel transparent while open.

Restated decision: while the nav take-over is open, the floating header panel carries its own solid fill (`paper` #faf9f5) while the take-over body ground drops to the deeper `stone` (#ddd9cc) — our palette's analog of the vendor's strip-over-body two-tone. Header geometry stays our rounded floating panel; ink stays the light tone (forest on paper). Update the now-stale "melts into the take-over's cream ground" comments in `Nav.svelte` and anywhere else they appear. Keep z-index token usage intact (`layering.test.ts` must stay green).

Resolved when: on a phone-shaped viewport the open state shows the header panel on `paper` above a `stone` take-over body, per the `plume-design-language` skill; `npm run check && npm test` pass.
