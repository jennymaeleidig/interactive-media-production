# Mobile type scale fills the screen

Type: task
Status: open
Blocked by:

## Question

On phones our type is far smaller than the subject vendor's (compare `.scratch/ai-assistant/flock-source/` mobile screenshots against ours). Root cause: the fluid root scale in `src/app.css` (`font-size: calc(0.625rem + 0.4166vw)`) floors at ~11.6px on a 390px phone, so every rem-based size shrinks ~27% versus desktop, and the display heading clamps (e.g. `text-[clamp(3rem,2.75rem+1.25vw,3.875rem)]`) keep 3rem (~35px) floors.

Raise the mobile root floor to ~14px (keep ~16px at desktop; keep the fluid mechanic) and raise the display clamp floors so hero/section headings fill the phone screen (~44px+ at 390px), matching the vendor's presence. Sweep all pages (home, trust, products/plume-os) plus shared components for sizes that fall below comfortable mobile body text (~15–16px effective) — bump or make fluid as needed. Watch fixed-size surfaces for overflow at 320px and 390px widths (the assistant panel is rem-sized; the take-over uses a `pt-24` offset), and keep the z-index tokens untouched.

Resolved when: at 390px the home hero and section headings read at the vendor's scale and body text is comfortable; nothing overflows at 320px; `npm run check && npm test` pass.
