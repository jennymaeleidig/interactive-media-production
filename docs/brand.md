# Brand spec: the Flock look

Reference data for reproducing Flock Safety's visual identity, per
[ADR 0001](adr/0001-reproduce-flock-brand-identity.md). Values are read from Flock's compiled
stylesheet and recorded in `.scratch/flock-chatbot/research/flock-safety-brand.md`. This file is
reference material, not a decision — the decisions live in the ADRs.

A build session should not have to guess at a colour, a face, or an asset's provenance. If it does,
this file has a gap.

## Where the tokens live

One authoring file: `app/globals.css`. Tailwind v4's CSS-first `@theme` block carries both layers:

- **Semantic role names** for day-to-day UI work — `--color-surface`, `--color-surface-raised`,
  `--color-content`, `--color-content-muted`, `--color-accent`, `--color-link`, `--color-focus-ring`,
  `--color-edge`.
- **The raw ramp under Flock's own names**, re-exported as plain custom properties so the look can
  be diffed against the research table mechanically — `--color--green-1` … `--color--green-8`,
  `--color--grey-1` … `--color--grey-8`, `--color--flock`, `--color--white`.

There is no separate `tokens.css`. Ticket 02 already made `globals.css` the home for the template's
`@theme` tokens; these share it.

## Colour

Flock's palette is green throughout. There is **no red or maroon anywhere** in their stylesheet —
the brief's original assumption of a red brand colour was wrong, and no red may enter this piece.

| Token              | Value     | Role                                                  |
| ------------------ | --------- | ----------------------------------------------------- |
| `--color--flock`   | `#304833` | Accent, interactive elements (revised from `#5bd640`) |
| `--color--green-8` | `#061602` | Dark ground, darkest surface                          |
| `--color--green-7` | `#123a09` | Dark ramp step                                        |
| `--color--green-6` | `#1d5b0b` | Links                                                 |
| `--color--green-5` | `#2e9212` | Dark ramp step                                        |
| `--color--green-4` | `#84da6c` | Focus ring                                            |
| `--color--green-3` | `#b2e4a3` | Light ramp step                                       |
| `--color--green-2` | `#cbf3bf` | Light ramp step                                       |
| `--color--green-1` | `#e2fbdb` | Light ramp step                                       |
| `--color--grey-1`  | `#ecefeb` | Content on dark                                       |
| `--color--grey-2`  | `#d8dbd7` | Grey ramp step                                        |
| `--color--grey-3`  | `#bbc0b9` | Grey ramp step                                        |
| `--color--grey-4`  | `#a0a89e` | Grey ramp step                                        |
| `--color--grey-5`  | `#777c75` | Grey ramp step                                        |
| `--color--grey-6`  | `#525751` | Grey ramp step                                        |
| `--color--grey-7`  | `#3c403b` | Grey ramp step                                        |
| `--color--grey-8`  | `#22281f` | Dark text, elevated dark surface                      |
| `--color--white`   | `#ffffff` | Ground                                                |

Flock's alternate accent `#3fc919` and its legacy green `#1a3e2b` are **not** used. `#304833`,
recorded in the research as a recurring deep green, **is** used — as text on the light ground and as
the accent (see below), on the human's call.

### The light surface, as amended 2026-02-18

The piece's ground is **not** `grey-1`. The chrome and text are the homepage's own values, read off
`www.flocksafety.com` and settled against the full-viewport surface prototype
(`.scratch/flock-chatbot/prototype/full-viewport-surface.html`); the ground itself was revised to
`#fefdfb` by the human after that:

| Semantic role            | Value     | Role                                                              |
| ------------------------ | --------- | ----------------------------------------------------------------- |
| `--color-surface`        | `#fefdfb` | The page ground, revised from the homepage's `#f2efea`            |
| `--color-surface-raised` | `#eeeee3` | The chrome: the floating capsule header **and** the composer tray |
| `--color-content`        | `#304833` | Text on the light ground                                          |
| `--color-chrome-content` | `#061602` | The capsule header's wordmark and text (`green-8`)                |
| `--color-edge`           | `#bbc0b9` | The capsule's hairline border and the tray divider (`grey-3`)     |

Chips are `#183129` with `#eeeee3` text; the link-out block is an inline link in the message ink,
not a chip. `#183129` is
the **captured widget's own** value (`--THEME_TEXT_COLOR` and
`--MESSAGE_BUBBLE_OWN_TEXT_COLOR`), not Flock's ramp — kept because it is what the piece ships.

The accent is `--color--flock` (`#304833`), revised from `#5bd640` on the human's call, so on this
ground the accent and `--color-content` are the same value. The focus ring stays Flock's `#84da6c`:
it is the one place a bright green still shows, and a dark ring would vanish against a dark chip.

**Message bubbles take the captured widget's own values**, read off the rendered widget
(`.fpc-bubble--bot` / `.fpc-bubble--me`) rather than Flock's site:

