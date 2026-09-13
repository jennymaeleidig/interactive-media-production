# 01 — The index watch

Status: open
Blocked by: none

## What to build

One hand-run command, `npm run upstream`, that answers "does the live site still
match what we hold?" at the index level, with no new state: its comparison
baseline is the frozen Capture list we already commit.

It fetches upstream's sitemap and homepage, unions their paths with the frozen
Capture list, probes every URL in the union once, and reports:

- **index findings** — a live 200 path the Capture list does not hold, and a
  Capture-list path that no longer answers 200, naming its status and redirect
  target;
- **liveness** — every URL classified 200 / 3xx / 4xx, with 401 as its own class,
  because the tree 404s auth-gated stubs by rule and an upstream 401 is expected
  divergence rather than drift;
- **the inventory** — one row per URL carrying path, sitemap membership, status
  and redirect target, so a stale sitemap entry and a live-but-unlisted page are
  both visible as what they are.

Everything the command decides is a pure function of fetched bytes — the sitemap
body, the homepage body, and a map of path to probe result. The network edge
fetches and prints; it decides nothing. Human output by default, `--json` for a
machine-readable report, exit 0 for no findings, 1 for findings, 2 for an
operational failure.

`lastmod` may be carried in the inventory as context. No finding may be derived
from it: it is a publish stamp, it fires in bulk cohorts, and it is silent on
chrome.

The universe is a union of three sources because each is blind in a different
direction — the sitemap is an index of what upstream wants indexed, the homepage
carries the live pages the sitemap omits, and only our own frozen list can see a
deletion.

## Acceptance criteria

- [ ] the universe is the union of the sitemap's locs, the homepage's nav paths,
      and the frozen Capture list, with sitemap membership a per-URL field rather
      than the universe's boundary
- [ ] a fixture carrying the shape measured on 2026-09-13 produces exactly the
      measured findings: 1,209 sitemap locs of which 13 are not live 200
      (10 × 401, 3 × 301), 4 live 200 paths absent from the sitemap, and a live
      200-set identical to the Capture list — zero added, zero removed
- [ ] the three sitemap URLs that now 301 are reported as demotions naming their
      redirect targets
- [ ] a 401 is its own class and does not read as a finding
- [ ] the command never writes to the served tree or any of its records
- [ ] the pure core is pinned by fixtures with no network, and the network driver
      is not wired into the suite
- [ ] the pure module joins the `checkJs` project and gets its own vitest project
      row in `vitest.config.ts`
- [ ] human output and `--json` report the same findings
