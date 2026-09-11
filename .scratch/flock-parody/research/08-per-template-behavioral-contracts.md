# Research — Per-template behavioral contracts (incl. site-wide animation-pattern census)

Wayfinding ticket: [issues/08-per-template-behavioral-contracts.md](../issues/08-per-template-behavioral-contracts.md) · Resolved 2026-09-09

Baseline: [02-behavioral-machinery.md](02-behavioral-machinery.md) (homepage contract: GSAP split/clip/fade attribute system, Lenis, navbar morph, Qualified chat, Denim/Denimink/Denton/Sohne fonts, tracker strip-list). Evidence base: `research/flocksafety/2026-09-09/` (1,199 SingleFile captures; per-page status in `capture-status.csv`; template type per path in `01-full-site-inventory.csv`).

## Method

- **Corpus sweep (all 1,199 captures)**: scripted regex census over every file for animation attributes, element classes, video/iframe/form/input patterns — with `<style>` blocks stripped first (the inlined site CSS otherwise pollutes DOM-level counts; e.g. Swiper `w-lightbox` CSS exists site-wide while real instances are rare). Counts (pages-with / total occurrences per family) were computed for ~50 patterns; a raw dump is preserved at `.scratch/flock-parody/research/evidence/08-per-template-behavioral-contracts/census.md`.
- **Deep samples (16 files, ~2/family, large + small members)**: targeted extraction of every animation attribute value + captured inline end-states, iframe forms, video tags + m3u8 URLs, form/input/select names, clip-path/translate3d/scale inline values, keyframes list, finsweet/webflow/react attribute inventories. Per-sample transcripts in the same evidence directory.
- Gotchas that shaped the method: SingleFile serializes attribute values **unquoted when possible** (both `data-x=v` and `data-x="v"` occur in the same file — naive quoted-only greps silently miss most of the corpus), and the Qualified messenger's giant `srcdoc` attribute contains whole escaped documents (naive `<form>`/`<iframe>` counts overcount by its contents). Both are accounted for above.
- All findings are from local static analysis; no live-site access (per brief).

## Headline finding

There are **two distinct behavior stacks** on flocksafety.com, and ticket 02 saw only the smaller one:

