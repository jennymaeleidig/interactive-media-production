# Ticket 09 — chat widget fidelity: visual side-by-side evidence

This directory is the auditable artifact behind ticket 09's fidelity claim. It
is what the ticket's criterion 7 ("a side-by-side against the captured widget")
points at; without it the claim would be unauditable (every other artifact —
the widget, its stylesheet, its DOM seam test — is in the repo, but the *visual*
comparison was not).

Each `compare-*.png` is a 2x / 3x side-by-side: **left = Capture**, **right =
the Recreation's production build**. Same page coordinates, same viewport
(1440x900), no scaling of either side before compositing.

| file | captured source | surface |
| --- | --- | --- |
| `compare-launcher.png` | `s9-16-closed-launcher.png` | launcher |
| `compare-card.png` | `s9-01-greeting.png` | pounce card |
| `compare-panel.png` | `s9-09-opened-full.png` | expanded panel |
| `rendered-panel-echo.png` | — | panel after selecting a choice (echo + green chips) |

Captured sources live at
`.scratch/flock-parody/research/evidence/06-qualified-conversation-ux/`.

## Measured geometry — rendered vs captured

`rendered-boxes.json` is `getBoundingClientRect()` + computed style for each
surface as the production build actually rendered it. The captured figures are
pixel measurements of the captured screenshots (not the research table's
92x92/412x296/538xN, which are the *transparent host iframe* rects).

| surface  | captured visible box | rendered box | delta |
| --- | --- | --- | --- |
| launcher | 54x54, inset 17 | 54x54 @ (1369,829) | 0 |
| card | 332x252 @ (1092,632) | 332 wide, content-driven (≥252) | see note |
| panel | 343x413 @ (1082,470) | 343x413 @ (1080,470) | 2px |

Card note (user direction, 2026-09-10 late): the card was re-skinned as the
**same UI as the panel** — same header with the in-header close, same divider,
same avatar bubble, same composer and footer — in a 332px box floored at the
captured 252px and capped at `100vh - 150px`. The captured card's distinct
preview look (corner ✕, larger card type, avatar-less greeting) is consciously
dropped; the card's height is content-driven and grows past 252 whenever
choice chips or a longer greeting need the room.

Colors and elevation match: bot bubble `#F1F4F7`/`#101010`, own
`#ECEFEF`/`#183129`, 12px 16px padding; header band `#ecefeb` with `#183129`;
footer `#6E7879`; elevation `rgba(0,0,0,0.15) 0 5px 20px`.

**Typeface and type scale (user direction, 2026-09-10 late).** The Capture's
own `Inter var` regular face (variable, 100-900) is lifted verbatim into the
stylesheet as an inline `@font-face` — without it the widget silently fell
back to the host page's sans and never matched. (The srcdoc's italic face is
deliberately not lifted: the widget renders no italics and it is another
~327KB of base64.) The type scale follows the live widget's RENDERED
screenshots — 15px body, 16px name, 14px role/chips/footer, 6px bubble radii,
~1.4 line-height — superseding the 13px/3px computed-style transcription in
the `*-convo.json` evidence, which disagrees with every rendered capture.
Own bubbles are single-line where the original's are — the bubbles' captured
`max-width: 80%` resolves against the log's width (full-width message rows),
never against a bubble's own max-content, which would clamp every own bubble
to 80% of itself and wrap two-word choices ("Sup port").

## The one visible divergence — and why it is there

The **composer slot**. The captured widget's composer holds a placeholder
("Ask a question" on the card, "Enter a message" on the panel) plus a
persistent dark CTA row ("Get a Demo" / "Support"). The Recreation's composer
holds the pending Yarn choice **chips** instead.

That is mandated: ticket 09 requires "pending choices render as user-style
chips inside the composer slot" *and* the yarn fixture rules out a persistent
CTA row (`dialogue/flock.yarn`: "no free text, no persistent CTA row"). The two
cannot both hold, so the chips win the slot and the CTA row is not rendered.
Per user direction (2026-09-10) the chips themselves carry the captured CTA
button values — dark Flock green #183129, white text, the 4px token radius,
#070f0c hover — so the slot reads like the original's CTA row; the selected
choice's echo in the log remains the light user-style bubble, exactly as the
original rendered echoes. Every other captured element — launcher, card and
panel chrome, header, greeting, bubbles, footer, geometry, color — matches.
See the ticket's Comments.

## Reproducing

The rig (`rig-shot.mjs`) drives the app through the Playwright Docker image and
is *not* wired into `npm test` (it needs Docker, which the sandbox gates). It
loads `/` — the homepage, one of the pages whose Capture mounted the launcher
(ticket 10 mounts the injected widget site-wide) — in a clean profile so the
pounce fires. To re-shoot after a UI change:

```bash
# 1. production build
npm run build

# 2. serve it under a self-alarm (so the server dies with the command)
perl -e 'alarm shift; exec @ARGV' 300 npx next start -p 53411 &

# 3. shoot all three surfaces at 1440x900 (rig-shot.mjs writes /out/boxes.json)
mkdir -p /tmp/t09-rig /tmp/t09-out && cp rig-shot.mjs /tmp/t09-rig/
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v /tmp/t09-rig:/work -v /tmp/t09-out:/out -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  node rig-shot.mjs http://host.docker.internal:53411

# 4. composite each capture against its rendered shot
python3 rig-compare.py <captured.png> <captureX0> <captureY0> <rendered.png> <out.png>
```

(`rig-compare.py` takes the captured screenshot's clip offset because the
per-surface captures are clips, not full-page shots.)
