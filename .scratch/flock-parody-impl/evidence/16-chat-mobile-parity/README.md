# Ticket 16 — chat mobile parity (390×844)

Ground truth and side-by-side for the Chat mimic's mobile variant. `compare-*.png`
are stitched pairs (**left = live flocksafety.com, right = the Recreation's
production build**), same viewport (390×844), no scaling of either side.
`live-*.png` / `ours-*.png` are the raw viewport shots.

> The pounce is rule-gated server-side and intermittent; the live shots below
> came from one session in which it fired. The **expanded panel** and
> **launcher** geometry do not depend on the pounce and were reproduced across
> runs.

## The finding that shapes the change

The live widget ships **two variants and picks one by device detection (UA),
not by CSS width**:

| UA | card frame | panel frame |
| --- | --- | --- |
| mobile | 370×331 bottom-right | **fullscreen** 390×844 (1440×844 at 1440) |
| desktop | 412×296 bottom-right | 538×480 sidebar (1440×900) |

`live-variant-probe.mjs` shows the same 1440-wide viewport returning the
fullscreen mobile panel under a mobile UA and the 538px sidebar under a desktop
UA. A served page is static and has **no UA signal**, so the mimic keys the
mobile variant on the breakpoint the widget's own runtime CSS uses —
`(max-width: 767px)`, read out of the live messenger bundle
(`js.qualified.com/packs/js/multimodal_v2-*.js`) — which agrees with the mobile
variant at the ticket's 390px target. The mimic declares that block in
`pipeline/chat-widget.css`. The three runs are committed as
`live-variant-output.json`, and the extracted breakpoint as
`live-messenger-breakpoints.json`.

## Measured geometry (`rendered-boxes.json`)

Live figures are exact element rects read from inside the cross-origin messenger
frame (`live-dom-probe.mjs`); Recreation figures are same-origin
(`mimic-shots.mjs`). Both from the Docker chromium rig.

| surface | live | recreation | match |
| --- | --- | --- | --- |
| launcher | 50×50, 16px / 16px insets, circle | 50×50, 16px / 16px, circle | ✅ |
| card | 332 wide, right 17, **bottom 15**, radius 8 | 332 wide, right 17, bottom 15, radius 8 | ✅ box |
| card height | 257 (content) | 362 (content) | ticket 09 — see residuals |
| panel | **fullscreen** 390×844, radius 0 | fullscreen 390×844, radius 0 | ✅ |
| panel header | 390×49 | 390×54 | ticket 09 type scale |
| panel composer | 358×47 @ (16,748) | 358×72 @ (16,726) | chips vs CTA row — see residuals |
| panel footer | 390×30, `#fcfcfc` | 390×36, `#f4f5f3` | ticket 09 |

Before this change the mimic rendered the desktop surface at every width: a
54px launcher, a 343px bottom-right sidebar panel. The mobile launcher dock and
the fullscreen panel are the parity work.

## Layering over the mobile header take-over (criterion 3)

`ours-mobile-nav-open.png` is the Recreation at 390×844 with the mobile
hamburger take-over **open**: the dark-green launcher is visible above the
take-over's grey sheet. Measured in the same run (`ours-mobile-boxes.json`):
the widget root (`pipeline/chat-widget.css` `.fpc-root`) is
`z-index: 2147483000`; the captured header is `.header-z { z-index: 2000 }`, and
nothing on a served page sits between them. Both values are recorded in
`ours-mobile-boxes.json` (`headerZ: "2000"`, `widgetZ: "2147483000"`); the 2000
is `.header-z`'s own value in the served bytes, not the background layer's −1. Interactivity with the take-over
open, asserted in `mimic-shots.mjs`:

- clicking the launcher while the take-over is open opens the panel
  (`panelOpenedOverNav: true`, captured as `ours-mobile-nav-panel.png`);
- a chip click still advances the turn (`chipAdvanced: true`, own bubble
  rendered).

The widget root is `pointer-events: none` with `pointer-events: auto` only on
the launcher and surface, so it never steals the nav's own clicks.

## Keyboard / focus and the static end-state (criteria 4–5)

`mimic-invariants.mjs` at 390×844:

- **No-JS**: no `.fpc-root`, no `.fpc-launcher`, no `.fpc-surface` — the runtime
  is the only thing that builds the DOM, so the captured end-state (no widget)
  is intact. The injected `<script>` tag is present but never executes.
- **Reduced motion**: the panel still opens, and every widget surface reports
  `transition-duration: 0s`, `animation-duration: 0s`, `animation-name: none`.
  The mimic's widget has no motion at all (unlike the nav layer), which
  `test/chat-widget.seam.test.ts` now guards: no `transition`/`animation`/
  `@keyframes` may be added to `pipeline/chat-widget.css` without a
  `prefers-reduced-motion` path.
- The inert composer and chips are viewport-independent, and now carry mobile
evidence too: `mimic-invariants.mjs` (output in `mimic-invariants-output.json`)
opens the panel at 390 and walks the focus order — the panel holds **zero**
text inputs, the send button is `aria-disabled`, typing into the composer and
clicking send fire **no** extra turn (`postsOnOpen` = `postsAfterTypingAndSend`
= 1), and Tab walks close → chip → chip → chip → send → privacy link and then
leaves the widget (`focusLeftWidget: true`) — no focus trap. The desktop seam
tests (`test/chat-widget.seam.test.ts`) cover the same contract and pass
unchanged.

## Accepted residuals (all pre-existing ticket-09 decisions, not mobile-specific)

