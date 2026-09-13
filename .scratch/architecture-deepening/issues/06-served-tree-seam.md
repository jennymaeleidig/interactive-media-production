# 06 — One seam owns the served-tree rules

Status: resolved
Blocked by: none

## What to build

Review candidate 4. The rules that keep a request inside the served tree are
written three times in three tiers: the candidate order in
`app/[[...path]]/route.ts:22–27` and again in `regression/routes.mjs:143–163`
(whose own comment says it "Mirrors `app/[[...path]]/route.ts`"); the traversal
guard in `app/[[...path]]/route.ts:24–27` and again in `lib/serving.ts:33–45`;
the local-target predicate in `app/api/forms/[...key]/route.ts:31` and again in
`pipeline/run-manifest.mjs:65` (which `lib/serving.ts` imports). `lib/serving.ts`
also reaches into the build tier for `mimeForExt` and `isLocalTarget`.

Deepen `lib/serving.ts` into the served-tree seam: one resolution operation, the
guards on the seam, the extension → content type table owned by the serving tier.
The page route reads through it, the forms route uses the predicate, and the
serving check enumerates through it.

## Acceptance criteria

- [x] One candidate-order rule; the check imports it (no "Mirrors …" comment).
- [x] One traversal guard.
- [x] The forms route calls the shared local-target predicate.
- [x] The serving tier does not import build internals (the mime table moves to
      the serving tier, or is re-exported through it).
- [x] `npm run routes` green against the frozen `served/` tree (unchanged bytes).
- [x] `CODING_STANDARDS.md` "Stack & layout" updated.

## Comments

The rule both tiers need has to be plain JavaScript — `regression/routes.mjs`
cannot import `lib/serving.ts` — so it went to `pipeline/served-tree.mjs`,
following the precedent CODING_STANDARDS already blesses for
`pipeline/run-manifest.mjs` (a cross-tier seam both layers import).

`mimeForExt` turned out to be a cleaner move than the ticket assumed: the build
never calls it (`extForMime`, its inverse, is the build's half and stays in
`pipeline/assets.mjs`), so it existed only for the two things that answer a
request for the bytes. It now sits with the rest of the served tree's rules,
which also stops the serving tier importing the asset-extraction core.

Evidence: `npm run build` then `npm run routes` green against the frozen tree
(1,290 routes, 1,181 byte-identical pages, 3,118 assets with their declared
content type); `.tmp/golden` tree and log identical; 341 tests green in 18 files;
`tsc --noEmit` clean.
