# Research — Behavioral machinery of flocksafety.com

Wayfinding ticket: [issues/02-behavioral-machinery.md](../issues/02-behavioral-machinery.md) · Resolved 2026-09-09

Widget evidence (13 screenshots + raw DOM/network/cookie JSON): **[evidence/02-behavioral-machinery/](evidence/02-behavioral-machinery/)** (same directory)

## Answer

Researched 2026-09-09. Evidence tags: **[capture]** = static analysis of `.scratch/flock-parody/research/flocksafety/index.html` (post-render singlefile DOM, scripts stripped); **[live]** = live flocksafety.com observed same day via CDP-driven headless Chromium 124 in Docker (screenshots and JSON in `evidence/02-behavioral-machinery/`); **[srcdoc]** = the Qualified messenger's inlined iframe document extracted from the capture. The site is **Webflow** (`data-wf-*`, `w-mod-ix3`) + injected runtimes (Lenis, GSAP suite, Qualified, OneTrust, Marketo).

### 1. Qualified chat assistant ("Flock — AI Sales Assistant")

Mount & shell:
- Loader `https://js.qualified.com/qualified.js?token=PkqDRmLsN1JZW8p3`; `window.qualified` is a stub queue until rules decide to mount. [live]
- UI lives in an iframe `#q-messenger-frame` (class `qlfd-not-mobile`, `sandbox="allow-popups allow-top-navigation-by-user-activation"`, `data-mirrored=true`), inside `<q-root data-q-host>` inside `#qualified-multimodal-host` — a fixed full-viewport shadow host (z-index 2147483642, `right: var(--q-docked-right-offset, 0px)`, `pointer-events:none`). [capture][live]
- Collapsed state: iframe is **20×20 px pinned to the bottom-right corner** (20px margin) and **invisible** — no launcher is shown until the rules engine "pounces" (session-variable: 0 of 4 sessions without engagement signals, ~12–18s with scroll signals). [live]
- The app is React mounted via `data-react-class=Messenger` + `data-react-props` JSON: uuid, token, `messengerThemes[0]` (all theme tokens below), `teamPhoneNumber (650) 844-3352`, `geoPermissions` (28 countries), feature flags (`qualified_gpt_autopilot`, `messenger_avatar_bubbles`, `smart_forms`, …). `multimodalStartingPosition=collapsed_center`, `multimodalOpenedPosition=sidebar`. [srcdoc]

UX flow (bubble → window → conversation): [live, screenshots 07–13]
1. Page load → invisible 20×20 frame bottom-right.
2. Pounce → iframe expands to **412×296 bottom-right** greeting card with pop animation (`q-bubblePop`: opacity 0 + translateY(12px) → visible).
3. Card contents: circular dark-green avatar (Flock bird mark) + header "**Flock** / AI Sales Assistant"; bot message "Hey there! I'm Flock, your AI Sales Assistant. What questions do you have about our solutions at Flock?"; buttons **Get a Demo** + **Support**; composer textarea placeholder **"Ask a question"** with Send icon button; footer link "Flock's Privacy Policy"; dark-green circular **✕** collapse button at the card's top-left corner (outside card edge).
4. Click card/launcher → expands to **412×343** (composer row appears); a proactive follow-up bot message may arrive over the websocket (observed: "Saw that you're interested in Flock Safety. I'm available if you have questions or want to chat!").
5. Config targets a sidebar dock for the opened state on desktop; at 1440×900 the observed opened state was still the card. Operator replies/typing indicator were not walked (no typing per brief) — their motion exists as keyframes (below).

