# Systemic z-index layers

The site has exactly three fixed overlay layers — nav take-over (30), floating header (40), AI Sales Assistant (50) — and the assistant must always paint on top (owner decision during the mobile-experience effort). Per-component z-index values already produced a header/assistant tie, so the values live as `--z-index-*` tokens in the `@theme` block of `src/app.css` with the bottom→top order documented there; components consume them only via Tailwind's arbitrary-property syntax `z-(--z-index-*)`; and `src/lib/components/layering.test.ts` fails on a bare `z-<number>` in a fixed component or a reordered token.

**Consequence**: any new overlay layer gets a new token in the documented order — it never hardcodes a number. Renumbering layers is cheap as long as relative order holds.
