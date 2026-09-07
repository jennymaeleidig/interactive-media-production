# Mobile type scale fills the screen

Type: task
Status: resolved
Blocked by:

## Question

On phones our type is far smaller than the subject vendor's (compare `.scratch/ai-assistant/flock-source/` mobile screenshots against ours). Root cause: the fluid root scale in `src/app.css` (`font-size: calc(0.625rem + 0.4166vw)`) floors at ~11.6px on a 390px phone, so every rem-based size shrinks ~27% versus desktop, and the display heading clamps (e.g. `text-[clamp(3rem,2.75rem+1.25vw,3.875rem)]`) keep 3rem (~35px) floors.

Raise the mobile root floor to ~14px (keep ~16px at desktop; keep the fluid mechanic) and raise the display clamp floors so hero/section headings fill the phone screen (~44px+ at 390px), matching the vendor's presence. Sweep all pages (home, trust, products/plume-os) plus shared components for sizes that fall below comfortable mobile body text (~15–16px effective) — bump or make fluid as needed. Watch fixed-size surfaces for overflow at 320px and 390px widths (the assistant panel is rem-sized; the take-over uses a `pt-24` offset), and keep the z-index tokens untouched.

Resolved when: at 390px the home hero and section headings read at the vendor's scale and body text is comfortable; nothing overflows at 320px; `npm run check && npm test` pass.

## Answer

Changes in `src/app.css` plus a sweep across the three pages, `Footer.svelte`, and `AssistantWidget.svelte`:

- **Root scale**: `html { font-size: calc(0.828rem + 0.191vw) }` — linear ~14.0px at 390px → 16.0px at 1440px, still fluid beyond (the old `0.625rem + 0.4166vw` floored at ~11.6px). Measured 13.99px at 390px in headless Chromium.
- **Display clamp floors**: the shared hero/section-H2/stat-numeral clamp floor raised `3rem → 3.25rem` (12 instances across home, trust, plume-os). Measured 45.5px at 390px (was ~34.9px) — the ~44px+ vendor bar. Desktop (1440px) is pixel-identical: the clamp's `2.75rem+1.25vw` term still resolves to the 3.875rem (62px) cap there.
- **Mid-tier section H2s** (the fixed `text-[2.75rem]` tier: gallery intro, product band, practice, beliefs, both FAQs) got a below-md boost: `max-md:text-[3.125rem]` → 43.7px at 390px (was 38.5px); desktop unchanged. Judgment call: the ticket's clamp-floor instruction named the clamp tier, but the resolved-when bar says "section headings", and these fixed-rem headings were still ~13% under the vendor scale on phones. Tablet (768–1024, where they read 40.5–44px) stays with the map's open "Tablet breakpoints" item.
- **Body copy**: new `--text-body` token in `@theme`: `clamp(1rem, calc(1.1034rem - 0.115vw), 1.0625rem)` — 15px at 390px, 16px at 1440px (desktop pixel-identical), consumed as `text-body` (all former `text-[0.9375rem]` instances, home/trust/plume-os + `Footer` legal strip follow-up) and as `.btn`'s font-size. The small negative vw slope counter-balances the root's shrink so both viewport targets hold exactly. Assistant message bubbles and the pseudo-input placeholder also ride `text-body`.
- **Micro voices bumped one step**: eyebrow `0.6875rem → 0.75rem` (~10.5px at 390, ≈ the design language's 11px), footer legal `0.84rem → 0.875rem`, mono belief indexes and the home arrow link `0.8125rem → 0.875rem`, assistant privacy link `text-xs → text-sm`.
- **Left alone, deliberately**: choice chips and the "AI Sales Assistant" meta line in the widget (controls/labels, not body), `text-[1.05rem]` footer links and capability rows (14.7px effective — borderline but content-adjacent labels), the plume-os testimonial quote clamp, gate-page wordmark, and all `--z-index-*` tokens (untouched; `layering.test.ts` green).

**Checks**: prettier applied; `npm run check` 0 errors/0 warnings; `npm test` 5/5; `npm run build` passes.

**Visual verification** (Playwright, repo-local headless chromium via `--single-process`, same rig as ticket 03 — script `.scratch/verify-ticket04.mjs`, throwaway, not committed; preview landed on :4185 because 4173–4183 are held by other sessions): at 390×844 on `/home` — root 13.99px, hero H1 45.5px, clamp-tier H2 45.5px, mid-tier H2 43.7px, `text-body` paragraph 14.9px, eyebrow 10.5px. At 320×690: no horizontal overflow on `/`, `/home`, `/trust`, `/products/plume-os`, with the take-over open, and with the assistant panel open; the stat numeral stays inside its glass panel (bounding-box check) despite the larger floor; take-over links compute 26px. Screenshot `.scratch/ticket04-home-390.png` shows the hero and section headings at the vendor's presence.

Deviations: none of substance. Judgment calls recorded above: (1) the `max-md` boost on the fixed mid-H2 tier, (2) the counter-sloped `--text-body` token instead of a flat rem bump so desktop stays pixel-identical, (3) measurement note — the script's first assistant-bubble read picked up the typing-indicator placeholder (inherits root size); the token itself was verified via the `/home` body paragraph read.

**Review follow-up** (post-resolution code-review pass):

- The duplicated clamp tier and the duplicated `max-md` boost are tokenized: `--text-display` (the shared hero/section/stat clamp, consumed as `text-display`) and `--text-display-mid` (the fixed 2.75rem mid-H2 tier, consumed as `text-display-mid`). The mid token's counter-sloped vw term lifts small viewports to the 3.25rem display floor — 45.5px at 390px, clearing the ~44px bar the old `max-md:text-[3.125rem]` boost (43.7px) just missed — and hands off to 2.75rem at 768px, removing the boost's md-boundary discontinuity. Desktop (1440px) is pixel-identical for both tiers.
- The partial sweep is completed: `text-[1.05rem]` footer links + footer tagline and the plume-os capability rows ride `text-body` now (14.99px at 390px / 15.98px at 1440px; desktop steps 16.8px → 16px for consistency with the token). The earlier "left alone, deliberately" entry for those sizes is superseded.
- Micro-voice bumps (eyebrow, mono indexes, privacy link) stand as recorded — the design language pins the ~11px quiet eyebrow, so labels are exempt from the body-text floor.
- Nav.svelte desktop links keep `text-[1.05rem]` — they render `hidden` below md, so the mobile floor never applies.
