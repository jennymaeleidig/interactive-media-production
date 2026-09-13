# Upstream watch

The Recreation is a **Frozen snapshot** of flocksafety.com as it stood on
2026-09-12, and `served/` is the artifact. Nothing in the repo can see the live
site: the serving check compares the served tree against itself, so it can never
report that upstream has moved. The question "are we out of date?" has no
answer today, and the only machinery that ever had one — the capture-refresh
workflow's inventory walk and drift diff — was retired with the captures it read
(`git show 56fae83^:pipeline/inventory-diff.mjs`).

This spec revives the cheap half of that workflow and nothing else: the part that
reads upstream and reports, never the part that writes the tree. Decided in the
grilling session of 2026-09-13, on the measured findings of three research lanes
(`/tmp/research-a-upstream.md`, `/tmp/research-b-prior-art.md`,
`/tmp/research-c-practice.md`). This repo keeps no ADR record; the decisions
below are the record.

## Problem Statement

A reader of this repo — or of the published Recreation — cannot tell whether the
copy in `served/` still matches the live site. There is no command to run, no
date to point at, and no signal to watch. That is a real gap even though the
snapshot is deliberately frozen: the piece's whole claim is "this is the site as
it stood", and a claim nobody can check is a claim nobody can defend. It also
costs something to keep: the media slots in the tree still reach the network at
runtime, so a page can rot without anyone editing it.

Detecting drift by hand is also harder than it looks, because every cheap signal
on this stack lies:

- The sitemap is an index of what upstream wants *indexed*, not of what exists.
  Today it holds 1,209 URLs, of which 13 are not live pages (10 password-gated
  test scaffolds answering 401, 3 URLs that now 301 away), while 4 live pages
  we do serve are missing from it entirely.
- `lastmod` is a **publish** stamp, not a content stamp — Webflow's own
  documentation says "last published", the per-page feature only launched
  2026-08-20, and a single bulk save re-dates 71% of the site at once (753 of
  815 blog posts share one millisecond). It does not move when a URL is
  unpublished or redirected.
- HTML carries no `ETag` and no `Cache-Control`, and `Last-Modified` is a
  Cloudflare cache-fill stamp that equals `Date − Age` on a hit and `Date` on a
  miss — so a conditional request can only ever tell us that the edge still
  holds the copy it handed us.
- The Wayback Machine has no reliably queryable coverage of this host, and CDX
  is not a changed-on service, so the past cannot be reconstructed from it.

And the obvious approach — diff the live page against our page — produces a
false positive on its first run, because our page is a deliberate lossy
transform: the strip pass removes the sign-in link, the chat launcher, the
OneTrust stack and the Qualified offer; links are rewritten; stylesheet and
script bodies are deduped; six layers are injected. The live nav's
`users.flocksafety.com` "Sign In" link is absent from our tree because we
removed it, not because we are stale. Raw bytes can never be compared.

## Solution

One hand-run command that reads upstream, compares it to what we hold, and says
what moved — without ever writing to `served/`.

It works from a **watched universe** that is the union of three sources, because
each one alone is blind in a different direction: the sitemap's `<loc>` set,
one homepage fetch (which closes the 4 live pages the sitemap omits), and the
frozen **Capture list** (which is the only source that can see a *deletion* —
a page upstream removes vanishes from the sitemap entirely).

