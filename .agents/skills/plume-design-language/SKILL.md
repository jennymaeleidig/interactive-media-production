---
name: plume-design-language
description: Governs design for this repo's vendor-mimicry satire prototype — the subject-homepage-derived design language (cream + blue-ramp tokens, serif-300 display, flat-paper run with stacked darks, glass depth, motifs, motion) with design principles, AI-tell bans, and engineering guardrails. Use when building or restyling any UI in the vendor-mimicry effort, writing Tailwind theme tokens, designing pages or components, or when anyone asks for "the Plume look".
license: CC0-1.0
---

# Plume Design Language (satire skin)

> **RE-BASELINED on the subject vendor's homepage (ticket 18, resolved):** the design source is
> the subject vendor's homepage **only** — the subject's product-page styling is ignored and its
> teardown retired. The governing teardown is the homepage's Aug-2026 "iverson"
> redesign, mined from published HTML + CSS. Still binding regardless of baseline:
> the owner-pinned decisions (cream main white `#faf9f5`, blue accent ramp, orange
> selection), the cross-vendor adopted patterns (receipt/ledger, hairline rows, mono
> voice, teleprompter, wordmark pun), the dials/tells/guardrails, and the Declined
> list. Background color values defer to `src/app.css` (owner hand-tunes).

Captured from the subject vendor's homepage (2026-09-06 teardown, published CSS mined);
distilled for this repo's satirical prototype. This governs **design language only** —
tokens, structures, motifs. The subject vendor's logo, product name, photography, and copy stay
out; nothing here is usable for impersonation.

## The one idea

Warm, human, civic-optimist marketing skin stretched over a surveillance product: **one flat warm-paper run** (alternation comes from card fills and content density, not band swaps), a **full-bleed photo hero with no CTA button** — the "we're so confident we don't ask" move — **glass-blur depth** over photography, and a **stacked-darks ending** (product band → footer → legal strip). Serif light display voice, grotesque sans body, one quiet accent doing all the pointing. The design's job is to make the corporate smile visible — fidelity to the *pattern* is the satire. The satire angles write themselves: the glass blur literally performs the "privacy" redaction the company promises; the hero asks nothing and gives nothing.

> **Palette notes:** named for the subject vendor but carrying no green — pivot 1 moved the neutrals to the warm family; pivot 2 (owner directive, ticket 08) replaced the orange accent with the coolors blue ramp `#133c55 / #386fa4 / #59a5d8 / #84d2f6 / #91e5f6` and made warm cream `#faf9f5` the main white. Pivot 3 (tier differentiation via a second coolors set) was applied and **reverted by the owner**, who is hand-tuning background colors directly — treat the values below as a base, not a finished decision. The sole exception the owner kept: text selection is **burnt orange** `rgb(217 119 87 / 0.5)` — the one orange left anywhere.

## Colors

Warm cream as the main white, one saturated blue accent from the coolors ramp, deep navy darks. Owner is tuning background tiers by hand; don't re-derive them from here without checking `src/app.css` first (environment over doc).

**Role structure (homepage-derived, the part that transfers regardless of hex):**

