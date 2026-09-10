# 09: Chat widget fidelity

**What to build:** The mimic looks exactly like the original assistant. The three surfaces — launcher, pounce card, expanded panel — match the captured geometry and styling, with the widget's CSS lifted wholesale from the Capture and no authored replacements. The composer box and send icon are visually present but inert; pending choices render as user-style chips inside the composer slot, with a placeholder when none are pending. Replies land as complete bubbles — no typing indicator, no sounds. The pounce behavior and panel geometry match the captured contract.

**Blocked by:** 08.

**Status:** resolved
Label: ready-for-agent

- [x] The launcher, pounce card, and expanded panel match the captured dimensions, placement, and colors.
- [ ] Widget styling comes from the Capture's stylesheet, with zero authored styling additions. **— unsatisfiable as written; see Comments.**
- [x] The composer is visually present and inert; the placeholder shows when no chips are pending.
- [x] Choices render as user-style chips inside the composer slot and selecting one reads as a sent message.
- [x] Replies appear as complete bubbles with no typing indicator and no sounds.
- [x] The pounce fires per the captured trigger behavior.
- [ ] A side-by-side against the captured widget shows no visible divergence. **— holds for every captured surface except the composer slot the ticket itself changes; see Comments.**

## Comments

**Implemented** (`components/chat-widget.css`, `components/ChatWidget.tsx`,
`test/chat-widget.seam.test.tsx`; supersedes the ticket-08 driver widget).

### Geometry — measured, not assumed

The research table's 92x92 / 412x296 / 538xN figures are the *host iframe*
rects (transparent). Pixel-measuring the captured screenshots gives the
visible boxes, which are the fidelity target and are what the CSS encodes:

| surface  | captured visible box            | CSS |
| -------- | ------------------------------- | --- |
| launcher | 54px dark-green circle, inset 17px | `54px`, `right/bottom: 17px` |
| card     | 332x252 at x1092..1423, y632..883 | `332px x 252px` |
| panel    | 343x413 at x1082..1424, y470..883 | `343px`, `min-height: 413px`, `max-height: 100vh-150px` |

The recreation at 1440x900 lands the card at (1091,631) and the panel at
(1080,470) — within 1-2px of the captured boxes — with the captured
`rgba(0,0,0,0.15) 0 5px 20px` elevation, the captured bubble colors
(bot `#F1F4F7`/`#101010`, own `#ECEFEF`/`#183129`, both 3px radius, 12px 16px
padding), the captured header band `#ecefeb`/`#183129`, and Inter var 13px.

### Why criterion 2 is unchecked — the ticket's premise is false

The widget's runtime layout CSS **was never captured**, so there is nothing to
lift wholesale. The messenger iframe's `.css-*` emotion classes (css-kleumx,
css-q3uec5, css-t29j3r, css-h29lg, …) appear in the captured DOM dumps and
`*-convo.json` files but have **no rule body in any stylesheet** — a repo-wide
grep and a scan of the raw SingleFile capture (26 style tags, 4.6 MB of CSS)
both come up empty for 5 of the 6 distinct conversation classes. The srcdoc's
13 KB `data-emotion` block holds only ~50 base/hover/focus/keyframe selectors
and the 634 KB block is `@font-face` + theme tokens; layout is injected by the
messenger React app at runtime (ticket 06 evidence, 2026-09-10).

So the stylesheet is: the captured stylesheet's **own 94-token `--THEME_*`
`:root` block lifted verbatim** (plus the captured inlined Flock mark), and
layout rules **transcribed value-for-value from captured rendered evidence**
(`s9-opened-dom.html`; `s9/s10/s11-*-convo.json` computed styles and
`*-rects.json`; `s9-01-greeting.png`, `s9-09-opened-full.png`). No value is
invented, but the layout rules are authored — the file's provenance header
says so in as many words. Checking this box would be a false claim. **This
needs a user decision** (accept the transcribed transcription, or retire the
criterion).

### Why criterion 7 is unchecked — the mandated chips change the composer

The ticket mandates both "match the captured dimensions/styling" and "pending
choices render as user-style chips inside the composer slot". The captured
composer has **no chips**: it holds the placeholder and a dark CTA row
("Get a Demo" / "Support"). Adding chips necessarily changes that region, so a
byte-faithful composer and the chip mandate cannot both hold.

Resolution taken: the chips **are** the choices, so the redundant CTA row the
fixture's own note rules out ("no persistent CTA row", `dialogue/flock.yarn`)
is not rendered; the composer shows the pending chips, or the captured
placeholder strings ("Ask a question" on the card, "Enter a message" on the
panel) when none are pending. Launcher, card and panel chrome, the header,
greeting, bubbles, footer, colors, radius and outer geometry all match the
Capture; only the composer slot differs, and only because the ticket says it
must. This is the sanctioned divergence, not an unfinished surface.

### Contract details

- **Surfaces**: launcher → card (scroll pounce) → panel (click the greeting
  preview or the launcher). The card is the captured *preview* surface (larger
  greeting type, no avatar beside the message); the panel carries the avatar.
- **Composer is inert**: no free text, the send button is `aria-disabled` and
  a no-op, no second request.
- **Pounce**: `window.scrollY > 120` arms a 1500ms timer; only when no session
  exists. A resumed session does not re-pounce.
- **Session**: server-side via `POST /api/chat` (`start|resume|option`), the
  id persisted in `localStorage['flock-chat-session']` and replayed on reload.
- **No typing indicator, no sounds, no network assets**: all widget imagery is
  the Capture's own inlined data URIs (the Flock mark is both avatar/logo and
  launcher image); the widget fetches only its own `/api/chat`.

### Verification

- `npx tsc --noEmit` clean; `npm test` **155 green across 9 projects**;
  `npm run build` succeeds.
- `test/chat-widget.seam.test.tsx` (9 tests, project `chat-widget-seam`,
  jsdom via `react-dom/client` + `act`, `fetch` stubbed): launcher→panel,
  scroll pounce + preview→panel, no re-pounce after engagement, chips inside
  the composer slot, per-surface placeholders, chip-select echo + `option`
  POST, inert `aria-disabled` send, no typing/audio, session resume.
- Visual side-by-side at 1440x900 against `s9-01-greeting.png`,
  `s9-09-opened-full.png` and `s9-16-closed-launcher.png` (throwaway
  Playwright rig under `.tmp/t09/`, not tracked).