| Role              | Background | Text      | Source                                                                             |
| ----------------- | ---------- | --------- | ---------------------------------------------------------------------------------- |
| Assistant message | `#f1f4f7`  | `#183129` | `.fpc-bubble--bot` — the *rendered* background; its text was `#101010`, overridden |
| Viewer message    | `#ecefeb`  | `#183129` | `--MESSAGE_BUBBLE_OWN_BACKGROUND_COLOR` / `--MESSAGE_BUBBLE_OWN_TEXT_COLOR`        |

Both bubbles' text is `#183129` — the human's call, so the two message kinds read as one voice. The
captured widget's own bot text was `#101010`.

`#ecefeb` is Flock's `grey-1`. `#f1f4f7` is **not** on Flock's ramp — it is the captured widget's
rendered bubble, kept because it is what the piece ships. Neither is `#fefdfb`, the ground: it is
the human's pick, revised from `#f2efea` on 2026-02-18.

The capsule floats `20px` in from each viewport edge and `12px` from the top, radius `8px`, no
shadow, always visible — the live header's own numbers. The live header is `opacity: 0` at the top
of the page and fades in on scroll; that has no equivalent here, because the transcript scrolls
rather than the page.

## Type

Three files, roman only, self-hosted under `/fonts/` and declared in `app/globals.css`. The
piece is self-contained — no external font CDN — so there is no remote source in `@font-face`.

| Face          | Weight | Use                                     | Source                            |
| ------------- | ------ | --------------------------------------- | --------------------------------- |
| Sohne Regular | 400    | Body text, chat prose                   | Lineto, via Flock's Webflow CDN   |
| Sohne Book    | 400    | Lighter chrome: labels, chips, metadata | Lineto, via Flock's Webflow CDN   |
| Denim Bold    | 700    | Display, content-block headings         | Displaay, via Flock's Webflow CDN |

**Dropped, deliberately — do not re-add:** Denton (serif display; chat content has no serif voice),
every italic, every other Denim and Sohne weight, and both Thermochrome decorative faces. If a
future ticket seems to need one, that is a new decision, not a forgotten asset.

**Before the fonts load:** `font-display: swap`, with all three files preloaded from the root layout
as `<link rel="preload" as="font" crossorigin>`. No metric-override descriptors: three local files
land fast enough, and the piece is a single unlisted artwork where a first-visit flash of `Arial` is
acceptable. Fallback stack, verbatim from Flock:

- Sohne and Denim: `Arial, sans-serif`
- Denton (should it ever return): `Georgia, sans-serif`

## Shape and density

Frozen as named `@theme` values in `app/globals.css`, not left to taste:

- **Radii:** `1rem` and `8px` / `.5rem` dominate; `12px` / `16px` on larger cards; `100px` full
  pills for buttons and chips; `4px` on small controls.
- **Spacing:** Flock's 8-step scale, `--space-50` … `--space-800`.
- **Shadows:** flat by default — `box-shadow: none` is the norm. Ambient `0 4px 50px rgba(0,0,0,.05)`
  and hover lift `13px 12px 40px rgba(0,0,0,.25)` are the only two.
- **Edges:** hairline inner borders via inset shadows, never heavy strokes.
- **Focus ring:** `box-shadow: 0 0 0 3px #84da6c`. Non-negotiable, and recorded as an accessibility
  constraint rather than a style preference: the chips and the link-out block are the transcript's
  focusable things, and a keyboard user must be able to see where they are.

Composition and motion are **not** frozen here — they come from the vendored template's dependencies
and the `design-taste-frontend` skill.

## Assets

| Asset                | File                        | Status                                                                         |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Wordmark             | header, SVG, 138×32 viewBox | Trademark of Flock Group Inc. No rights claimed.                               |
| Favicon              | one 32px PNG                | Trademark of Flock Group Inc. No rights claimed.                               |
| Apple touch icon     | 256px PNG                   | Trademark of Flock Group Inc. No rights claimed.                               |
| Sohne Regular / Book | two `woff2`                 | Commercial typeface licensed to Flock Group Inc (Lineto). No rights claimed.   |
| Denim Bold           | one `woff2`                 | Commercial typeface licensed to Flock Group Inc (Displaay). No rights claimed. |

Each line above states the asset's real status. This is what documents that the choice was made
knowingly, not by accident.

**Dropped:** the 1200×628 og image (nothing is shared as a card; the piece is unlisted and never
indexed) and the second, dark-scheme favicon (the piece has one fixed theme — a light ground — with
no theme toggle in scope).

**No licence headers on any Flock-derived file**, including the token block in `globals.css`. No
`SPDX-License-Identifier` line, no CC0 stamp. The repository's own code stays CC0; these assets are
the opposite case and must not inherit it.

## Voice

For any copy the piece composes itself. Content authored in the Yarn program is a separate effort.

- Sentence case everywhere, including headings and buttons.
- "Flock" in running copy, "Flock Safety" only where legal or footer framing is intended.
- Short declarative sentences, civic and reassuring in tone.
- Plus signs instead of ampersands in nav-like lists.