It reports four tiers of drift: **index** (the page set moved), **liveness** (a
page we serve no longer answers 200), **content** (a page's copy changed), and
**chrome** (nav, footer or a site-wide restyle changed). Index and liveness come
from one probe pass; content and chrome come from comparing two *projections* of
the fetched body — a prose projection that must match our bytes exactly, and a
chrome projection that is expected to differ by exactly the regions we stripped.

The first run is a **silent baseline**: it records what upstream looks like and
reports nothing, so 1,209 URLs never register as 1,209 changes. Every run after
it diffs against that committed baseline, and the baseline carries the date we
last verified, so the repo can state when the copy was last known to be in
step — which today it can honestly say is 2026-09-13, the day the index was
measured identical to the frozen list.

## User Stories

1. As the maintainer of the Recreation, I want one command that tells me whether upstream has moved since the snapshot, so that I can stop guessing about a claim the piece rests on.
2. As the maintainer, I want the command to run in under a minute and cost nothing, so that "check it before a milestone" is a habit rather than a project.
3. As the maintainer, I want a committed record of when the copy was last verified in step, so that the repo states a checkable date instead of a vibe.
4. As the maintainer, I want the first run to say nothing, so that the tool's opening report is not 1,209 lines of "changed".
5. As the maintainer, I want a steady-state run to produce an empty report, so that a non-empty report is an alarm I will actually read.
6. As the maintainer, I want to learn when upstream adds a page, so that I can decide whether the snapshot's completeness matters for the piece.
7. As the maintainer, I want to learn when upstream removes a page we serve, so that I know a route we still answer no longer exists upstream.
8. As the maintainer, I want to learn when a page we serve stops answering 200, so that redirects and auth-gates upstream do not silently pass for live pages here.
9. As the maintainer, I want to learn when a served page's prose changed, so that I know our copy of that page is out of date without reading 1,181 pages.
10. As the maintainer, I want to learn when the site's chrome changed, so that a nav or footer edit on every page does not pass unnoticed because no CMS item was touched.
11. As the maintainer, I want to learn when the site's shared stylesheet or scripts changed, so that a global restyle — which no per-page field can report — is visible to me.
12. As the maintainer, I want the tool to never modify `served/`, `build-log.json` or any tree record, so that a check cannot become a second, unlogged editor of the artifact.
13. As the maintainer, I want the tool to refuse to touch the network as part of the test suite, so that `npm test` stays offline and reproducible.
14. As the maintainer, I want the tool's decisions to be a pure function of fetched bytes, so that I can test the interesting half without a network.
15. As the maintainer, I want the tool to feed it the committed tree as if it were live, and report no prose difference, so that the steady-state promise is pinned offline.
16. As the maintainer, I want the upstream-facing fetch to be hand-run rather than scheduled, so that no recurring notification is created that nobody reads.
17. As the maintainer, I want to be told when a media slot in the tree goes dead upstream, so that the one part of the Recreation that still reaches the network is covered by the same report.
18. As a reviewer of this repo, I want to see why the obvious signals were rejected, so that I do not rebuild a `lastmod`-based trigger that is known to be silent on chrome and to fire in 753-page cohorts.
19. As a reviewer, I want the watched universe's three sources named with the blind spot each one closes, so that I can tell whether a future source is worth adding.
20. As a reviewer, I want the tool's decisions recorded beside its destination, so that the frozen-snapshot rule and the watch do not look like a contradiction.
21. As the Parody layer's author, I want to know which live pages have changed since the snapshot, so that the pages I patch are the pages I actually understand.
22. As a future publisher, I want the verification date to be a fact the repo holds, so that a published claim about the snapshot's date is backed by a check rather than by the commit log.
23. As a reader of the published Recreation, I want the piece's staleness to be a known and stated fact, so that "as it stood on 2026-09-12" is honest rather than accidental.
24. As someone reading git history later, I want the retired workflow's vocabulary and its replacement to be distinguishable, so that I do not mistake the watch for a return of the refresh workflow.

## Implementation Decisions

1. **The snapshot stays frozen; the watch reports.** This is not a return of the
   capture-refresh workflow. Nothing here re-captures, rebuilds, or edits the
   tree, and "should the snapshot move?" remains a separate decision with its own
   effort. The watch exists so that decision can be made on evidence.
2. **The watched universe is a union of three sources**, each closing a specific
   blind spot: the sitemap `<loc>` set (the index upstream publishes), one
   homepage fetch (the 4 live pages the sitemap omits), and the frozen Capture
   list (deletions, which no upstream source can report). Sitemap membership is
   recorded as a field per URL, not as the universe's boundary.
3. **Liveness is measured, never inferred.** Every URL in the universe is
   probed and classified 200 / 3xx / 4xx (with the redirect target kept). A 401
   is its own class: the tree 404s auth-gated stubs by rule, so an upstream 401
   is expected divergence and not a finding.
4. **`lastmod` is never a verdict.** It may be reported as context, and it may
   narrow a candidate list, but no finding is derived from it. Measured reasons:
   it is a publish stamp, it fires in bulk cohorts, and it is silent on chrome.
5. **Two text projections, not one.** A **copy projection** — the prose the
   Recreation reproduces — must match the served page exactly; a **chrome
   projection** — header/footer/nav text — is expected to differ by exactly the
   stripped regions and is reported against an allow-list named after the strip
   table's own 11 targets. Splitting them is what makes a steady-state report
   empty: `copy` carries the hard findings, `chrome` carries the soft ones. This
   split is a hypothesis and ticket 02's measurement decides the allow-list's
   real scope.
6. **The restyle case gets its own signal.** A content hash of the site-wide
   stylesheet and script set, which is small and shared, so a global restyle is
   visible even when every page's text is unchanged. Per-page HTML is never
   hashed raw: asset filenames carry build hashes, so a raw hash would fire on
   every publish and teach us to ignore the report.
7. **Live bytes are never compared to served bytes.** The only legitimate
   live-versus-ours comparisons are the path set, the status, and the two text
   projections. Raw-byte comparison is banned because the tree is a deliberate
   lossy transform; the reasons belong in the module's header so nobody
   reintroduces it.
8. **One pure core, one thin network edge.** Everything the watch decides is a
   pure function of fetched bytes: the sitemap body, the homepage body, a map of
   path to probe result, and the previous baseline. The network edge only
   fetches and prints. This is the shape the retired ops tools were reviewed
   for, and it is what makes the whole thing testable offline.
9. **State is one committed baseline; evidence is stdout.** The baseline file
   holds one row per watched URL — path, sitemap membership, status, redirect
   target, and the projection digests — plus the date the run verified. Only an
   explicit `--accept` rewrites it, so a check cannot silently move the
   reference point. Run output goes to stdout and is optionally saved with
   `--out`.
10. **The first run is a silent baseline.** With no baseline present, the run
    records and reports nothing but the count. This mirrors the prior art and is
    the whole reason the tool's opening report is readable.
11. **Exit codes are the interface for a hand-run tool.** Zero means no
    findings, one means findings, two means the run failed operationally (a
    fetch error, an unparsable sitemap). Human output by default, `--json` for a
    machine-readable report.
12. **The tool lives with the checks**, not with the serving rules: it is a
    verification of upstream rather than a rule the serving layer and the checks
    share, and `regression/` is where the checks already are. The pure parts come
    under the existing `checkJs` project; the network driver stays hand-run and
    is never wired into the test suite.
13. **Media liveness is a second check in the same watch**, built after the
    index-and-content half lands, and producing the same staleness report. It
    needs different machinery (the media hosts' own metadata) so it stays
    separable, and it covers the one class of rot a page edit cannot explain:
    the media slots the allow-list lets reach the network at runtime — 91 frames
    across 74 pages, per the README — where a media that dies upstream leaves a
    dead player on a page nobody edited.
14. **New vocabulary goes into the glossary**: *upstream watch*, *watched
    universe*, *copy projection*, *chrome projection*, *silent baseline*,
    *verified-in-sync date*. The frozen-snapshot entry stays as it is; the watch
    does not alter it.
15. **Docs carry the result, not the machinery.** A "last verified in step"
    line beside the snapshot's provenance, and a reviewable rule that the check
    runs before a milestone or a publish. No cron, no CI job, no notification
    channel.
16. **Cadence is deliberate, not automatic.** A full pass is 17.4 seconds and
    42 MB measured, and upstream did not rate-limit at concurrency 8, so the
    cost argument for a schedule does not exist; the argument against an unread
    recurring issue does.

## Testing Decisions

Good tests here assert what the watch *reports*, given fetched bytes — never how
it fetches, parses or formats. The inputs are the four things the core receives
(sitemap body, homepage body, probe map, previous baseline); the output is the
finding list and the new baseline. No test touches the network, and no test
asserts on stdout text.

The whole design resolves to **one seam**: the pure core, called as a function.
It is exercised two ways — with small fixtures that pin each decision, and with
the committed tree fed in as if it were live. The second is what makes the
steady-state promise a test rather than a hope, and it needs no network because
the tree is already on disk.

| Seam | Subject | Where |
|---|---|---|
| The pure watch core | universe union, status classification, the four finding tiers, baseline arithmetic, the silent first run | new pure-module test beside the existing five |
| The pure watch core, tree-fed | every served page's copy projection equals its own served bytes, so steady state is empty | same test file, over the committed tree |
| The projection | copy versus chrome extraction, in both directions | new pure-module test, same file or beside it |

The network driver is deliberately untested by the suite — it is a hand-run ops
tool, as the retired ones were — and its correctness is checked by the
serving-time discipline the repo already uses: run it, read the report, commit
the baseline with a message that says what the run found.

Prior art for the shape: the retired `test/inventory.test.ts` /
`test/inventory-diff.test.ts` (pure cores with injected I/O, network drivers
hand-run), and the current five pure-module seams named in `CODING_STANDARDS.md`.

## Out of Scope

- **Re-capturing, rebuilding, or editing the tree.** The build stays retired and
  `served/` stays frozen. If the watch ever justifies a refresh, that is its own
  effort; the capture flag set, the image provenance and the reason the Docker
  half was expensive are in `README.md` and git history, and SingleFile is
  AGPL-3.0 with a real-browser dependency — a licensing question that effort must
  settle before anything else.
- **A scheduled or CI-triggered run.** No cron, no Action, no issue-opening.
- **The Wayback Machine as a baseline source.** Measured: not reliably queryable
  for this host, and not a changed-on service.
- **`lastmod`-based detection.** Ruled out by measurement, not by preference.
- **Retroactively determining whether upstream moved between 2026-09-12 and the
  first run.** The signals that could have answered it are gone; the honest
  statement is a verification date, not a claim about the past.
- **Comparing live bytes to served bytes**, in any form.
- **The Parody layer.** The watch reports; it does not patch, and it has no
  relationship to the story-hook seam beyond both reading the same tree.

## Further Notes

- **This effort has no ADR record**, because the repo keeps none: decisions live
  in this file, and what binds longer-term folds into `README.md`,
  `CONTEXT.md` and `CODING_STANDARDS.md`, the way the scrapped ADRs' content was
  folded in (`git show 968277b`).
- **What was measured, and when.** 2026-09-13: the live site answered 200 on
  exactly the 1,200 URLs of the frozen Capture list, zero added and zero removed,
  with the newest `lastmod` anywhere being 2026-09-04 — eight days before the
  freeze. That measurement is this spec's evidence and the baseline's starting
  point; it is also the run that would have been silent had the tool existed.
- **The false positive worth remembering.** The live nav's `users.flocksafety.com`
  sign-in link reads as drift against our tree and is not: the retired strip
  table removes it by class, and `build-log.json` logs it at 1,404 bytes on the
  homepage. Any future "live vs ours" idea must answer that case first.
- **The unlisted four.** `/newsletter`, `/supplier-registration`,
  `/reduce-guard-cost-calculator` and `/blog/what-is-traffic-analytics` are live,
  served by us, and absent from upstream's sitemap. They are why the universe is
  a union rather than the sitemap alone, and why "in the sitemap" is a field
  rather than a filter.
- **The stale three.** The sitemap advertises three URLs that now 301. All three
  are already in our redirect table pointing exactly where live points, so they
  are confirmations of correct behaviour, not findings — a useful worked example
  for the reporting shape.
