# Brief — wayfinding ticket 01: Full site inventory of flocksafety.com

You are a pi research agent for effort `flock-parody` in this repo. Work alone (AFK). Follow steps in order; do not modify any other files than the three named below.

1. Read `.scratch/flock-parody/map.md` (the effort map) and `.scratch/flock-parody/issues/01-full-site-inventory.md` (your ticket).
2. Claim the ticket: set the ticket file's `Status:` line to `claimed` before any research.
3. Read and follow the research skill at `~/.pi/agent/skills/research/SKILL.md`. Investigate the primary source itself (the site); be exhaustive and honest about coverage.
4. Research the ticket's question — the complete public page inventory of https://www.flocksafety.com/ :
   - Fetch `https://www.flocksafety.com/robots.txt` and every sitemap it references (index sitemaps included).
   - Enumerate all URLs from the sitemaps; also crawl the site's own header/footer links to catch pages sitemaps omit (use your `web_crawl`/`web_fetch` tools; same-host only).
   - For every URL record: path, page `<title>` (or best-known label), nav membership (header / footer / neither / sitemap-only), type (marketing page, product page, post, utility, asset/binary).
   - Spot-check reachability on a sample (HTTP status). Separately list URLs that redirect, 404, or look auth-gated/app-like (portals, logins, search) — never drop them silently.
5. Resolve the ticket:
   - Write your **full findings** — the complete inventory table (path | title | nav | type | status), page counts, sitemap sources used, the auth-gated/app-like list, and coverage caveats — to `.scratch/flock-parody/research/01-full-site-inventory.md`.
   - Append an `## Answer` section to `.scratch/flock-parody/issues/01-full-site-inventory.md` containing only a short gist (page count, sitemaps used, biggest caveat) and a link to the research file above.
   - Set the ticket's `Status:` to `resolved`.
   - Append one line under `## Decisions so far` in `.scratch/flock-parody/map.md`:
     `- [Full site inventory of flocksafety.com](issues/01-full-site-inventory.md): <one-line gist — N pages, sitemaps used, caveats>`

Later tickets depend on your URL list (the capture run, ticket 03, and the link-rewrite map): completeness of the inventory matters more than prose.
