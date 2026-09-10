# Flock Safety parody — exact recreation

Label: wayfinder:map
Effort tracker: `.scratch/flock-parody/` (see `docs/agents/issue-tracker.md`)

## Destination

Everything `/to-spec` needs, decided and evidenced, to synthesize the spec for the art piece's first milestone: a word-for-word, CSS-exact, function-by-function **Recreation** of flocksafety.com — the **entire site** — with its chat assistant mimicked by a **yarnspinner-ts** wrapper. No new copy; external links remain; internal links repoint at Recreation routes. The map is done when a `/to-spec` session could run with nothing left to ask.

## Notes

Decisions settled while charting (2026-09-09, charting session):

- **Stack**: Next.js/React, npm. (Pivot from the repo's former SvelteKit identity; AGENTS.md updated. CODING_STANDARDS.md stays empty until the first implementation effort fills it.)
- **Fidelity bar**: serve-snapshots — the Recreation serves the captured SingleFile DOM back verbatim, so word-for-word/CSS-exact is true by construction; the build pass only strips, rewrites links, and injects the story-hook seam. Verification: automated diff (served vs capture minus strip list) as a per-build regression check, plus human side-by-side signoff at the phase gate (the only check covering runtime behavior — animations, chat overlay). *Pivoted from rebuild-as-code, 2026-09-09 serving session: minimum-work constraint.*
- **Scope**: the entire site, not homepage-plus-nav; the page inventory comes from ticket 01.
- **Assets**: inlined into each snapshot by SingleFile — no separate asset hosting in the serve-snapshots model; flagged for revisit at publication time.
- **Trackers**: stripped — and at the serving pivot, generalized: **every external API call is stripped; served pages make zero outbound requests**. **OneTrust stripped entirely** (nothing left to consent to — settled at the serving pivot). **Forms**: identical markup; main flows inert, POSTing to local mock Next.js API routes that redirect to captured thank-you pages (never live); scaffold/test pages dropped from serving.
- **Link policy**: external links stay live; internal links rewrite to Recreation routes.
- **Chat mimic**: the real assistant is Qualified. The clone mimics its UX, powered by a yarnspinner-ts wrapper (server-side `Dialogue` vs client bundle, session state, and the Vite-plugin-vs-Next.js question → ticket 04). Yarn script content is the user's future effort; the wrapper ships with a minimal throwaway fixture.
- **Story-hook seam** (pinned dormant, serving pivot): the build pass injects `story-hooks.js` into every served page exposing `window.flockParody.apply([{selector, text|html|src|style}…])`; the chat wrapper's yarnspinner dialogue events drive it in the parody phase. The Recreation ships it dormant; patch content is the parody effort's.
- **Captures stay out of git**: `research/flocksafety/**` HTML artifacts are gitignored (reproducible via the capture refresh runbook, ticket 09); CSVs/MD stay tracked.
- **Toolchain facts**: headless Chromium cannot run under the main agent's sandbox (`MachPortRendezvousServer: Permission denied`) — captures run via Docker (`capsulecode/singlefile`, colima) and browser work runs in herdr-spawned sibling agents (children of the Herdr server, unfenced). bladebro is installed project-local (`.pi/settings.json`; loads at pi startup). taste-skill is installed repo-local (`.pi/skills/taste-skill/`) — parody phase only.
- **Skills every session should consult**: `pi-sandbox` (fence facts), `herdr` (spawning research/prototype agents), `research` (for research tickets), `prototype` + `domain-modeling` (for prototype/grilling tickets).
- **Effort layout**: ticket bodies in `issues/`; research briefs for spawned agents in `briefs/`; full research findings in `research/` (each ticket's `## Answer` stays a short gist linking to its research file); visual/raw evidence in `research/evidence/<NN-slug>/`; capture runs in `research/flocksafety/`; prototypes in `prototype/`.

## Decisions so far

<!-- one line per closed ticket: [title](link): gist -->
- [Full site inventory of flocksafety.com](issues/01-full-site-inventory.md): 1,199 live pages (+56 redirect stubs, 10 auth-gated /events/test-* stubs, 14 dead roots) from robots.txt→sitemap.xml (1,209 URLs), nav crawl, and pagination walks; 70 live paths missing from the sitemap incl. all /webinars/* aliases and header nav pointing at legacy redirects (/products/lpr-cameras, /privacy-ethics); every URL status+title-verified, full table in ticket.

- [Behavioral machinery of flocksafety.com](issues/02-behavioral-machinery.md): Webflow + GSAP 3.15/Lenis split-text & clip-reveal animations, no homepage video, Denim/Denimink/Denton/Sohne fonts; Qualified pounce-card chat UX fully tokenized (#ecefeb/#183129, Inter var) for the yarnspinner mimic; full tracker strip-list captured; recommend stripping OneTrust too.

- [Qualified conversation UX beyond the pounce](issues/06-qualified-conversation-ux.md): three surfaces (launcher 92×92 → pounce card 412×296 → right-docked 538px panel, flush bottom-right, content-driven height); pounce = scroll-triggered, GPT copy per session; replies ~4s via auto_respond, no typing indicator; conversation persists across reload; full /messages + ActionCable wire shapes + 94 THEME tokens captured for the yarnspinner mimic; lead-capture email gate honored (nothing submitted).

- [yarnspinner-ts integration facts](issues/07-yarnspinner-integration-facts.md): packages NOT on npm (registry 404, repo private — install `file:../yarnspinner-ts`, dist built); `Dialogue` = sync pull API, 7 event types, diagnostics-not-throws, `pullUntilStopped`/`Transcript` helpers in-package; `VariableStorage.entries()` is the whole serialization seam (VM position doesn't survive — restore restarts the node); `loadYarnProject()` gives plain-JSON programs at startup/request time; vite-plugin compile steps are bundler-agnostic but Turbopack has no loader seam → SSR startup-singleton is the documented Next.js route; both CC0-1.0, core dual ESM/CJS, zero runtime deps.
- [Full site capture](issues/03-full-site-capture.md): 1,199/1,199 pages captured, 0 failed, 5.45 GB SingleFile snapshots at `research/flocksafety/2026-09-09/` (pilot-13-first, 4 parallel Docker containers, ~77 min); per-page status + uncaptured manifest (56 redirect, 10 auth, 14 dead) in the run folder; 260 runtime title-swaps ("Message from Flock Safety") restored from inventory ground truth and logged.
- [Chat wrapper prototype](issues/04-chat-wrapper-prototype.md): server-side Dialogue runtime — SSR `loadYarnProject()` startup-singleton, zero bundler config (vite plugin rejected: Turbopack has no seam); npm `file:` dep on the sibling via absolute path (publish later); message API `{start|resume|option}` → turn batch + `vars` = `VariableStorage.entries()` per turn; **all choices are yarn-option chips inside a visually-present but inert composer box** (send icon does nothing; no free text, no persistent chips — user direction); styling copied from the capture (94 THEME tokens + rendered values; messenger CSS pack lifted wholesale at build); prototype at `.scratch/flock-parody/prototype/chat-wrapper/` (throwaway, runnable). Env facts: `WATCHPACK_POLLING=true` for dev, `browserslist` field required, yarn comments between options silently drop following options.

## Not yet specified

- **Dead collection roots**: `/ebooks`, `/webinar`, `/video`, `/events` 404 while their item pages are live — whether the Recreation reproduces them as routes or drops them; decide in the snapshot-serving pipeline prototype (ticket 05). (Research also ruled: no locale variants exist; www host only — subdomain surfaces out.)
- **Capture fidelity limits**: captures snapshot the runtime DOM post-JS (SingleFile inlines assets), so pre-hydration markup and any network-only state are not in the evidence; the homepage has a pre-capture probe loose at `research/flocksafety/index.html` from charting. Single-file captures embed the announcement-banner state they observed — the runtime title-swap phenomenon (ticket 03) suggests session-dependent behavior the static snapshots only partially evidence; per-template research (ticket 08) works from these snapshots regardless.
- **Chat lead-capture depth**: ticket 06 walked the widget up to the email gate and stopped (covenant: no real data to Flock's CRM); ticket 04's mimic likewise ends the demo path at the gate with a marked divergence — and the flow is now choice-driven (no composer), so the typed-email booker path is doubly unobservable. Decide with the user at spec: how far the mimic's demo-request flow goes. (Where its email capture POSTs is settled: a local mock API route, per the forms decision.)

## Out of scope

- **Parody content and concept** — the piece's argument and every divergence from the original. This map ends at the Recreation handoff; the parody returns as a fresh effort. (Charting: "no new copy".)
- **Yarn script content** for the chat mimic — the user writes it in a future effort; the wrapper gets a minimal test fixture only.
- **Publication/deployment** of the piece — hosting, domain, and the asset-rights revisit that publication would trigger.
