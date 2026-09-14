# Static-host mapping for `served/` — Recreation (flocksafety.com, frozen 2026-09-12)

Scope: what a plain static host (GitHub Pages) must reproduce to serve the committed
`served/` tree faithfully, and what would break on one. Every structural claim cites
`file:line`; every number is measured. Measurement scripts used are noted per section
(they live in `/tmp/`, were read-only, and copied/edited nothing).

Repo facts used repeatedly:

- `served/` is the artifact, committed, not a build output — `README.md:34`, `README.md:159-166`, `CODING_STANDARDS.md:328-333`.
- The serving layer returns frozen bytes unmodified — `CODING_STANDARDS.md:57-60`, `CODING_STANDARDS.md:202-206`.
- 660 MB / 4,466 files / 1,181 pages claimed in docs (`README.md:34`); measured below: 4466 files, 1181 HTML, 682,311,315 bytes.

---

## 1. Route → file mapping, and the served tree's shape

### 1.1 The rules (`pipeline/served-tree.mjs`)

`pageCandidates(servedDir, page)` — `pipeline/served-tree.mjs:64-72`:

```js
export function pageCandidates(servedDir, page) {
  const rel = page.replace(/^\/+/, '');
  if (rel === '') return [path.join(servedDir, 'index.html')];
  return [path.join(servedDir, `${rel}.html`), path.join(servedDir, rel, 'index.html')];
}
```

For `/a/b` the candidates are tried **in this order**:

1. `served/a/b.html`
2. `served/a/b/index.html`

`/` resolves only to `served/index.html`. Leading slashes are stripped (so `a/b` and
`//a/b` behave like `/a/b`) — `test/served-tree.test.ts:14-28`. The route tries them in
order and takes the first that `readFile` accepts — `app/[[...path]]/route.ts:24,30,43-49`.

`insideTree(root, file)` — `pipeline/served-tree.mjs:79-81`:

```js
export function insideTree(root, file) {
  return path.resolve(file).startsWith(path.resolve(root) + path.sep);
}
```

A candidate is **illegal** when `insideTree` is false: the resolved path does not sit under
the resolved root. This catches `..`, encoded `..`, compound segments, the root itself, and
a sibling whose name shares the prefix (`served-other/…`) — `test/served-tree.test.ts:30-40`.
The route rejects the whole request (`404`) if **any** candidate is illegal —
`app/[[...path]]/route.ts:26-29`. Note `path.resolve` is applied to the already-joined
candidate, and Next has percent-decoded the segments, so `/%2e%2e/package.json` resolves and
is rejected — `test/serving.seam.test.ts:250-254`.

The route then: byte-reads the first existing candidate and returns it with
`content-type: text/html; charset=utf-8`, else consults `redirects.json`, else `notFound()`
— `app/[[...path]]/route.ts:30-39`.

### 1.2 Served tree shape (measured)

Command: `node /tmp/tree-shape.mjs` (walks `served/`, `statSync` per file).

| Metric | Measured |
|---|---|
| Total files under `served/` | **4,466** |
| Total bytes (`statSync` sum) | **682,311,315** (~650.7 MiB; `du -sh` = **660M** with block rounding) |
| `*.html` files | **1,181** |
| Top-level `*.html` (no `/`) | **82** |
| Nested `*.html` | **1,099** |
| `*.html` bytes | **149,187,949** |
| `served/assets/` files | **3,280** |
| `served/assets/` bytes | **530,830,932** |

Nested `*.html` grouped by top-level dir (top 15):

| Count | Dir |
|---|---|
| 816 | `blog` |
| 68 | `webinar` |
| 61 | `ebooks` |
| 39 | `customers` |
| 20 | `industries` |
| 20 | `legal` |
| 17 | `thank-you` |
| 12 | `video` |
| 10 | `abm` |
| 10 | `products` |
| 9 | `use-case` |
| 7 | `lp` |
| 5 | `trust` |
| 3 | `careers` |
| 2 | `vs` |

Files per top-level entry (all file types):

| Count | Top-level |
|---|---|
| 3,280 | `assets/` |
| 816 | `blog/` |
| 87 | root files (82 `.html` + `assets.json`, `build-log.json`, `build-summary.json`, `redirects.json`, `forms-manifest.json`) |
| 68 | `webinar/` |
| 61 | `ebooks/` |
| 39 | `customers/` |
| 20 | `industries/`, 20 `legal/` |
| 17 | `thank-you/` |
| 12 | `video/` |
| 10 | `abm/`, 10 `products/` |
| 9 | `use-case/` |
| 7 | `lp/` |
| 5 | `trust/` |
| 3 | `careers/` |
| 2 | `vs/` |

**Directory-with-`index.html`:** exactly **one** — `served/index.html` (root). Zero nested
`<dir>/index.html` exist. Verified by the same walk and by
`node /tmp/pagenotref.mjs` (`INDEX_DIRS 0` nested).

### 1.3 Routes that exist ONLY as `<path>.html`

Because there is exactly one `index.html` (the root):

- `/` is served by `served/index.html` (works even on a host that never appends `.html`).
- Every other page — **1,180 of 1,181** — exists only as `served/<path>.html`. There is no
  `<path>/index.html` fallback anywhere in the tree, so a static host that does **not**
  append `.html` 404s those routes.
- Of those, **1,179** are hit by at least one extensionless internal reference (see §2);
  `served/lp/flockos-waitlist.html` is the one page no served page links extensionlessly
  (`node /tmp/pagenotref.mjs` → `PAGES_NOT_REFERENCED_EXTENSIONLESS 1 [ '/lp/flockos-waitlist' ]`).

GitHub Pages does not add `.html` to a request path (it maps URL path → file path), so a
verbatim `served/` publish 404s the whole extensionless-link graph. This is the single
largest static-host breakage and is quantified in §10.

---

## 2. Extensionless internal references — the crux