Visual tokens (from the `--THEME_*` layer on the messenger root — reproduce these, NOT the hashed Emotion classes): [srcdoc]
- Primary `#ecefeb` (bone); text `#183129` (dark green); bot avatar bg image + `#ecefeb` circle.
- Own (user) bubble: bg `#ecefeb`, border `#ecefeb`, text `#183129`. Bot bubble: bg `rgba(236,239,235,0.25)`, border transparent, text `#122124`.
- Header: bg `#ecefeb`, text/icons `#183129`. Footer text `#6E7879`; secondary icon `#888F91`.
- Buttons: bg `#183129`, text `#ffffff`, radius **4px** (rectangle/solid), hover bg `#070f0c`.
- Launcher: bg `#ecefeb` + custom bird PNG (`messenger-assets.qualified.com/...4a007c6b...png`); callbox bg `#ecefeb`; calendar/booker tokens present (day controls `#122124`/`#888F91`).
- Fonts: **Inter var** (100–900) + Inter statics, self-hosted woff2 (`assets.qualified.com/packs/media/Inter-Regular.*.woff2`). The top-of-page offer banner reuses the site font **Denimink**. [srcdoc][capture]
- Motion keyframes: `q-fadeIn/q-fadeOut`, `q-bubblePop` (12px rise), `q-bookerPaneIn`/`q-bookerStepIn` (4–6px slide-fade for meeting-booker panes), `q-pulse` + `flipDotMove` (typing dots). Panda-CSS token layers (`@layer reset,base,tokens,recipes,utilities`). [srcdoc]
- Offer banner ("pounce" banner, captured mounted at top): shadow-DOM offer host, `data-qualified-offer-host-location=HEADER`, z-index 2147483641; dark-green `#183129` strip with background image; headline Denimink 16px/weight 200 white (italic em): "Read about Flock's latest privacy, security, and accountability updates here."; CTA "Read Now" → blog post (bg `#536E47`, white text, radius **13.825px**, height 32px); ✕ dismiss 12×12. [capture][live screenshot 07]

Network shape (to MIMIC, never call): [live]
- `POST https://app.qualified.com/w/1/{token}/visitor_events?wu={visitorUuid}&uuid={sessionUuid}` → 204, body `{"event":"..._ms","type":"log","extra":{"method":"dist","operand":<ms>,"tags":{...}}}` (telemetry).
- `GET https://app.qualified.com/w/1/{token}/messenger?uuid={sessionUuid}` → iframe HTML (the srcdoc captured).
- `WSS wss://ws7.qualified.com/cable?wv=9&token=…&vu=…&wu=…&ca=<ISO ts>` (ActionCable live session).
- Packs: `analytics-*.js`, `multimodal_v2-*.js`, `widget/sandboxed/messenger-{css,js}`, Inter woff2, `static-media/piperx-orb/orb-animation.mp4` (autopilot orb video).

**Checklist:**
- MUST-REPRODUCE: collapsed → pounce-card → expanded UX flow, geometry (20×20 → 412×296 → 412×343, bottom-right), pop animation, card layout (avatar/header/message/CTAs/composer/footer/✕), full `--THEME_*` token set, Inter var font, bubblePop + typing-dot motion, offer-banner visual (as themed variant), privacy-disclosure footer text behavior.
- MUST-REPRODUCE (ticket 04): swap the network layer for the yarnspinner-ts wrapper; keep the same message/bubble/CTA/composer semantics; ship throwaway fixture dialogue.
- DEFER: meeting-booker panes (keyframes + config exist; not exercised), inbound voice/callbox, multi-locale privacy disclosures, GPT-autopilot specifics.
- STRIP: all calls to app.qualified.com / ws7.qualified.com / js.qualified.com, telemetry events, visitor/session cookies (`__q_state_PkqDRmLsN1JZW8p3`).

### 2. Animation machinery

