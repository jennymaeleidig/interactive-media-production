# 20: What a served page may still name remotely

**What to build:** ADR 0002's audit covers exactly one class of remote reference —
absolute `<iframe src>` hosts — while the served bytes name remote hosts in five
other classes. The *behavior* is clean today (0 remote `<img src>` site-wide, and
every other class is either refused by the captured CSP or never fetched by a
browser at all), but that is a property nobody checks: a future Capture could
introduce a fetched reference in an unexpected class and no gate would notice.
Decide the stance and make the audit match it — either every remote reference must
sit in a class the CSP refuses or the browser never fetches, or the classes get
stripped/rewritten.

Census of the built tree, 2026-09-11:

| class | count | fetched by a browser? |
|---|---|---|
| `<iframe src>` — the live Wistia players | 120 on 82 pages | **yes — the ADR's deliberate exception, allow-listed** |
| `og:image` / `twitter:image` metas | 2,171 on 977 pages | never (social/crawler metadata) |
| `<video poster\|src>` (Vidzflow) | 120 on 10 pages | no — `img-src`/`media-src 'self' data:` |
| JSON-LD `thumbnailUrl` (Wistia, YouTube) | 76 on 55 pages | never (data inside a script) |
| Lottie `data-src` | 12 on 6 pages | no — `connect-src 'self'` |
| other remote meta (vocalvideo.com) | 8 on 5 pages | never (metadata) |
| CSS `url(https://fast.wistia.com/…)` swatch | 2 on 2 pages | no — `img-src 'self' data:` |
| `<img src=remote>` | **0** | — |

**Blocked by:** none.

**Status:** open
Label: ready-for-agent

- [ ] Each class is either given a rule or explicitly accepted as inert, in
      writing, naming the CSP directive that refuses it (or the reason the browser
      never asks for it).
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
