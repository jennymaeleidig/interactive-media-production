# 05 — Compose the layers in one window

Status: resolved
Blocked by: 01

## What to build

No seam ever puts two layers in one document, so the composition they share —
four document-level click listeners, the `<html>` class space, and the dialog
scroll owns — is asserted nowhere. Its order is pinned only by the frozen page
bytes.

Build a composed seam that loads a real served page, installs every marked
member it carries into one jsdom window in the page's own order, and asserts:

- the document-level click listeners register in the page's order
  (`interactions`, `nav`, `nav`, `scroll`);
- the layers' `<html>` class writes coexist;
- the dialog `scroll` owns is not claimed by another layer;
- `interactions`' `defaultPrevented` guard still defers to an element-level
  handler that ran earlier in the bubble path.

`safe-cities.html` is the page: it is the only one carrying all seven marked
members, and the only one with a `<dialog>`.

The seam reads the page and its member order through ticket 01's module.

## Acceptance criteria

- [x] `test/composition.seam.test.ts` runs over the committed
      `served/safe-cities.html`, not a hand-built miniature
- [x] it installs all seven marked members into one window
- [x] it asserts the four document click listeners' registration order
- [x] it asserts `defaultPrevented` precedence against an element-level handler
- [x] it asserts the `<html>` class space and dialog ownership
- [x] a reordered or missing member fails the seam
- [x] added to `vitest.config.ts` as its own project, like the other seams

## Correction (measured while implementing)

- The document click listeners register `interactions`, `scroll`, `nav`, `nav` —
  not the `interactions`, `nav`, `nav`, `scroll` written above. `nav` defers its
  document listeners to `DOMContentLoaded`, so they land after `scroll`'s even
  though nav's script tag ships third. The seam pins the measured order.
- "Installs all seven marked members" means: all seven names are asserted
  present in page order, every **script** part is evaluated into the window, and
  the style parts (the asset stylesheets, the inline `scroll` style, the 67-byte
  `legibility` patch) are already in the jsdom document as the marked tags the
  tree ships. No CSS bytes are evaluated, because no assertion depends on them.
- Order is reported, not fatal: `mirrorFindings` records a page out of roster
  order as a note (`spec.md`, decision 3 — "reported, not corrected"), so "a
  reordered or missing member fails the seam" holds only for a *missing* member.
  The composed seam pins the listener registration order that ordering produces.
