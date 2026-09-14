# 05 — The restyle signal

Status: resolved
Blocked by: 01

## What to build

A global restyle is invisible to every other signal: no page's text changes, no
CMS item is edited, and a per-page HTML hash cannot help because Webflow's
stylesheet and script filenames carry build hashes that change on every publish
(`flocksafety-staging.shared.5697e783c.min.css`). So the watch fetches the site's
shared stylesheet and script set — small, and shared across every page — and
records a content digest of it.

A changed digest is a chrome-tier finding: the site's presentation moved, and
every served page is potentially out of date with it. The finding names the
changed asset and its size, not a diff. The digest is over the asset's bytes, so
a republish that changes a filename but not its content is not a finding.

## Acceptance criteria

- [x] the shared asset set is discovered from a live page's own references and is
      small enough to fetch in the same pass
- [x] the digest is over asset bytes, not asset URLs, so build-hashed filenames
      alone never produce a finding
- [x] a fixture where one stylesheet's bytes change produces exactly one finding,
      naming that asset
- [x] the finding is chrome-tier and distinguishable from a per-page chrome
      finding
- [x] the asset set and its digests are recorded in the baseline
- [x] pinned in the pure watch seam's vitest project, and `npm test` stays offline

## Comments

**Status: resolved.** Hand-off and close are the same state
(`docs/agents/issue-tracker.md`); this ticket-close commit carries the ticked
boxes and this note. Commits: `cc6f6a8` — "Add the shared-asset restyle signal
(ticket 05)" — and `6005daa` — "Fix the ticket 05 two-axis review findings".

**What was built.** `regression/upstream-assets.mjs` is new and owns the tier as
pure functions: `assetRefs(html, pageUrl)` parses one page, reads
`<html data-wf-site>`, and keeps every stylesheet `<link>` and script
`<script src>` whose resolved path lies under `/<site-id>/`; `assetDigest(bytes)`
is a 16-hex SHA-256 over the bytes; `assetReport(assets, previousAssets)` digests
each fetched asset and reports one whose digest the previous baseline does not
hold, recording `{name, url, digest, bytes}`. `runWatch` gains an optional
`assets` input, sets `report.chrome.restyle`, and records `baseline.assets`; the
CLI discovers from the live homepage, fetches the set with `mapLimit`, and fails
the run (exit 2) on a fetch error or an empty discovery.

**Where the discovery rule lives, and what it cannot see.** `assetRefs` in
`regression/upstream-assets.mjs`; the module header states the rule and the
blind spots. It reads a single page (the live homepage), so a shared asset that
page does not reference is invisible; it needs the `data-wf-site` attribute; it
sees only stylesheet `<link>`s and script `src`s, not `@import`/`url()` or
`as=style` preloads; it matches by digest only, so a bare removal — a digest that
disappears with no replacement — sets no finding; and the filter checks the
pathname prefix only, not the host.

**The measured set (2026-09-14).** The live homepage carried 27 references; 4
are under the site id — the shared CSS (945,868 bytes) and three site JS bundles
(974,790 / 41,429 / 279,929). They are recorded in
`regression/upstream-baseline.json`.

**The chrome baseline digest — the deliberate decision.** Yes, a live chrome
digest joins the baseline row, the deferral ticket 04 recorded. It holds the
digest of the live page's allow-list-masked chrome runs (`chromeDigest` in
`regression/upstream-chrome.mjs`). Why: it gives the chrome tier its own "moved
since the last accepted baseline" signal in `since.changed`, matching ticket
03's copy digest; and its reference point is different from the
live-versus-served comparison — the tier compares served to live *now*, the
digest compares live to live-at-the-last-accept. Adding it is a one-time field
addition absorbed by the re-accept this ticket needed anyway.

**The baseline re-accept.** `regression/upstream-baseline.json` was re-accepted
against live with `npm run upstream -- --accept`; the verified date is now
`2026-09-14`. No status, `location`, `inSitemap` or copy digest moved — 1,181
rows gained a `chrome` digest and the file gained the four `assets` records.
`test/upstream-baseline.test.ts` updates the date and the root-row expectation
and adds the asset/chrome assertions.

**Box 4 — chrome-tier yet distinguishable.** In the report shape the restyle tier
is nested under `report.chrome.restyle`
(`{compared, differed, findings: [{name, url, bytes}]}`), separate from
`report.chrome.findings` (per-page `{path, hunks}`). In the printed output the
chrome block reads `restyle (chrome tier, shared assets): N compared · M changed`,
and the findings are their own labeled block, `restyle findings (chrome tier, not
per-page) — shared asset bytes that moved:`. `reportMoved` counts both, so a
restyle sets exit 1.

**Seams tested** (`test/upstream-assets.test.ts`, new `upstream-assets` vitest
project, plus extensions in the baseline and chrome tests, no network): discovery
keeps only site-directory stylesheets/scripts, returns nothing without a site id,
resolves and dedupes; the digest is over bytes (same bytes → same digest, a URL
change alone is silent, one changed stylesheet → exactly one named finding with
its size); the silent first run records the asset set with no finding and a plain
run reports a change as one chrome-tier finding with exit 1, distinct from a
per-page finding in shape and print; the baseline round-trips and validates
`assets`; the committed baseline carries 1,181 chrome digests and the 4 asset
records.

**Review findings, two axes vs fixed point `a4e5136`.** Standards — fixed:
duplicated digest line (`projectionDigest` extracted; `copyDigest`/`chromeDigest`
delegate); duplicated URL comparator (`byAssetUrl` exported and reused);
`baselineFromReport`'s two same-shaped digest maps plus the asset list bundled
into one options object so a copy/chrome transpose is a type error. Rejected: the
CC0-1.0 finding (`test/upstream-assets.test.ts` already carries the SPDX line);
the Data Clumps across `AssetRef`/`FetchedAsset`/`AssetRecord` (three distinct
roles — discovered reference, fetched bytes, recorded digest — and collapsing
them loses meaning); the Divergent Change in `upstream-baseline.mjs` (the
baseline module owns the committed file's schema by ticket 02's design; moving
asset validation out would scatter the schema). Spec — fixed: an empty discovery
was digested as a clean run and could `--accept` an `"assets": []`, erasing the
recorded set (now an operational failure, exit 2); the `chromeDigest` rationale
misstated the control flow (reworded); the discovery header's third-party claim
overstated the path-only filter (reworded). Rejected: none. The remaining spec
note — the ticket not yet closed — is this commit.

**Verification.** `npm run typecheck` clean; `npm test` 21 files / 348 tests
green and offline; `npm run build` succeeds. CLI smoke-tests via fetch
interception (edge, not in the suite): an asset fetch answering 500 exits 2 with
the asset URL and no baseline write; a homepage without `data-wf-site` exits 2
("discovered no shared assets"). A live plain run after the re-accept reports
`since.changed: 0` and `chrome.restyle {compared: 4, differed: 0}`.
