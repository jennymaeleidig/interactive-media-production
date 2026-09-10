# Brief — wayfinding ticket 08: Per-template behavioral contracts

You are a pi research agent for effort `flock-parody` in this repo. Work alone (AFK). Follow steps in order; do not modify any other files than the three named below.

1. Read `.scratch/flock-parody/map.md` (the effort map) and `.scratch/flock-parody/issues/08-per-template-behavioral-contracts.md` (your ticket).
2. Claim the ticket: set the ticket file's `Status:` line to `claimed` before any research.
3. Read and follow the research skill at `~/.pi/agent/skills/research/SKILL.md`.
4. Research the ticket's question entirely from local evidence — **no live-site access needed**:
   - Evidence base: `.scratch/flock-parody/research/flocksafety/2026-09-09/` — 1,199 SingleFile captures, one per live page, URL hierarchy preserved (`index.html`, `<path>.html`). Per-page status: `capture-status.csv`. Background: `README.md` in the run folder. Template family per path: `.scratch/flock-parody/research/01-full-site-inventory.csv` (column `type`).
   - Reference baseline (homepage contract, from ticket 02): `.scratch/flock-parody/research/02-behavioral-machinery.md` — GSAP 3.15/Lenis split-text & clip-reveal, Denim/Denimink/Denton/Sohne fonts, Qualified chat widget, stripped trackers.
   - Sample 1–2 captures per family (index, marketing, campaign LP, product, post, resource, legal, utility — pick large and small members; prefer files ≥ 3 MB as likely-rich). Static analysis only: grep with tight patterns and offset reads — these files run 1–33 MB, never read whole. Compare each sample against the homepage baseline.
   - Extract per family: animation attributes/scripts beyond baseline; video (`<video>`, iframe players, `data-src` lazy patterns); carousels/tabs/accordions; interactive embeds (maps, schedulers, calculators, iframes); forms (markup, action URL, fields) other than the newsletter; page-specific scripts and what they inject.
   - Plus the **animation-pattern census** (ticket 10 waits on it): name every distinct motion pattern site-wide (fade-up, clip-reveal, split-text, parallax, pinned/scroll-scrubbed timelines, marquees, hover tweens, smooth scroll); per pattern — template families using it, whether it is scroll-scrubbed/pinned (the hard-to-fake class), and captured end-state values (transform/opacity/fill-mode) needed to author its from-state.
5. Resolve the ticket:
   - Write your **full findings** — a per-family behavioral contract table, each item marked MUST-REPRODUCE or STRIP/DEFER, sample paths cited, plus coverage caveats — to `.scratch/flock-parody/research/08-per-template-behavioral-contracts.md`.
   - Append an `## Answer` section to `.scratch/flock-parody/issues/08-per-template-behavioral-contracts.md` containing only a short gist (families with non-baseline behaviors, biggest surprise) and a link to the research file above.
   - Set the ticket's `Status:` to `resolved`.
   - Append one line under `## Decisions so far` in `.scratch/flock-parody/map.md`:
     `- [Per-template behavioral contracts](issues/08-per-template-behavioral-contracts.md): <one-line gist>`

Later tickets depend on this: the spec's build method (snapshot-serving pipeline, ticket 05) and the `/to-spec` handoff need to know which behaviors exist beyond the homepage's.
