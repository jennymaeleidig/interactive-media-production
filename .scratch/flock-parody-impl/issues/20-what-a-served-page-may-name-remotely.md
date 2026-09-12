# 20: What a served page may still name remotely

**What to build:** ADR 0002's audit covers exactly one class of remote reference —
absolute `<iframe src>` hosts — while the served bytes name remote hosts in six
other classes, one of which nothing has ever looked at. The *behavior* is clean
today (0 remote `<img src>` site-wide, and every other class is either refused by
the captured CSP or never fetched by a browser at all), but that is a property
nobody checks: a future Capture could introduce a fetched reference in an
unexpected class and no gate would notice. Decide the stance and make the audit
match it — either every remote reference must sit in a class the CSP refuses or the
browser never fetches, or the classes get stripped/rewritten.

Census of the built tree, 2026-09-11:

| class | count | fetched by a browser? |
|---|---|---|
| `<iframe src>` — the live Wistia players | 119 on 81 pages | **yes — the ADR's deliberate exception, allow-listed** |
| `og:image` / `twitter:image` metas | 2,317 on 1,050 pages (2,171 carrying a URL) | never (social/crawler metadata) |
| `<video poster>` (Vidzflow, on the inert wrapper) | 120 on 10 pages | no — a `poster` on a custom element is never fetched, and `img-src 'self' data:` refuses it |
| JSON-LD `thumbnailUrl` (Wistia, YouTube) | 76 on 55 pages | never (data inside a script) |
| Lottie `data-src` | 12 on 6 pages | no — `connect-src 'self'` |
| CSS `url(https://fast.wistia.com/…)` swatch | 2 on 2 pages | no — `img-src 'self' data:` |
| **`srcdoc` widget documents** (VocalVideo) | 92 host occurrences on 81 pages | **nothing has checked** — see below |
| `<img src=remote>` | **0** | — |

The `srcdoc` class is the one with teeth. Those 81 pages inline a third-party
widget document (a Rails view: `<title>Vocal Video</title>`, `wss://vocalvideo.com/cable`,
a live Stripe publishable key, a GA analytics id, a CSRF token) inside an iframe
whose `sandbox` carries **`allow-scripts`**. Verified today: the only `<script`
marker inside any `srcdoc` in the tree is a `type=application/ld+json` data block
(on `flock-forward.html`), so nothing executes — but that is because of what
SingleFile happened to drop, not because anything checks. Neither the frame audit
(absolute `src` values only) nor the build's script census looks inside a `srcdoc`
attribute, so the zero-executable-scripts invariant is currently unenforced for
607 `srcdoc` payloads across 168 pages.

**Blocked by:** none.

**Status:** open
Label: ready-for-agent

- [ ] Each class is either given a rule or explicitly accepted as inert, in
      writing, naming the CSP directive that refuses it (or the reason the browser
      never asks for it).
- [ ] **The `srcdoc` blind spot is closed**: the script census and/or the audit
      looks inside `srcdoc` payloads, and a `srcdoc` bearing a script or a live
      `allow-scripts` sandbox fails loudly rather than relying on capture luck.
- [ ] `auditHtml` gains a key covering the unexpected case — a remote reference in
      a class that is neither allow-listed nor known-inert — or ADR 0002 records
      why a per-class census is the wrong instrument here.
- [ ] The metadata classes are decided with the publication/rights revisit in mind:
      they are never fetched, but they do print the original's asset URLs into our
      HTML, which is a different question from whether they cost a request.
- [ ] The outcome is reflected in ADR 0002 and the spec's invariant wording, and
      `npm run routes` stays green.

## Comments

**Opened 2026-09-11** from the Tier 1 embed work (`72b1bbb`), where the audit was
scoped to frames on purpose: the pre-existing image-side references would have
failed a broader key and stripping them risked touching motion behavior (the Lottie
ones). That scope was a judgement call taken mid-build to keep the change small; it
is recorded here so it gets a real answer instead of becoming folklore — the same
shape as the "0 misses" claim in `e829de1` that turned out to be a blind spot in
its own checker.

**Corrections (two-axis review of `e1a68af`, 2026-09-11):** the first version of
this census missed the `srcdoc` class entirely (it classified attributes and never
looked inside a payload — the same self-validating-checker failure), reported
VocalVideo as "8 metas on 5 pages" where the host has 92 occurrences across 81
pages, and listed the `og:image` row without saying how it was counted.
