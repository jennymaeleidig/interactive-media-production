Status: resolved
Type: research
Blocked by:

## Question

Ticket 02 walked the homepage only — what behaviors do the other template families carry that it never saw? Static analysis of the capture run (`research/flocksafety/2026-09-09/`, one SingleFile snapshot per page, all 1,199 live pages): sample 1–2 captures per template family (index, marketing, campaign LP `/abm/*` + `/lp/*`, product, post, resource, legal, utility) and extract what each family's pages embed and do: per-template GSAP/animation attributes beyond the homepage's split-text set, embedded video sources and players, carousels/tabs/accordions, interactive embeds (maps, schedulers, calculators), forms other than the newsletter (markup + POST target), lazy-load patterns, and any page-specific scripts. Mark every finding MUST-REPRODUCE or STRIP/DEFER per the fidelity bar, and note per-family differences from the homepage contract.

Plus one census the motion-mimicry decision (ticket 10) waits on: name every **distinct animation pattern** site-wide (e.g. fade-up, clip-reveal, split-text, parallax, pinned/scroll-scrubbed timelines, marquees, hover tweens, smooth scroll). For each: which template families use it, whether it is scroll-scrubbed/pinned (the hard-to-fake class — the line where ticket 10 says "end-state only"), and the captured end-state values (transform/opacity/fill-mode) needed to author its from-state. All evidence is local — no live-site access needed.

## Answer

Researched 2026-09-09, static analysis of the 2026-09-09 capture run (corpus-wide pattern sweep over all 1,199 captures + 16 deep samples, 2+ per family). Full contracts, census table, and caveats: [research/08-per-template-behavioral-contracts.md](../research/08-per-template-behavioral-contracts.md) (raw sweep dump in `research/evidence/08-per-template-behavioral-contracts/`).

- **Two behavior stacks**: ticket 02's GSAP attribute system exists on only **8 pages** (`/`, `/flock-ecosystem`, `/press-center`, `/products/license-plate-readers`, 4 `/lp/*`); the other **1,191 pages** run the Webflow-platform stack — IX2 (`data-w-id`), `w-tabs`/`w-dropdown` FAQ accordions, Swiper sliders (57 pages), Finsweet CMS-filter/load/social-share, and rendered Marketo/Webflow forms.
- **Biggest surprise for ticket 10**: the animation-pattern census (18 patterns) found **zero pinned/scroll-scrubbed motion site-wide** — no pin-spacers, parallax attributes, or scrub mid-states in any capture — so the cheap end-state CSS floor covers everything found; every pattern's from/end values (e.g. image-clip `inset(6% 10% 0% 10%round 8px)` → `inset(0% 0% 0% 0%round 8px)`, fade-in `translate(0,24px)+opacity:0`) were captured and tabulated.
- Forms: **no `<form action>` anywhere** (all JS-submitted) — inert markup + local mock POST routes holds; the rendered Marketo DOM (mktoForm 1009/1818/2703/1226/2807 + `wf-form-Reseller`) is the static-mock substrate. Video = Wistia HLS poster-frozen on 139 pages + YouTube click-to-load facades (trust hub + 14 posts). Legal family is fully static; `/chilipiper-2` captured empty (scheduler never rendered — known-dead demo path).