Command: `node /tmp/refs2.mjs` (parses every `served/**/*.html` `href`/`src`/`poster`,
every `srcset`, every inline `<style>` `url(...)`, and every `served/**/*.css` `url(...)`).
Shape classifier: root-absolute path whose last segment contains no `.` = **extensionless**;
last segment contains a `.` = **file-with-extension** (assets).

### 2.1 Occurrences by shape (all positions, 352,436 non-empty URL occurrences)

| Count | Shape |
|---|---|
| 186,975 | extensionless, no trailing slash (e.g. `/products/flock-os`) |
| 103,569 | file-with-extension (root-absolute asset refs, e.g. `/assets/<sha16>.svg`) |
| 37,390 | anchor-only (`#…`) |
| 16,563 | absolute external (`https:` / `http:` / other scheme) |
| 2,977 | `data:` URI |
| 2,430 | root `/` |
| 1,299 | relative (does not start `/`) |
| 1,190 | `tel:` |
| 38 | `mailto:` |
| 5 | trailing slash (`/blog/`) |
| **0** | `.html` (see note) |

**`.html` count is zero.** No internal reference anywhere in `served/` points at a
`<path>.html`. This is the `--save-original-urls` + link-rewrite policy: hrefs are rewritten
to Recreation routes (`CODING_STANDARDS.md:197-199`). The `.html` files exist on disk but
nothing links to them by that name.

### 2.2 Anchor / query variants on root-absolute shapes

| Count | Shape + suffix |
|---|---|
| 186,903 | extensionless |
| 103,569 | file-with-extension |
| 2,430 | root `/` |
| 41 | extensionless + query |
| 30 | extensionless + anchor |
| 5 | trailing slash |
| 1 | extensionless + query + anchor |

### 2.3 The 20 most common extensionless targets (occurrences)

| # | Occ. | Target |
|---|---|---|
| 1 | 5,951 | `/careers` |
| 2 | 5,904 | `/press-center` |
| 3 | 4,858 | `/book-a-demo` |
| 4 | 4,815 | `/blog/what-is-traffic-analytics` |
| 5 | 4,815 | `/blog/california-sb34-what-private-organizations-using-alpr-need-to-know` |
| 6 | 4,815 | `/blog/what-flocks-privacy-and-security-updates-mean-for-private-sector-customers` |
| 7 | 4,786 | `/products/video-cameras` |
| 8 | 4,764 | `/products/lpr-cameras` |
| 9 | 4,744 | `/products/flock-dfr` |
| 10 | 3,729 | `/contact` |
| 11 | 3,727 | `/resources` |
| 12 | 3,587 | `/trust` |
| 13 | 3,584 | `/legal` |
| 14 | 3,565 | `/legal/lpr-policy` |
| 15 | 3,547 | `/products` |
| 16 | 3,547 | `/privacy-ethics` |
| 17 | 3,545 | `/safe-cities` |
| 18 | 3,186 | `/blog` |
| 19 | 2,410 | `/products/flock-os` |
| 20 | 2,409 | `/products/mobile-security-trailer` |

### 2.4 Existence check

**Corpus tally** — 1,493 distinct extensionless targets (`/tmp/refs2.mjs`):

| Resolves to | Count |
|---|---|
| `<target>.html` exists | **1,179** |
| `<target>/index.html` exists | **0** |
| neither | **314** |

**Sample of 10** (the top 10 by occurrence):

| Target | `<target>.html` | `<target>/index.html` |
|---|---|---|
| `/careers` | ✅ | ❌ |
| `/press-center` | ✅ | ❌ |
| `/book-a-demo` | ✅ | ❌ |
| `/blog/what-is-traffic-analytics` | ✅ | ❌ |
| `/blog/california-sb34-…` | ✅ | ❌ |
| `/blog/what-flocks-privacy-…` | ✅ | ❌ |
| `/products/video-cameras` | ✅ | ❌ |
| `/products/lpr-cameras` | ❌ (**redirects.json source**) | ❌ |
| `/products/flock-dfr` | ✅ | ❌ |
| `/contact` | ✅ | ❌ |

**Dominant case: `<target>.html`.** The directory-index case never occurs in this tree.
The 314 "neither" targets are the dead/redirected links analysed in §3.

---

## 3. Root-absolute reference frequency and the 404 cross-check

Command: `node /tmp/prefix.mjs` (same extraction as §2; strips `?`/`#`, groups by first path
segment) and `node /tmp/miss-rows.mjs` (distinct misses, attributed).

### 3.1 Top path prefixes (all root-absolute refs in `src`/`href`/`srcset`/`poster`/CSS `url()`)

| Count | Prefix |
|---|---|
| 103,569 | `/assets` |
| 43,740 | `/industries` |
| 36,978 | `/products` |
| 19,824 | `/blog` |
| 17,730 | `/use-case` |
| 9,897 | `/legal` |
| 7,230 | `/trust` |
| 5,974 | `/careers` |
| 5,904 | `/press-center` |
| 4,858 | `/book-a-demo` |
| 3,822 | `/resources` |
| 3,729 | `/contact` |
| 3,547 | `/privacy-ethics` |
| 3,545 | `/safe-cities` |
| 2,576 | `/customers` |
| 2,430 | `/` |
| 2,372 | `/partner-program` |
| 2,364 | `/what-is-flock` |
| 2,361 | `/podcast` |
| 1,199 | `/pricing` |
| 1,194 | `/faq` |
| 1,181 | `/newsletter` |
| 1,181 | `/upcoming-events` |
| 1,181 | `/supplier-registration` |
| 1,181 | `/accessibility-statement` |
| 1,181 | `/accessibility-plan` |
| 978 | `/blog-audiences` |
| 230 | `/articles` |
| 160 | `/privacy-policy` |
| 138 | `/webinar` |
| 133 | `/devices` |
| 116 | `/ebooks` |
| 114 | `/webinars` |
| 62 | `/use-case-filters` |
| 42 | `/lp` |
| 27 | `/reduce-guard-cost-calculator` |
| 25 | `/use-cases` |
| 23 | `/video` |
| 18 | `/thank-you` |
| 10 | `/abm` |

