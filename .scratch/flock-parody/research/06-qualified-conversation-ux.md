# Research — Qualified conversation UX (beyond the pounce)

Wayfinding ticket: [issues/06-qualified-conversation-ux.md](../issues/06-qualified-conversation-ux.md) · Resolved 2026-09-09

Evidence (screenshots, DOM/WS/network JSON, per-session logs, capture rig): **[evidence/06-qualified-conversation-ux/](evidence/06-qualified-conversation-ux/)** — sessions `s1`–`s14`; the richest full walks are **s9** (1440×900), **s10** (1920×1200), **s11** (2560×1440), plus `s12` (Get-a-Demo flow) and `s14` (banner dismissal).

## Answer

Walked the full conversation UX live (Dockerized Playwright Chromium 124, UA-spoofed Mac Chrome, fresh contexts per session, viewports 1440×900 / 1920×1200 / 2560×1440). The widget has **three surfaces**: a **92×92 launcher**, the **412×296 pounce card**, and the expanded conversation — which at every desktop viewport docks as a **right-anchored 538px-wide panel** (the config's `multimodalOpenedPosition: "sidebar"`; never full-height). Conversation persists across minimize/re-open **and across page reload**. Bot replies arrive in ~4s via `source: "auto_respond"` GPT autopilot with **no typing indicator**; greeting/reply copy is **GPT-generated fresh per session**. Full wire contract captured: `POST /w/1/{token}/messages` payload shapes, ActionCable channel/frame shapes, sent/received sound files, and the complete 94-property `--THEME_*` token set.

### 1. Mount model & the three surfaces

The widget mounts `#qualified-multimodal-host` (fixed full-viewport, `pointer-events:none`, z-index 2147483642) whose shadow root is just `<slot name="start-guard">/<slot name="end-guard">` guards — **the messenger iframe `#q-messenger-frame` lives in the light DOM, slotted in** (this is why ticket 02's CDP flattened-DOM view saw it "inside" the host; DOM-subtree probes must search the whole document). [live, s3-structure-diag.json]

Geometry contract (iframe rects from `s9`/`s10`/`s11-rects.json`): [live]

| State | Size | Anchor |
|---|---|---|
| Pre-pounce | 20×20, invisible | bottom-right (ticket 02) |
| Launcher | **92×92** | flush bottom-right corner (0px margin) |
| Pounce greeting card | **412×296** | flush bottom-right |
| Expanded conversation | **538 × N** (N = content height, grows 480→750/843/982 as messages accumulate; cap ≈ viewportH−150) | flush right + bottom |

At 1920×1200 one session showed **launcher only** (no pounce card) — clicking the launcher opens the conversation directly. Pounce is rule-gated/session-variable as ticket 02 found; in this run's sessions the greeting always appeared ~36–38s after load, **triggered by scrolling**: the client posts `{"type":"event","event_type":"scrollPercentage"}` to `/messages`, the server answers over WSS with `botProcessStarted` → `startChatBot` → `showWidget`, then the greeting texts arrive as `first_auto_pounce` / `second_auto_pounce` message events (source `auto_respond`). The server pushes these **even in sessions where the client never mounts the UI** (s1/s2: cable open, auto-pounces delivered, iframe never created). [live, ws-events/network JSONs]

### 2. Greeting card (pounce)

412×296 white card, flush bottom-right (`s9-01-greeting.png`, `s3-01-no-pounce-end.png`): [live]

- Header: circular dark-green avatar (bird mark) + "**Flock**" (bold) / "AI Sales Assistant" (gray).
- One bot message bubble, **GPT-generated fresh every session** — four verbatims captured, e.g. "Hey there! I'm Flock, your AI Sales Assistant. What questions do you have about Flock's offerings today?" / "…Just curious, is there something…" / "Hey! …I noticed you were checking out our site—anything specific…" (ticket 02's text was itself one of these rolls). **Mimic implication: the original's copy is non-deterministic; the parody must fix one canonical string** (map already assigns copy to the user's yarn effort).
- CTA row: **Get a Demo** / **Support** — solid `#183129`, white text, radius 4px (`--BUTTON_BORDER_RADIUS`).
- Composer: placeholder **"Ask a question"** + paper-plane Send icon.
- Footer: "Flock's Privacy Policy" link, `#6E7879`.
- Close: dark-green circular **✕ at the card's top-left**, half outside the card edge.

### 3. Expansion → the "sidebar" dock

Clicking the message preview (aria-label "Message preview - click to open…") or the launcher morphs the card into the conversation panel: **538px wide, right-anchored, bottom-anchored, content-driven height** — at 1440×900 it settles at 538×750; taller viewports grow taller panels (538×843 @1200p, 538×982 @1440p) — this is the config's `multimodalOpenedPosition: "sidebar"`, never a full-height sidebar. WSS emits `{"type":"event","event_type":"open"}` on expand. Expansion frames: `s9-02..07-expand-burst*.png`. [live, rects.json]

### 4. Conversation anatomy

From `s9-12-bot-reply.png`, `s6-13-reopened.png`, `s9-opened-convo.json`, `s9-bot-reply-dom.html`: [live]

- **Timestamp divider** "Today, 6:50 am" — small centered gray text at conversation top.
- **Bot bubbles**: class contract `focusable other bot isVisitorsPovAutopilotMessage css-* e16vzhe91`; small round avatar beside the bubble (outside it); rendered bg `rgb(241,244,247)` `#F1F4F7`, text `#101010`, radius **3px**, padding 12px 16px, max-width 80%, Inter var 13px/400. (Token `--MESSAGE_BUBBLE_BOT_BACKGROUND_COLOR` says `rgba(236,239,235,0.25)` — rendered value differs; treat **rendered** as ground truth for the mimic.)
- **Own bubbles**: class `focusable own css-q3uec5`; right-aligned, **no avatar**; bg `#ECEFEF` (= `--MESSAGE_BUBBLE_OWN_BACKGROUND_COLOR`), border 1px solid `#ECEFEF`, text `#183129`, radius 3px, same padding/type.
- A clicked CTA renders as a right-aligned own-side **chip** (bordered, e.g. "Support") — visually distinct from typed messages.
- **Placeholder swaps** between states: greeting card "Ask a question" → opened conversation **"Enter a message"**.
- **Persistent CTA row** above the composer: Get a Demo / Support solid buttons, present in card and panel.
- Composer: single-line textarea + paper-plane Send (`aria-label="Send"`, icon `#888F91`); grows text rows on input (21px tall at rest).

### 5. Send / reply / typing

Wire-verified sequence (`s9-ws-events.json`, `s9-network.json`): [live]

1. Typed send → `POST https://app.qualified.com/w/1/{token}/messages?uuid={session}` body `{"client_id":"<uuid>","type":"text","text":"What can you help me with?","ai_usages":null}`; the client's own bubble renders immediately (no server round-trip needed for display).
2. Sound cue `GET app.qualified.com/packs/media/message-sent.8ef9c21a59.mp3`.
3. Bot reply in **~4s** as WSS `message` event, `isOwn:false`, `source:"auto_respond"`, full text in `plainText` (no streaming deltas observed); mirrored by a `message-received.mp3` fetch.
4. **No typing indicator for the AI SDR**: zero `botProcessStarted` between send and reply, no `flipDotMove`/`q-pulse` animations observed in ~8s reply windows across s8/s9/s10 (150–350ms polling), no typing-classes in DOM dumps. The `flipDotMove`/`q-pulse` keyframes from ticket 02 belong to the **human-operator** path — `agentsAvailable:false` in every session, so operator UX remains unobservable (see caveats).
5. `messageRead` events arrive asynchronously (read receipts).

### 6. Quick replies / CTA strategy buttons

The greeting's Get a Demo / Support buttons are `aiStrategyButtonCtas` (ids + texts delivered in WSS payloads). Clicking one: sends a **text message with attribution** — `{"client_id":"…","type":"text","text":"Support","ai_usages":null,"ai_strategy_id":"1844…","ai_strategy_trigger_type":"button_cta"}` — plus an `activateAiStrategy` event; the bot then answers in-theme (Support → phone `+1 (866) 901-1781` + `support@flocksafety.com` with markdown links rendered inside the bubble). `s9-14/15-quick-reply*.png`. [live]

### 7. Lead capture ("Get a Demo" path)

Clicking **Get a Demo** in the greeting opens the panel and sends "Get a Demo" as a `button_cta` message; the bot replies **in chat asking for an email address** ("I'd be happy to help you book a demo! Could you please provide your email address?"). Capture stopped there per research boundary — **no email/lead data was ever submitted**. The meeting-booker/calendar panes sit behind this email gate and were **not reached** (ticket 02's DEFER stands). `s12-demo-convo.json`, `s12-04-demo-t2.png`. [live]

### 8. Minimize / re-open / persistence

- Expanded-panel close: **✕ top-right inside the header** (`aria-label="Close messenger"`); greeting-card close is top-left outside the card (§2).
- After close: iframe shrinks to the **92×92 launcher** (bird image, `--LAUNCHER_IMAGE_BACKGROUND_URL`), flush bottom-right. Clicking it re-opens the panel at full geometry with **100% of messages retained** (s9: 5/5). [live]
- **Page reload persistence**: after `location.reload()`, the launcher re-appears and the conversation is fully restored server-side (s9/s10/s11: 4/4, 5/5, 5/5 messages; `s9-18-restored.png`). Conversation state lives on the server keyed by visitor/session ids (`__q_state_*` cookie + `visitorId`/`conversationId`), not in the DOM. [live]

### 9. Offer banner (header strip)

Delivered by the WSS `initOffers` push: dark-green `#183129` strip, 52px tall, background image, Denimink headline (italic em), "Read Now" CTA `#536E47` radius 13.825px → blog URL; `animation.type: "PUSH_DOWN"`; `dismissOptions {allowDismiss, hideOnDismiss, hideOnSubmit}`. Dismiss = `button.dismiss-button` (aria-label "Close", 12×12) → host removed from DOM (`s14-banner-probe/after-dismiss.json`, `s1/s13/s14-banner*.png`). CTA href captured from the offer payload — never navigated. [live]

### 10. Network contract (to MIMIC in ticket 04 — never call)

Endpoints (all captured in `<sid>-network.json`):

- `POST /w/1/{token}/messages?uuid={session}` — three body shapes: event keep-alives (`{"type":"event","event_type":"scrollPercentage"|"open"}`), typed text (`client_id/type/text/ai_usages`), CTA clicks (adds `ai_strategy_id`, `ai_strategy_trigger_type:"button_cta"`).
- `POST /w/1/{token}/visitor_events?wu={visitor}&uuid={session}` — telemetry logs (204), e.g. `handleEvents event: Conversation Started`.
- `GET /w/1/{token}/messenger?uuid={session}` — the iframe document (srcdoc copy: `messenger-srcdoc.html`).
- WSS `wss://ws7.qualified.com/cable?wv=9&token=…&vu=…&wu=…&ca=<ISO>` — ActionCable: client subscribes `Visitors::WidgetChannel` + `CoBrowse::VisitorChannel`; server frames `welcome`/`confirm_subscription`/ping-every-3s/`message` envelopes `{"identifier":…,"message":[{event,payload}]}`; event vocabulary: `initState`, `initOffers`, `endLoadingState`, `botProcessStarted/Ended`, `startChatBot`, `showWidget`, `message` (types `text`/`event`, `source: standard|auto_respond`, `apForArComposer: first|second_auto_pounce`), `messageRead`, `activateAiStrategy`. Full `initState` payload (agents, avatars, conversation, script ids): `<sid>-init-state.json`.
- Sounds: `message-sent.mp3`, `message-received.mp3` (packs/media).
- Packs (iframe assets): `messenger-{css,js}`, `analytics-*.js`, `multimodal_v2-*.js`, Inter woff2s, orb-animation.mp4.

### 11. Tokens & motion for the conversation state

- Full live `--THEME_*` set (**94 custom properties**) in `s9-opened-convo.json` → `theme` field: bubbles, buttons (incl. picklist/string-field/text-field send buttons for in-chat forms), calendar/booker, callbox, launcher, header/footer, prompt CTAs. Base: `--THEME_PRIMARY_COLOR #ecefeb`, `--THEME_TEXT_COLOR #183129`, `--theme-font-family 'Inter var'`, `--BUTTON_BORDER_RADIUS 4px`.
- Rendered conversation values (§4) override tokens where they differ (bot bubble bg `#F1F4F7`, radius 3px).
- Motion: card→panel expand morph (burst frames `s9-02..07`), `q-bubblePop` message entry, banner PUSH_DOWN; typing dots exist as keyframes only (operator path, unexercised).

## Coverage caveats

- **Human-operator mode never observed** (`agentsAvailable:false` in all sessions, all viewports): operator typing dots, agent-join, multi-agent avatars, and co-browse (`CoBrowse::VisitorChannel` subscribed but unused) are evidenced only by config/keyframes. The AI SDR path is fully walked.
- **Meeting booker unexercised** — gated behind an email ask in chat; deliberately stopped (no lead data submitted). Booker tokens/keyframes from ticket 02 remain the only evidence.
- Pounce rules remain opaque server-side; observed correlations only (scroll → `scrollPercentage` → bot start; ~36–38s with nudged scrolling; one launcher-only session). Copy is per-session GPT output — do not treat any single greeting string as canonical.
- Panel height cap measured at three viewports (content-driven, ≈ viewportH−150 at 1440×900); exact max-height formula not pinned.
- Greeting ✕ (top-left, outside edge) vs panel ✕ (top-right, inside) captured visually; their exact hover/press states not frame-walked.
- Sessions ran from a residential IP via Dockerized headless Chromium (stealth-patched); Qualified's bot-scoring could still influence mount rate — pounce mounted in most s3+ sessions after stealth patches, matching ticket 02's 2-of-4 rate before.

**Checklist for ticket 04 (yarnspinner wrapper mimic):**
- MUST-REPRODUCE: launcher 92×92 → pounce card 412×296 → panel 538×N geometry chain (flush right/bottom), expand morph, all surface layouts (§2, §4), placeholder swap, CTA row + clicked-CTA chip echo, timestamp divider, bubble styles (rendered values), Inter var 13px, close button positions both states, minimize/re-open retention, reload restoration (local session state), sent/received sound hooks, push-down banner variant.
- MUST-REPRODUCE (wire shape, locally simulated): message envelopes (`text`/`event`, own/other, `source`), CTA-attributed sends, greeting-then-follow-up pounce cadence.
- DELIBERATE DIVERGENCE: replace per-session GPT copy with the user's fixed yarn dialogue; no telemetry/network calls.
- DEFER: operator/typing-dots UX, meeting booker, co-browse, in-chat form fields (tokens captured: picklist/string/text-field send buttons).
