# Spec: Recreation — flocksafety.com, the entire site, with Chat mimic

Label: ready-for-agent
Effort: flock-parody-impl (implementation). Wayfinding journey retired: `.scratch/flock-parody/`.
Tickets: `issues/01`–`13`.

## Problem Statement

The art piece's first milestone is a **Recreation** of flocksafety.com — the entire site, 1,199 live pages — word-for-word, CSS-exact, function-by-function. Hand-rebuilding a thousand pages cannot hit that bar: copy drifts, CSS approximates, and every page carries third-party machinery — trackers, a live GPT sales chat, cookie consent, lead-capture forms wired to real CRMs — that the piece must never operate. No visitor data may ever reach Flock's systems, and no page may phone home. The user needs a build method where fidelity to the original is true by construction, the site never makes an outbound request, and the one piece of live behavior that matters — the chat assistant — is mimicked locally without a backend.

## Solution

**Serve the Captures.** Every page is a SingleFile Capture taken from the live site; the Recreation is a Next.js app whose build pipeline passes each Capture through six mechanical passes — strip trackers and the Qualified widget, rewrite internal links to Recreation routes, point forms at local mock routes, inject the motion layer, the delegated interaction layer, and the dormant story-hook seam — and serves the result verbatim at the original URL paths. Because Captures carry zero executable scripts, the zero-outbound guarantee is true by construction, not by audit alone.

The one live surface is the **Chat mimic**: the Qualified assistant's exact UX — launcher, pounce card, expanded panel, bubble styling lifted wholesale from the Capture — driven by a yarnspinner-ts runtime behind a small message API, with one fixed, pinned string set (the real assistant's copy is GPT-generated per session; the mimic pins one observed session). Every conversational choice is a Yarn option rendered as a chip inside a visually-present but inert composer; the demo branch ends at the email gate with a single "Maybe later" chip, and nothing in the rendered UI marks the divergence.

Pages ship as static captured end-states; motion returns as a cheap mimic layer — CSS plus one shared IntersectionObserver snippet with declarative annotations, never the original GSAP/Lenis runtime — honoring reduced-motion, and click-driven page furniture (tabs, dropdowns, accordions, sliders) returns through one delegated-interaction sibling keyed on captured classes and geometry. Serving is verified by a full-scale HTTP check — every route class, every served page's bytes, and the site-wide strip audit — and the whole system stays synced to the drifting live site through the capture refresh runbook. The story-hook seam ships dormant, ready for the Parody layer effort.

## User Stories

Pages and navigation:

1. As a visitor, I want every page of flocksafety.com to exist at its original path, so that the Recreation is navigable exactly like the original.
2. As a visitor, I want each page to render word-for-word and pixel-exact against the original, so that I cannot tell the Recreation from the real site.
3. As a visitor, I want internal links to take me to the corresponding Recreation route, so that site navigation works end to end.
4. As a visitor, I want external links (social profiles, the privacy portal) to still lead to their real destinations, so that off-site behavior matches the original.
5. As a visitor following a legacy URL, I want the same 301 redirect the live site performs, so that old links land in the right place.
6. As a visitor hitting a dead collection root, I want a 404 like the live site gives, so that even the site's broken edges are faithfully reproduced.
7. As a visitor, I want every page's real static title (not the runtime-swapped one), so that tabs and history read like the original site's truth.

Chat:

8. As a visitor, I want the chat launcher bubble sitting flush bottom-right, so that the page feels alive like the original.
9. As a visitor, I want the pounce card to appear greeting me, so that the signature Qualified moment is reproduced.
10. As a visitor, I want to open the expanded panel and converse, so that the assistant experience carries over.
11. As a visitor, I want to answer using option chips that read as my own sent messages, so that conversing feels natural.
12. As a visitor, I want the composer box present but inert, so that the UI looks exactly like the original's input area.
13. As a visitor, I want my conversation to persist across page reloads, so that the chat behaves like the original's server-side session.
14. As a visitor choosing "book a demo", I want the assistant to ask for my email and then offer only "Maybe later", so that the flow ends gracefully and harmlessly.
15. As a visitor, I want replies to appear as complete messages, so that the conversation reads like the original's auto-responses.

