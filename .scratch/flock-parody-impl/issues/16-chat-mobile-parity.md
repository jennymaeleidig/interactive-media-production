# 16: Chat mobile parity

**What to build:** On mobile widths the chat mimic behaves exactly as the live
Qualified assistant does — launcher placement, pounce card, expanded panel, and
composer all match the live mobile layout and interaction, including how the
widget coexists with the header's mobile take-over (ticket 14). Today the widget
is verified at desktop widths; this ticket pins the mobile behavior against live.

**Blocked by:** none — ticket 14 resolved 2026-09-11 (the mobile header take-over
now exists and is evidenced at 390×844).

**Status:** resolved
Label: ready-for-agent

- [x] A mobile ground-truth run of the live site (390×844) captures the widget's
      collapsed, pounce-card, and expanded states as evidence.
- [x] The mimic's launcher, pounce card, and panel match the live mobile geometry
      and layout at 390×844 (side-by-side evidence).
- [x] The widget stays layered above the open mobile header take-over and remains
      interactable with it open (`z-index: 2147483000` verified against the nav).
- [x] No keyboard or focus trap regression on mobile: the inert composer and the
      chips behave as at desktop.
- [x] Reduced motion and no-JS leave the widget's static end-state intact.

## Comments

Opened from ticket 14's Q6: the header ticket makes no chat changes; mobile chat
fidelity is scoped here. "Same function as live."

**Implemented** (`pipeline/chat-widget.css`, `test/chat-widget.seam.test.ts`,
`evidence/16-chat-mobile-parity/`).

### The live widget picks its variant by device detection, not width

The mobile ground-truth run found the live widget ships **two variants**: a
mobile UA gets a bottom-sheet card (370×331 frame) and a **fullscreen**
conversation (390×844); a desktop UA gets the 412×296 card and the 538px
sidebar. A controlled 1440-wide run returns the fullscreen mobile panel under a
mobile UA and the sidebar under a desktop UA — the split is UA/device-detection,
not CSS width. A served page is static and has no UA signal, so the mimic keys
the mobile variant on `(max-width: 767px)` — the breakpoint the widget's own
runtime CSS uses, read out of the live messenger bundle — which agrees with the
mobile variant at 390.

### What changed (geometry only)

- Launcher: 54px @ 17px insets → **50px @ 16px insets** (matches live exactly).
- Panel: 343px bottom-right sidebar → **fullscreen 390×844, square** (matches
  live exactly), including square header/footer bands so their 8px radii no
  longer re-round the corners.
- Card: bottom inset 17 → 15px; width/right unchanged (332 / 17, matching live).
- Desktop is untouched: the media query is `max-width: 767px`, verified by
  re-measuring the 1440 panel at 343×413 @ (1080,470) — ticket 09's boxes.

### Layering and invariants

The launcher stays visible above the open mobile take-over (`ours-mobile-nav-open.png`)
and remains interactable: clicking it opens the panel over the take-over and a
chip still advances the turn. `.fpc-root` is `z-index: 2147483000`; the captured
header is `.header-z { z-index: 2000 }`. No-JS renders no widget at all (the
runtime builds the DOM); under reduced motion the panel opens with every animated
property at 0s. The desktop seam tests for the inert composer and chips are
unchanged and pass.

### Tests

`test/chat-widget.seam.test.ts` gains a `mobile layout parity (ticket 16)`
block. jsdom does not evaluate media queries, so — like the nav seam's
reduced-motion check — it asserts the stylesheet's shape: the 767px block,
fullscreen square panel + bands, the 50px/16px launcher dock, the widget stays
motionless, and `.fpc-root` clears the nav's 2000.

### Accepted residuals

Named in the evidence README rather than hidden, all pre-existing ticket-09
decisions (not mobile-specific): chips vs the live CTA row; ticket 09's rendered
type scale vs the live computed 13px scale (so the header is 54 vs 49px and the
bubble taller); the card-as-panel UI (so the mobile card carries the divider the
live preview omits); the `#f4f5f3`/36px footer vs live's `#fcfcfc`/30px.

### Verification

`npx tsc --noEmit` clean; `npm test` **184 green across 10 projects**;
`npm run pipeline` (1180 pages, chat census 1167 mounted) + `npm run build` +
`npm run routes` green (1180 byte-identical served pages). Evidence at
`evidence/16-chat-mobile-parity/`.
