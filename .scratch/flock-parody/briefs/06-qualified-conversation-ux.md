# Brief: Qualified conversation UX (ticket 06)

You are resolving a wayfinding research ticket for the flock-parody effort.

**Ticket**: `.scratch/flock-parody/issues/06-qualified-conversation-ux.md` — read it first; it holds the full question, method notes, and deliverable conventions.

**Context you need**:

- `.scratch/flock-parody/research/02-behavioral-machinery.md` — the prior research that captured the pounce greeting. Reuse its capture method (Dockerized headless Chrome + CDP worked; native Chromium is sandbox-fenced). Its `## Coverage caveats` section lists exactly what was NOT observed — that is your target.
- Evidence convention: screenshots/raw JSON go to `.scratch/flock-parody/research/evidence/06-qualified-conversation-ux/` (create it), full findings to `.scratch/flock-parody/research/06-qualified-conversation-ux.md`.
- Resolution convention: append a short-gist `## Answer` (a pointer to the research file) to the ticket, set `Status: resolved`, and append one Decisions-so-far line to `.scratch/flock-parody/map.md`.

**Goal**: ground truth for rebuilding the widget's conversation UX (ticket 04 will mimic it with a yarnspinner wrapper — zero Qualified network calls, but identical visuals/motion/flow). Capture every state you can reach: expanded card, composer focus/send, typing indicator, bot reply bubbles, quick replies, offer banner interaction, minimize/re-open, sidebar dock if reachable. The pounce is rule-gated and session-variable — use multiple fresh sessions and viewports (1920x1200+ for possible sidebar docking). Record the mimic-relevant network shapes (POST app.qualified.com payloads, WSS frame shape) but never exfiltrate credentials or submit real forms.

**Boundary**: this is research only — no building, no code beyond throwaway capture scripts (keep them in the evidence folder).
