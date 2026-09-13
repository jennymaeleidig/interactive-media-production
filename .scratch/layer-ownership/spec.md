# Layer ownership

The Recreation's injected layers are the only bytes in `served/` that are *ours*
rather than the Capture's. They are also the bytes with no owner: each exists
twice (a maintained source in `pipeline/`, a content-addressed copy in
`served/`), nothing verifies the pair, the one rule that governs an injected
source is copied into five places, the chat turn shape is declared four times,
each layer's reduced-motion policy is invisible to the seam that should pin it,
and the six layers are never composed in one window by any test.

## Destination

One owner for the marked bytes: the roster, each member's delivery form, its
order in a page, and its maintained source all resolve through one module. The
zero-outbound rule for an injected source has one home, the turn shape has one
declaration, each layer's reduced-motion policy is named and pinned, and the
layers' composition in one served document is a test surface.

## Decisions

Settled in the grilling session of 2026-09-13.

1. **Marked bytes are publishable; captured bytes are frozen.** The
   `data-flock-parody` marker is what tells our bytes from the Capture's, so a
   future publish tool operates only on marked tags — no upstream reach, no
   capture dependency, and the Frozen snapshot decision is untouched.
2. **A publish preserves content-addressing.** New bytes mean a new
   `/assets/<sha16>` name and a rewrite of the pages carrying that member. It is
   a deliberate, rarely-run, documented write that owns the record files it
   invalidates (delete the superseded asset, regenerate `assets.json` from the
   directory, leave `build-log.json` stale and say so). It is **not** built in
   this effort: nothing needs a republish, and the one gap it would have covered
   (legibility) is a *missing source*, not a changed byte.
3. **The roster is declared; the order is observed.** The module declares the
   marked set (so a vanished member fails), and derives order and asset names
   from the page (so the tree stays authoritative about what a browser does).
4. **The roster is seven marked members, not six.** The six site-wide layers are
   `motion`, `interactions`, `nav`, `chat`, `story-hook`, `scroll`; the seventh
   is `legibility`, page-scoped to `/safe-cities`. Delivery forms differ and are
   part of the roster: asset-backed CSS, inline CSS, asset-backed JS, no style.
5. **`legibility` gets its source back.** It was pass 12 of the retired build,
   driven by `config.LEGIBILITY_PATCHES`, which the retire commit deleted and so
   orphaned a shipped byte. Restoring the constant restores the source; no
   `served/` byte changes.
6. **Prose drift is a named finding, not silence.** The mirror compares bytes and
   reports comment-only drift as a distinct, non-fatal finding. Every pair
   currently drifts this way (measured), and the old comparator folded comments
   away to tolerate it.
7. **The zero-outbound rule gets a module**, justified by invariant ownership:
   the Media allow-list half is `audit.mjs`'s; the injected-source half is
   nobody's.
8. **`chat · none` is fidelity.** The captured widget had no reduced-motion path,
   so the mimic matches it. The reduced-motion promise belongs to
   *capture-derived* motion, not to every layer.
9. **`pipeline/` is typechecked in place** (`checkJs` over `pipeline/**`), so the
   one reader that hand-narrows the turn shape stops drifting green. No build
   step, no runtime change.
10. **The composition is a test seam now, a composed runtime later.** Six
    working runtimes are not rebuilt to pin an order that one composed seam can
    assert.

## Testing decisions (the pre-agreed seams)

| Seam | Subject | Where |
|---|---|---|
| The marked-member module's interface | roster, delivery forms, observed order, mirror findings | `test/injected-layers.test.ts` (pure: page HTML + a stubbed asset reader) |
| The zero-outbound rule | injected sources reference no network primitive | `test/injected-source.test.ts` (pure) |
| The serving seam over HTTP | status, content-type, CSP, marked stand-in present and externalised | `test/serving.seam.test.ts` (kept, shrunk) |
| The serving check | every served page carries the declared members, and each member's bytes match its source | `regression/routes.mjs` (`npm run routes`) |
| The turn shape | the shape is declared once and every reader derives from it | `npm run typecheck` (`tsconfig.checkjs.json`) |
| Each layer's reduced-motion policy | the policy the layer actually holds | that layer's existing `*.seam.test.ts` |
| The composition | order of the document click listeners, `<html>` class writes, dialog ownership | `test/composition.seam.test.ts` (over `served/safe-cities.html`) |

The DOM seams continue to drive the layer's own bytes; the composed seam drives
all seven members over one real served page.

## Out of scope

- **The `file:` absolute dependency** (`package.json:28`) — becomes an npm
  dependency; yarnspinner-ts is a local checkout for now.
- **The publish CLI** — designed (decision 2), deferred until a member actually
  changes.
- **A composed runtime** — revisit once publishing is real.