Motion and interactions:

16. As a visitor, I want the hero split-text to animate on load and reveals to play on scroll, so that pages feel like the live site.
17. As a visitor, I want smooth scrolling for anchor jumps, so that in-page movement feels like the original.
18. As a visitor, I want tabs, dropdowns, accordions, and sliders to operate, so that interactive page furniture functions.
19. As a visitor, I want hover states to tween like the original, so that fine-grained polish carries over.
20. As a visitor with reduced motion enabled, I want fully static pages, so that the piece respects my system setting.
21. As a visitor, I want pages to render complete and styled with JavaScript disabled, so that nothing depends on the stripped runtime.

Safety and forms:

22. As a visitor, I want zero requests to leave my machine from any page, so that browsing the piece never feeds trackers or Flock's systems.
23. As a visitor submitting any form, I want identical form markup that lands me on the captured thank-you page, so that the flow completes while nothing is actually submitted.
24. As a visitor, I want Marketo forms rendered fully styled exactly as captured, so that even the forms look real.
25. As a visitor, I want no cookie-consent banner and no account, login, or cart UI, so that the page shows only what the strip decision kept.

The artist:

26. As the artist, I want the Recreation built mechanically from Captures rather than by hand, so that the fidelity bar holds across 1,199 pages.
27. As the artist, I want zero new copy anywhere in the Recreation, so that this milestone stays a pure Recreation.
28. As the artist, I want the chat's copy pinned to one observed Qualified session, so that the mimic is deterministic.
29. As the artist, I want no visible marker of where the chat diverges from the original, so that the illusion is never broken.
30. As the artist, I want the chat powered by Yarn scripts I will write later, so that the wrapper is content-agnostic.
31. As the artist, I want the story-hook seam shipped dormant on every page, so that the Parody layer can drive DOM changes without touching the serving machinery.
32. As the artist, I want an automated full-scale serving check — every route class and every served page's bytes over HTTP — so that regressions are caught before I ever look.
33. As the artist, I want a human side-by-side at each phase gate, so that runtime feel — animations, chat overlay — gets a signoff no diff can give.
34. As the artist, I want Captures out of git but reproducible from the runbook, so that the repo stays light and the ground truth regenerable.
35. As the artist, I want a capture refresh runbook, so that the Recreation tracks the live site's drift without re-deriving method.

Future efforts:

36. As the Parody layer effort, I want the documented story-hook contract, so that dialogue events can patch page DOM declaratively.
37. As the Parody layer effort, I want per-turn chat events and variables surfaced, so that I can bind patches and branching to conversation beats.
38. As the Parody layer effort, I want the chat's CSS lifted wholesale from the Capture, so that zero new styling is authored.

Build sessions:

39. As a build session, I want every pipeline mutation logged per page, so that strip and motion changes are auditable.
40. As a build session, I want a single capture-pointer config value, so that moving the build to a new capture run is one switch.
41. As a build session, I want a changed page to invalidate exactly its own route, so that a scoped refresh never rebuilds the world.
42. As a build session, I want the yarnspinner dependency resolved locally, so that the build works today and can move to a published package later.
43. As the artist, I want the site's videos to play in place, so that the Recreation is not a site of dead boxes.
44. As the artist, I want every image, font, and sound served from our own tree, so that the piece reaches for no remote image and its weight is measured in megabytes.

## Implementation Decisions

**Build method — serve the Captures**