- One page background carries nearly every light section — alternation via **card fills and content density**, not band swaps.
- Text mutes by **opacity** (primary @ ~80%), not a second grey — one ink, graded.
- A single warm **hairline neutral** rules list rows (solid) and card borders (40% alpha).
- Card fills are a distinct warm tier (the subject's "sand") — flat, radius ~12px, **no shadows**; elevation is color and blur, never shadow.
- **Three glass grades = three depths**: blur 60px (over photos), 80px (rails), 120px (floating containers).
- The page ends in **stacked darks**: product band one step lighter than the footer, legal strip a third tone.
- Accent appears in exactly two temperatures: fill and hover-fill one step darker.

### Light theme (marketing surfaces)

| Role | Hex |
|---|---|
| Page background (main white) | `#faf9f5` (warm cream — never stark `#fff`) |
| Band / secondary light surface | `#f0eee6` (alt: `#e8e6dc`) |
| Tinted panel / card fill | `#e3dacc` |
| Heading text | `#133c55` (the ramp's deep navy is the "black") |
| Body / muted text | `#133c55` @ 70% |
| Accent — interactive | `#386fa4` (blue; sparingly) |
| Accent deep — light-theme CTA tier, hovers | `#2a5d8a` |
| Accent soft — pills, washes | `#84d2f6` / `#91e5f6` |
| Subtle borders | navy `#133c55` @ 16% alpha |
| Selection | `rgb(217 119 87 / 0.5)` — burnt orange, owner-pinned |

### Dark theme (product surfaces — the PlumeOS page flips the whole body)

| Role | Hex |
|---|---|
| Page background | `#133c55` (deep navy) |
| Primary text | `#faf9f5` (cream) |
| Secondary / muted | `#a5c8da` / `#7fa3ba` |
| Accent — interactive | `#59a5d8` (the ramp step that clears contrast on navy; `#386fa4` is too dark there) |
| Control fill | `#1c4a6b` |
| Elevated surfaces | `#17415f` |

Rules: one saturated accent per surface; CTAs are blue fill with cream text (contrast ≥ 4.5:1), or navy fill with `#84d2f6` text. No orange in the accent family — the owner-pinned orange selection is the sole exception.

### Data surfaces

- **Categorical data-viz ramp**: charts in ops/dashboard surfaces use a categorical ramp (8–10 hues, Blueprint-style) quarantined to the chart — the brand accent never appears in charts.
- **Semantic color as rhetoric**: on receipt/ledger surfaces, color argues — a positive tier for the "deal" value, a negative tier for the struck/undercut value, at full volume. (keep hues navy-compatible.)
- **Accent-as-wash discipline** applies only to imperial-register surfaces (future dark ops pages): accent at 5–10% alpha washes, never a fill. On civic-optimist-register surfaces, the accent at full volume is the deliberate satirical choice.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display / headings | Light serif, weight **300** (subject: Denton → use *Instrument Serif* or *Fraunces Light*) | The single most identity-bearing choice |
| Body / UI | Grotesque sans (subject: Denim/Söhne → use *Schibsted Grotesk*) | Weights 400/500 |
| Authority tier | Tabular mono (JetBrains Mono via `--font-mono`) | **Serif makes the promises, mono makes the paperwork** — uppercase micro-sizes carry public-notice copy, ledger headers, timestamps, loglines, legal footnotes. Serif display states the claim; mono states the record. |

- Fluid root: `html { font-size: calc(0.625rem + 0.4166vw) }`.
- Display ladder: `clamp(3rem → 3.875rem)` for hero H1, section H2s, **and stat numerals** — the giant-stat treatment is dead on the homepage; numerals live at heading scale. Mid H2s 2.75rem, small H2s 2rem.
- Display `line-height: 1` (1.04 for smaller headings); headings capped at **24ch**; body measures 45ch (lede) / 60ch (hero paragraph) / 75ch.
- Global letter-spacing zeroed, except: eyebrows `.04rem`, hero-card eyebrows `.07em`.
- Casing: headings **sentence case**; buttons **sentence case** (homepage reality — the legacy uppercase/tracked family is unused on the subject's homepage body); eyebrows **UPPERCASE but quiet** — 11px, weight 400, 70% opacity; pills ~.75rem.
- Body mutes by **opacity .8 on the primary ink**, weight 300–400.

## Design principles

Treat each page as an original commission for Plume, not a template with the colors swapped.

- **Start from Plume's world.** Cameras, patrol maps, dusk-lit neighborhoods, civic warmth — pull every visual decision from that material, and build with the brief's actual content.
- **Earn the first screen.** Open on the most defining thing in the product's world. The statistical flourish (giant numeral, small label, gradient kiss) is a fallback, not an opener.
- **Let type do the characterization.** A small family of strongly contrasted faces; when text doubles as imagery, the treatment itself should carry the identity.
- **Keep measures humane.** Display lines cap at 24ch, body at 60–75ch; long-form serif may run a little wider with looser leading.
- **Refuse the template smell.** Every treatment that appears must carry real information — the AI-tells list below is the hard floor.
- **Budget the motion.** One choreographed moment per page; interactive motion only where it clarifies what changed.

## Design read & dials

Open any build or restyle with a one-line **design read**: page kind, audience, voice, aesthetic family. If the read is unclear, ask exactly one clarifying question — never a question dump.

Three global variables drive the page's layout, motion, and density decisions. Plume baseline: **VARIANCE 7 · MOTION 5 · DENSITY 4** — the subject-landing read wants offset asymmetric grids and a staged hero, kept composed because the satire needs composure.

- **DESIGN_VARIANCE** — 1–3: symmetric 12-column, uniform padding · 4–7: offsets, overlaps, mixed aspect ratios, left-aligned headers over centered data · 8–10: masonry, fractional tracks, vast whitespace. Levels 4–10 fall back to a strict single column below 768px.
- **MOTION_INTENSITY** — 1–3: hover/active only · 4–7: fluid transform/opacity transitions, staggered load-ins · 8–10: scroll-choreographed sequences. Only the hero blur-in earns 8–10; everything else sits at 4–5.
- **VISUAL_DENSITY** — 1–3: gallery gaps (py-32+) · 4–7: ordinary web rhythm · 8–10: cockpit density, hairline separators, mono numerals.

**Conflict rule**: the pinned design language outranks the dials. Where a treatment is pinned (sentence-case buttons, light-serif display, hairline commitment rows — all confirmed on the subject homepage), it stands; the dials govern only unpinned axes.

## AI tells (forbidden patterns)

The fingerprints of generated design. Each is banned unless the brief explicitly calls for it — and the pinned design language wins regardless.

- **Visual/CSS**: no neon or outer glows; no pure `#000`/`#fff` (cream `#faf9f5` and navy `#133c55` are the stand-ins); no oversaturated accents; no gradient-text headers; no custom cursors.
- **Typography**: no shouting oversized H1s — weight and color carry hierarchy; no headlines broken with `<br>` or set in italic; no uppercase eyebrows stacked over every heading.
- **Layout**: no suspiciously even spacing; equal 3-column feature cards are banned *except where the design language pins them*; prefer real grid tracks over flex-percentage arithmetic (`grid-cols-3`, never `w-[calc(33%-1rem)]`).
- **Content/data (the "Jane Doe" effect)**: no placeholder names, egg avatars, too-perfect figures (`99.99%`), startup-slop naming, or filler verbs ("elevate," "seamless," "unleash"). Data should look lived-in — which doubles as satire hygiene.
- **Production-test tells (hard bans)**: version labels in heroes; numbered section eyebrows (`001 · Capabilities`); `01 / 4` pagination labels; middle-dot metadata strips (max one `·` per line); decorative status dots; em-dashes in visible page copy (use hyphens); rotated vertical text; decorative crosshair grids; "Quietly trusted by" headers; poetic section labels; empty step labels (`Stage 1` — the verb-noun is the label); pills overlaid on photos; photo credits on placeholders; version footers on marketing pages; live counters.
- **Fake product UI**: div-built dashboards are the single worst tell. `MapPlaceholder`/`DashboardPlaceholder` are deliberate, labeled stand-ins awaiting the imagery pass — an accepted interim, to be replaced by real rendered surfaces before ship.
- **Icons**: never hand-drawn SVGs; one icon library per project, standardized stroke width. (The map placeholder is an illustration, not an icon.)

## Engineering guardrails

- **Animation budget: `transform` and `opacity` only.** Never animate `top`/`left`/`width`/`height`; `will-change` sparingly.
- **No scroll listeners.** `window.addEventListener('scroll')` re-renders every frame — use IntersectionObserver (as the `blurWords` action does) or CSS scroll-driven animations for reveal/progress work.
- **Reduced motion is unconditional.** Any dial above 3 gates behind `prefers-reduced-motion` and collapses to static (the global CSS already implements this).
- **Full-height sections use `min-h-[100dvh]`** — `h-screen` jumps when mobile address bars show/hide.
- **Z-index is for systemic layers only** (fixed nav, modals, overlays); no arbitrary `z-50` escalation.
- **One theme per page** (the subject's `.dark-zz` convention): ship and test in a single mode. Dual-mode pages pick one token strategy; contrast targets are AA body / AAA hero, with hierarchy parity across modes.
- **Fonts**: self-host with `font-display: swap` when practical; the Google Fonts `<link>` in `app.html` is a known alpha shortcut to revisit at beta.
- **Core Web Vitals floor**: LCP < 2.5s, INP < 200ms, CLS < 0.1 — reserve space for images and fonts.

## Writing in the interface

Interface copy is design content — it exists to make the product usable, not to decorate it.

- Write from the user's seat, in the user's vocabulary ("notifications", not "webhook config").
- Active voice; CTAs state the outcome ("Save changes", not "Submit"); one action keeps one name across the whole flow.
- Errors say what broke and what to do next, in the product's own voice — no apology theater, no vagueness. Empty states invite the next move.
- Plain verbs, sentence case, zero filler; each written element does exactly one job.

Note: for *satirical* copy in the civic-optimist register, the `corporate-jargon-voice` skill governs and defers to this section for surface style.

## Layout grammar

- Content max **82rem** (flat, editorial — not near-full-bleed); gutters narrow: `clamp(1.5rem, 1rem + 1vw, 2rem)`.
- Vertical rhythm lives in **section header wraps** (~4rem top / 2rem bottom), not band padding; sections are close-cropped, not gallery-spaced.
- **Band sequence**: full-bleed photo hero → one flat light run for all content sections (no band swaps) → **stacked darks**: product band (one step lighter) → footer (darkest) → legal strip (third tone). The two-dark ending is the signature closer.
- 6-column grid (1.5rem gap) drives section heads (title column + lede column) and galleries; 3-up rows for hero/stat cards; 2-col story rail; 5-across flex for product lineups.
- Imagery: `aspect-ratio` everywhere (1, 3/2, 2, 4/4.3), radius 12px dominant, `overflow: hidden`; full-bleed cover photo hero at **85svh** with a 20% black wash and bottom-left-aligned content; masked product objects sit flat on card fills, never in fake browser chrome.
- Warm, human photography register — neighborhoods, golden hour, everyday life — never surveillance-tech imagery on marketing surfaces.

## Component motifs

- **Nav**: floating header (light/dark variants), rounded mega-menu panel, sentence-case "Book a demo" fill right; active dropdown trigger underline is the one place a legacy accent may live. Solidifies on scroll. (The owner has blessed the current header — restyle gently.)
- **Hero**: full-bleed photo (85svh, 20% black wash), ≤24ch serif-300 H1 bottom-left with word-by-word blur-in, 60ch mission paragraph — and **no CTA button in the hero**; the nav carries the only ask.
- **Hero cards**: row of 3 small card squares (sand fill, radius ~.88rem): quiet eyebrow + **0.5rem tricolor accent chips** (three hues — Plume runs its own triad from the blue ramp/tan) + serif-300 numeral + 15ch caption. Hover: opacity .7.
- **Buttons**: sentence case, 500, `1rem` radius, `.4s` bg transition. Variants: primary accent fill with cream text, hover one step darker; secondary outline; dark fill + light-blue text.
- **Glass stat cards**: sage-equivalent card, radius 12px, photo (`aspect 4/4.3`) behind an inner panel with `backdrop-filter: blur(60px)` + `#0000001c` fill; stat numeral at heading-4xl serif-300 + one-line caption at 80% opacity. The satire hook: **the blur performs the privacy redaction**.
- **Story/news cards**: white fill, 1px hairline border, radius .75rem, small square thumb, serif-300 heading, arrow text-link + location pin; **hover fills the whole card with the accent tint** (.2s).
- **Product lineup (dark band)**: glass rail (`blur(80px)`, `#ffffff1a` fill) of masked product objects on card fills, label in accent; **hover swaps in an in-situ photo + circular-arrow affordance**. Plume's analog uses original renders/illustrations — never fake browser chrome.
- **Trust moment**: quiet eyebrow ("Powerful technology needs clear boundaries"-shaped) + "Accountability built in"-shaped heading + one paragraph + **a single CTA** to the trust surface — restraint is the boast. The receipt/ledger motif below remains the sharper Plume-prototype move.
- **Hairline commitment rows**: 1px top-ruled rows, serif-300 items, plain text, no icons — **confirmed native to the subject's own homepage**, strengthening the cross-vendor adoption.
- **Receipt/ledger motif**: hairline-ruled rows, struck-through original value, deep-accent "new" value, % delta, mono column headers. Receipts say "check the math" where compliance cards say "trust us".
- **Wordmark pun**: the wordmark wears the product — a Plume analog puts the mark inside a camera aperture or feather-shaped container.
- **FAQ**: bold-question accordion, accent open-state. **Footer**: stacked darks — link groups on the darkest tone, legal strip a third tone below.
- **MapPlaceholder note (owner-loved)**: the SVG map illustration with camera nodes is a **keeper** — the fake-UI-safe way to show product surface; carry it through the lineup and imagery motifs.

## Motion

Restrained, orchestrated, always behind `prefers-reduced-motion: reduce`:

- Hero: word-stagger blur-in — each word `translateY(0.42em)` + `blur(10–14px)` → settled, 1.06s expo-out, **92ms per word**; words rise from a ghost tint (the subject uses steel-blue `rgb(142,168,184)` → ink). Paragraph line rises after 0.4s.
- Scroll-in headings: word-split fade/mask, **58ms stagger**, blur 7px → 0 — confirmed native to the subject's own H2s.
- Reveals: `image-clip` clip-path wipes on stat-card photos; `img-mask` reveals on gallery images; card-row fade-ins.
- Hovers: opacity .7 on hero cards (200ms), whole-card accent-tint fill on story cards (.2s), `.4s` bg on buttons. Nothing else moves on its own.
- **Teleprompter reveal** (adopted pattern, cousin of the subject's own 58ms H2 stagger): an official "statement" block whose words color in as you scroll — the autocue joke. Available for a dedicated statement section; the hero keeps the blur-in.
- Blur-in stays the entrance signature. The plain-speech register's motion is deliberately blur-free — keeping blur is how the Plume skin stays distinct from the warm-cream skin it borrows colors from.

## Process & restraint

- Design before code: settle a compact token system (color, type, layout, principles), then test the plan against the brief. Anything that reads as the default answer for a generic page gets revised — with the change called out — before any code lands.
- Concentrate the boldness in one place; everything else stays quiet and disciplined; decoration that doesn't serve the brief is cut.
- Hold a quality floor without announcing it: mobile-responsive, visible keyboard focus, reduced motion honored, accessible contrast, coherent palette.
- Critique with screenshots, not guesses, whenever the environment allows.

## Declined from the teardowns (recorded so they stay declined)

Adopt/decline decisions from the imperial (09), statement-blend (10), plain-speech (11), and subject-homepage (18) teardowns; declines are binding unless the destination is redrawn. Two plain-speech-era declines **flipped when the subject homepage went the same way** (ticket 18):

- ~~Neutral sentence-case buttons~~ — **now adopted**: the subject's homepage buttons are sentence case; the uppercase/tracked family survives only in legacy chrome.
- ~~Quiet single-color page rhythm~~ — **now adopted**: the homepage is one flat light run with card-driven alternation.
- **Sans-700 display / serif-body inversion** (plain speech) — declines; the light serif display is the single most identity-bearing choice, and the homepage confirms Denton-300 everywhere.
- **Blur-free motion** (plain speech) — declines as global rule; blur is doubly the Plume signature now (word blur-ins + glass panels).
- **Accent-as-wash as global rule** (imperial) — declines globally, adopted only for imperial-register surfaces (see Data surfaces).
- **Curtain-reveal footer, floating still-life hero** (statement blend) — declines; the homepage's full-bleed photo hero and stacked-darks footer are the pinned patterns.
- **The subject's sage/green hexes as a set, Denton itself, real photography, real-UI glass panels, the lime nav underline** (homepage) — declines; Plume keeps its pinned cream/blue/orange-selection palette and stand-in serif, uses placeholder frames and original fake-UI illustrations.

## Prototype mapping

The effort closed with the site in its final alpha shape (all under `src/`):

- **`/` (gate)** — minimal splash: serif wordmark, stub line, **Enter** button → `/home`. Light canvas stamp.
- **`/home` (main site)** — the full homepage: 85svh photo-hero placeholder (no CTA), 3 sand hero cards with tricolor chips, asymmetric gallery, hairline commitments, glass stat cards, single-CTA trust moment, dark product band with the `MapPlaceholder` glass centerpiece + lineup rail, stacked darks footer. Owner authors content here.
- **Shared surfaces**: dynamic Nav (resting ink follows `overlay`, scrolled panel per `theme` with clear border), Footer (`bg-deep` → `bg-pine` legal strip), sentence-case buttons, quiet eyebrows, editorial gutters, 82rem containers, `blurWords` action (92ms/58ms), body-level canvas stamps, burnt-orange selection.
- **Retired but kept in `src/lib/components/`**: `DashboardPlaceholder`, `FaqItem` — PlumeOS-page features awaiting a future surface.

Tokens live in `src/app.css` `@theme` (owner hand-tunes backgrounds — defer there). CODING_STANDARDS.md governs all code; this file governs the look.
