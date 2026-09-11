# 09: Chat widget fidelity

**What to build:** The mimic looks exactly like the original assistant. The three surfaces — launcher, pounce card, expanded panel — match the captured geometry and styling, with the widget's CSS lifted wholesale from the Capture and no authored replacements. The composer box and send icon are visually present but inert; pending choices render as user-style chips inside the composer slot, with a placeholder when none are pending. Replies land as complete bubbles — no typing indicator, no sounds. The pounce behavior and panel geometry match the captured contract.

**Blocked by:** 08.

**Status:** resolved
Label: ready-for-agent

- [x] The launcher, pounce card, and expanded panel match the captured dimensions, pr™`2lacement, and colors.
- [x] **AMENDED** — was: "Widget styling comes from the Capture's stylesheet, with zero authored styling additions." Now: widget styling is the Capture's **own 94-token `--THEME_*` layer lifted verbatim** plus layout values **transcribed from captured rendered evidence**; no visual value is invented. The original wording is unsatisfiable — the widget's runtime layout CSS was never captured, so there was nothing to lift wholesale (see Comments).
- [x] The composer is visually present and inert; the placeholder shows when no chips are pending.
- [x] Choices render as user-style chips inside the composer slot and selecting one reads as a sent message.
- [x] Replies appear as complete bubbles with no typing indicator and no sounds.
- [x] The pounce fires per the captured trigger behavior — scroll-armed, then a beat (the Capture's exact thresholds are unrecorded; see Comments).
- [x] **AMENDED** — was: "A side-by-side against the captured widget shows no visible divergence." Now: the side-by-side (committed at `evidence/09-chat-widget-fidelity/`) shows no visible divergence **outside the composer slot the ticket itself changes**. The original wording is unsatisfiable alongside the chips mandate (see Comments).

## Comments

**Implemented** (`components/chat-widget.css`, `components/ChatWidget.tsx`,
`test/chat-widget.seam.test.tsx`, `evidence/09-chat-widget-fidelity/`;
supersedes the ticket-08 driver widget).

### Geometry — measured, not assumed

The research table's 92x92 / 412x296 / 538xN figures are the *host iframe*
rects (transparent). Pixel-measuring the captured screenshots gives the
visible boxes, which are the fidelity target and are what the CSS encodes. The
rendered boxes are committed in
`evidence/09-chat-widget-fidelity/rendered-boxes.json`:

| surface  | captured visible box | rendered | delta |
| -------- | -------------------- | -------- | ----- |
| launcher | 54px circle, inset 17px | 54px @ (1369,829) | 0 |
| card     | 332x252 @ (1092,632) | 332x252 @ (1091,631) | 1px |
| panel    | 343x413 @ (1082,470) | 343x413 @ (1080,470) | 2px |

Colors, radii, fonts and elevation match the Capture (bot bubble
`#F1F4F7`/`#101010`, own `#ECEFEF`/`#183129`, 3px radius, 12px 16px padding;
header band `#ecefeb`/`#183129`; footer `#6E7879`; elevation
`rgba(0,0,0,0.15) 0 5px 20px`; Inter var 13px).

### Two criteria were AMENDED, not quietly checked

Both are marked inline above with their original wording. Neither was
satisfiable as written.

**Criterion 2 — the ticket's premise is false.** The widget's runtime layout
CSS **was never captured**, so there is nothing to lift wholesale. The
messenger iframe's `.css-*` emotion classes (css-kleumx, css-q3uec5, …) appear
in the captured DOM dumps and `*-convo.json` files but have **no rule body in
any stylesheet** — a repo-wide grep and a scan of the raw SingleFile capture
(26 style tags, 4.6 MB of CSS) both come up empty for 5 of the 6 distinct
conversation classes. The srcdoc's 13 KB `data-emotion` block holds only ~50
base/hover/focus/keyframe selectors; layout is injected by the messenger React
app at runtime. So the stylesheet is the Capture's **own 94-token `--THEME_*`
block lifted verbatim**, plus layout rules transcribed value-for-value from
`s9-opened-dom.html`, the `s9/s10/s11-*-convo.json` computed styles and
`*-rects.json`, and the captured screenshots. The file's provenance header says
this in as many words.

