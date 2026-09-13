# Frozen snapshot

The Recreation is final: it reproduces flocksafety.com as it stood on
2026-09-12 and does not follow the live site. The always-match-upstream policy
and the refresh workflow that served it — re-inventory, drift diff, scoped
re-capture, and the upstream video-liveness probe — are retired; the build and
`served/` stay as the recipe and the artifact.

Decision: [ADR 0004](../../docs/adr/0004-frozen-snapshot-no-upstream-sync.md).