- The Recreation is a Next.js/React app (npm) that serves SingleFile Captures verbatim through a build of ordered passes: strip DOM → rewrite links → inject form actions → swap video slots for live players → extract inlined `data:` assets to content-addressed files → inject motion → inject the delegated interaction layer → inject the nav layer → mount the chat mimic → inject the story-hook seam, then write with a per-page mutation log. Order is load-bearing twice: the embed pass runs **before** asset extraction, so the payloads inside a discarded player snapshot are never written out as orphans; and extraction runs **before** every injection pass, because the Recreation's own runtimes are inlined verbatim and one of them carries `data:` URIs of its own. Proven end-to-end by the snapshot-serving prototype.
- Captures carry zero executable scripts, so "zero outbound requests from any served page" is true by construction; the strip audit confirms no tracker residue (Qualified = 0 everywhere; OneTrust's one survivor is the footer "Your Privacy Choices" link, which is site content and stays under the link policy) and no account/auth host reference (`users.flocksafety.com`, `login.flocksafety.com` = 0 everywhere). **Amended for video (ADR 0002):** a Capture cannot play a video, so the slots now load the original hosts' players in a frame — the one network reference a served page makes, bounded by an allow-list the strip audit enforces. Images were never re-pointed at the network; they are extracted to same-origin files instead.
- The strip list is the converged audit set: the Qualified offer host, the chat launcher custom element with its inlined CSS, focus sentinels, all Qualified style blocks including orphaned layout CSS, Qualified-smeared attributes and the header-height var, the OneTrust banner/consent stack entirely (nothing is left to consent to), and every account/auth affordance — the header and footer Sign In chrome pointing at `users.flocksafety.com`, removed wholesale, and inline auth-host links (`login.flocksafety.com`), unwrapped so their words survive. Account surfaces are stripped, never mocked (ADR-0001): there is no account page, no mock login, no cart. The strip is keyed on the host, not the word "account" — the corpus says "Account Executive" and "account representative" in ordinary copy, which stays.
- Static-frozen end-states are the ratified fidelity floor: served pages are fully static; the Recreation's runtime is the Chat mimic, the story-hook seam, the motion layer, and the delegated interaction layer — nothing else executes. The captured "Message from Flock Safety" title swaps were the pounce script's doing and are gone with the scripts; Captures carry static titles restored from inventory ground truth.
- Captures are truncated before the closing body/html tags; the build pass appends them back.

**Serving and links**

- A single catch-all serving route resolves the served tree at original paths; a redirect manifest built from the capture run's uncaptured manifest serves the 56 redirect stubs as 301s to their (already local) targets. Dead collection roots 404 — reproducing observed behavior is the fidelity bar. Scaffold/test pages are dropped from serving entirely. The ten auth-gated `/events/test-*` stubs (444 on the live site) also 404: they are uncaptured test scaffolds, consistent with the scaffold-drop policy, and the Recreation has no password gate to reproduce.
- Link policy: absolute internal hrefs rewrite to Recreation routes; external links stay live; meta/JSON-LD URLs are untouched. One internal link's Qualified tracking parameter is kept verbatim — word-for-word bar, inert locally.
- Page assets are extracted, not inlined (ADR 0002): a Capture inlines every image, font, and sound as a `data:` URI, and the build writes each distinct payload once to `/assets/<sha16>.<ext>`, served same-origin by `app/assets/[...path]/route.ts` and referenced from every page that carried it. This is what makes the served tree ~2.1 GB instead of ~10 GB, and it is why an image never becomes a network reference. The asset-rights revisit at publication stands.
- **Video plays from the original hosts** (ADR 0002) — the one deliberate exception to the zero-outbound rule. A Capture cannot play a video, so it keeps an inert snapshot of the player; the embed pass reads the live player from the page's own `w-json-ld` `embedUrl` and swaps the snapshot for a frame. Built 2026-09-11 across all four providers: **Wistia — 130 live player frames across 92 pages, covering 115 distinct medias** (the build's `live` counter counts frames, so it agrees with the served bytes), including the 11 live `popover` slots whose captured box was already the 16:9 padding box, so inlining changed no layout. Three captured shapes — an inlined `srcdoc` player document, the JS-built player chrome Wistia's runtime had frozen, and a `<wistia-player>` web component carrying a declarative shadow root. The slot element and its box always survive; only the snapshot's contents change. **YouTube — the 19 `data-video-id` iframes on three `/trust` pages (16 distinct ids) are armed by the interactions runtime**: the poster click sets `https://www.youtube.com/embed/<id>?autoplay=1` and crossfades the captured panel in; the pass itself sets no `src` (the panel is hidden at rest) and grants `frame-src` for `www.youtube.com` on exactly those three pages. **Vidzflow — the 120 hidden video.js player documents on 10 pages are stripped**, not played (their visible content is a sibling still image and the capture carries no playable embed URL). The 5 medias dead upstream keep the captured end-state. The captured `frame-src 'self' data:` is **widened** with the hosts the pass actually used — appended inside the one captured directive rather than added as a second one, because a duplicate `frame-src` intersects with the first and the players would stay blocked — and the strip audit fails the build on any frame pointed elsewhere, so the exception is enforced rather than assumed. Per page, the widened policy names only that page's hosts. The audit now also looks inside `srcdoc` payloads (`srcdoc scripts`) and counts a **remote reference outside a known class** (`unclassified remote refs`); the accepted inert classes are named in ADR 0002.

