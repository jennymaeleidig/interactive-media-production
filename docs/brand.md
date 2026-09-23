# Brand spec: the Flock look

Reference data for reproducing Flock Safety's visual identity.

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

## Type

Four files, roman only, self-hosted under `/fonts/` and declared in `app/globals.css`. The
piece is self-contained — no external font CDN — so there is no remote source in `@font-face`.

| Face           | Weight | Use                                               | Source                            |
| -------------- | ------ | ------------------------------------------------- | --------------------------------- |
| Sohne Regular  | 400    | Body text, chat prose                             | Lineto, via Flock's Webflow CDN   |
| Sohne Book     | 400    | Chrome: chips, labels, metadata, tooltip controls | Lineto, via Flock's Webflow CDN   |
| Denim Bold     | 700    | Display, content-block headings                   | Displaay, via Flock's Webflow CDN |
| Denton Regular | 400    | The `?` disclosure's prose                        | Via Flock's Webflow CDN           |

Fallback stack, verbatim
from Flock:

- Sohne and Denim: `Arial, sans-serif`
- Denton: `Georgia, sans-serif`

## Assets

| Asset                | File                        | Status                                                                                       |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Wordmark             | header, SVG, 138×32 viewBox | Trademark of Flock Group Inc. No rights claimed.                                             |
| Assistant mark       | transcript, inline SVG      | Trademark of Flock Group Inc. No rights claimed. The wordmark's own geometry.                |
| Favicon              | one 32px PNG                | Trademark of Flock Group Inc. No rights claimed.                                             |
| Apple touch icon     | 256px PNG                   | Trademark of Flock Group Inc. No rights claimed.                                             |
| Sohne Regular / Book | two `woff2`                 | Commercial typeface licensed to Flock Group Inc (Lineto). No rights claimed.                 |
| Denton Regular       | one `woff2`                 | Commercial typeface licensed to Flock Group Inc (foundry not identified). No rights claimed. |
| Denim Bold           | one `woff2`                 | Commercial typeface licensed to Flock Group Inc (Displaay). No rights claimed.               |

**No licence headers on any Flock-derived file**, including the token block in `globals.css`. No
`SPDX-License-Identifier` line, no CC0 stamp. The repository's own code stays CC0; these assets are
the opposite case and must not inherit it.