1. **The "2025 redesign" GSAP attribute stack** (ticket 02's homepage machinery: `data-split-onload`/`data-split-title`, `data-split-gsap`, `data-animation-gsap`) — used on exactly **8 pages site-wide** (verified by corpus grep): `/`, `/flock-ecosystem`, `/press-center`, `/products/license-plate-readers`, `/lp/proven-where-it-matters`, `/lp/rapid-response-shield`, `/lp/lpr-pro-early-access`, `/lp/lpr-pro-waitlist`.
2. **The Webflow-platform stack** on the other **1,191 pages**: Webflow IX2 interactions (`data-w-id`, present on 855/855 posts and most marketing/product/utility pages), Webflow native `w-tabs`/`w-dropdown`/`w-nav`, **Swiper** sliders, **Finsweet Attributes** (CMS Filter / CMS Load / CMS Nest / Social Share), **Wistia/YouTube** video embeds, and **Marketo/Webflow forms**. Zero `data-animation-gsap` anywhere on them.

Also notable: **no scroll-scrubbed/pinned motion is evidenced anywhere in the corpus** (the class ticket 10 feared) — see census. And **no `<form>` in the whole corpus carries an `action` attribute** (all submission is JS; supports the map's inert-forms + local-mock decision). The only non-JSON-LD `<script>` surviving in any capture is a SingleFile re-nesting helper on the LPR page (`data-sf-nesting-track-id`) — capture tooling, STRIP; the map's "captures carry no executable scripts" claim holds corpus-wide.

## Per-family behavioral contracts

Verdict key: **MR** = MUST-REPRODUCE · **SD** = STRIP/DEFER. "Baseline" = behaviors already covered by the ticket-02 homepage contract (nav morph, split/clip/fade GSAP system, Lenis, Qualified chat, fonts, footer).

Legend of shared components (present on virtually every page, all families): `w-nav` navbar (MR, ticket 02), Qualified messenger iframe `#q-messenger-frame` (MR as mimic, ticket 04/06 — captured mount state varies per page: collapsed 20×20, greeting card 412×296, or open panel 412×315–382), JSON-LD metadata blocks (SD, keep as inert data), footer privacy-menu IX2 disclosure (`privacy-menu_trigger/content`, trigger `sf-hidden` on desktop — MR as CSS-toggled disclosure), Finsweet social-share buttons on posts (MR as static links).

### index (10 pages: `/`, `/blog`, `/careers`, `/customers`, `/legal`, `/press-center`, `/products`, `/resources`, `/trust`, `/upcoming-events`)

| Behavior | Evidence (sample → path) | Verdict |
|---|---|---|
| Homepage GSAP baseline (split hero + words + fade-in-2 + image-clip) | `index.html` | MR (ticket 02) |
| press-center joins the GSAP stack (`fade-in` ×1) | `press-center.html` | MR (trivial fade) |
| Swiper sliders: real instances captured (`swiper-initialized swiper-horizontal`, 928–989px slides, 20px gap, `swiper-button-disabled` states) | `customers.html` (quotes ×2), gsx (×10, marketing file) | MR — click-driven carousel; captured geometry is the spec |
| Finsweet CMS Filter + Load mega-lists: search/filter form (`wf-form-0`, input `name=field`), `fs-cmsfilter-field` ×19–63, `fs-cmsload-mode=pagination` (×44 corpus) or `load-under` (`/upcoming-events`, the 33 MB file — all items inlined), `fs-cmsnest-element` | `upcoming-events.html`, `customers.html`, `blog.html`, `resources.html`, `press-center.html` | MR as **static filter UI**; live filtering SD/DEFER (decide at ticket 10 whether filtering re-filters the served DOM client-side or ships inert) |
| YouTube **click-to-load facades** (`data-youtube-card`, poster button `data-youtube-poster` + hidden inert wrapper + `youtube.com/embed/<id>` iframes ×3) + inline Wistia player + custom accordion (`accordion-css`, 2 sections) | `trust.html` | MR the facade/poster + Wistia poster frame; actual playback DEFER (external) |
| IX2 scroll-reveal from-states captured as inline `opacity:0` (e.g. `filters-container w-form`) | `upcoming-events.html` | MR (CSS transition to opacity:1) |

### marketing (67 pages: `/industries/*` ×17, `/gsx`, `/flock-ecosystem`, `/what-is-flock`, use-case/hub pages…)

| Behavior | Evidence | Verdict |
|---|---|---|
| GSAP stack full set: `clip-in` ×24, `image-clip` ×7 (one captured at **end state** `inset(0% 0% 0% 0%round var(--clip-r))`), `fade-in` ×4, `split-gsap=words` ×5, `split-onload` hero | `flock-ecosystem.html` (7.9 MB — the system's flagship after the homepage) | MR (same authoring recipe as homepage) |
| Webflow IX2 hovers/reveals: `product-card` hovers, `faq_card w-dropdown` FAQ accordions (data-delay=0, hover=false), `stat_card`, `cs-highlight` | `industries/hoas.html`, `gsx.html`, `products/gunshot-detection.html` | MR as CSS :hover transitions + expand-on-click; exact IX2 tweens DEFER (definitions stripped with site JS; captured DOM shows only from/end states) |
| Swiper: 23 pages, incl. all 17 `/industries/*` (`swiper is-featured w-dyn-list`, aria-label "1 / 5", margin-right:20px) + `cc-swiper w-embed` wrappers | `industries/hoas.html` | MR — click/drag carousel, geometry captured |
| Finsweet CMS Filter fields (×10 on hoas; ×8 on flock-os product page as `name/content` search) | `industries/hoas.html` | MR static; live filter DEFER |
| Webflow-native form `wf-form-Book-a-Demo` (`form_wr is-dark`, no action — JS-submitted) | `gsx.html` | MR markup, inert POST → local mock route (map decision) |
| Rendered Marketo form `mktoForm_2807` (`sf-hidden` at capture) + `MktoForms2XDIframe` xdomain iframe | `flock-ecosystem.html` | SD the Marketo runtime (munchkin/forms2/XDIframe/reCAPTCHA); MR a static styled mock of the rendered field markup (map decision) |
| Custom tab panels (`data-tabs=home-content-item`, tabpanel at `opacity:0;pointer-events:none;position:absolute;inset:0px`) — NOT w-tabs | `flock-ecosystem.html` | MR — click-switch tabs; captured hidden-pane style is the from-state |
| "Marquee": `cases_marquee` exists **only** on `/what-is-flock` — and it is **empty + `sf-hidden`** (display:none, no children, no scroll keyframes in CSS) | `what-is-flock.html` | SD — no marquee motion to reproduce |

### marketing (campaign LP) (17 pages: `/lp/*` ×7, `/abm/*` ×10)

| Behavior | Evidence | Verdict |
|---|---|---|
| Two GSAP-stack LPs: `proven-where-it-matters` (fade-in ×1, words ×2, IX2 blur-hover end-states `filter:blur(0px);opacity:1` on `master-cta-c`), `rapid-response-shield`, `lpr-pro-early-access`, `lpr-pro-waitlist` (gsap present) | `lp/proven-where-it-matters.html` | MR (homepage recipes) |
| ABM pages (all 10, incl. `abm/national-grid`): minimal — IX2 `cta-block-image` hover blocks only; no forms in DOM beyond messenger; no video | `abm/national-grid.html`, `abm/amazon.html` | MR as static + CSS hovers |
| Marketo forms on every LP (`mktoForm_1009` rendered: text×5 + email×1 + select `Type__c` — fields FirstName/LastName/Email/Phone/PostalCode/Company; mkto refs ×2–6 per page) | `lp/proven-where-it-matters.html` | SD runtime; MR static styled mock → local mock route |
| Inline Wistia `<video>` (HLS `embed-ssl.wistia.com/deliveries/<hash>.m3u8`, frozen at poster) on 5 LPs | `lp/proven-where-it-matters.html` ("Flock LPR Sizzle Reel") | MR poster frame; playback DEFER |
| Hidden naked iframes ×2 (`style=display:none`, srcless — Munchkin/ad pixels) + reCAPTCHA srcdoc iframe inside forms | LPs, book-a-demo pages | SD (strip list; note ticket 05 "heads must match" check) |

### product (10 pages)

| Behavior | Evidence | Verdict |
|---|---|---|
| **`/products/license-plate-readers` is the only product page on the GSAP stack** (redesigned template, `lpr1_/lpr2_` class prefixes): `data-animation-gsap=fade-in` ×16 (from-state captured: `transform:translate(0px,24px);opacity:0`), `words` ×4, `lines` ×1 (SplitText with `split-line-mask` wrappers, aria-label preserved), plus a **`data-animation-css`** system: hero `fade` keyframe + `fade-d1`/`fade-d3` delays (`animation-fill-mode:both`, `--transition-duration-3`/`--transition-ease` tokens) | `products/license-plate-readers.html` | MR — all pure-CSS-authorable; from/end values captured |
| Custom accordion system: `accordion-css__item`, `data-animate=slide-up`, `data-accordion-status=not-active`, `data-accordion-toggle` buttons, `panel-content-N` regions (content fully in DOM, ~30 elements) | `products/license-plate-readers.html` | MR — CSS height/rotate toggle, content present |
| Legacy 9 pages: Webflow IX2 only (`data-w-id` on `stat_card`s, FAQ `w-dropdown`s, shared `tag is-dfr` hover component) + `w-tabs` on `/products/video-cameras` (PTZ/Fixed camera tabs, `data-duration-in=300 data-duration-out=100`, inactive pane `sf-hidden`) | `products/flock-os.html`, `products/gunshot-detection.html`, `products/video-cameras.html`, `products/mobile-security-trailer.html` | MR structure + captured states; IX2 tween params DEFER |
| Stray GSAP residue: single `translate3d(0px,0.505px,0px)` on a scroll element (all legacy product pages) | all product samples | SD — sub-pixel captured artifact, ignore |
| Inline Wistia player ×3 pages (LPR: `inset(0.5px round 18.8389px)` player chrome) | `products/license-plate-readers.html` | MR poster; playback DEFER |
| No forms on any product page | all product samples | — |

### post (855 pages: `/blog/*`, `/customers/*` stories)

The most uniform family: **zero GSAP/Finsweet-filter/Swiper/forms on all 855**.

| Behavior | Evidence | Verdict |
|---|---|---|
| Finsweet Social Share: `fs-socialshare-element` ×3 (linkedin/facebook/twitter/x links) on every post | `blog/tips-for-leaving-town.html`, `customers/how-spring-branch-…` | MR as static links |
| Wistia inline `<video>` on 39 posts (63 elements, 118 m3u8 refs; `wistia_simple_video_NNN`, `playsinline loop preload=none`, poster frozen) | `blog/200-vs-400-feet-dfr.html` | MR poster frame + aspect box; playback DEFER |
| YouTube embeds on 14 posts (`youtube.com/embed/<id>` / `youtu.be/<id>` iframes, 18 refs) + footer/channel **links** on many more (links stay live per map) | `blog/transparency-portal.html` (external youtu.be link), `trust.html` (facades, index family) | MR as frozen embed or facade; playback DEFER |
| IX2 on shared footer `privacy-menu_trigger/content` (same element IDs on all 855 — shared component) + TOC section (`section-z is-toc`) on customer stories | `blog/*` samples, Spring Branch story | MR as CSS disclosure |
| Related-post CMS load (`fs-cmsload-*` ×1 each) on customer stories | Spring Branch story | MR static list |
| 8 posts (small, ~1.8 MB) captured **without** the Qualified messenger iframe (rule didn't fire in those sessions) | `blog/tips-for-leaving-town.html` etc. | Note for ticket 05 strip audit: messenger presence varies; the mimic injects uniformly |

### resource (159 pages: `/ebooks/*`, `/webinar/*`, `/podcast`, `/video/*`, guides)

| Behavior | Evidence | Verdict |
|---|---|---|
| Gated-content Marketo forms on **156/159** pages (rendered `mktoForm` with `data-formid` — e.g. **1818**: text×5 + email×1 + select `Type__c`; duplicate instance marked `data-forminstance=two`; one rendered + one hidden template copy per page) | `ebooks/apartment-security.html` | SD runtime; MR static styled mock → local mock route (the map's form decision; these are the "main flows") |
| Wistia video: 27 pages with `<video>` (27 elements), 34 pages m3u8, Wistia refs ×1,238 (heaviest Wistia family) | `ebooks/*`, webinar pages | MR poster frames; playback DEFER |
| `w-tabs` season switcher (`data-current="Season 2"`, `season-link` tabs, inactive pane `sf-hidden`) | `podcast.html` | MR — click tabs, all content in DOM |
| No GSAP attribute system anywhere in family; IX2 minimal | podcast, ebooks samples | — |

### legal (20 pages: `/legal/*`, policies)

| Behavior | Evidence | Verdict |
|---|---|---|
| **Fully static**: no GSAP, no IX2 (data-w-id 0), no swiper, no video, no forms, no inputs. Only w-nav + footer + messenger + JSON-LD | `legal/terms-and-conditions.html` | MR as pure static (the trivial family) |

### utility (61 pages: `/book-a-demo*` ×16, `/thank-you*` ×26, one-offs)

| Behavior | Evidence | Verdict |
|---|---|---|
| `/book-a-demo-paid` (5.4 MB): rendered `mktoForm_1009` (text×5, email×1, select `Type__c`), Swiper quotes slider (989px slides ×4), FAQ `w-dropdown`s ×5, IX2 section reveal | `book-a-demo-paid.html` | SD Marketo runtime; MR static form mock + slider + FAQ |
| `/newsletter`: `mktoForm_2703` rendered — text×2, email×1, **checkbox×2** (the site's actual newsletter signup) | `newsletter.html` | SD runtime; MR static mock |
| `/partner-inquiry`: **Webflow-native** form `wf-form-Reseller` (text×4, email×1, tel×3, checkbox×4, radio×14, submit×1) | `partner-inquiry.html` | MR markup, inert POST → local mock route |
| `/refer`: `mktoForm_1226` (text×6, email×2) | `refer.html` | SD runtime; MR static mock |
| `/chilipiper-2`: **empty** — the Chili Piper scheduler never rendered in capture (no form, no inputs, no embed) | `chilipiper-2.html` | DEFER — nothing to reproduce; flag to /to-spec as a known-dead demo path |
| `/thank-you/*` ×26: capture destinations for the mock-form redirects (map decision); behaviorally simple pages | family sweep | MR static |
| Scaffold/test pages (`form-test`, `email-exclusions-test`, `fb-click-id`, `business-template`, `webinar-test`) | family sweep | SD — map already drops scaffold/test pages from serving |

## Animation-pattern census (for ticket 10)

"Scrubbed/pinned?" = scroll-position-driven (the hard-to-fake class). Captured values are the literal inline styles/attributes found in the corpus; from-state = what the mimic layer must author, end-state = captured ground truth.

| # | Pattern | Where (families / pages) | Scrubbed/pinned? | Captured values for authoring |
|---|---|---|---|---|
| 1 | **Hero split-on-load** (`data-split-onload data-split-title`, `.title-word` ×`--word-index`) | index: `/`; marketing: `/flock-ecosystem` | No — fires on load | From: `color:rgb(142,168,184); filter:blur(15px); translateY(0.42em); opacity:.45`. To: `--split-final-color:rgb(254,253,251)`, blur 0, translate 0, opacity 1; stagger 58ms/word (ticket 02 recipe, confirmed intact in capture) |
| 2 | **Scroll-triggered word split** (`data-split-gsap=words`, `.word` spans, `aria-label` kept) | index: `/` (7 h2); marketing: `/flock-ecosystem` (5); LP: `proven-where-it-matters` (2), `rapid-response-shield` (2) | No — one-shot on scroll into view (ScrollTrigger, not scrub) | From: same blur/rise/slate recipe; end captured: heading `style=opacity:1` + word spans with `will-change:transform,filter,color,opacity` |
| 3 | **Masked word/line split** (`data-animation-gsap=words\|lines` → `.split-word` / `.split-line-mask` spans) | product: LPR page (words ×4, lines ×1) | No — one-shot | `.split-word{position:relative;display:inline-block}`, `.split-line-mask{position:relative;display:block}` (overflow-hidden line masks → slide-up inside mask); `will-change:transform,opacity,filter` (CSS contract on the page); end state captured `style=opacity:1` |
| 4 | **fade-in-2** (`data-animation-gsap=fade-in-2`) | index: `/` ×4 | No | From: `opacity:0`. End (captured on above-fold element): `opacity:1;translate:none;rotate:none;scale:none;transform:translate3d(0px,0px,0px)` |
| 5 | **fade-in / rise-24** (`data-animation-gsap=fade-in`) | product: LPR ×16; marketing: `/flock-ecosystem` ×4; LP ×4 pages; index: `/press-center` ×1 | No | From (captured): `transform:translate(0px,24px);opacity:0`. End: translate 0/opacity 1 |
| 6 | **clip-in** (`data-animation-gsap=clip-in`) | marketing: `/flock-ecosystem` ×24 (`home4_scroll_heading/paragraph/item_body` wraps) | No scrub evidence, but sits in the scroll-driven `home4` hero (sticky `progressive-blur_wrap-2.hero`, `overflow:clip`) — the closest thing to a scroll-linked section on the site | From: `opacity-0` class. End: not captured (below fold) — author as opacity/clip reveal; flag to ticket 10: this section is where any residual scrub-like behavior lives; live check optional |
| 7 | **image-clip reveal** (`data-animation-gsap=image-clip` on `.img-overlay`) | index: `/` ×5; marketing: `/flock-ecosystem` ×7 | No — one-shot | From (captured ×5 on `/`): `clip-path:inset(6% 10% 0% 10%round var(--clip-r))`; End (captured on `/flock-ecosystem`): `inset(0% 0% 0% 0%round var(--clip-r))`; `--clip-r:8px` (CSS) |
| 8 | **CSS keyframe fades** (`data-animation-css=fade\|fade-d1\|fade-d3`; `@keyframes fade{from{opacity:0}to{opacity:1}}`, delays `--transition-delay-d1/d3`, `fill-mode:both`) | product: LPR hero (h1/desc/CTA) | No — plays on load | Entirely in captured CSS — copy verbatim |
| 9 | **Webflow IX2 scroll-reveals** (`data-w-id` + inline `opacity:0` from-states) | post ×855 (footer/privacy-menu, TOC), utility: `/upcoming-events` filters, marketing: `stat_card`, `container-*`, `hero_layout`, `cs-highlight`, `section-z` | No evidence of scrub; one-shot reveals | From: captured inline (`opacity:0;display:block` etc.). End: `opacity:1`. IX2 timeline params (durations/eases) were stripped with site JS — DEFER exact params, author as ~0.3–0.6s ease fade/rise |
| 10 | **IX2 hover tweens** (card/image hover: `product-card`, `cta-block-image`, `l-img-wrapper`, `card-article`, `tag is-dfr`, blur+fade `master-cta-c`, `headline-timeline` captured at `filter:blur(0px);opacity:1`) | marketing, LP, product families | No (hover) | End-states captured; tween params DEFER — author as CSS :hover transitions |
| 11 | **w-dropdown FAQ accordions** (`faq_card`/`faq_card-2`, data-delay=0, hover=false) | marketing (19 pages), product (9), utility (7), index (7), legal (all 20 — dropdowns only) | No (click) | Closed state captured (`aria-expanded=false`, panel content fully in DOM); open = Webflow `.w--open` toggle — author as height/opacity toggle |
| 12 | **Custom accordions** (`accordion-css__item`, `data-accordion-status`, `data-accordion-toggle`; trust page variant) | product: LPR; index: `/trust` | No (click) | All panels in DOM; icon SVGs rotate (`.accordion-css__item-icon`) |
| 13 | **w-tabs** (`w-tabs`, `data-duration-in=300 data-duration-out=100`) | product: `/products/video-cameras` (PTZ/Fixed); resource: `/podcast` (Season 1/2) | No (click) | Inactive pane captured `sf-hidden` (display:none); switching = show/hide + 300/100ms fade |
| 14 | **Custom tabs** (`data-tabs=home-content-item`, tabpanes stacked `position:absolute;inset:0px;opacity:0`) | marketing: `/flock-ecosystem` | No (click) | Hidden-pane style captured verbatim |
| 15 | **Swiper sliders** (`swiper-initialized swiper-horizontal swiper-backface-hidden`, `.swiper-slide-active/next`, prev/next buttons incl. `swiper-button-disabled`) | index: `/customers`; marketing: 23 pages (all `/industries/*`, `/gsx`); utility: `/book-a-demo*` (16); resource: 1 | No (click/drag) | Captured geometry: slide widths 928–989px (quotes) / card widths (industries), gap 20px, aria `1 / N` — the captured mid-state IS the layout spec |
| 16 | **Smooth scroll (Lenis)** | Live-site runtime; capture caught the `lenis` html class on only 3 pages (`index.html`, `products/flock-dfr.html`, `safe-cities.html`) | n/a (continuous) | MR as feel (ticket 02), not per-page; captured class variance is capture-timing noise, not page behavior |
| 17 | **Marquee** | None active. `cases_marquee` exists only on `/what-is-flock`, empty + `sf-hidden`, no scroll keyframes | — | SD — nothing to author |
| 18 | **Pinned / scroll-scrubbed timelines** | **Not evidenced anywhere in the corpus.** No pin-spacers, no scrub artifacts, no `data-speed`/parallax attributes in any of the 1,199 DOMs; `position:sticky` only on sticky headers + the ecosystem blur overlay | — | The "hard-to-fake" class ticket 10 reserved the end-state-only floor for is **empty**; the CSS end-state floor covers everything found |

**Census caveat**: IX2/GSAP timeline definitions (durations, eases, scrub flags) lived in stripped site JS, so "not scrubbed" is inferred from (a) zero captured scrub mid-states corpus-wide and (b) captured from/end states that are all simple one-shot values. If ticket 10 wants certainty on the `home4_scroll_*` section (`/flock-ecosystem`), a single live visit settles it; nothing else on the site plausibly scrubs.

## Forms inventory (beyond the homepage's none)

No `<form action>` exists anywhere; all submission was JS (Marketo forms2 / Webflow forms) — inert markup + local mock POST routes per the map's forms decision. One-time caveat: `<form class="css-1d6gwie…">` found on every page is **inside the Qualified messenger's srcdoc attribute**, not page markup.

| Form | ID | Fields (rendered, captured) | Pages |
|---|---|---|---|
| Marketo book-a-demo | `mktoForm_1009` | FirstName, LastName, Email, Phone, PostalCode, Company + select `Type__c` | `/book-a-demo*` ×16, `/lp/*` ×7, `/fifa-2026` LP |
| Marketo gated asset | `mktoForm_1818` (`data-forminstance=two`) | FirstName, LastName, Email, Phone, PostalCode, Company + `Type__c` | 156/159 resource pages |
| Marketo newsletter | `mktoForm_2703` | text×2, email, checkbox×2 | `/newsletter` |
| Marketo refer | `mktoForm_1226` | text×6, email×2 | `/refer` |
| Marketo (other) | `mktoForm_2807` | rendered `sf-hidden` | `/flock-ecosystem` |
| Webflow native demo | `wf-form-Book-a-Demo` (`form_wr is-dark`) | in `gsx.html` | `/gsx` |
| Webflow native reseller | `wf-form-Reseller` | text×4, email, tel×3, checkbox×4, radio×14 | `/partner-inquiry` |
| Finsweet CMS-filter pseudo-form | `wf-form-0` (input `name=field`) | search/filter fields | 5 hub pages (`/blog`, `/customers`, `/resources`, `/upcoming-events`, `/press-center`) |

Marketo/infra to STRIP (extends ticket 02 strip-list): `munchkin`, `forms2.min.js`, `MktoForms2XDIframe` xdomain iframes, reCAPTCHA srcdoc iframes inside forms, srcless `display:none` ad/Munchkin iframes. Keep: the rendered `mktoForm` DOM (labels/inputs/selects/styles inline) as the static mock substrate.

## Coverage caveats

- Sampling: 16 deep samples (1–2+ per family, large+small) + scripted corpus-wide greps for every pattern above — feature *presence* claims (e.g. "39 posts have Wistia video") are corpus-wide, not extrapolated from samples. Per-element nuance on un-sampled pages may vary (e.g. exact Swiper slide counts).
- Capture-state variance is real and matters to ticket 05's diff gate: the Qualified iframe height differs per capture (20×20 / 296 / 315.5 / 382px); the `lenis` class survived on 3 pages only; elements above the fold carry completed animation end-states while below-fold ones carry `opacity:0` from-states. These are capture-time artifacts, not per-page behavior differences. (Silver lining: both animation states are therefore present in the corpus, which is exactly what authoring from-states needs.)
- `sf-hidden` is SingleFile's marker for elements hidden at capture (inactive tab panes, closed accordions, desktop-hidden triggers) — the content is present, just display:none. Good news: nothing behavioral was lost to hiding.
- No live verification was done (per brief): IX2 tween params and the `home4_scroll_*` section's exact scroll linkage remain inferred (see census caveat).
- One bare `<script>` site-wide (SingleFile re-nesting helper on the LPR capture) — add to the build's strip list for cleanliness.
