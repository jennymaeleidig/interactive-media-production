# 01 — One owner for the marked bytes

Status: resolved
Blocked by: none

## What to build

A module `pipeline/injected-layers.mjs` that owns the Recreation's marked bytes:

- declares the seven marked members and each one's delivery form (css asset,
  inline css, js asset, or none) and its maintained source path;
- reads a page's marked members from its HTML, in document order, resolving each
  to the bytes it names (an `/assets/<name>` reference, or an inline body);
- compares those bytes with the maintained source and reports findings —
  `code drift` (fatal) and `prose drift` (reported, non-fatal);
- reports a declared member missing from a page, and a marked member the roster
  does not declare.

Restore `LEGIBILITY_PATCHES` to `pipeline/config.mjs` (recovered verbatim from
`d8e0d6e^`) so the `legibility` member has a source again.

The module is plain JS (`.mjs`) because the serving check (plain JS) and the
seams (TS) both read it — the same reason `pipeline/served-tree.mjs` gives.

## Acceptance criteria

- [x] `pipeline/injected-layers.mjs` exports the declared roster, a page reader,
      a byte reader, and the mirror/roster findings as pure functions
- [x] the asset reader is a parameter, not a disk call, so the module is pure
- [x] `pipeline/config.mjs` carries `LEGIBILITY_PATCHES` with the `/safe-cities`
      rule the tree actually ships (67 bytes)
- [x] `test/injected-layers.test.ts` pins the roster, the delivery forms, the
      observed order, an undeclared member, a missing member, code drift, and
      prose drift
- [x] every one of the ten asset-backed pairs plus `scroll`'s inline style plus
      `legibility`'s inline style reports its true state against the tree
- [x] `regression/routes.mjs` folds the per-page roster check and the mirror
      check into the loop it already runs, so `npm run routes` fails on drift
- [x] `test/serving.seam.test.ts` no longer owns the mirror: its two `codeOf`
      comparison blocks and the `layerTag`/`assetName` helpers go, keeping the
      HTTP facts (200, content-type, CSP, marked stand-in externalised)
- [x] the failure of the check names the member and the kind of drift
