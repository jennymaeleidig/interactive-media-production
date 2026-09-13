# 01 — The index watch

Status: resolved
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

- [x] the universe is the union of the sitemap's locs, the homepage's nav paths,
      and the frozen Capture list, with sitemap membership a per-URL field rather
      than the universe's boundary
- [x] a fixture carrying the shape measured on 2026-09-13 produces exactly the
      measured findings: 1,209 sitemap locs of which 13 are not live 200
      (10 × 401, 3 × 301), 4 live 200 paths absent from the sitemap, and a live
      200-set identical to the Capture list — zero added, zero removed
- [x] the three sitemap URLs that now 301 are reported as demotions naming their
      redirect targets
- [x] a 401 is its own class and does not read as a finding
- [x] the command never writes to the served tree or any of its records
- [x] the pure core is pinned by fixtures with no network, and the network driver
      is not wired into the suite
- [x] the pure module joins the `checkJs` project and gets its own vitest project
      row in `vitest.config.ts`
- [x] human output and `--json` report the same findings

## Comments

**Commit.** `44583cb` — "Add the upstream watch index command (ticket 01)" —
ships `regression/upstream-watch.mjs` (pure core),
`regression/upstream-watch-cli.mjs` (network edge, `npm run upstream`),
`test/upstream-watch.test.ts`, the vitest project row, the `checkJs` include, the
`mapLimit` single-sourcing in `pipeline/cli.mjs` + `regression/routes.mjs`, the
`CODING_STANDARDS.md` carve-out, and the `CONTEXT.md` terms. This ticket-close
commit carries `Status: resolved` and this note.

**Seams tested** (`test/upstream-watch.test.ts`, 24 tests, no network):

- the pure core called as a function, over the committed Capture list plus the
  2026-09-13 measured shape: 1,209 locs, 13 not live 200 (10×401, 3×3xx), the 4
  unlisted live pages, universe 1,220, liveness 1200/0/10/0/0, 0 added, 0
  removed, exactly 3 demotions with their targets, and the live 200-set equal to
  the Capture list;
- `lastmod` mutated to 2030 changes no finding, demotion, or exit code;
- synthetic drift: added `/new-page`, removed `/gone` (404), exit 1;
- a Capture-list path answering 401 is not a finding, and a 401 is its own class;
- `sitemapLocs` throws on a non-`<urlset>` body (empty, an HTML error page, a
  `<sitemapindex>`), so the driver exits 2 instead of reporting a shrunken
  universe clean;
- `buildWatchReport` throws when the probe map does not cover the universe;
- named and numeric XML entities (`&amp;`, `&#38;`, `&#x26;`) decode in a loc;
- 5xx gets its own class, never the `4xx` bucket;
- human output carries every path the JSON `findings` carries.

**Network edge.** Not wired into the suite, per the spec's Testing Decision. It
was smoke-tested offline by intercepting `globalThis.fetch` through
`node --import` (the driver itself unmodified): clean exit 0; drift exit 1 with
both added and removed; a probe failure exit 2; a non-`<urlset>` sitemap exit 2.
`npm run typecheck`, the full `npm test` (17 files, 248 tests), and `npm run
build` all pass.

**Liveness signal settled for.** One HTTP status per watched URL, classified
200 / 3xx / 401 / 4xx / 5xx with 401 pulled out because the tree 404s auth-gated
stubs by rule and an upstream 401 is expected divergence. It is measured, never
inferred, and `lastmod` is carried as context only.

**What that signal cannot see.** A page whose status is unchanged but whose
content moved (copy, chrome/nav/footer, a site-wide restyle, or a media slot
that died upstream) is invisible here — those are the later tiers (the copy and
chrome projections, the restyle signal, media liveness). It also cannot see the
sitemap *dropping* a URL our Capture list still holds (the path stays in the
universe and, if it still answers 200, is not a finding); it cannot detect a
truncated-but-still-`<urlset>` body beyond the root-element check; and it does
not descend a `<sitemapindex>`.

**Review findings (two axes vs fixed point `fd6e678`).** Fixed — Standards H1
(frozen-snapshot rule contradicted): `CODING_STANDARDS.md` now records the watch
as the one deliberate upstream-facing exception and states it never writes the
tree. H2 (test pinned prose labels): the `'1 added'`/`'1 removed'` assertions are
gone; the test asserts the finding data. H3 (source-grep "never writes" test):
removed, and the driver now takes only the named `readFileSync` import, so it has
no write function in scope. H4 (missing vocabulary): `CONTEXT.md` gains **Capture
list**, **upstream watch**, **watched universe**, **demotion**, and **watch
probe**. J1 `mapLimit` duplicated in `regression/routes.mjs`: single-sourced in
`pipeline/cli.mjs`, imported by both drivers. J2 the union resolved twice:
extracted `resolveSources`. J3 class keys respelled: exported `LIVENESS_CLASSES`.
J4 `row.class`: renamed `statusClass`. J5 anonymous input shapes: exported
`Probe` / `WatchInputs` / `ReportInputs` typedefs, referenced in the driver. J6
& B2 `--origin` / `--capture`: removed — the baseline is the frozen Capture list
and the ticket names only `--json`. Spec A1 unparsable sitemap: `sitemapLocs`
throws and the driver exits 2. B3 `unreachable` class: removed; a missing probe
now throws. C1 a Capture-list 401 counted as a finding: excluded, matching the
acceptance box and the module comment. C2 5xx folded into `4xx`: split into its
own class. C3 only `&#39;` decoded: all numeric entities decode now. Rejected —
B1 (whole-page homepage scan flagged as scope creep): the ticket's "homepage's
nav paths" is read as the homepage's same-origin anchor paths; class-marker
slicing is approximate by design and would silently miss a nav variant, and a
live page reachable only from another homepage link is exactly the blind spot the
homepage source exists to cover. The scan can only add probe rows, and a live
page the Capture list does not hold is a finding by the ticket's own first rule.
