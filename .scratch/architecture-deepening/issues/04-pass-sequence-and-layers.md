# 04 — The pass sequence gets a module, and a layer becomes a record

Status: resolved
Blocked by: 02, 03

## What to build

Review candidate 3. The build's real behaviour is the *order* of fourteen calls
carried by position and prose (`pipeline/build.mjs:1196–1243`), and a "layer" is
five hand-maintained places: the pass function, its `*_INJECTED` constant, the
marker literal, `test/pipeline.test.ts:19–36` (eleven `readFileSync` calls and
`INJECTED_BYTES`), and a vitest project (`vitest.config.ts:23–95`). Section
banners number passes 13 then 10, 10b, 11, 14; `legibilityPass` has no banner;
the file header still documents a retired pass 2.

Create the pass-sequence module (the ordered passes with their preconditions
named) and a layer table (`{name, marker, css, runtime, mount, grants}`) with one
mount operation. The build, the injected-bytes accounting, the audit's marker
census, and the six seam harnesses read the same records.

The reduced-motion read is written four times across
`pipeline/{motion,interactions,nav,scroll}-runtime.js`; if a shared runtime
primitive is extracted it must ship inside the same injected bytes.

## Acceptance criteria

- [x] The pass order and its preconditions live in one module; the three
      numbering sequences become one.
- [x] A layer is one record; `layerTag` / `injectBeforeClose` take it.
- [x] The injected-bytes accounting and the "six markers" assertion derive from
      the table, not from hand-written constants.
- [x] A new layer can be added as one record (proven by a test that mounts the
      table and counts the markers).
- [x] Fixture output byte-identical (`.tmp/golden` diff empty).

## Comments

Two new plain-ESM modules, following the `html.mjs`/`csp.mjs` precedent:

- `pipeline/passes.mjs` — the ordered passes (`n`, `name`, `summary`) with the
  preconditions that make the order load-bearing (`after`, and `before` with a
  `why`). The build iterates it and dispatches through `PASS_IMPL`, a table in
  `build.mjs` keyed by pass name that holds the implementations (they need the
  build's own helpers and per-page state). The three competing sequences are
  gone: the file header's pass list is now a pointer to the table, the section
  banners carry no numbers, and `build.mjs` checks at import that `PASS_IMPL`
  and `PASSES` name the same passes. (This ticket fixed the two `pass 14`
  references inside `dedupeTree`; a review follow-up then moved the rest of the
  tree — `CODING_STANDARDS.md`, the pipeline comments, the tests, ADR 0003, the
  README — onto "the dedupe pass" too, so no number outside `passes.mjs` can
  drift again.)
- `pipeline/layers.mjs` — one record per injected layer: `name` (the marker),
  `label` (the mutation-log line), `parts`, `css`/`runtime` files, `mounts`, and
  `grants`. `injectBeforeClose`/`layerTag`/`mountLayer`/`grantLayer` take the
  record; `readLayerBodies` reads every inline file once; `layerFile` hands the
  six runtime seam harnesses their source path. `audit.mjs`'s census reads
  `MARKER_RE` from here, so a marked tag's provenance is one definition.

The reused `chatPass`/`legibilityPass` mount predicates are unchanged behavior:
`chat` mounts on `entry.chatLauncher`, `legibility` on a `LEGIBILITY_PATCHES`
entry for the page. The chat CSP grant moved from a hand-written
`grantConnectSelf` into the chat record's `grants`, producing the same
`connect-src 'self' (chat mount)` log line and the same warnings.
Evidence: `.tmp/golden` diff empty (24-file tree, byte for byte, plus an
identical mutation log); full suite 362 tests green in 21 files; `tsc --noEmit`
clean.
