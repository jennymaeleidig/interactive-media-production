Status: open
Type: prototype
Blocked by: 08

## Question

The Recreation's pages are static frozen end-states (ratified, ticket 05) — motion is restored as a **cheap mimic layer**, not the original GSAP/Lenis runtime. Ticket 08's census names the site's distinct animation patterns; for each pattern family, decide which mimicry tier applies, and prove the feeling once on the homepage:

1. **CSS-only** — `scroll-behavior: smooth` for the Lenis feel; `@keyframes` + `animation-fill-mode: forwards` (or `animation-timeline: view()` for scroll reveals); `transition:` rules for hover tweens.
2. **Shared reveal snippet** — one ~30-line IntersectionObserver + `data-animate`-style annotations on the captured DOM + per-pattern CSS pairs authored from ticket 08's captured end-state values. Declarative annotation on top of the captured DOM, not per-page bespoke logic; `prefers-reduced-motion` honored by not annotating. Static-first: the captured end-state is the default, motion is enhancement.
3. **End-state only** — the line for anything scroll-scrubbed/pinned (ScrollTrigger timelines) the census flags as hard to fake cheaply: the page ships as captured.

Build the chosen layers in the same shape as the story-hook seam (shared snippet injected by the build pass, declarative per-element annotations), wire the Marketo form decision in as its first real case (static styled mock of the rendered end-state → existing mock route — ticket 05), walk it with the user, then write the spec wording: what motion the Recreation ships, how it's authored, and how it's regression-checked (extend the serving-gate diff if annotations change default rendering).
