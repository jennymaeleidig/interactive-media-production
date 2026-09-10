Status: open
Type: research
Blocked by:

## Question

Ticket 02 walked the homepage only — what behaviors do the other template families carry that it never saw? Static analysis of the capture run (`research/flocksafety/2026-09-09/`, one SingleFile snapshot per page, all 1,199 live pages): sample 1–2 captures per template family (index, marketing, campaign LP `/abm/*` + `/lp/*`, product, post, resource, legal, utility) and extract what each family's pages embed and do: per-template GSAP/animation attributes beyond the homepage's split-text set, embedded video sources and players, carousels/tabs/accordions, interactive embeds (maps, schedulers, calculators), forms other than the newsletter (markup + POST target), lazy-load patterns, and any page-specific scripts. Mark every finding MUST-REPRODUCE or STRIP/DEFER per the fidelity bar, and note per-family differences from the homepage contract.

Plus one census the motion-mimicry decision (ticket 10) waits on: name every **distinct animation pattern** site-wide (e.g. fade-up, clip-reveal, split-text, parallax, pinned/scroll-scrubbed timelines, marquees, hover tweens, smooth scroll). For each: which template families use it, whether it is scroll-scrubbed/pinned (the hard-to-fake class — the line where ticket 10 says "end-state only"), and the captured end-state values (transform/opacity/fill-mode) needed to author its from-state. All evidence is local — no live-site access needed.
