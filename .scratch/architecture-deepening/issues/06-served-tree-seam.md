# 06 — One seam owns the served-tree rules

Status: open
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

- [ ] One candidate-order rule; the check imports it (no "Mirrors …" comment).
- [ ] One traversal guard.
- [ ] The forms route calls the shared local-target predicate.
- [ ] The serving tier does not import build internals (the mime table moves to
      the serving tier, or is re-exported through it).
- [ ] `npm run routes` green against the frozen `served/` tree (unchanged bytes).
- [ ] `CODING_STANDARDS.md` "Stack & layout" updated.
