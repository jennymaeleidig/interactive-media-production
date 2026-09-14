# 01: Repoint the yarnspinner dependency to the published package

**What to build:** The repository's direct dependency on `yarnspinner-typescript`
points at a published npm release instead of an absolute local checkout, so a
fresh clone or a CI runner can install dependencies and the full suite runs
against the published package. The chat engine's imports — the root import and
the `node` subpath loader — keep working with no code change.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `package.json` and the lockfile name `yarnspinner-typescript@1.0.0` from
      the registry; no `file:` dependency remains anywhere in the manifest or
      lockfile.
- [x] `yarnspinner-vite-plugin` is added only if something imports it; a search
      of the source shows nothing does, so it is not added.
- [x] On a machine without the sibling checkout, `rm -rf node_modules && npm ci`
      completes.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass against the
      published tarball.
- [x] The chat message API seam still passes, proving the `node` subpath
      (`loadYarnProject`) resolves from the published package.

## Comments

Implemented and verified. `package.json` now declares
`"yarnspinner-typescript": "^1.0.0"`; the lockfile entry resolves to
`https://registry.npmjs.org/yarnspinner-typescript/-/yarnspinner-typescript-1.0.0.tgz`
and the old `../yarnspinner-ts` link entry is gone.

Note on the repoint mechanics: the first `npm install` after the specifier
change kept the old symlink, because the linked package's version (1.0.0)
satisfied `^1.0.0` and npm treated the lockfile link as current. A clean
`npm uninstall yarnspinner-typescript && npm install yarnspinner-typescript@^1.0.0`
was needed to drop the link and resolve the registry tarball; a bare
`rm -rf node_modules && npm install` did **not** dislodge it.

Evidence, all on the `npm ci` state (after `rm -rf node_modules`):

- Published tarball API parity: `diff -r --exclude=tests --exclude='*.map'`
  between the sibling checkout's `dist/` and the installed registry `dist/`
  reports no differences — the two are byte-identical for every shipped file
  (the only extra files locally are `dist/tests/*`, which the package's `files`
  allow-list excludes). Same `exports` map (root + `./node`) in both.
- `rm -rf node_modules && npm ci` completed; installed 1.0.0 from the registry
  as a real directory.
- `npm run typecheck` clean (`tsc --noEmit` + `tsc -p tsconfig.checkjs.json`).
- `npm test` — 23 files, 422 tests passed. `test/chat.seam.test.ts` (16 tests)
  and `test/chat-widget.seam.test.ts` (18) exercise the API seam and the
  `loadYarnProject` `node` subpath directly.
- `npm run build` — `next build` succeeded.
- `grep` for `file:` / `../yarnspinner-ts` across `package.json` and
  `package-lock.json`: none.

Docs: removed the sibling-checkout caveat from `CODING_STANDARDS.md`'s
Environment constraints (and the "one dependency caveat" parenthetical in the
suite-against-the-committed-tree rule), and named the published package in
`CONTEXT.md`'s **Chat mimic** entry. No `served/` bytes changed, so
`npm run routes` was not needed.

Left deliberately out of scope: `.pi/sandbox.json` still allow-lists
`~/Documents/projects/interactive-media/yarnspinner-ts` for agent reads. That is
an agent read-allowance, not a dependency, and does not affect `npm ci` on a
fresh clone; it can be dropped independently if the sibling is no longer used
at all.