Total root-absolute refs **292,979**; distinct (stripped) paths **4,561**; distinct
first-segment prefixes **124**.

### 3.2 `/assets/` totals

- In the five asked positions (`src`/`href`/`srcset`/`poster`/CSS `url()`): **103,569**
  references, **3,064** distinct filenames.
- Scanning the whole text of every served HTML/CSS for `assets/<sha16>.<ext>` (which also
  catches `data-src`, JSON-LD, JS strings, etc.): **3,118** distinct filenames —
  **exactly the 3,118 entries in `served/assets.json`** (`node /tmp/final-data.mjs`).
- `served/assets/` holds **3,280** files; the extra **162** are not referenced by any
  served HTML/CSS (orphans from the retired build). All referenced assets exist — no
  missing asset name (`ASSETS_REFERENCED_MISSING_ON_DISK 0`).

### 3.3 Distinct root-absolute paths with no file under `served/`

Measured: **317** distinct stripped paths have no file, no `<path>.html`, and no
`<path>/index.html` (`node /tmp/refs2.mjs` → `MISSES 317`). Breakdown by cause
(`node /tmp/miss-rows.mjs`, `node /tmp/miss-explain.mjs`):

| Cause | Count | Meaning on a static host |
|---|---|---|
| Source in `served/redirects.json` | **55** | Next host returns 301; a bare static host 404s. **True gap.** |
| `build-summary.json` `deadRoots` | **13** | Next host 404s; static 404s. Faithful already. |
| `DROPPED_PAGES` (`pipeline/config.mjs:55-75`) | 0 | — |
| `authGated` | 0 | — |
| Neither | **249** | Next host 404s; static 404s. Faithful already (these are dead links frozen into the capture). |

All 317 misses are page paths; **0 are `/assets/` paths** (asset fidelity is complete).

**Top 20 misses with one referring page each** (`/tmp/miss-rows.json`), distinguishing
redirect-explained from neither:

| # | Occ. | Path | Kind | Redirect target | One referring page |
|---|---|---|---|---|---|
| 1 | 4,764 | `/products/lpr-cameras` | redirect | `/products/license-plate-readers` | `abm/amazon.html` |
| 2 | 3,547 | `/privacy-ethics` | redirect | `/trust` | `abm/amazon.html` |
| 3 | 2,364 | `/products/freeform-search` | redirect | `/products/flock-freeform` | `abm/amazon.html` |
| 4 | 1,196 | `/products/national-lpr-network` | redirect | `/products/license-plate-readers` | `abm/amazon.html` |
| 5 | 1,185 | `/products/investigations-manager` | redirect | `/products/license-plate-readers` | `abm/amazon.html` |
| 6 | 1,180 | `/legal/terms-of-service` | redirect | `/legal/terms-and-conditions` | `abm/amazon.html` |
| 7 | 1,180 | `/legal/privacy-notice` | redirect | `/legal/privacy-policy` | `abm/amazon.html` |
| 8 | 377 | `/blog-audiences/law-enforcement` | deadRoot | — | `blog/1000-missing-persons-reunited.html` |
| 9 | 306 | `/blog-audiences/community-safety` | deadRoot | — | `blog/10-safety-tips-for-the-holiday-season.html` |
| 10 | 160 | `/privacy-policy` | **neither** | — | `are-you-ready-for-the-new-budget-year.html` |
| 11 | 110 | `/blog-audiences/elected-officials` | deadRoot | — | `blog/5-keys-to-hiring-…` |
| 12 | 104 | `/blog-audiences/retail` | deadRoot | — | `blog/20-million-gift-card-scheme-…` |
| 13 | 27 | `/devices/lpr-cameras` | **neither** | — | `blog/5-key-insights-on-tackling-organized-retail-crime-…` |
| 14 | 25 | `/blog-audiences/property-managers` | deadRoot | — | `blog/4-ways-flocks-mobile-security-trailer-…` |
| 15 | 24 | `/devices/lpr` | **neither** | — | `blog/8-rules-hoa-boards-can-follow-…` |
| 16 | 21 | `/blog-audiences/schools` | deadRoot | — | `blog/24-7-schools-…` |
| 17 | 21 | `/blog-audiences/healthcare` | deadRoot | — | `blog/6-career-tips-…` |
| 18 | 21 | `/use-case-filters/corporate-entities` | deadRoot | — | `chilipiper-2.html` |
| 19 | 21 | `/use-case-filters/large-cities` | deadRoot | — | `chilipiper-2.html` |
| 20 | 20 | `/use-case-filters/small-towns` | deadRoot | — | `chilipiper-2.html` |

The `neither` misses are dominated by renamed/removed paths (`/articles/*` 135,
`/resources/*` 38, `/devices/*` 17, …). They 404 on the Next host as well, so they are not
static-host regressions; they are frozen dead ends (`CODING_STANDARDS.md:213-216`).

The **3 trailing-slash misses** are `/wing/`, `/terms-and-conditions/`, `/knowledge/`
(`/tmp/final-data.mjs`).

---

## 4. Server-dependent endpoints and client callers

### 4.1 `app/api/chat/route.ts`

- Method: `POST` only (`app/api/chat/route.ts:16`).
- Request: JSON parsed by `request.json()`; any parse failure → `400 {"error":"invalid JSON"}`
  (`:18-22`). Then `parseChatRequest(raw)`; null → `400 {"error":"invalid request"}`
  (`:23-26`). Shape is the one declared in `pipeline/chat-turn.mjs`: `{type:'start'|'resume'|'option', sessionId?, optionIndex?}`.
- Response: `NextResponse.json(handleChat(body))` — the turn's lines, pending option set (or
  completion), and session variables (`:28`). Engine throw → `500 {"error": …}` (`:29-32`).
