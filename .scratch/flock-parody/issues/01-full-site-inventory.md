Status: resolved
Type: research
Blocked by:

## Question

What is the complete public page inventory of www.flocksafety.com? Enumerate every page: URL path, title, nav membership (header / footer / neither / sitemap-only), and type (marketing, product, post, utility, asset). Prefer robots.txt and sitemaps first, then nav/crawl discovery for what sitemaps omit; spot-check reachability and list auth-gated or app-like URLs separately rather than dropping them. This inventory is the capture list (ticket 03) and the link-rewrite map the build depends on.

## Answer

Researched 2026-09-09 against the live site (Webflow-hosted). **1,199 live pages** (plus 56 redirect stubs, 10 auth-gated `/events/test-*` stubs, 14 dead roots), discovered via robots.txt → sitemap.xml (1,209 URLs), nav crawl, and pagination walks; every URL status- and title-verified (~1,700 requests). 70 live paths are missing from the sitemap (including all `/webinars/*` aliases); header nav points at legacy redirects (`/products/lpr-cameras`, `/privacy-ethics`). No locale variants exist anywhere. No app routes on the www host; subdomain surfaces (users/help/docs/go.) ruled outside the Recreation.

Full findings: [research/01-full-site-inventory.md](../research/01-full-site-inventory.md) — inventory table: [research/01-full-site-inventory.csv](../research/01-full-site-inventory.csv).
