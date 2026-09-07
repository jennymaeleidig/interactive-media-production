# Effort: Plume AI Sales Assistant

The Plume mimicry of the subject vendor's "AI Sales Assistant" chat widget
(source screenshots in `flock-source/`). Site-wide, choices-only dialogue,
built on the owner's local yarnspinner-ts library from day one.

## Decisions (grilling round 1–3, resolved)

- **Runtime, not interim** — yarnspinner-ts (`yarnspinner-typescript` +
  `yarnspinner-vite-plugin`) is wired _now_ as local `file:` deps to the
  sibling checkout `../yarnspinner-ts`; the owner builds that repo's dist
  (sandbox can't write there). Content loads as build-time-compiled `.yarn`
  via the vite plugin; the pull-based `Dialogue` runtime drives the widget.
  No interim interpreter was built.
- **Interaction** — no free-text box, ever. The runtime's option set is the
  only reply mechanism; the user's picked option lands as their bubble.
  Persistent chips ("Get a Demo" / "Support") mimic the source widget and
  are `<<jump>>`s to contract node titles (`GetADemo` / `Support` in
  `dialogue.yarn`).
- **Turn shape** — each turn's agent lines land as one batch after a typing
  indicator; unavailable options are hidden, not disabled.
- **State** — close/reopen resumes mid-dialogue (no restart control in v1).
  One shared `InMemoryVariableStorage` instance survives chip-jump
  reconstructions, so visit counts, once-state, and variables persist.
  Session lives in `src/lib/state/assistant.svelte.ts` (client state,
  survives route navigation).
- **Placement** — every route except the gate page `/`.
- **Satire stance** — faithful mimicry; satire lives in the
  corporate-jargon-voice register. No page-tracking behavior.
- **Content** — placeholder `src/lib/assistant/dialogue.yarn` in Plume
  voice, structured like the source screenshots, marked for the
  owner-authored pass. Deliberately exercises the feature surface
  (conditions, `<<set >>`/`<<declare >>`, `<<once >>`, `<<jump >>`,
  `visited()`, interpolation) as the scaffold's smoke test. The owner
  authors the real script later, keeping the chip node-name contract.
- **Look** — mirrors the source widget structure (avatar header, bubbles,
  chips, privacy footer) in the Plume design language: original serif-"P"
  roundel, paper panel on both page themes, no shadows. WAI-ARIA non-modal
  dialog pattern: focus to panel on open, back to bubble on close, Escape
  closes, live-region conversation log.
- **Copy policy** — widget copy follows the site-wide placeholder rule
  (COPY-PENDING); the support phone/email are fake placeholders
  (1-800-PLUME-01, care@plume.example).

## Files

- `src/lib/assistant/dialogue.yarn` — dialogue content (placeholder)
- `src/lib/state/assistant.svelte.ts` — session driver (shared client state)
- `src/lib/components/AssistantWidget.svelte` — bubble + panel UI
- `src/routes/+layout.svelte` — mount point
- `vite.config.ts`, `src/app.d.ts`, `package.json` — plugin, types, deps

## Open

- Owner-authored dialogue script replaces the placeholder content.
- yarnspinner-ts peer range covers vite ^8 only after the owner widens it
  (`packages/vite-plugin` declares ^5 || ^6 || ^7; installed with npm's
  tolerance — pin this when the library next installs strictly).
