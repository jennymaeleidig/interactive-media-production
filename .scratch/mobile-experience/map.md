---
Labels: wayfinder:map
---

# Mobile experience

## Destination

The site is usable and on-brand on a phone: a hamburger opens the **nav take-over** on small viewports, and the Plume AI Sales Assistant always layers above it. Execution is carried in this map (per Q2) — done means the change is built, checked against CODING_STANDARDS, and on a phone-shaped viewport.

## Notes

- **Domain**: Plume — parody surveillance vendor (see root `CONTEXT.md`). All UI mimics the subject vendor's design language via the `plume-design-language` skill (`.agents/skills/plume-design-language/`); copy register via `corporate-jargon-voice` if any menu copy is written.
- **Skills to consult when working tickets**: `plume-design-language`, plus root `CODING_STANDARDS.md` (Svelte 5 runes, Tailwind v4 tokens) before finishing.
- **Reference**: subject vendor's mobile menu — full-screen cream take-over, hairline dividers between rows, chevron-less flat list (our link graph is small), full-width pill CTA at the bottom of the list. Screenshots saved under `.scratch/ai-assistant/flock-source/`.
- **Decisions settled while charting** (2025 → standing preferences):
  - Menu shape: full-screen take-over in the subject vendor's design language, flat list, no empty accordion chevrons (Q3). Canonical term: **nav take-over** (glossarized in `CONTEXT.md`).
  - Assistant layering: the assistant widget is **always on top** — the nav take-over never covers it (Q4, user override).
  - Accessibility: follow WAI-ARIA APG (disclosure/button contract for the hamburger, focus handling on open/close).
- **Concurrency**: other sessions may work tickets in parallel — claim via `Status: claimed` before starting.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [Build the mobile nav take-over](issues/01-mobile-nav-take-over.md): hamburger below md opens a full-screen cream take-over (hairline flat list, full-width pill CTA) in Nav.svelte — APG disclosure focus contract, z-40 so the assistant widget stays on top.

## Not yet specified

- **Assistant widget on small viewports** — its own sizing/behavior (panel height, keyboard overlap, safe areas) needs a look on a real phone viewport before it can be phrased as a question.
- **Gate page (`/`) mobile layout** — suspected work, but it hangs on how the take-over turns out; revisit after the frontier advances.
- **Tablet breakpoints** — the current `hidden md:flex` cutoff may be wrong once the take-over exists; needs a viewport pass to spec.
- **Small-screen polish below the fold** — footer, heroes, and section layouts on narrow screens; part of "usable on a phone" but not yet sharp enough to ticket.

## Out of scope

- **Account icon in the header** — the subject vendor's mobile header has one; we have no accounts and won't fake one. Ruled out while charting (Q5).
