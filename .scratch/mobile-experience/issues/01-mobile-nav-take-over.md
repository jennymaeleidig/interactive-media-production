# Build the mobile nav take-over

Type: task
Status: resolved
Blocked by:

## Question

`Nav.svelte` hides all page links below `md` and offers no hamburger, so phones get only the wordmark and "Book a demo". Build the **nav take-over**:

- A hamburger button (visible below the desktop breakpoint) in the floating header panel, opening a full-screen take-over in the subject vendor's design language (see `.scratch/mobile-experience/map.md` Notes + `.scratch/ai-assistant/flock-source/` screenshots): cream background, hairline dividers between rows, flat list of links (PlumeOS, Trust), full-width pill "Book a demo" CTA, close X — no accordion chevrons.
- WAI-ARIA APG contract: the hamburger is a disclosure-style toggle (`aria-expanded`, `aria-controls`), focus moves into the take-over on open and returns to the button on close, Escape closes.
- Follow the map's standing decisions: flat list, assistant always on top (do not raise the take-over above the widget), `plume-design-language` skill for treatment, `CODING_STANDARDS.md` before finishing.

Resolved when: on a phone-shaped viewport the hamburger opens/closes the take-over with correct semantics and focus handling, all links route to built pages, and the checks in `CODING_STANDARDS.md` ("before finishing") pass.

## Answer

Built entirely in `src/lib/components/Nav.svelte` (no new component file — the hamburger and take-over share one focus contract, so one file kept it cohesive):

- **Hamburger** below `md` in the header panel (lucide `Menu`/`X`, one button morphing between them, so the close X and the toggle are the same control): `aria-expanded`, `aria-controls="mobile-nav-take-over"`, sr-only label. While open, the header panel goes transparent with light-theme ink so it melts into the cream take-over (the header's wordmark serves as the take-over's wordmark; its "Book a demo" hides — the take-over carries the full-width pill).
- **Take-over**: full-screen `bg-paper` panel, hairline-divided flat list (PlumeOS, Trust — serif-300 rows, no chevrons), full-width pill "Book a demo" CTA after the list, `min-h-[100dvh]`. Layered at **z-40**, deliberately below the assistant widget's z-50 — the assistant is always on top (map standing decision; ticket 02 will formalize the z-index tokens).
- **APG contract**: focus moves into the take-over on open — onto the first link (PlumeOS), not the bare container, so screen readers announce a menu entry (the panel carries an `aria-label="Site menu"` as fallback) — and returns to the hamburger on close (never steals focus on mount — same `wasOpen` pattern as `AssistantWidget`); Escape closes; while open, Tab cycles across the visible header controls and the take-over's links + CTA so keyboard focus cannot fall through into the page content hidden beneath the full-screen panel (judgement call beyond the literal disclosure reading — a full-screen take-over surprises users if Tab escapes it); body scroll locks while open; SPA link clicks and the wordmark close the take-over; crossing the `md` breakpoint while open auto-closes (media-query listener with cleanup).
- **Checks** (CODING_STANDARDS "before finishing"): prettier applied, `npm run check` 0 errors/0 warnings, `npm test` 2/2, `npm run build` passes.

Deviation: none of substance. The only judgment call beyond the literal ticket is auto-close on breakpoint crossing and hiding the header CTA while open (avoids duplicate CTAs over the cream ground).