- External calls: **none**. “The Recreation's chat makes no outbound request of any kind —
  this route is the visitor's own machine talking to itself, and the engine's session state
  lives in server memory” (`app/api/chat/route.ts:5-7`). All behavior is in
  `lib/chat-engine.ts`.

### 4.2 `app/api/forms/[...key]/route.ts`

- Method: `POST` only (`app/api/forms/[...key]/route.ts:19`).
- Request: the body is **never read**. The path segments are joined into a key, looked up in
  `served/forms-manifest.json` (`:22-27`). Missing/unparseable manifest → `404`
  (`:23-24`).
- Response: if the entry's `redirectTo` passes `isLocalTarget` (root-relative, not
  protocol-relative), `303` with `location: redirectTo` and `cache-control: no-store`
  (`:33-37`). Otherwise `404`.
- External calls: **none**. “No submission ever leaves the machine: the only data movement is
  a local redirect to a build-authored, root-relative path” (`:7-8`).
- The manifest has **66 entries** (`node -e "…require('./served/forms-manifest.json')"`),
  e.g. `book-a-demo/mktoForm_1009 → {page:'/book-a-demo', formId:'mktoForm_1009', redirectTo:'/thank-you'}`.
  `GET` is answered by Next with `405` (`test/serving.seam.test.ts:122-126`).

### 4.3 Every client caller (measured)

Command: `grep -rho '/api/[a-zA-Z0-9/_-]*' served --include=*.html | sort | uniq -c` and
`grep -rl '/api/chat' served/assets`.

| Caller | Count | Where |
|---|---|---|
| `<form action="/api/forms/<key>" method="post">` | **66** occurrences, **66** distinct keys, one each across **66** HTML pages | 66 keys match `forms-manifest.json` exactly |
| `fetch('/api/chat', {method:'POST', …})` | source in **1** asset: `served/assets/f191381b9413a392.js` (a marked chat script, referenced by all 1,181 pages) | `pipeline/chat-widget.js:300` |
| `/api/asset/storyblok` | 2 occurrences | **not local** — inside `href="https://nrf.com/api/asset/storyblok?…"` in `blog/how-to-prevent-shrinkage-in-retail.html` and `blog/how-to-prevent-employee-theft-in-retail.html` |
| `/api/core/bitstreams/…` | 1 occurrence | **not local** — inside `href="https://cardinalscholar.bsu.edu/server/api/core/…"` in `blog/the-strategic-value-of-flock-safety-for-multifamily-communities.html` |
| inline `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket`/`EventSource` in served HTML | **0** | zero-outbound invariant holds in the HTML itself |

The chat widget is mounted on **all 1,181** pages (`served/build-summary.json` `chat.mounted: 1181`; grep `data-flock-parody="chat"` = 1,181 pages).

### 4.4 What breaks on a static host

- **Forms submission (66 routes, one per page across 66 pages, e.g. `/book-a-demo`, `/video-form`, `/video/*`, `/use-case/*`).**
  The served markup is a native `<form action="/api/forms/…" method="post">`
  (`test/serving.seam.test.ts:81-83`), so the browser itself POSTs to the static host. There is
  no handler: GitHub Pages cannot accept a POST at that path. The user does **not** reach the
  captured `/thank-you` page; the browser shows the host's POST error page. Failure mode:
  **visible broken submission** (lost lead), not a silent no-op.
  `UNVERIFIED:` the exact status GitHub Pages returns for `POST /api/forms/…` (405 vs 404).
  Command that would settle it: `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<owner>.github.io/<repo>/api/forms/book-a-demo/mktoForm_1009 -d x=1`.
- **Chat widget (all 1,181 pages).**
  `pipeline/chat-widget.js:300-313` posts to `/api/chat`; on a 404 `res.ok` is false and the
  code does `if (!res.ok) return;`, and the whole chain ends in `.catch(function () { /* no
  network is the invariant; a failed turn leaves the last state */ })`. So on a static host
  the widget opens, accepts input, and then **silently no-ops** — no reply, no error toast, no
  unhandled rejection. Failure mode: **silent feature loss**.
- The two `/api/asset/storyblok` references are external links and are unaffected.

---

## 5. Injected layers: baked into `served/`, not serve-time

**Claim: the injected layers are baked into the committed `served/` files by the (now retired)
build. The Next app does not inject or transform anything at request time.**

Evidence:

1. The marker convention is `data-flock-parody="<layer>"` — `pipeline/marker.mjs:14`
   (`MARKER_ATTR`), `:17` (`MARKER_RE`).
2. The served pages themselves carry the markers. Measured across `served/**/*.html`
   (`grep -rho 'data-flock-parody="…"'`):
   - `motion`, `interactions`, `nav`, `chat`, `scroll`: **2,362 occurrences each** = 2 × 1,181
     pages (CSS + JS member).
   - `story-hook`: **1,181** occurrences (JS only).
   - `legibility`: **1** occurrence, on `served/safe-cities.html`.
   Total marked elements **12,992**.
3. Fragment from `served/index.html` (element → shipped asset):

   ```
   <link rel=stylesheet href=/assets/af740dcabf1ca606.css data-flock-parody="motion">
   <script data-flock-parody="motion" src=/assets/ca8ac519f7977658.js>
   <link rel=stylesheet href=/assets/909f5ee357cd16e0.css data-flock-parody="interactions">
   <script data-flock-parody="interactions" src=/assets/353a051d6f4f44d3.js>
   <link rel=stylesheet href=/assets/16923b6b5458c07f.css data-flock-parody="nav">
   <script data-flock-parody="nav" src=/assets/fa30abf15c68fa80.js>
   <link rel=stylesheet href=/assets/8df6c73b04a154e3.css data-flock-parody="chat">
   <script data-flock-parody="chat" src=/assets/f191381b9413a392.js>
   <script data-flock-parody="story-hook" src=/assets/25dd97178a1430a9.js>
   <style data-flock-parody="scroll"> … </style>
   <script data-flock-parody="scroll" src=/assets/5f1298161cef4390.js>
   ```
