# Build the mobile nav take-over

Type: task
Status: open
Blocked by:

## Question

`Nav.svelte` hides all page links below `md` and offers no hamburger, so phones get only the wordmark and "Book a demo". Build the **nav take-over**:

- A hamburger button (visible below the desktop breakpoint) in the floating header panel, opening a full-screen take-over in the subject vendor's design language (see `.scratch/mobile-experience/map.md` Notes + `.scratch/ai-assistant/flock-source/` screenshots): cream background, hairline dividers between rows, flat list of links (PlumeOS, Trust), full-width pill "Book a demo" CTA, close X — no accordion chevrons.
- WAI-ARIA APG contract: the hamburger is a disclosure-style toggle (`aria-expanded`, `aria-controls`), focus moves into the take-over on open and returns to the button on close, Escape closes.
- Follow the map's standing decisions: flat list, assistant always on top (do not raise the take-over above the widget), `plume-design-language` skill for treatment, `CODING_STANDARDS.md` before finishing.

Resolved when: on a phone-shaped viewport the hamburger opens/closes the take-over with correct semantics and focus handling, all links route to built pages, and the checks in `CODING_STANDARDS.md` ("before finishing") pass.
