# 04 — The pass sequence gets a module, and a layer becomes a record

Status: open
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

- [ ] The pass order and its preconditions live in one module; the three
      numbering sequences become one.
- [ ] A layer is one record; `layerTag` / `injectBeforeClose` take it.
- [ ] The injected-bytes accounting and the "six markers" assertion derive from
      the table, not from hand-written constants.
- [ ] A new layer can be added as one record (proven by a test that mounts the
      table and counts the markers).
- [ ] Fixture output byte-identical (`.tmp/golden` diff empty).
