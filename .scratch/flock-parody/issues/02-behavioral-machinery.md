Status: resolved
Type: research
Blocked by:

## Question

What interactive machinery must the Recreation reproduce function-by-function, and what third-party baggage may be dropped? Two evidence sources: the committed capture `.scratch/flock-parody/research/flocksafety/index.html` (static analysis) and the live site (a herdr-spawned agent has native Chromium and bladebro's browser tools; the main agent's sandbox cannot run browsers). Cover:

- The **Qualified chat assistant**: mount point, DOM/UX flow (bubble → window → conversation), visual tokens, and the network calls it makes — enough to mimic the UX with a yarnspinner-ts wrapper behind it. Observe passively; never submit real inquiries through the live chat.
- Animation machinery (split-text headline effects, scroll reveals), hero/background video behavior, carousels/accordions.
- Fonts: families, weights, sources actually served.
- The tracker/analytics strip-list (GTM, pixels, Qualified telemetry) and cookie-consent behavior.

Product: a behavioral checklist, each item marked MUST-REPRODUCE or STRIP/DEFER, that tickets 04 and 05 walk.

## Answer

Researched 2026-09-09 (evidence: capture static analysis + live Dockerized headless Chromium; 13 screenshots and raw JSON preserved). The site is **Webflow + GSAP 3.15/Lenis**; the homepage has **no video**; fonts are Denim/Denimink/Denton/Sohne/Schibsted Grotesk (widget: Inter var). The Qualified chat assistant ("Flock — AI Sales Assistant") is fully characterized: pounce-card UX (invisible 20×20 → 412×296 greeting → 412×343 expanded, bottom-right), complete `--THEME_*` token set (`#ecefeb`/`#183129`, Inter var), motion keyframes, and network shape — the mimic (ticket 04) re-implements the UX over the yarnspinner wrapper and strips every call to qualified.com. Full tracker strip-list captured (GTM, LinkedIn/FB/Bing/Reddit pixels, Hotjar, HockeyStack, Marketo, 6sense et al.); OneTrust consent stack recommended for full strip.

Full findings: [research/02-behavioral-machinery.md](../research/02-behavioral-machinery.md) — widget evidence in `research/02-evidence/`.