The mimic's widget was never a byte-for-byte clone; ticket 09 recorded the
divergences it accepted. They carry into mobile and are visible in the
side-by-side, so they are named here rather than hidden:

1. **Chips vs the CTA row.** The live composer holds a persistent dark CTA row
   ("Get a Demo" / "Support") *and* an input; the mimic renders the pending Yarn
   choices as chips inside the composer slot and no separate CTA row (ticket 09
   criterion 4 + `dialogue/flock.yarn`'s "no persistent CTA row"). The chips make
   the mobile composer taller (72 vs 47px).
2. **Type scale.** The mimic follows the live *rendered* scale ticket 09 chose
   (15px body, 16px name, 14px role, 6px radii) rather than the live *computed*
   scale, which is consistently smaller (13px body, 14px name, 12px role, 3px
   radii — captured in `live-mobile-*-computed-styles.json` and identical on
   desktop). This makes the mimic's header 54px vs the live 49px and the body
   bubble taller.
3. **Card is panel UI.** Ticket 09's 2026-09-10 user direction made the pounce
   card the same UI as the panel (same header, divider, avatar bubble), so the
   mobile card carries the "Today, …" divider the live preview card omits, and
   is taller.
4. **Footer band.** The mimic uses the captured `#f4f5f3` / 36px footer; the live
   band is `#fcfcfc` / 30px (ticket 09's captured-screenshot value).

4. **Footer band.** The mimic uses the captured `#f4f5f3` / 36px footer; the live
   band is `#fcfcfc` / 30px (ticket 09's captured-screenshot value).
5. **UA vs width.** Live picks its variant by device detection; the mimic can only
   key on width (a served page has no UA). At ≥768px with a mobile UA — a phone
   in landscape, or a tablet — live shows the fullscreen variant while the mimic
   shows the sidebar. `live-variant-output.json` is the demonstration. This is
   the one residual this ticket introduces; it is structural (a static page
   cannot read the UA in CSS) and only bites outside the ticket's 390px target.

None of 1–4 are introduced or changed by this ticket; the mobile block only
touches geometry (launcher dock, card bottom inset, fullscreen panel + its
square bands). Item 5 is the deliberate consequence of having no UA signal.

## Reproduce

The rigs are the throwaway probes used here (Docker chromium, `capsulecode/singlefile`,
`npm i puppeteer-core@23` inside):

```bash
docker run -d --name t16shot --entrypoint sh capsulecode/singlefile -c 'sleep 5400'
docker exec t16shot sh -c 'cd /tmp && npm i puppeteer-core@23'

# live ground truth (needs internet; pounce is intermittent — re-run until it fires)
docker cp live-rig.mjs        t16shot:/tmp/ && docker exec -w /tmp t16shot node live-rig.mjs        https://www.flocksafety.com 390 844 /tmp/shots live-mobile
docker cp live-dom-probe.mjs  t16shot:/tmp/ && docker exec -w /tmp t16shot node live-dom-probe.mjs  https://www.flocksafety.com 390 844 live launcher
docker cp live-computed-styles-rig.mjs t16shot:/tmp/ && docker exec -w /tmp t16shot node live-computed-styles-rig.mjs https://www.flocksafety.com panel
docker cp live-variant-probe.mjs t16shot:/tmp/ && docker exec -w /tmp t16shot node live-variant-probe.mjs https://www.flocksafety.com 1440 900 mobile

# the Recreation (build first; serve the served tree under a self-alarm)
npm run pipeline && npm run build
perl -e 'alarm shift; exec @ARGV' 3600 python3 -m http.server 60577 --directory served &
docker cp mimic-shots.mjs     t16shot:/tmp/ && docker exec -w /tmp t16shot node mimic-shots.mjs     http://host.docker.internal:60577 /tmp/ours
docker cp mimic-invariants.mjs t16shot:/tmp/ && docker exec -w /tmp t16shot node mimic-invariants.mjs http://host.docker.internal:60577

# composite (left = live, right = ours)
python3 rig-compare.py live-mobile-card.png  ours-mobile-card.png  compare-mobile-card.png
python3 rig-compare.py live-mobile-panel.png ours-mobile-panel.png compare-mobile-panel.png
python3 rig-compare.py live-mobile-launcher.png ours-mobile-launcher.png compare-mobile-launcher.png
```

`mimic-probe.mjs` is the box-measuring probe (it stubs `/api/chat` so the card
and panel render without the real API; run it at `1440 900` to reproduce
ticket 09's desktop boxes, committed as `ours-desktop-boxes.json`);
`live-rig.mjs` / `live-dom-probe.mjs` are the live counterparts, and
`mimic-invariants.mjs` writes the no-JS / reduced-motion / keyboard output.
`live-mobile-rig-output.json` is the raw frame-rect output from `live-rig.mjs`;
`live-variant-output.json` and `live-messenger-breakpoints.json` back the
UA-vs-width finding.

## What the seam tests cover instead of pixels

`test/chat-widget.seam.test.ts` gains a `mobile layout parity (ticket 16)`
block. jsdom does not evaluate media queries, so — like the nav seam's
reduced-motion check — it asserts the stylesheet's **shape**: a
`@media (max-width: 767px)` block that makes `.fpc-surface--panel` fullscreen
and square-cornered (header/footer too), docks `.fpc-launcher` at 50px / 16px,
keeps the widget a static end-state, and keeps `.fpc-root` above the nav's
`z-index: 2000`. The rendered result is the human side-by-side above.
