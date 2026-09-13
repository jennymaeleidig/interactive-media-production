# 05 — The restyle signal

Status: open
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

- [ ] the shared asset set is discovered from a live page's own references and is
      small enough to fetch in the same pass
- [ ] the digest is over asset bytes, not asset URLs, so build-hashed filenames
      alone never produce a finding
- [ ] a fixture where one stylesheet's bytes change produces exactly one finding,
      naming that asset
- [ ] the finding is chrome-tier and distinguishable from a per-page chrome
      finding
- [ ] the asset set and its digests are recorded in the baseline
- [ ] pinned in the pure watch seam's vitest project, and `npm test` stays offline