4. The corresponding files exist in `served/assets/` and are listed in `served/assets.json`
   (all ten checked names return `true`). Their maintained sources are `pipeline/*.css` /
   `*-runtime.js` (`pipeline/injected-layers.mjs:68-129`); shipped vs maintained differ only
   in comments (e.g. `diff pipeline/motion.css served/assets/af740dcabf1ca606.css` shows only
   comment lines) — the documented comment-only drift (`CODING_STANDARDS.md:365-375`).
5. **Delivery form (inline vs separate file), measured:**

   | Member | Form in the tree |
   |---|---|
   | `motion` CSS + JS | separate `/assets/…` files (5,718 B / 3,028 B) |
   | `interactions` CSS + JS | separate files (1,412 B / 12,385 B) |
   | `nav` CSS + JS | separate files |
   | `chat` CSS + JS | separate files |
   | `story-hook` JS | separate file |
   | `scroll` **CSS** | **inline `<style data-flock-parody="scroll">`**, 673 B body, on all 1,181 pages |
   | `scroll` JS | separate file |
   | `legibility` CSS | **inline `<style data-flock-parody="legibility">`**, 67 B body, `/safe-cities` only |

   `scroll`'s CSS is inline because it is under the build's 1 KB inline rule
   (`pipeline/injected-layers.mjs:120-122`; `CONTEXT.md:41` **Deduped body**). 158 asset bodies
   ≥ 1 KB were externalised.

6. **The app transforms nothing at request time.**
   - `app/[[...path]]/route.ts:30-37` reads a file and returns its bytes with a content-type;
     no string edit, no marker lookup, no injection.
   - `lib/serving.ts:33-46` reads an asset and returns bytes + content-type; no transform.
   - `grep -rn 'data-flock-parody\|MARKER' app lib` finds **no** reference in `app/` or
     `lib/` — only `pipeline/injected-layers.mjs` and `pipeline/audit.mjs` read the marker.
   - `CODING_STANDARDS.md:57-60` states it directly: “Serving time edits nothing.”

**Which pages carry which layer:** the roster is `pipeline/injected-layers.mjs:68-129` —
six `scope:'site'` layers (every page) plus `legibility` scoped to `['/safe-cities']`
(`:110-114`). The build log records the injection per page (`served/build-log.json` `injected`
array, e.g. `"motion layer (style+script, inline)"`).

---

## 6. Redirects and 404

### 6.1 `served/redirects.json`

Measured (`node /tmp/final-data.mjs`):

- Entries: **67** (matches `served/build-summary.json` `redirects.count: 67`).
- Source shape: **0** trailing slashes, **0** queries, **0** anchors, **0** absolute/
  protocol-relative sources; depth 1 segment = **3**, depth 2 segments = **64**.
  Examples: `/articles/200-vs-400-feet-dfr`, `/legal/privacy-notice`, `/webinars/…`.
- Targets: all root-relative local routes; **0** absolute or protocol-relative targets;
  **0** dangling targets (every target resolves to a served `.html`).
- **Collisions with real files: 0.** No redirect source also exists as
  `served/<source>.html` / `/index.html`. The route resolves files first anyway
  (`app/[[...path]]/route.ts:30-38`), so a served file would win; the pure core encodes this
  precedence as “200 beats 301 beats 404” (`regression/routes.mjs:97-114`,
  `test/routes.test.ts:40-47`). (The `test/serving.seam.test.ts:208-212` case for `/thank-you`
  passes because `/thank-you` is served, not because it is in the table.)

### 6.2 What `lib/serving.ts` emits

Redirect (`lib/serving.ts:78-82`), quoted:

```ts
export function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 301,
    headers: { location, 'cache-control': 'no-store' },
  });
}
```

Miss (`lib/serving.ts:47-52`), quoted:

```ts
export function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
```

The route's fallback order is `200` (served file) → `301` (`redirects.json`) → `404`
(`app/[[...path]]/route.ts:30-39`).

### 6.3 What a static host must provide

- **67 per-URL redirect artifacts** — one for every key in `redirects.json` — at a path that
  shadows the served tree (e.g. `articles/200-vs-400-feet-dfr/index.html`), each carrying a
  meta-refresh/JS redirect to the local target. GitHub Pages has no server-side redirect
  table, so the true `301` status is **not reproducible**; the artifact returns `200` with a
  client-side hop. That is itself a fidelity gap versus the Next host.
- **1 `404.html`** at the site root — GitHub Pages' custom 404 mechanism. It reproduces the
  body `Not found` and the 404 status for the 13 dead roots, 10 auth-gated stubs, 19 dropped
  scaffold pages, and the 249 dead links.
- **Extras: 67 + 1 = 68 files** on top of whatever serves the pages.

---

## 7. Byte-fidelity constraints

### 7.1 Assertions that served bytes are unmodified / not edited at serve time