**Forms**

- Main-flow forms keep identical markup; the build injects a POST to a local mock API route keyed per form, which swallows the submission and 303-redirects to the captured thank-you page. Nothing ever leaves the machine.
- Marketo forms render fully styled from the Capture itself — all five captured Marketo CSS blocks are live in the served page, so the "static styled mock" reduces to the captured form as-is plus the injected action. No authored mock CSS. Hidden Marketo clones and the scheduler embed stay inert.
- The chat makes no POST at all (see chat decisions).

**Chat mimic**

- Runtime lives server-side as an SSR startup-singleton: the Yarn project compiles once at route-module load via the node loader; one Dialogue instance per session lives in server memory, so sessions survive reloads exactly like the original's server-side session. Zero bundler configuration (the Vite-plugin path is rejected — Turbopack has no loader seam). From the chat-wrapper prototype.
- The yarnspinner-ts packages are installed as an npm file: dependency on the local sibling repo by absolute path (relative specifiers break under npm resolution); publish later, repoint then.
- Message API (from the prototype): one POST per turn — `{type: start | resume | option, …}` → the turn's batch of lines, the pending choice set, or completion, plus `state.vars` surfaced every turn as the storage's entries. `start` is idempotent: a live session resumes rather than resets.
- UI contract (user direction, from the prototype): no free text, no persistent chips. Every choice is a Yarn option authored in the script, rendered as a user-style bubble sitting in the composer slot; the composer box and send icon stay visually present but inert, with a placeholder showing when no chips are pending. Clicking a chip is an option selection.
- Copy is pinned, not live: greeting, general reply, support reply, and the demo ask are transcribed strings from one observed Qualified session (evidence in the Qualified-UX research). All replies are fixed strings delivered as complete bubbles — no typing indicator, no sounds (hooks noted in the prototype, deliberately unshipped).
- Demo branch depth (grilling, ratified): it ends at the email gate — the pinned demo-ask reply, then a single "Maybe later" chip returning to the hub option set. The gate never dead-ends the widget. **No divergence notice of any kind in the rendered UI — prohibited.** No mock email capture, no booker, no POST. The stop is stated declaratively in the Yarn comment at the gate node, so builders can tell the intentional stop from an unfinished one while no visitor sees any trace.
- The wrapper ships with a minimal throwaway Yarn fixture (the pinned session's shape); real Yarn content is the user's future effort. Chat CSS is lifted wholesale from the Capture — the full 94-prop theme token set plus rendered bubble values; zero new styling.
- Yarn authoring constraint carried from the prototype: a comment placed between options silently drops every following option — keep comments at line level.

**Motion mimicry layer** (tier table ratified in the motion ticket)

- Tier 1, CSS-only: smooth-scroll feel for anchor jumps; the captured CSS-keyframe animations play for free with no JS; hover tweens authored as transitions at build time.
- Tier 2, shared reveal snippet: one IntersectionObserver runtime plus declarative annotations, injected by the build pass; per-pattern from-states come from the behavioral census's captured values. The hero split re-fires the original visibility class so the captured transition CSS plays verbatim; scroll word-splits (including the masked variant) get per-word stagger indices; fades and clip reveals fire one-shot.
- Interactions, delegated clicks: tabs, dropdowns, accordions, and sliders all function — geometry and classes from the Capture; the license-plate-reader accordion is function-only (no height tween).
- Tier 3, end-state only → **superseded at ticket 21**: the two pages carrying real scroll-scrubbed timelines (`/safe-cities`, `/products/flock-dfr`) now run the scroll choreography + modal layer (below) instead of shipping as captured.
- The build pass normalizes every captured from-state to its end-state in the static DOM before injecting the layer (a no-JS page is the styled end-state, by construction), plus a generic sweep of inline zero-opacity from-states tagged for the observer — all logged per page in the mutation log.
- Reduced motion: the runtime adds no motion class, every from-state rule stays inert — the page ships static. No JS: same. The layer mirrors the story-hook seam's shape — shared snippet + declarative keys, zero per-page bespoke logic.

**Scroll choreography + modal layer** (ticket 21 — supersedes the tier-3 end-state ruling)

- The pages with real scroll-driven timelines get a shared vanilla runtime keyed on the captured attributes/classes — no GSAP, no CDN (`pipeline/scroll-runtime.js` + `scroll.css`, injected inline by build pass 13): `[animate="scrub-word"]` runs the captured dark → green → near-white word-color sequence, reversed on scroll-back; `.line-label` scales `0 → 1` with its marker sliding from `translateY(170%)`; `[data-scroll-video]` plays in view and pauses out; `#stickme` sticks to the viewport bottom and releases at its parent's end; `#main-progress` draws with page scroll; and `dialog.c-modal` opens from `data-c-modal-open`, closing on `[c-modal-close]` / backdrop / Escape, with the modal's `#route-progress` drawing on the modal's own scroll and each `.marker[data-stop]` placed along the path opposite its timeline event.
- The build normalizes the captured scroll from-states to their end-states (the scrub-word dark color is dropped, `.line-label` is `scale(1,1)`, its marker `translate(0,0%)`, the route `stroke-dashoffset:0`, the modal panel settled), so a no-JS page is the static end-state. Reduced motion keeps the FUNCTION — the modal opens, the sticky sticks, the markers are placed — and skips the animation (ticket 05's function-never-blocked ruling).

**Story-hook seam (dormant)**

- Injected on every served page, exposing `window.flockParody.apply(patches)` with patches of `{selector, text | html | src | style}`: text sets text content, html sets inner HTML, src sets the attribute, style merges camelCase props. Array order; a missing selector is skipped with a console debug, never throws; returns the count applied; safe before DOM-ready (queues until DOMContentLoaded); DOM-only, no network. Dormant in the Recreation — the Parody layer's dialogue events will drive it.

**Verification**

- Serving check (automated, full scale): `npm run routes` starts the production server and asserts every route class over HTTP — 200 with a byte-identical body for every live page, 301 for every legacy stub to its local target, 404 for dead roots / auth-gated stubs / dropped scaffold-test pages — plus the count identity, the site-wide strip audit (tracker residue, no capture-derived executable script, no frame outside the media allow-list, no executable script inside a `srcdoc` payload, and no remote reference outside a class ADR 0002 accepts as inert), and **asset identity**: every extracted asset named in the build's manifest answers at its content-addressed path with the content type its extension declares and the same bytes as the on-disk file. Byte-identity is the serving layer's whole guarantee: same bytes ⇒ same pixels, so the visual result is fixed by the build, not the request. (Byte-identity alone would not notice a missing image, which is why asset identity is its own check.)
- Strip decision (recorded, reviewed by eye): the build log records what each page lost (the Qualified offer host and header-height var, the chat launcher, the OneTrust consent stack) with removed byte counts; the human side-by-side confirms the visual result — the strip-list regions are gone and the page otherwise reads identically to the Capture.
- Human side-by-side at each phase gate: the only check covering runtime feel — animations playing, chat overlay, pounce timing — and the visual strip result.

**Keeping ground truth alive**

- The capture refresh runbook governs drift: full re-inventory (robots → sitemap → nav crawl → pagination walks, same column format) plus diff at spec freeze and at each build phase gate; added/retitled/newly-live pages re-captured immediately as a scoped run; one full re-capture before the final side-by-side signoff; never mid-phase — a refresh invalidates routes, so it happens between phases. Proposed by the runbook ticket; this spec adopts it (flagged in Further Notes).
- A changed page invalidates exactly its own Recreation route: re-run the build passes on that page from the fresh Capture, then its serving check. The capture pointer (which run folder the build serves from) is a single config value. Captures remain out of git; inventories, CSVs, and markdown stay tracked.

## Testing Decisions

- A good test asserts external behavior only: what an HTTP request returns, what a chat POST replies, what the DOM looks like after a story-hook application — never pipeline internals or module structure.
- The seams, in order of height:
  1. **The HTTP serving seam** — the whole system, top: request → response at full scale (`npm run routes`). 200 with a byte-identical body for every live page, 301/404 per route class, the count identity, the site-wide strip audit, form POSTs 303 to thank-you pages, served bytes carrying no executable scripts and no tracker residue, links rewritten, story-hook and motion layer present. Everything page-shaped is assertable here without a browser; byte-identity stands in for the retired pixel gate (same bytes ⇒ same pixels).
  2. **The chat message API seam** — POST start/resume/option → turn batches, choice sets, surfaced variables, session persistence across calls, the email-gate branch shape. Drives the Dialogue runtime, session store, and gate behavior headlessly.
  3. **The story-hook DOM seam** — apply() contract tests: each op mutates as documented, order honored, missing selectors skipped without throwing, pre-DOM calls queue.
  4. **The motion DOM seam** (added at ticket 04) — the injected reveal runtime's contract, evaluated in jsdom against the exact injected bytes: html.fpm-motion is added only when reduced motion allows, the hero visibility class is re-fired, one-shot reveals land (and with reduced motion, nothing moves). Same rationale as seam 3: an injected runtime whose DOM behavior is genuinely separate from byte-serving.
  5. **The interactions DOM seam** (added at ticket 05) — the delegated interaction runtime's contract, evaluated in jsdom against the exact injected bytes over fixtures mirroring the captured shapes (census patterns 11–15): tabs swap the captured active/hidden classes and pairings, dropdowns and accordions open and close per their captured hiding shape, the license-plate-reader accordion toggles state and icon without a height tween, sliders advance and retreat by captured slide geometry, and reduced motion never blocks function.
  6. **The scroll DOM seam** (added at ticket 21) — the scroll/modal runtime's contract, evaluated in jsdom against the exact injected bytes: the scrub-word color sequence plays on scroll-in and reverses on scroll-back, the `.line-label` reveal lands, scroll videos play in view and pause out, the sticky button toggles, the modal opens/closes and arms its route draw with markers placed opposite their events, and reduced motion keeps the function while leaving the decoration at the build end-state.
  The ideal is one seam; the HTTP serving seam is that whole-system seam — the others exist because the chat (server state) and the DOM-contract runtimes (story-hook, motion, interactions, scroll) are genuinely separate surfaces.
- Modules under test: the build pipeline (as a pure transformation — capture run in, served tree + mutation log out, with the strip audit as an invariant), the serving layer, the chat engine behind its message API, and the story-hook runtime.
- Prior art: the snapshot-serving prototype's regression harness (screenshot shoot + pixel diff) is the model that was **built, then retired** — it compared the served tree against itself; the chat-wrapper prototype's end-to-end start/resume/option smoke walks remain the model for the chat seam.
- Not automated, deliberately: runtime feel (animation playback, chat overlay behavior, pounce timing) — covered by the human side-by-side at phase gates.

## Out of Scope

- **Parody content and concept** — every divergence from the original, including all story-hook patch content. The Recreation ships the seam dormant; the parody returns as a fresh effort.
- **Yarn script content** for the Chat mimic — the wrapper ships with the minimal fixture only; the user writes the real scripts later.
- **Publication and deployment** — hosting, domain, and the asset-rights revisit that inlined assets will trigger at publication.
- Subdomain surfaces of flocksafety.com; the ten auth-gated event test pages (manifest entries only); any live backend traffic — Qualified's real API, CRMs, analytics, cookie consent, scheduling. **Video playback is no longer out of scope**: it plays in place from the original hosts per ADR 0002, bounded by the media allow-list, with the residual slots resolved in tickets 17–20 (5 dead medias and 2 slot-less named medias stay as captured, recorded as accepted divergences).
- Free-text chat input, typing indicators, sounds, operator handoff, and any post-email-gate booker machinery.
- Wheel-driven smooth scrolling beyond CSS anchor behavior — not CSS-reproducible; accepted.
- **Account functionality** — login, signup, account, cart. The live site's account surfaces are stripped from every page (never mocked); no account page, route, or mock exists, and no reference to the account/auth hosts survives.

## Further Notes

- **Video liveness is an ops tool, not a gate.** `pipeline/video-probe.mjs` re-probes the dated video inventory against the providers (Wistia media JSON, YouTube oembed, a HEAD per delivery stream; `--tier deep` adds `yt-dlp --simulate`), and `pipeline/config.mjs`'s `DEAD_VIDEO_IDS` — the medias the embed pass deliberately leaves as captured — is generated from its `playability.csv`. It needs the network, so like `npm run routes` it is run by hand and never by `npm test`; the spec has no gate for it because a third-party outage must not fail our suite. It earned its keep on 2026-09-11 by finding a fifth dead Wistia media whose slot the inventory could not see (ticket 17).
- The behavioral census's scrub worry resolved in the motion ticket's live check: the homepage-adjacent "scroll" system is click-tabs, and the only real scrub timelines are the two tier-3 pages — the mimic's one-shot model is exact for everything else.
- The capture refresh policy is adopted from the runbook ticket's proposal, which was queued for ratification at spec: it stands unless vetoed here.
- Two sandbox/toolchain facts bind every build and capture session: dev servers need watchpack polling enabled and the package needs a browserslist field (both proven in the prototypes); headless-Chromium work runs via Docker (the capture run — the serving check does not render).
- The prototype assets live with the effort and are throwaway; the liftable parts are the build pipeline script, the motion CSS/runtime pair, and the chat engine module.
- Media decisions live in `docs/adr/0002-video-plays-remote-images-stay-local.md`: video plays from the original hosts in a framed player, images are extracted to local content-addressed files, and the zero-outbound invariant becomes allow-list enforced for frames. The work that ADR left open was ticketed next to this spec — **17** (the YouTube slots), **18** (the slots that stay as captured), **19** (Vidzflow, the fourth provider), **20** (what a served page may still name remotely) — and all four are resolved in this round.
- This is the repo's first implementation effort under the Next.js pivot — CODING_STANDARDS.md is filled in by this effort, per the repo's AGENTS.md.
