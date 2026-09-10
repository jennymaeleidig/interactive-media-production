# 03: Story-hook seam

**What to build:** A dormant DOM-patching seam on every served page. The runtime is injected by the build and exposes a single global function that applies a list of selector-targeted patches — text, html, src, or style. It preserves array order, skips missing selectors without throwing, returns how many patches applied, queues safely if called before the DOM is ready, and never makes a network request. It ships inert: nothing in the Recreation calls it; the Parody layer will.

**Blocked by:** 01.

**Status:** open
Label: ready-for-agent

- [ ] Applying a patch list mutates the DOM for each supported operation.
- [ ] Patch order is honored; later patches see earlier effects where selectors overlap.
- [ ] Missing selectors are skipped with a debug message and never throw.
- [ ] The function returns the number of patches applied.
- [ ] Calls made before DOM-ready are queued and applied once ready.
- [ ] The seam performs no network access.
- [ ] It is present on every served page and dormant (uncalled) in the Recreation.