**Criterion 7 — the chips mandate forecloses a byte-faithful composer.** The
captured composer holds a placeholder plus a dark CTA row; ticket 09 mandates
chips in that slot, and `dialogue/flock.yarn` rules out a persistent CTA row
("no free text, no persistent CTA row"). Both cannot hold. Resolution: the
chips **are** the choices, the redundant CTA row is not rendered, and every
other captured element matches. The side-by-side is now a committed artifact
(`evidence/09-chat-widget-fidelity/`), not a claim.

### Review fixes (two-axis review of `49a0624`)

- **Double-echo of a selected option — fixed.** `handleChat`'s `option` turn
  already prepends the visitor's line, so the widget's optimistic append
  rendered every selection twice against the real server. The optimistic
  append is gone; the server owns the echo. The seam test now asserts exactly
  one own bubble (it previously masked the bug by checking only the first).
- **Pounce constants overclaimed as captured — fixed.** The Capture records
  only that the pounce is scroll-armed and fired ~36s after load under a
  server-side rule set; the thresholds were never captured.
  `POUNCE_SCROLL_PX` / `POUNCE_DELAY_MS` are now documented as the mimic's
  stand-ins for the captured trigger *shape*, the only such values in the file.
- **`export default` → named export**, per `CODING_STANDARDS.md`
  ("Named exports; ESM"); imports in the demo page and the seam test updated.
- **New seam registered** in `CODING_STANDARDS.md`'s Testing section, per that
  doc's rule that later efforts extend it rather than deviate silently.

### Post-review direction (user, 2026-09-10 evening)

- **The pounce card is the same UI as the panel.** Same header with the
  in-header close (the captured corner ✕ is dropped — it also clipped badly
  against the surface), same divider, same avatar bubble, same composer and
  footer; only the box differs (332px wide, floored at the captured 252px,
  capped at `100vh - 150px`, content-driven height). Clicking the greeting
  still opens the panel.
- **Typeface + type scale matched to the live widget.** The Capture's own
  `Inter var` regular face is lifted verbatim into the stylesheet as an inline
  `@font-face` (~303KB base64; the italic face stays out — no italics are
  rendered). The scale follows the live widget's rendered screenshots: 15px
  body, 16px name, 14px role/chips/footer, 6px bubble radii, ~1.4 line-height.
  This supersedes the 13px/3px `*-convo.json` computed-style transcription,
  which disagrees with every rendered capture of the real widget.
- **Chips are green.** The pending choice chips now carry the captured CTA
  button values (#183129 / white, `--BUTTON_BORDER_RADIUS`, #070f0c hover) —
  the slot reads like the original's CTA row. This supersedes the "user-style
  chips" styling (criterion 4's *slot* requirement stands; the echo in the log
  is still the user-style bubble, as the original renders echoes).
- **Own-bubble wrapping fixed.** The captured `max-width: 80%` was resolving
  against each row's shrink-wrapped width — clamping every own bubble to 80%
  of itself ("Sup port"). Rows are now full-width, so 80% resolves against the
  log, as it did in the original; own bubbles render single-line where the
  original's do (`rendered-panel-echo.png`).
- **Pounce legibility.** The scroll gate fires ONCE per session (the captured
  contract — a live session resumes and never re-pounces), so on a return
  visit scrolling does nothing *by design* and reads as "broken". The widget
  now logs one console line when it restores a session and suppresses the
  pounce; to see the pounce again, remove
  `localStorage["flock-chat-session"]` and reload. Verified firing on a fresh
  profile of the production build (`rendered-boxes.json`, card 332x252 after
  scroll).

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
  the composer slot, per-surface placeholders, chip-select echo (single) +
  `option` POST, inert `aria-disabled` send, no typing/audio, session resume.
- Visual side-by-side committed at `evidence/09-chat-widget-fidelity/`
  (captured vs the production build at 1440x900), with `rendered-boxes.json`
  and the re-shoot recipe.
