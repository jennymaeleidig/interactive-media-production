# Flock Safety parody — exact recreation

Label: wayfinder:map
Effort tracker: `.scratch/flock-parody/` (see `docs/agents/issue-tracker.md`)

## Destination

Everything `/to-spec` needs, decided and evidenced, to synthesize the spec for the art piece's first milestone: a word-for-word, CSS-exact, function-by-function **Recreation** of flocksafety.com — the **entire site** — with its chat assistant mimicked by a **yarnspinner-ts** wrapper. No new copy; external links remain; internal links repoint at Recreation routes. The map is done when a `/to-spec` session could run with nothing left to ask.

## Notes

Decisions settled while charting (2026-09-09, charting session):

- **Stack**: Next.js/React, npm. (Pivot from the repo's former SvelteKit identity; AGENTS.md updated. CODING_STANDARDS.md stays empty until the first implementation effort fills it.)
- **Fidelity bar**: rebuild-as-code — components reproducing DOM, visuals, and behavior 1:1, with Captures as ground truth. "Exact" is the verification bar: automated screenshot diff (2–3 viewports) plus human side-by-side signoff at the phase gate.
- **Scope**: the entire site, not homepage-plus-nav; the page inventory comes from ticket 01.
- **Assets**: images/videos/fonts copied verbatim and self-hosted; flagged for revisit at publication time.
- **Trackers**: stripped. **Forms**: identical markup/behavior, submissions POST to local Next.js API routes (never to live endpoints).
- **Link policy**: external links stay live; internal links rewrite to Recreation routes.
- **Chat mimic**: the real assistant is Qualified. The clone mimics its UX, powered by a yarnspinner-ts wrapper (server-side `Dialogue` vs client bundle, session state, and the Vite-plugin-vs-Next.js question → ticket 04). Yarn script content is the user's future effort; the wrapper ships with a minimal throwaway fixture.
- **Toolchain facts**: headless Chromium cannot run under the main agent's sandbox (`MachPortRendezvousServer: Permission denied`) — captures run via Docker (`capsulecode/singlefile`, colima) and browser work runs in herdr-spawned sibling agents (children of the Herdr server, unfenced). bladebro is installed project-local (`.pi/settings.json`; loads at pi startup). taste-skill is installed repo-local (`.pi/skills/taste-skill/`) — parody phase only.
- **Skills every session should consult**: `pi-sandbox` (fence facts), `herdr` (spawning research/prototype agents), `research` (for research tickets), `prototype` + `domain-modeling` (for prototype/grilling tickets).
- **Effort layout**: ticket bodies in `issues/`; research briefs for spawned agents in `briefs/`; full research findings in `research/` (each ticket's `## Answer` stays a short gist linking to its research file); visual/raw evidence in `research/evidence/<NN-slug>/`; capture runs in `research/flocksafety/`.

## Decisions so far

<!-- one line per closed ticket: [title](link): gist -->
- [Full site inventory of flocksafety.com](issues/01-full-site-inventory.md): 1,199 live pages (+56 redirect stubs, 10 auth-gated /events/test-* stubs, 14 dead roots) from robots.txt→sitemap.xml (1,209 URLs), nav crawl, and pagination walks; 70 live paths missing from the sitemap incl. all /webinars/* aliases and header nav pointing at legacy redirects (/products/lpr-cameras, /privacy-ethics); every URL status+title-verified, full table in ticket.

- [Behavioral machinery of flocksafety.com](issues/02-behavioral-machinery.md): Webflow + GSAP 3.15/Lenis split-text & clip-reveal animations, no homepage video, Denim/Denimink/Denton/Sohne fonts; Qualified pounce-card chat UX fully tokenized (#ecefeb/#183129, Inter var) for the yarnspinner mimic; full tracker strip-list captured; recommend stripping OneTrust too.

- [Qualified conversation UX beyond the pounce](issues/06-qualified-conversation-ux.md): three surfaces (launcher 92×92 → pounce card 412×296 → right-docked 538px panel, flush bottom-right, content-driven height); pounce = scroll-triggered, GPT copy per session; replies ~4s via auto_respond, no typing indicator; conversation persists across reload; full /messages + ActionCable wire shapes + 94 THEME tokens captured for the yarnspinner mimic; lead-capture email gate honored (nothing submitted).

- [yarnspinner-ts integration facts](issues/07-yarnspinner-integration-facts.md): packages NOT on npm (registry 404, repo private — install `file:../yarnspinner-ts`, dist built); `Dialogue` = sync pull API, 7 event types, diagnostics-not-throws, `pullUntilStopped`/`Transcript` helpers in-package; `VariableStorage.entries()` is the whole serialization seam (VM position doesn't survive — restore restarts the node); `loadYarnProject()` gives plain-JSON programs at startup/request time; vite-plugin compile steps are bundler-agnostic but Turbopack has no loader seam → SSR startup-singleton is the documented Next.js route; both CC0-1.0, core dual ESM/CJS, zero runtime deps.

## Not yet specified

- **Dead collection roots**: `/ebooks`, `/webinar`, `/video`, `/events` 404 while their item pages are live — whether the Recreation reproduces them as routes or drops them; decide in ticket 05. (Research also ruled: no locale variants exist; www host only — subdomain surfaces out.)
- **Cookie-consent UX**: research recommends stripping the whole OneTrust stack including the banner (nothing left to consent to); final call folds into ticket 05.
- **Per-template behavioral contracts**: ticket 02 walked the homepage only; the 855 posts, product pages, and campaign LPs may carry behaviors it never saw (embedded video, carousels, tabs, per-template GSAP attributes). Not researchable until captures exist — graduates to a research ticket out of ticket 03's pilot/full runs (sample one capture per template family).
- **Chat lead-capture depth**: ticket 06 walked the widget up to the email gate and stopped (covenant: no real data to Flock's CRM); the post-gate booker/panes were never observed, and no agent can walk them without live-firing a submission — this gap is permanent, observation-capped. Decide with the user in ticket 04 or at spec: how far the mimic's demo-request flow goes, and what the in-chat email capture POSTs to (presumably a local API route, per the forms decision).

## Out of scope

- **Parody content and concept** — the piece's argument and every divergence from the original. This map ends at the Recreation handoff; the parody returns as a fresh effort. (Charting: "no new copy".)
- **Yarn script content** for the chat mimic — the user writes it in a future effort; the wrapper gets a minimal test fixture only.
- **Publication/deployment** of the piece — hosting, domain, and the asset-rights revisit that publication would trigger.