| Evidence | Quote / claim |
|---|---|
| `CODING_STANDARDS.md:57-60` | “**Serving time edits nothing.** `app/[[...path]]/route.ts` and `lib/serving.ts` return the frozen file's bytes unmodified — no policy edit, no rewrite, no per-request transformation. … the serving check's byte-identity assertion is what keeps the route honest.” |
| `CODING_STANDARDS.md:202-206` | “The served tree is **frozen**: the serving route returns the tree's bytes unmodified (no per-request transformation), and `npm run routes` asserts byte-identity over HTTP for every page — same bytes ⇒ same pixels …” |
| `CODING_STANDARDS.md:143-145` | “Every served page's HTTP body must be byte-identical to its file in the tree — same bytes ⇒ same pixels …” |
| `CODING_STANDARDS.md:182-183` | “A served byte changes only as a deliberate, reviewed tree migration, and the commit says why.” |
| `CODING_STANDARDS.md:193-196` | “**No new copy** anywhere in the Recreation (milestone rule). … anything a visitor reads on a captured page comes from the Capture, verbatim.” |
| `CODING_STANDARDS.md:387-390` | “If anything under `served/` changed: `npm run routes` … and say in the commit why a frozen byte changed.” |
| `regression/routes.mjs:169-172` | `byteMismatch(page, body, file)` — returns null only when `body.equals(file)`, else names the first differing byte. |
| `regression/routes.mjs:262-270` | Per served page: resolve `pageCandidates(...).find(exists)`, then `byteMismatch(r.e.path, r.bytes, fs.readFileSync(file))`. |
| `test/routes.test.ts:74-88` | Unit tests for `byteMismatch`: identical → null; differing → `/a: HTTP body differs from the served file at byte 3`. |
| `README.md:60-64` | “`npm run routes` … asserts … **byte-identity**: every served page's body must equal the file in the tree (same bytes ⇒ same pixels …).” |
| `regression/routes.mjs:291-325` | Asset byte-identity + content type: each `assets.json` entry fetched, `content-type` must equal `mimeForExt(ext)` (`:317`), file must exist (`:319-322`), `byteMismatch` on bytes (`:324`). |

**Caveat that matters for publishing:** byte-identity is *self-referential* — it compares the
response to the file it came from. `CODING_STANDARDS.md:283-288` says so: “**The check cannot
see a hand edit**: byte-identity compares the response to the file it came from, so editing
`served/` passes it. That is the point (the tree is the source of truth) and the trap (a
silent edit makes the build log a lie).”

### 7.2 Publish-time transformations — violates vs allowed

**Would violate the constraints:**

- **Rewriting `/assets/…` prefixes in place** (the `https://<owner>.github.io/<repo>/` fix
  contemplated in `README.md:133-136`). It mutates frozen page bytes, so
  `served/build-log.json` / `build-summary.json` no longer describe the tree
  (`CODING_STANDARDS.md:176-182`), and any prefix rewrite that touches a marked tag also
  breaks the injected-layer mirror. Locally the byte-identity check would still pass (it is
  self-referential), which is exactly the trap.
- **Inlining a disclaimer banner / any new copy** (`README.md:144-146` notes the disclaimer is
  not yet in the tree). It adds visitor-visible copy the Capture did not carry
  (`CODING_STANDARDS.md:193-196`), changes page bytes, and — if implemented as an unmarked
  `<script>` — fails the script census (`pipeline/audit.mjs:259-264`), and if implemented by
  editing the CSP fails `test/serving.seam.test.ts:188-195`.
- Any in-place edit that adds tracker residue, an off-allow-list frame, a `srcdoc` script, or
  an unclassified remote ref fails the strip audit (`pipeline/audit.mjs:275-297`,
  `regression/routes.mjs:140-151`).

**Would be allowed:**

- **Copying a file to a second path** (same bytes at a new URL) — the original route's bytes
  and therefore byte-identity are untouched, and nothing counts tree files (see §7.3). This
  is the mechanism a static publish needs for extensionless routes (§10) and redirect stubs.
- **Adding a new file** (`404.html`, redirect stubs, `.nojekyll`) — the count invariant does
  not read the directory (§7.3). Caveat for `*.html`: see §7.3.

### 7.3 Does any test enumerate the expected served file set or count?

- **Route-check count invariant: NO tree enumeration.** `served` is derived from
  `build-log.json`, not from the filesystem — `regression/routes.mjs:186`
  (`buildLog.filter(e => !e.error).map(e => e.page)`), then
  `served + dropped + errors === listing` (`regression/routes.mjs:120-127`, applied at
  `:203`). Adding files to `served/` therefore does **not** fail it. `assets.json` count is
  checked against `build-summary.json`, not against the directory
  (`regression/routes.mjs:294-296`).
- **`test/routes.test.ts:50-62`** exercises `countFailures` with synthetic numbers; no tree
  read.
- **However, two vitest projects enumerate `served/**/*.html` and assert per-page content:**
  - `test/upstream-copy.test.ts:20-23` builds `servedPages` from
    `readdirSync(SERVED_DIR, { recursive: true }).filter(name => name.endsWith('.html'))`,
    then `:231-233` asserts every one projects prose (`copyRuns(...).length > 0`).
  - `test/upstream-chrome.test.ts:33-36` does the same, then `:264-266` asserts every one
    projects chrome (`chromeRuns(...).length > 0`).
  Adding any **`.html`** file to `served/` that is not a full page (a redirect stub or a
  `404.html`) **fails these two tests**. Adding byte-copies of real pages passes them.
  Adding **non-`.html`** artifacts (extensionless route copies, `.nojekyll`) is invisible to
  them.
- No test hard-codes the file count 4,466 or a file list. The `1,181` in
  `test/upstream-baseline.test.ts:235,244` counts rows in the committed baseline, not files in
  the tree.

---

## 8. Content policy in the artifact; the strip audit

### 8.1 Where the security policy lives

It is a **`<meta http-equiv>` tag in every served page — not an HTTP response header.** The
Next routes set only `content-type` and `cache-control`
(`app/[[...path]]/route.ts:33-34`, `app/assets/[...path]/route.ts:17-21`); no CSP header is
sent. Measured: **1,181 of 1,181** pages carry
`<meta http-equiv=content-security-policy …>`.

Quoted from `served/index.html:14`:

```html
<meta http-equiv=content-security-policy content="default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline' 'self'; media-src 'self' data:; script-src 'unsafe-inline' data: 'self'; object-src 'self' data:; frame-src 'self' data:; connect-src 'self';">
```

- All 1,181 pages carry `connect-src 'self'` and `script-src 'unsafe-inline' data: 'self'`
  (measured by `grep -rl`).
- `safe-cities.html`'s meta is byte-for-byte the same policy as `index.html` (measured); the
  `frame-src` widening by media hosts appears on **164** pages that actually carry a media
  frame (`grep -rl "frame-src 'self' data: https://" served --include=*.html | wc -l` → 164).
