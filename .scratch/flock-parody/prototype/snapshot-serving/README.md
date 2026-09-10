# PROTOTYPE: snapshot-serving pipeline (wayfinder ticket 05)

**Throwaway.** Lives with the effort at
`.scratch/flock-parody/prototype/snapshot-serving/`. Answers one question —
*what is the repeatable pipeline from the capture run to a served page that hits
the fidelity bar with minimum work?* — proven once on the homepage (hardest
page: split-text hero, chat mount, densest payload) plus four pages across
template families for the mechanism (product, post, thank-you, and the form
page). Not production code and not the piece.

## Run it

```bash
npm install
npm run pipeline     # capture → served/ (subset from pipeline/pages.list; empty it for all 1,199)
npm run dev          # → http://localhost:3000  (WATCHPACK_POLLING baked in — sandbox needs it)
# regression (needs colima up + dev server running):
PORT=<port> bash regression/shoot.sh
npm run diff
```

## The pipeline (five passes, one Node script, zero deps)

`pipeline/build.mjs` reads the capture run (`research/flocksafety/2026-09-09/`,
gitignored, reproducible via ticket 09's runbook) and writes a mirrored tree to
`served/`. Every page:

1. **Strip** — DOM surgery only. Captures carry **zero executable scripts**
   (SingleFile stripped them at capture time; only 2 JSON-LD blocks remain), so
   *zero outbound requests is true by construction* once strip-DOM is gone. The
   converged strip list, audited to zero residue per page:
   - `_qualified-offer-host` div (the pounce card: "headline banner" copy + Read
     Now CTA + dismiss — the whole cluster lives in this one fixed div)
   - `q-root` custom element — the chat **launcher** (92×92 bubble + inlined CSS,
     ~1.8 MB/page) with its AI-assistant a11y guard divs
   - `q-focus-sentinel` elements
   - all `<style id=qualified-offer-…>` blocks + bare `<style>` blocks whose
     content mentions `qualified-offer-` (orphaned layout-shift CSS in `<head>`)
   - `qualified-offer-header-shifted-element=true` attributes (smeared onto real
     page elements) and the `--qualified-offer-header-height` var on `<body>`
   - OneTrust: `onetrust-banner-sdk`, `onetrust-pc-sdk`, `onetrust-pc-dark-filter`,
     the empty `onetrust-consent-sdk` root, `<style id=onetrust-style>`
   - audit baseline after strip: `qualified=0`; `onetrust=1` — the footer
     "Your Privacy Choices" webform link, which is **site content** and stays
     under the external-links-stay-live policy.
2. **Rewrite links** — `href` absolute `https://(www.)flocksafety.com/X` →
   `/X`, quoted and unquoted (SingleFile emits unquoted attrs); 33 links on the
   homepage. External links untouched. `src`/meta/JSON-LD URLs untouched
   (nothing loads from them — assets are all data-URIs).
3. **Forms** — main-flow forms keep identical markup; the build injects
   `method=post action=/api/forms/<slug>` (Marketo forms have no action attr —
   their submit was JS, which captures don't carry). `/book-a-demo`'s visible
   `mktoForm_1009` → `/api/forms/book-a-demo` is the proof case. Hidden
   Marketo clones and the Chili Piper embed stay as inert markup.
4. **Inject the story-hook seam** — inline `<script>` at EOF (captures are
   **truncated before `</body></html>`** — SingleFile CLI never emits closing
   tags; the pass appends them back). Dormant: the runtime ships, nothing calls
   it. See contract below.
5. **Write + log** — every mutation lands in `served/build-log.json`.

## Serving (Next.js, ~40 lines total)

- `app/[[...path]]/route.ts` — GET resolves `served/<path>.html` (or
  `<path>/index.html`), else 301 from `served/redirects.json` (the run's
  `manifest-uncaptured.csv`, 56 redirect stubs → local targets), else 404.
  **Dead roots (`/ebooks`, `/webinar`, `/video`, `/events`) 404** — the live
  site 404s them; reproducing observed behavior *is* the fidelity bar. (Ratify
  at walkthrough.)
- `app/api/forms/[slug]/route.ts` — swallows the POST (nothing leaves the
  machine) and 303s to the captured thank-you page.

Verified: `/` 200 · `/book-a-demo` 200 · `/legal/privacy-notice` 301 →
`/legal/privacy-policy` · `/ebooks` 404 · `POST /api/forms/book-a-demo` 303 →
`/thank-you`.

## Regression check (two comparisons, three renders per viewport)

Same chromium build (Docker `capsulecode/singlefile`, `--headless` — note
`--headless=new` hangs in this image; `--timeout` self-limits each shot) at
1440×900, 768×1024, 390×844. Control: identical renders are **0 px apart** —
the renderer is deterministic, diffs measure content.

- **Serving gate** (automated, ~0 tolerance): pipeline output over http **vs**
  the same bytes rendered from disk — **0 px at all three viewports**. The
  serving layer is pixel-invisible.
- **Strip report** (informational + human-reviewable diff PNGs): raw capture vs
  served differs only in strip-list regions — homepage: the Qualified offer bar
  (top, full width), the OneTrust consent card (bottom-left), and a **52 px
  reflow** (the captured page reserved header height for the offer bar; the
  served page reclaims it). Everything else — hero, nav, stat cards, responsive
  mobile layout — is pixel-identical.

## The story-hook contract (for the spec)

`window.flockParody.apply(patches)` — `patches`: array of
`{ selector, text? | html? | src? | style? }`.

| op | effect |
|----|--------|
| `text` | `el.textContent = text` |
| `html` | `el.innerHTML = html` |
| `src` | `el.setAttribute('src', src)` |
| `style` | camelCase props merged onto `el.style` |

Array order; missing selector → skipped with `console.debug`, never throws;
returns count applied; safe pre-DOM-ready (queues until `DOMContentLoaded`).
DOM-only, no network — fidelity-bar safe. Dormant in the Recreation; the
parody phase's yarnspinner dialogue events drive it (`lib/chat-engine.ts`'s
event stream → `apply()` patch lists).

## What the prototype surfaced (beyond the pipeline)

- **Captures are frozen post-JS DOM.** No scripts survive in any capture, so
  served pages are fully static: GSAP/Lenis never run, animations sit at their
  captured end-state, Marketo forms render unstyled (the `book-a-demo` mktoForm
  is frozen at its pre-JS 2531 px width — the worst case of the frozen-DOM
  model). The fidelity bar's "runtime behavior" clause resolves to: **the
  Recreation's runtime IS the chat mimic + story hooks; nothing else animates.**
  Spec must say this plainly. (Ratify at walkthrough.)
- **The "headline banner" title-swap mystery** (ticket 03): the 260
  "Message from Flock Safety" title rewrites were Qualified's pounce script —
  gone with the scripts; captures carry repaired titles. Closed.
- **Residue kept on purpose** (content, not tracker): footer
  `privacyportal.onetrust.com` webform links; one internal link carrying
  Qualified's `?q_offer_info=` param (kept verbatim — word-for-word bar;
  inert locally).

## Environment facts hit while building (sandbox)

- `WATCHPACK_POLLING=true` required (known from ticket 04) — launching
  `npx next dev` directly without it 404s every route (EMFILE watcher death →
  empty route manifest).
- `--headless=new` hangs forever in `capsulecode/singlefile`; old `--headless`
  + `--timeout=30000` works, screenshots a 12 MB data-URI page in seconds.
- Renders are deterministic across containers: same image + flags → 0 px
  between identical loads. The diff methodology stands on this.