- **GSAP 3.15.0 suite** from `cdn.prod.website-files.com/gsap/3.15.0/`: core, ScrollTrigger, **SplitText**, TextPlugin, ScrollToPlugin, Observer, CustomEase, DrawSVGPlugin, MotionPathPlugin, Flip. [live]
- **Lenis 1.3.23** smooth scroll (`unpkg.com/lenis@1.3.23/dist/lenis.min.js`; `html.lenis` class). MUST-REPRODUCE (or equivalent smooth-scroll feel). [live][capture]
- **Split system A — hero H1** (`data-split-onload data-split-title`, `.is-visible` added on load; spans `.title-word` with `--word-index`, `--split-final-color: rgb(254,253,251)`): [capture]
  - CSS transition stagger per word: durations `.28s / .98s / 1.02s / 1.02s` (opacity/transform/filter/color), ease `cubic-bezier(0.22,1,0.36,1)`, delay `word-index × 58ms` (+64ms for filter/color).
  - Final state: `color: var(--split-final-color); opacity:1; filter:blur(0); translate3d(0,0,0)`. Initial state (per the GSAP words' captured values): `color: rgb(142,168,184) (slate #8EA8B8); filter: blur(15px); transform: translateY(0.42em); opacity: 0.45`. MUST-REPRODUCE — achievable in pure CSS.
- **Split system B — section headings** (`data-split-gsap=words`, GSAP SplitText): heading-2xl/3xl/4xl (Denton 300, line-height 1–1.04, max-width 24ch) get `aria-label` + per-word `<div class=word aria-hidden=true>` with `will-change: transform,filter,color,opacity`; effect = blur(15px)+0.42em rise+slate→final color, scroll-triggered. 7 headings on homepage. MUST-REPRODUCE. [capture][live]
- **`data-animation-gsap=fade-in-2`** (9×: hero-cards-container, spotlight-card, large-feature-panel, lineup-wrap, …): scroll-triggered opacity 0→1 (verified live: elements at opacity 0 until scrolled into view). MUST-REPRODUCE.
- **`data-animation-gsap=image-clip`** (5×, on media wrappers `.img-overlay`): clip-path inset reveal — captured mid-state `inset(6% 10% 0% 10% round var(--clip-r))`, animating toward full reveal (`--clip-r` radius animated by JS). MUST-REPRODUCE.
- **No Webflow IX2** (`data-w-id` count 0) despite `w-mod-ix/ix3` classes — all custom motion is the GSAP attribute contract above. [capture]
- **Navbar**: `w-nav` (`data-collapse=all`, duration 400, ease); on scroll the transparent full-width bar becomes a floating rounded cream bar. MUST-REPRODUCE. [capture][live screenshots 07→11]
- **Carousels/accordions**: none in homepage DOM (Swiper CSS is inlined site-wide + `.swiper-arrow` styling and Finsweet `attributes-cmsslider` are loaded — CMS sliders likely live on collection pages; homepage has no instances). DEFER to ticket 01/05 inventory. [capture][live]

### 3. Video

- **Homepage has zero `<video>` elements** (capture and live agree; no mp4/webm anywhere in the page, no `w-background-video` DOM). Hero is a static full-bleed photograph. Nothing video-behavioral to reproduce on the homepage. [capture][live]
- Only video found: Qualified's `orb-animation.mp4` (widget decoration — optional in the mimic). [live]
- Caveat: other pages may embed video (ticket 01 inventory governs).

### 4. Fonts (families/weights actually served)

Site fonts, all woff2, self-hostable (inlined base64 in the capture; Webflow-served live): [capture][live]
- **Denim** — 400/500/600, normal+italic. Display primary (`--_zz-default---font--primary: Denim,Arial,sans-serif`).
- **Denimink** — 400/500, normal+italic. Secondary (`--_zz-default---font--secondary`), used by H1 var + Qualified offer banner.
- **Denton** — 300/400, normal+italic. All section headings (`.heading-*`: Denton,Georgia,sans-serif; weight 300).
- **Sohne** + **Sohne Book** — 400, normal+italic. Body (`Sohne,Arial,sans-serif`).
- **Schibsted Grotesk** — 400 latin subset @font-face; Webfont-loader classes show n3–n7 activated. Used by `.mw-60ch` prose utility.
- Loader: `ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js`. [live]
Widget fonts: **Inter var** (100–900 variable, normal+italic) + Inter statics 100–400. [srcdoc]

MUST-REPRODUCE: families + the weights/styles listed, self-hosted per map decision (assets copied verbatim = ticket 05).

### 5. Tracker strip-list + cookie consent

All of the following fired on a plain US visit — **STRIP** (does not block ticket 04's mimic, which re-implements UX locally): [live]
- **GTM-P2N74FZ** + gtag **G-920D26WZNB** + analytics.js + DoubleClick conversion 854632199 (google-analytics.com, googletagmanager.com, stats/ad doubleclick).
- **LinkedIn** Insight (snap.licdn.com insight + beta, px.ads.linkedin.com) — **Facebook Pixel** (connect.facebook.net/fbevents.js) — **Bing** (bat.bing.com) — **StackAdapt** — **Nextdoor** ads pixel — **Reddit** pixel (redditstatic.com, `_rdt_uuid`).
- **Hotjar** (site 5147324) — **HockeyStack** (+ `-qualified` + `-marketo-forms` integrations).
- **Marketo**: forms2.min.js (go.flocksafety.com), Munchkin (`munchkin.marketo.net`, `_munchkin`), marketo-v2 Webflow app + munchkin-init.
- Intent/deanonymization: **6sense** (j.6sc.co, `_zitok` is ZoomInfo), **Bizible**, **Intentsify**, **UnifyIntent**, **Warmly** (getwarmly.com widget), **Mountain** (dx.mountain.com/spx).
- Two obfuscated first-party scripts (`/g0lnomhfn3mgNjgy…/P2BpHyKp…`) — purpose unidentified (likely bot/fraud or visitor-ID). STRIP; note for ticket 05 if heads must match 1:1.
- Cloudflare `_cfuvid` — infra-level, not a script to strip.
- Cookies observed: `_cfuvid, _ga, _gcl_au, flockID, utm_source, utm_medium, __q_state_{token}, _zitok, _rdt_uuid, OptanonConsent, _ga_920D26WZNB`. [live]
- **Qualified telemetry endpoints** — STRIP from network reality; their UX shell is the MUST-REPRODUCE above.

**Cookie consent (OneTrust/CookiePro)** — `cdn.cookielaw.org` otBannerSdk + otSDKStub, template `202605.1.0`: [capture][live]
- UX: floating card bottom-LEFT (~390px): policy paragraph + "Privacy Policy" link; buttons **Accept Cookies** (`onetrust-accept-btn-handler`), **Reject All** (`onetrust-reject-all-handler`), **Do Not Sell or Share My Personal Information** (`onetrust-pc-btn-handler`, opens preference-center `#onetrust-pc-sdk`, role=dialog aria-label=Privacy), ✕ close. US model: trackers fired pre-consent (opt-out regime).
- Recommendation for map's open question: **STRIP the whole consent stack including the banner** (nothing left to consent to); fold final call into ticket 05.

### Coverage caveats

- The capture is a **post-render, script-stripped singlefile DOM**: JS behavior was reconstructed from the data-attribute contracts, the live CDN script list, captured runtime DOM states (inline styles left by GSAP), and live observation. Exact GSAP timeline parameters for `fade-in-2`/`image-clip` (precise durations/eases) are inferred from captured start/mid/end states, not from source.
- Live runs used Dockerized headless Chrome 124 (native Chromium is sandbox-fenced — `MachPortRendezvousServer: Permission denied`; the brief's browser-extension path also failed: no Chrome on host). UA-spoofed Mac Chrome, residential egress; the Qualified pounce is **rule-gated and session-variable** (mounted in 2 of 4 sessions; never on the plain recon session). The opened widget was observed as a 412px card at 1440×900; the config's `sidebar` opened-state geometry was not observed (needs a pounce + click at a viewport where docking kicks in).
- The conversation beyond the greeting was **not** walked (no typing/submission per brief). Operator-side visuals (typing dots, agent join) are evidenced only by keyframes and pack names.
- Widget internals use hashed Emotion/Panda classes (`css-*`, `q-*`) — brittle as copy targets; the token layer (`--THEME_*`, keyframes) is the stable contract.
- Homepage-only per ticket scope; other pages may carry video/sliders/forms (Finsweet cmsslider + Marketo forms2 are loaded site-wide). Marketo form behavior was not exercised.
- Screenshots + raw JSON evidence: preserved in `research/evidence/02-behavioral-machinery/` — `01-top.png`, `02-bottom.png`, `07-collapsed.png`, `11-greeting.png`, `12-greeting-card.png`, `13-conversation.png`, `evidence.json`, `ux-flow.json`, `dom-greeting.json`, `dom-open.json`, `widget-mount.json`, `cookies.json`.
