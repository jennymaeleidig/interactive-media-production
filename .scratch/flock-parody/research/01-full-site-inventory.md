# Research — Full site inventory of flocksafety.com

Wayfinding ticket: [issues/01-full-site-inventory.md](../issues/01-full-site-inventory.md) · Resolved 2026-09-09

Inventory table: **[01-full-site-inventory.csv](01-full-site-inventory.csv)** (1,279 rows, same directory)

## Answer

Researched 2026-09-09 against the live site (Webflow-hosted). Every URL below was actually fetched during the inventory: status code, redirect target, and page `<title>` are ground truth from the live HTML, not slug guesses. Total requests to the site during this ticket: ~1,700 (sitemap, nav, listing walks, then one verification pass over the full union).

### Page counts

| Bucket | Count |
|---|---|
| Discovered paths (rows in table) | **1,279** |
| — sitemap-listed | 1,209 |
| — found only via nav/crawl | 70 |
| Live unique pages (200, real content) | **1,199** |
| Redirect stubs (live URL → canonical) | 56 |
| Auth-gated (401 Webflow "Protected page") | 10 |
| Dead (404): section roots + stale links | 14 |
| In site nav (any of header/footer) | 72 rows (64 header, 14 footer, 6 both) |

By type (live 1,199 + special rows): 855 post (816 blog posts, 39 customer stories) · 159 resource (84 webinars, 61 ebooks, 12 videos, podcast, brand guide) · 67 marketing · 61 utility · 20 legal · 17 campaign LP (/abm/*, /lp/*) · 10 index · 10 product · 10 auth-gated · 56 redirect · 14 dead.

### Sitemap sources used

- `robots.txt` → single sitemap: `https://www.flocksafety.com/sitemap.xml` (fetched in full; 1,209 URLs, lastmods through 2026-09-04). No sitemap index, no hreflang/locale alternates (`/sitemap_index.xml`, `/sitemap-0.xml`, `.gz` all 404). robots also disallows `/blog-audiences/`, `/use-case-filters/` and two obfuscated Webflow bot-block script paths.
- Nav crawl (homepage header + footer): 64 header + 14 footer internal links → caught 10 live paths missing from the sitemap (e.g. `/newsletter`, `/supplier-registration`, `/blog/what-is-traffic-analytics`, legacy aliases).
- Listing walks (Webflow `?…_page=N` pagination): `/blog` 69 pages, `/customers` 5, `/resources` 16, `/press-center` (its items are `/blog/*` posts — no separate press-item pages). Caught the `/webinars/*` and `/whitepaper/*` families the sitemap omits.
- `web_crawl` map pass (60 pages) corroborated; no additional page families beyond the above.

### Auth-gated / app-like (do not silently drop)

- **401 password-protected**: all 10 sitemap `/events/*` items are `test-*` stubs (`/events/test-event`, `/events/test-small-event`, `/events/test-third-party-events` + 6 `-copy` variants, `-past`) → "Protected page". There are **no real event item pages**; live events live on `/upcoming-events` with external registration links.
- **No app routes on the main host**: `/login`, `/signin`, `/search`, `/admin`, `/wp-admin`, `/users`, `/profile` all 404.
- **External app-like surfaces** (out of www scope, listed for the Recreation decision): `users.flocksafety.com` (Sign In / customer portal), `help.flocksafety.com` (Help Center), `docs.flocksafety.com` (Developer Hub / API docs), `go.flocksafety.com` (Marketo — forms2 posts here), `privacyportal.onetrust.com` (Do-Not-Sell form), `cdn.prod.website-files.com` (all assets), event-registration domains linked from `/upcoming-events`.
- **Crawl utility, not pages**: query-param pagination states (`/blog?6f47fcda_page=2…69`, `/customers?97994871_page=2…5`, `/resources?6f47fcda_page=2…16`, `/press-center?97994871_page=…`). The Recreation needs the pagination *control*, not 90 extra routes.

### Redirect families (56; target shown in each row's Status)

- `/webinars/*` (plural, 43 paths, **not in sitemap**): 32 → matching `/webinar/*`, 10 → `/resources` (retired webinars), 1 → `/industries/retail`.
- Legacy product aliases → `/products/license-plate-readers`: `/products/lpr-cameras`, `/products/investigations-manager`, `/products/national-lpr-network`; `/products/freeform-search` → `/products/flock-freeform`. **The header nav currently points at the aliases, not the canonical sitemap URLs.**
- `/privacy-ethics` → `/trust` (header "Privacy & Ethics" links the alias); `/privacy-ethics-copy` exists as a stray 200 page.
- Footer legal aliases: `/legal/privacy-notice` → `/legal/privacy-policy`, `/legal/terms-of-service` → `/legal/terms-and-conditions`.
- `/whitepaper/*` → `/ebooks/*`; `/blog/academy-reduces-orc…` → customers post; `/customers/whitehall-pd…` → `/customers`; `/customers/4-ways-retailers…` → `/industries/retail`; `/webinar/uncover-and-connect…` slug rename.

### Coverage caveats

- The four **collection index routes are dead** while their item pages are live: `/ebooks`, `/webinar` (+`/webinars`), `/video`, `/events` (and `/abm`, `/lp`, `/use-case`, `/industries`, `/vs`, `/whitepaper` roots) all 404. The only live hub for gated content is `/resources` (Learning Center). Recreation must decide whether to reproduce the dead roots.
- 2 sitemap blog posts never appear in the live blog listing (69 pages walked) but are live: `/blog/flock-aerodome-automated-security-for-retail-shopping-centers`, `/blog/secure-warehouses-with-help-from-flock-aerodome`.
- `/use-case-filters/{corporate-entities,large-cities,small-towns}` are robots-disallowed **and** 404 yet still linked from `/resources` — stale CMS links.
- CMS-glitch slugs exist and are live (e.g. `/blog/georgia-neighborhood-hands-georgia-neighborhood-hands-…`, `/customers/…-56tgx`); several sitemap blog slugs contain mangled word runs. Titles in the table are the real page titles.
- `/blog/what-is-traffic-analytics` (Sept 2026 post, in the header "Latest news" rail) is **not in the sitemap** — flagged in the table.
- No locale variants anywhere (no `xhtml:link` alternates, no locale paths).
- Titles are live-fetched point-in-time values (2026-09-09); 56 pages required multiline-`<title>` re-extraction.

### Legend

Nav column: `header` / `footer` / `header+footer` = in site chrome; `sitemap-only` = in sitemap, not in chrome; `crawl-only ⚠️not-in-sitemap` = discovered by crawl, absent from sitemap. Type: `index` section hub · `marketing` · `marketing (campaign LP)` · `product` · `post` · `resource` (gated content) · `legal` · `utility` (forms, thank-yous, tests, accessibility, site files) · `redirect` (stub; Status shows target) · `auth-gated` · `dead`. Status: HTTP code of the URL itself; `200 → /x` means it serves 200 only after redirecting to `/x`.

### Full inventory

The full 1,279-row table lives in **[01-full-site-inventory.csv](01-full-site-inventory.csv)** (same directory) — columns:

| Column | Content |
|---|---|
| `path` | site path |
| `title` | live-fetched page `<title>` |
| `nav` | `header` / `footer` / `header+footer` / `sitemap-only` / `crawl-only [not-in-sitemap]` |
| `type` | `index` · `marketing` · `marketing (campaign LP)` · `product` · `post` · `resource` · `legal` · `utility` · `redirect` · `auth-gated` · `dead` |
| `status` | HTTP code of the URL itself; `200 (redirect)` = serves 200 only after redirecting |
| `redirect_target` | canonical path for redirect rows, else empty |
| `url` | absolute URL (capture-list ready) |
