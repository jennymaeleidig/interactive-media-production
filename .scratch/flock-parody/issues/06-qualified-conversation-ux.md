Status: resolved
Type: research
Blocked by: —

## Question

What does Qualified's chat widget actually do **beyond the pounce greeting**? Ticket 02's research (see `research/02-behavioral-machinery.md`) captured the pounce card (412x296, tokens, keyframes) but explicitly never walked: the expanded/opened conversation state, composer behavior, typing indicator, bot/operator response bubbles, quick-reply buttons, the dark-green offer banner interaction, minimize/re-open persistence, and the config's `sidebar` docked-state geometry (config targets sidebar dock on desktop; only the 412px card was observed at 1440x900).

Method notes (from ticket 02's caveats — reuse what worked):

- The pounce is **rule-gated and session-variable** (mounted in 2 of 4 sessions). Plan multiple fresh sessions; vary viewport (try 1920x1200+ where sidebar docking may kick in).
- Native Chromium is sandbox-fenced; the proven method is **Dockerized headless Chrome + CDP** (see `research/02-behavioral-machinery.md` for the exact setup) or an unfenced herdr pane's own browser tooling.
- Record per state: screenshot (to `research/evidence/06-qualified-conversation-ux/`), DOM snapshot, relevant tokens/keyframes, and the network shape (to MIMIC in UX, never call: POST app.qualified.com, WSS ActionCable message frames).

Deliverables: full findings in `research/06-qualified-conversation-ux.md`; short-gist `## Answer` here linking to it; a Decisions-so-far line on `map.md`. Evidence is ground truth for the chat wrapper prototype (ticket 04).

## Answer

Researched 2026-09-09 — full findings + evidence: [research/06-qualified-conversation-ux.md](../research/06-qualified-conversation-ux.md) (evidence: `research/evidence/06-qualified-conversation-ux/`, sessions s1–s14; best full walks s9/s10/s11).

Three surfaces, one geometry contract: launcher **92×92** → pounce card **412×296** → expanded panel **538×N** — all flush bottom-right; "sidebar" position = right-docked 538px panel with content-driven height (cap ≈ viewportH−150), never full-height. Pounce fires ~36s in, triggered by scrolling (`scrollPercentage` event → `botProcessStarted`/`startChatBot`/`showWidget`); greeting + replies are **GPT-generated per session** (copy is non-deterministic — mimic must fix one string). Replies land in ~4s via `auto_respond` with **no typing indicator** (operator-only; operators were never online). Conversation persists across minimize/re-open **and page reload** (server-side session). Full wire contract captured for the yarnspinner wrapper to imitate locally: `POST /w/1/{token}/messages` body shapes (events / typed text / CTA clicks with `ai_strategy_id`), ActionCable channel + frame vocabulary, `initState` payload, sent/received sound files, 94-prop `--THEME_*` set + rendered bubble values. "Get a Demo" lead-capture asks for email in-chat — stopped there, no data submitted; booker panes stay deferred. Covenants honored: no credentials exfiltrated, no forms submitted.
