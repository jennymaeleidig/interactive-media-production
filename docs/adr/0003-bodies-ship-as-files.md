# Inline bodies ship as files

A Capture inlines a page's stylesheets, and the Recreation injects its six
runtimes into every page, so the same bytes are written once per page: the
built tree held 29,686 `<style>` elements carrying 1,642 MB of CSS and 9,339
`<script>` elements carrying 72 MB — but only 1,476 distinct style bodies
(21.5 MB) and 1,073 distinct script bodies (2.4 MB). 89% of the 1,843.8 MB of
HTML was the same stylesheets repeated 1,181 times, and the site measured
2.36 GB against GitHub Pages' **1 GB published-site limit**. The duplication is
not a fidelity problem — it is the same bytes — it is a size problem, and the
only thing that makes the piece publishable.

The build therefore moves each body into one content-addressed file. The dedupe pass
(`pipeline/dedupe.mjs`) writes every `<style>`/`<script>` body of at least
`KEEP_INLINE_BYTES` (1,024) to `/assets/<sha256[:16]>.css|.js` — the same
content-addressing, the same `assets/` directory, the same `assets.json`
manifest and the same extract-one-store-once reasoning as **Extracted asset**
(ADR 0002) — and leaves a `<link rel=stylesheet>` or `<script src>` in the
document position the body held, so cascade order is preserved. Every attribute
of the original element is carried onto the stand-in (`data-flock-parody`, a
`nonce`, an id), which is what keeps the strip audit's script census reading the
same: the injected runtimes stay counted as injected and the JSON-LD blocks stay
counted as data.

Two rules bound it. Bodies **under the threshold stay inline** — 18,004 of them
hold 1.0 MB in total, and 1.0 MB of requests is worse than 1.0 MB of bytes — and
scripts whose `type` is not JavaScript (`application/ld+json`, `importmap`,
`text/template`) stay inline, because a `<script src>` of such a type is fetched
and then ignored: externalizing them would silently delete the page's structured
data. A body inside an `srcdoc` payload is not an element at all (it is a nested
document's text, with its own CSP) so the scanner tokenizes attribute structure
and skips attribute values, comments, and SVG subtrees rather than regexing for
`<style`.

The one thing the pass must touch outside the bodies is the page's own policy.
Every captured page carries a `content-security-policy` meta of
`default-src 'none'` with **neither `style-src` nor `script-src` granting
`'self'`**, so a `<link href=/assets/x.css>` or `<script src=/assets/x.js>` is
refused until that directive says so. The dedupe pass adds `'self'` to the two
directives **by replacing each one**, exactly as the embed pass widens
`frame-src`: a second `style-src` would intersect with the captured one and keep
the file blocked. If there is no directive to widen (no meta, or no such
directive), the body stays inline and the page logs why, under the same rule the
embed pass follows — never ship a request the browser will refuse.

**Considered options.** Do it as a publish step over `served/` — rejected: the
published bytes would then sit outside the serving check's byte-identity and
asset-identity guarantee, which exists to make "same bytes ⇒ same pixels" cover
what visitors actually get. Inline everything and let the host gzip it —
rejected: 1 GB is a hard limit, and the duplication is per-page, so compression
cannot remove it. Externalize the JSON-LD blocks too — rejected: the browser
fetches them and ignores them, so the page would lose data it still renders.
Write one file per page rather than per body — rejected: it is the *same* sheet
that repeats across pages, so only content-addressing collapses it (13,384
style and 7,086 script bodies became 158 files).

**Consequences.** The tree went from 2.36 GB to 660 MB in one pass: HTML
1,843.8 → 149.1 MB, bodies 18.7 MB in 158 files, and the serving check now
walks 3,118 assets instead of 2,960 — the body files are in `assets.json`, so
their bytes and content type are verified over HTTP exactly like an extracted
image. Pages make ~10 same-origin requests where they made none; the
zero-outbound invariant is untouched (same origin, and the audit only flags
`https?://` references), but the tree is no longer self-contained per page: it
must be served by the app or a static host, not opened as a `file://` dump. The
pass is idempotent (pinned by `test/dedupe.test.ts`) because the build runs it
over a tree the tests also rewrite by hand: `npm run dedupe` applies it to an
existing `served/` tree, which is how the current tree was deduped while no
capture run exists to rebuild it. The threshold is the pass's only tuning knob;
1 KB was chosen from the measured distribution (1,414 of 2,549 distinct bodies
were under 1 KB and held 1.0 MB between them), and lowering it buys fewer bytes
at the cost of more requests.
