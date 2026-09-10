# 03: Story-hook seam

**What to build:** A dormant DOM-patching seam on every served page. The runtime is injected by the build and exposes a single global function that applies a list of selector-targeted patches — text, html, src, or style. It preserves array order, skips missing selectors without throwing, returns how many patches applied, queues safely if called before the DOM is ready, and never makes a network request. It ships inert: nothing in the Recreation calls it; the Parody layer will.

**Blocked by:** 01.

**Status:** resolved
Label: ready-for-agent

- [x] Applying a patch list mutates the DOM for each supported operation.
- [x] Patch order is honored; later patches see earlier effects where selectors overlap.
- [x] Missing selectors are skipped with a debug message and never throw.
- [x] The function returns the number of patches applied.
- [x] Calls made before DOM-ready are queued and applied once ready.
- [x] The seam performs no network access.
- [x] It is present on every served page and dormant (uncalled) in the Recreation.

## Comments

**Implemented** (commit on `main`, ticket 03):

- **Runtime** `pipeline/story-hook.js`: `window.flockParody.apply(patches)` — lifted from the proven snapshot-serving prototype (wayfinding ticket 05, contract ratified there) and cleaned to repo standards. Patches `{selector, text | html | src | style}`: textContent, innerHTML, src attribute, camelCase style merge. Array order; a patch counts as applied when its selector resolves (first match); missing selector → `console.debug` + skip, never throws; non-array/empty → 0. Called while `document.readyState === 'loading'`, the list queues and drains at DOMContentLoaded (apply returns 0 while queued). DOM-only: the seam references no network primitive — the zero-outbound invariant (test-enforced primitive list).
- **Injection pass (pass 4)** in `pipeline/build.mjs`: reads the runtime once, inlines it verbatim and marked (`<script data-flock-parody="story-hook">`) before `</body>` — or at EOF on truncated captures, with the write pass still restoring the closing tags after it. Logged per page as `entry.injected = ['story-hook seam (inline, dormant)']`.
- **Census aware of injected runtimes**: `scripts` now carries an `injected` count (the marked runtime); `executable` still counts only capture-derived scripts and must stay 0 — the audit invariant's meaning is unchanged, now with the Recreation's own runtime visible separately.
- **Tests (58, green)**: new story-hook DOM seam project (`test/story-hook.seam.test.ts`, 13 tests) drives the exact injected bytes in jsdom — every op, undefined-valued ops treated as absent, order (a later patch targeting DOM an earlier patch created), missing-selector skip with the debug note observed on a captured virtual console, return count, the queue path pinned against the *real* DOMContentLoaded (jsdom `beforeParse`, readyState `loading`), one-global leak check, dormancy (installed and left alone it mutates and logs nothing), no-network static check. Pipeline tests: verbatim inline injection on every fixture page, inside-`<body>` placement, per-page log, census shape `{executable: 0, injected: 1}`, growth bounded by the injected runtime (stripping never adds bytes). HTTP seam: the seam rides every served page, capture-derived bytes never mention `flockParody`, served runtime bytes reference no network primitive.
- **Real-run verified**: `npm run pipeline` 8/8 subset pages — audit clean everywhere, census `0 executable / N ld+json / 1 injected` per page, homepage carries the runtime verbatim inside `<body>`, and no capture-derived byte references the seam. The two DOM seams together cover presence: the served bytes are byte-identical to the runtime the DOM seam tests execute (real-browser render is the pixel gate's job, ticket 06).
- One assertion replaced in `logs every mutation per page`: `bytesIn > bytesOut` no longer holds on the miniature fixture (the 2.6KB runtime outweighs what the tiny fixture loses to stripping); real pages still shrink ~2MB each. The replacement is a real invariant: net growth is positive and bounded by the runtime + tag overhead.

**Two-axis review** (code-review, parallel sub-agents) found: the `.js` runtime deviates from the pipeline's ESM/.mjs+JSDoc standard (fixed — documented carve-out in CODING_STANDARDS.md: injected browser runtimes stay plain, ES5-safe, inlined verbatim), a source-grep dormancy test was a structure test (fixed — dropped; behavioral dormancy + byte-level no-mention tests cover it), `{selector, text: undefined}` would write "undefined" into the page (fixed — undefined-valued ops treated as absent, test added), `entry.injected` overwrote instead of appended (fixed — push semantics for ticket 04's motion pass), variable shadowing (fixed), the mutation-log byte assertion verified little (fixed — growth-bounded check). Declined with rationale: dedupe marker/regex literals across test files (repo precedent from ticket 02 — standards forbid shared test internals), marker-trusting census (captures carry zero scripts; the `qualified`/`known trackers` audits run on final bytes regardless of marker), `lastIndexOf('</body>')` anchor (captures are truncated before `</body>` by construction; the write pass anchors identically), Primitive Obsession on patch objects (typed shapes can't ride inline served bytes).