- Because it is a meta tag, it survives a static publish **unchanged**; a static host that
  wanted to send it as a real header could, but the artifact does not need it.

### 8.2 Where it is constructed

The constructor is **not in the repo**. It was the retired build's “captured-policy editor” —
`README.md:161-163`: “the modules only the build used (its pass table, the embed / dedupe /
asset passes, **the captured-policy editor**, the layer table) are deleted.” The policy is
baked into the committed bytes, and the build's per-page record of the grants survives in
`served/build-log.json` (`csp` field on all 1,181 entries, e.g.
`"connect-src 'self' (chat mount); style-src 'self' (deduped stylesheet); script-src 'self' (deduped runtime)"`).

The surviving descriptions of how it was built: `CODING_STANDARDS.md:45-53` (the three grants:
`connect-src 'self'` on launcher pages, `frame-src` widened by embed hosts,
`style-src`/`script-src` widened by `'self'` for deduped bodies; each directive **replaced**,
never appended). The only executable check of it is `test/serving.seam.test.ts:188-195`, which
asserts the homepage meta contains `connect-src 'self';` and `default-src 'none';` and does
not contain `connect-src https:`.

### 8.3 The strip audit

`pipeline/audit.mjs` is the invariant's single home (`pipeline/audit.mjs:1-38`):

- `audit(html)` (`pipeline/audit.mjs:275-297`) returns counts for residue classes
  (`qualified`, `onetrust`, `account`, `known trackers`, `externalFormActions` —
  `:60-72`), plus `off-allowlist frames`, `srcdoc scripts`, and `unclassified remote refs`.
  **Every count must be 0.**
- `MEDIA_HOSTS = ['fast.wistia.net', 'www.youtube.com', 'www.youtube-nocookie.com']`
  (`pipeline/audit.mjs:51`) is the only allow-list (`CONTEXT.md:37`).
- `scriptCensus(html)` (`pipeline/audit.mjs:259-266`) must show `executable === 0`; only
  `application/ld+json` and marked `data-flock-parody` scripts are allowed.
- It **runs at check time, not build or serve time.** The build that wrote the tree is
  retired; the only caller is `regression/routes.mjs` (`npm run routes`), which fetches each
  served page over HTTP and folds the findings into failures
  (`regression/routes.mjs:51,140-151,260-262`). Its pure core is unit-tested at
  `test/audit.test.ts:19-56`. The Next routes never call it
  (`grep` finds no `audit(` in `app/` or `lib/`).

**Guarantee and meaning for a published artifact:** the committed bytes are documented as
audited clean (`CODING_STANDARDS.md:176-181`: “The strip audit is an invariant … A failing
audit means the tree is wrong — fix the tree, never weaken the audit”), but a static publish
does **not** run the audit. Re-pointing the check at the deploy is possible
(`routes.mjs --base`, §9), and it is the only way to re-prove the guarantee on a publish that
transformed bytes. Because the policy is a meta tag and the strip is baked in, a verbatim
copy carries the same clean artifact; any transform that re-serialises pages risks
re-introducing residue.

---

## 9. Dedupe and asset checks (`served/assets.json`, `npm run routes`)

### 9.1 `served/assets.json` shape

- It is a **flat JSON array of 3,118 filename strings**, no objects, no metadata
  (`node -e` shape check: `type array`; 82,967 bytes on disk).
- Names are content-addressed `<sha16>.<ext>`.
- By extension: 1,455 `avif`, 564 `svg`, 316 `png`, 309 `webp`, 221 `jpg`, **152 `css`**,
  64 `woff2`, 9 `gif`, 8 `mp4`, 6 `woff`, **6 `js`**, 5 `webm`, 3 `mp3`.
- **Deduped style/script bodies: 158** entries (152 CSS + 6 JS), all ≥ 1 KB, totalling
  **18,733,690 bytes**. These are the `<style>`/`<script>` bodies ≥ 1 KB that the retired
  dedupe pass externalised once instead of re-encoding on all 1,181 pages
  (`CONTEXT.md:41` **Deduped body**; `CODING_STANDARDS.md:70-77`). The other **2,960** entries are
  binary assets (images, fonts, media).
- `assets.json` total bytes = **526,581,090**. Entries = exactly the referenced set;
  `served/assets/` holds **3,280** files, so **162** on-disk files are unreferenced orphans.

### 9.2 What `npm run routes` asserts about it — `regression/routes.mjs`

- Count agreement: `assetNames.length !== summary.assets.distinct` → failure
  (`regression/routes.mjs:294-296`).
- For each entry (`regression/routes.mjs:298-325`):
  - `fetch(\`${base}/assets/${name}\`)` (`:300`);
  - status must be **200** (`:313-316`);
  - `content-type` must equal `mimeForExt(path.extname(name).slice(1))` (`:317-319`);
  - file must exist at `served/assets/<name>` (`:319-322`);
  - `byteMismatch('/assets/'+name, r.bytes, fs.readFileSync(file))` must be null —
    **byte identity** (`:324`).
- The same block also checks pages: the `200` body equals the page file
  (`regression/routes.mjs:262-270`).

### 9.3 Reuse as post-deploy verification

`regression/routes.mjs` accepts a base URL and **skips starting its own server** when given
one — `regression/routes.mjs:44-45` (“`[--base http://host:port]` (--base skips starting its
own server)”), `:365` (`const external = arg('--base')`). So
`npm run routes -- --base https://<owner>.github.io` re-runs the full route-class check,
injected-layer roster mirror, strip audit, and asset byte-identity against the deployed site.

Two caveats for a **static** deploy:

- Byte-identity compares the deployed response to the **local** `served/` file
  (`regression/routes.mjs:265-267`, `:319-324`). It verifies the deploy did not alter bytes.
  A publish that rewrote `/assets/` prefixes or inlined a disclaimer fails it — which is the
  right outcome.
