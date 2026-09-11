# Capture recovery audit — 2026-09-09 (defaults) vs corrected run

Paired captures (present in both runs): **1199** (0 new-only pages skipped).

## Site-wide markers

| marker | 2026-09-09 | corrected | what it means |
| --- | ---: | ---: | --- |
| sfHidden | 84334 | 0 | SingleFile hidden-element artifact class |
| sfHiddenRule | 1199 | 0 | the artifact class’s hide rule |
| wConditionRule | 0 | 1199 | Webflow base hide rule for condition variants |
| wConditionEls | 22876 | 52209 | elements carrying the condition-hidden class |
| navShowRule | 0 | 1197 | shared-header dropdown open state |
| headerScrollRule | 0 | 1197 | shared-header scrolled state |
| headerBgOpenRule | 0 | 1197 | shared-header mobile take-over state |
| headerSticky | 0 | 1199 | shared-header sticky offset (top:0) |
| wDropdownNoneRule | 0 | 1199 | Webflow dropdown base hide rule |
| wDropdownOpenRule | 0 | 1199 | Webflow dropdown open rule |
| wTabPaneNoneRule | 0 | 1199 | Webflow tab-pane base hide rule |
| wTabActiveRule | 2 | 1199 | Webflow active tab-pane rule |
| hasSelectors | 1189 | 1199 | :has() selectors (header state rules use them) |
| navDdContent | 5985 | 10773 | mega-menu panel containers |
| navDdEmpty | 5985 | 0 | empty mega-menu panel containers |
| mobileChrome | 1197 | 1197 | mobile take-over chrome containers |
| mobileCta | 1197 | 2394 | mobile take-over CTA rows |
| wDropdownToggle | 306 | 398 | Webflow dropdown toggles |
| wDropdownList | 306 | 398 | Webflow dropdown lists |
| wTabPane | 6 | 6 | Webflow tab panes |
| wTabLink | 4 | 6 | Webflow tab links |
| customTabs | 11 | 11 | custom tab elements (data-tabs) |
| accordionToggle | 56 | 56 | accordion toggles |
| sliderControls | 117 | 128 | slider controls |

## Per component family

### Shared header mega-menu — `/`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| navDdContent | 5 | 9 |
| navDdEmpty | 5 | 0 |
| navShowRule | 0 | 1 |
| headerScrollRule | 0 | 1 |
| headerBgOpenRule | 0 | 1 |
| headerSticky | 0 | 1 |
| hasSelectors | 1 | 1 |

### Mobile take-over — `/`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| mobileChrome | 1 | 1 |
| mobileCta | 1 | 2 |
| headerBgOpenRule | 0 | 1 |

### Webflow dropdown / FAQ (animated height) — `/products/flock-os`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| wDropdownToggle | 4 | 4 |
| wDropdownList | 4 | 4 |
| wDropdownOpenRule | 0 | 1 |

### Press-center filters (display:none shape) — `/press-center`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| wDropdownToggle | 2 | 2 |
| wDropdownList | 2 | 2 |
| wDropdownNoneRule | 0 | 1 |
| wDropdownOpenRule | 0 | 1 |

### Webflow tabs — `/products/video-cameras`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| wTabLink | 2 | 4 |
| wTabPane | 4 | 4 |
| wTabPaneNoneRule | 0 | 1 |
| wTabActiveRule | 1 | 1 |

### Custom tabs (data-tabs menu/content pairs) — `/flock-ecosystem`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| customTabs | 9 | 9 |

### Accordions (LPR accordion-css) — `/trust`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| accordionToggle | 7 | 7 |

### Sliders (Swiper) — `/press-center`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| sliderControls | 3 | 3 |

### Condition-hidden CMS variants — `/resources`

| marker | 2026-09-09 | corrected |
| --- | ---: | ---: |
| wConditionEls | 86 | 110 |
| wConditionRule | 0 | 1 |
