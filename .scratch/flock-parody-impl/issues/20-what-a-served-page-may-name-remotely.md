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
| **`srcdoc` widget documents** (VocalVideo) | **AMENDED:** 8 `srcdoc` payloads on 5 pages (the host's 92 occurrences are mostly `<a href>` navigation links on ~76 pages, which the link policy permits) | **nothing has checked** — see below |
| `<img src=remote>` | **0** | — |

**AMENDED at resolution:** after tickets 17–19 the live-frame row reads **130 on
92 pages**, the `<video poster>` row is gone (the Vidzflow documents are
stripped), and `<iframe src>` remains the only fetched remote class.

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

**Status:** resolved
Label: ready-for-agent

- [x] Each class is either given a rule or explicitly accepted as inert, in
      writing, naming the CSP directive that refuses it (or the reason the browser
      never asks for it). ADR 0002's Consequences now carries the class table:
      allow-listed frame (`frame-src`), `poster=` (`img-src 'self' data:` / a custom
      element never asks), Lottie `data-src` (`connect-src 'self'`), CSS `url()`
      (`img-src 'self' data:`), metadata + JSON-LD (never fetched).
- [x] **The `srcdoc` blind spot is closed**: the script census and/or the audit
      looks inside `srcdoc` payloads, and a `srcdoc` bearing a script or a live
      `allow-scripts` sandbox fails loudly rather than relying on capture luck.
      `srcdocScripts()` in `pipeline/embeds.mjs` reads every payload; the audit key
      **`srcdoc scripts`** counts executable (non-`ld+json`) scripts and must be 0
      on every page. The tree's one `allow-scripts` `srcdoc`
      (`/flock-forward`, cvt-embed) carries only an `ld+json` data block, so the
      count is 0 site-wide; the banner fact is recorded in ADR 0002.
- [x] `auditHtml` gains a key covering the unexpected case — a remote reference in
      a class that is neither allow-listed nor known-inert — or ADR 0002 records
      why a per-class census is the wrong instrument here. **`unclassified remote
      refs`** (`unclassifiedRemoteRefs()` in `pipeline/embeds.mjs`) scans the
      fetcher attributes a browser would actually request, accepts the classes
      above, and must be 0 on every page. It reads `data-src` as data, not `src`,
      and does not count `<a href>` navigation.
- [x] The metadata classes are decided with the publication/rights revisit in mind:
      they are never fetched, but they do print the original's asset URLs into our
      HTML, which is a different question from whether they cost a request. ADR 0002
      records them as inert for the network invariant and flags them for the
      publication/rights revisit (ticket 11) — the decision is deferred, not
      silently baked in.
- [x] The outcome is reflected in ADR 0002 and the spec's invariant wording, and
      `npm run routes` stays green. Serving check green (1,180 served, byte- and
      asset-identity), all audit keys 0 on all pages.

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

**Resolved 2026-09-11.** The stance is: **a served page may name a remote host**
**only in a class the audit can excuse, and the audit now enumerates those**
**classes rather than trusting one of them.** Two new keys in `auditHtml`:
`srcdoc scripts` (executable script inside any `srcdoc` payload) and
`unclassified remote refs` (a remote fetcher reference outside the accepted
classes), both 0 on all 1,180 pages, alongside the unchanged
`off-allowlist frames`. `pipeline/embeds.mjs` gained `srcdocScripts()` and
`unclassifiedRemoteRefs()`, both pinned in `test/embeds.test.ts`. The VocalVideo
documents stay in place — their runtime is stripped and their sandbox has no
`allow-scripts`, so their captured Stripe publishable key / CSRF token / analytics
id cannot execute — and are named as an accepted inert class. The metadata classes
are recorded as inert for the network invariant but flagged for the
publication/rights revisit (ticket 11), since they print original asset URLs into
our HTML without costing a request.

**Review catch (two-axis review of the WIP, 2026-09-12):** `srcdocScripts` scanned
the raw attribute value, so an entity-escaped `&lt;script&gt;` — which the parser
decodes before the frame runs — would have scored 0: the same
self-validating-checker failure this ticket exists to close. It now resolves the
common character references before scanning (pinned by a test). The same review
corrected the VocalVideo census row (8 `srcdoc` payloads on 5 pages, not 92
occurrences — most of those are `<a href>` links the link policy permits), and
`scriptCensus` now reports the allow-scripts `srcdoc` count (`srcdocAllowScripts`,
today 1 on `/flock-forward`) so that excused case is visible rather than silent.