- It verifies HTTP statuses (200/301/404). GitHub Pages cannot return a server `301`, so the
  redirect-artifact strategy fails the `301` expectation unless the static host supports real
  redirects. `UNVERIFIED:` whether the chosen host can emit the 67 `301`s. Command:
  `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<host>/legal/privacy-notice`.

---

## 10. Size and artifact economics

All measured with `node /tmp/econ.mjs` and `node /tmp/tree-shape.mjs`.

| Metric | Measured |
|---|---|
| Total bytes under `served/` | **682,311,315** (650.7 MiB; `du -sh` 660M) |
| `served/assets/` bytes | **530,830,932** |
| `*.html` count | **1,181** |
| `*.html` total bytes | **149,187,949** |
| Files under 1 KB | **411** (total 114,562 bytes; **0** of them `.html`) |
| `served/index.html` bytes | 132,848 |

**10 largest files:**

| Bytes | File |
|---|---|
| 24,239,455 | `assets/664f7a91391e594e.webm` |
| 23,397,843 | `assets/44ba0788d0c38ab5.webm` |
| 16,809,783 | `assets/0b8f8cbed432f187.mp4` |
| 14,061,797 | `assets/f2b643a918fdff83.mp4` |
| 9,967,779 | `assets/a9fd7f40cb26eac5.webm` |
| 6,767,324 | `assets/ec0963ad4d684524.mp4` |
| 4,013,223 | `assets/a9f28e8f01e641d3.png` |
| 3,862,264 | `assets/93ab25479791afb0.gif` |
| 3,685,998 | `assets/af70eb974c7f6ff1.gif` |
| 3,505,873 | `assets/6d3c761b15673ef1.jpg` |

### 10.1 Strategy A — copy each page file to its route path

Non-root `.html` files = **1,180**; their bytes = **149,055,101** (total HTML minus
`index.html`).

| Metric | Value |
|---|---|
| Added files | **1,180** |
| Added bytes | **149,055,101** |
| Projected total files | **5,646** |
| Projected total bytes | **831,366,416** (~793 MiB; ~831 MB decimal) |

This makes every extensionless route resolve to a real file. Caveats:

- Copying to a **literal extensionless file** (`products/flock-os`) risks GitHub Pages serving
  it as `application/octet-stream` (download instead of render).
  `UNVERIFIED:` the exact content type GitHub Pages assigns to an extensionless file.
  Command: `curl -sI https://<owner>.github.io/<repo>/products/flock-os | grep -i content-type`.
- Copying to **`<route>/index.html`** avoids that (served as `text/html`), at the cost that
  `/<route>` may 301 to `/<route>/`. Either variant is 1,180 files / 149,055,101 bytes.
- Adding these `.html` copies **does** pass the two upstream tests only if they are
  byte-copies of real pages (they are) — `test/upstream-copy.test.ts:231-233`,
  `test/upstream-chrome.test.ts:264-266`.

Add the §6 static-host artifacts (67 redirect stubs + 1 `404.html` = **68** files) and the
projected published set is **~5,714 files**.

### 10.2 Strategy B — assume the host appends `.html`

| Metric | Value |
|---|---|
| Added files | **0** |
| Projected total files | **4,466** |
| Projected total bytes | **682,311,315** |

This is the cheap strategy but **GitHub Pages does not append `.html`** — it maps URL path to
file path directly. Under strategy B, the 1,179 extensionless-linked routes and 1,180 total
page routes 404 (only `/` works, via `index.html`). `UNVERIFIED:` no host tested in-repo;
command that would settle it: `curl -s -o /dev/null -w '%{http_code}\n' https://<owner>.github.io/<repo>/products/flock-os`
against a verbatim publish.

### 10.3 Size against the GitHub Pages limit

`README.md:137-142` sets the binding constraint: GitHub Pages caps a published site at 1 GB.
Strategy A’s **831,366,416 bytes** is under 1 GB but only ~17% headroom. The on-disk tree is
already 682 MB in git, so a `docs/`-folder or `gh-pages`-branch duplicate also doubles the
repository content (~1.4 GB before git compression) — a separate structural constraint on
*how* the artifact is published, not on its bytes.

---

## UNVERIFIED items (each with the command that would settle it)

- Exact status GitHub Pages returns for `POST /api/forms/<key>`: `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<owner>.github.io/<repo>/api/forms/book-a-demo/mktoForm_1009 -d x=1`.
- Content type GitHub Pages assigns to an extensionless route file: `curl -sI https://<owner>.github.io/<repo>/products/flock-os | grep -i content-type`.
- Whether an actually-followed `.html`-appending publish 404s the extensionless routes on the target host: `curl -s -o /dev/null -w '%{http_code}\n' https://<owner>.github.io/<repo>/products/flock-os`.
- Whether the chosen static host can emit real `301`s for the 67 redirect sources: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<host>/legal/privacy-notice`.
- The exact single-page byte deltas between the shipped `scroll`/`legibility` inline bodies and `pipeline/scroll.css` (measured 673 B inline vs 671 B source; not byte-diffed here): `node -e "…extract inline style and diff…"` or `npm run routes` (the mirror reports only comment-only drift as a note).

## Measurement commands (read-only; nothing in the repo was modified)

- Tree shape: `node /tmp/tree-shape.mjs`
- Reference shapes: `node /tmp/refs2.mjs` (output archived at `/tmp/refs2.out`)
- Prefix table: `node /tmp/prefix.mjs`
- Miss attribution: `node /tmp/miss-explain.mjs`, `node /tmp/miss-rows.mjs`
- Assets.json: `node /tmp/assets.mjs`
- Redirects/orphans/inline bodies: `node /tmp/final-data.mjs`
- Economics: `node /tmp/econ.mjs`
- Page-not-referenced: `node /tmp/pagenotref.mjs`
- Grep/`diff`/`wc` citations as quoted inline above.
