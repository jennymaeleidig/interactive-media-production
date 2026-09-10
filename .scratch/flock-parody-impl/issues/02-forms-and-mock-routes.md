# 02: Forms & mock routes

**What to build:** Every served form behaves like the original without ever sending data anywhere. Form markup stays identical to the Capture; the build injects a POST action pointing at a local mock route keyed per form. The mock route swallows the submission and redirects to the captured thank-you page. Marketo forms render fully styled from the Capture's own stylesheets, with no authored mock CSS.

**Blocked by:** 01.

**Status:** resolved
Label: ready-for-agent

- [x] A served main-flow form preserves the captured markup exactly.
- [x] Submitting it POSTs to the local mock route, which returns a redirect to the captured thank-you page.
- [x] No submission leaves the machine; no external endpoint is contacted.
- [x] Marketo forms render fully styled exactly as captured.
- [x] Hidden clones and the scheduler embed remain inert.
- [x] Form routing is logged per page by the build.

## Comments

**Implemented** (commits on `main`, ticket 02 + review fixes):

- **Forms pass (pass 3)** in `pipeline/build.mjs`: routes a form iff its `id` matches the routing allowlist (`mktoForm_\d+`, `wf-form-*`, `email-form`) and it isn't Webflow filter furniture (`fs-cmsfilter-element`). Hidden Marketo clones carry no id → inert by construction (never touched). Injects `action="/api/forms/<pageKey>/<formId>" method="post"` right after `<form`; the rest of the captured tag stays byte-identical. The chat widget's HTML-escaped pseudo-forms (`&quot;` in attrs) are skipped — they're text inside attribute values, never real DOM forms.
- **Redirect target**: capture markup never reveals it (the live choice lived in the stripped JS), so the target is build config — `THANKYOU_DEFAULT = '/thank-you'` (the one flow the live site observably lands: demo request → thank-you), with `THANKYOU_BY_PAGE` for per-page overrides as evidence arrives. Webflow lead forms route too ("every served form behaves like the original"); their default target is the same documented guess.
- **Mock route** `app/api/forms/[...key]/route.ts`: POST swallows the submission (body never read) → 303 to the manifest's root-relative path; unknown key → 404; GET → 405; protocol-relative/absolute manifest targets rejected. Reads `served/forms-manifest.json` (written every build, even empty) — a route only exists if the build routed a form to it. Shared `lib/serving.ts` (servedDir/notFound) with the catch-all.
- **Zero-outbound, by construction**: corpus census — 631 captured form opens, ZERO carry an `action` (verified across all 1,199 pages); the only actions in served bytes are the injected local ones. New audit key `externalFormActions` (must be 0, checked on final bytes). Captured `action=`/`method=` would be replaced + warned, not duplicated (defensive; census 0/0).
- **Scheduler embed**: `/chilipiper-2` added to pages.list + a fixture page — `chiliCalFrame`'s frozen srcdoc iframe survives byte-intact (SingleFile already stripped its scripts; zero in the real capture), no form action anywhere on the page.
- **Marketo styling**: `mktoForms2BaseStyle`/`mktoForms2ThemeStyle` + the site's `.mktoForm` override blocks survive the strip untouched — fully styled from the Capture's own stylesheets, zero authored mock CSS. Verified on the real `/book-a-demo`.
- **Log**: per-page `entry.forms` records `{key, formId, action, redirectTo}`; duplicate routable ids log a warning and route only the first.
- **Tests (38, green)**: fixture pages `book-a-demo` (main form + hidden clone + filter form + escaped chat pseudo-form + Marketo CSS), `gsx` (Webflow lead form), `chilipiper-2` (scheduler embed + clone), `thank-you` (redirect target). Pipeline seam: injection byte-shape, inertness of clones/filters/scheduler, Marketo CSS presence, per-page log, manifest, external-action audit. HTTP seam: POST → 303 `/thank-you` with empty body, redirect lands on the captured thank-you page, unknown keys 404, GET 405, no external actions served.
- **Real-run verified**: 8/8 subset pages audit clean incl. `/chilipiper-2`; `/book-a-demo` routes `mktoForm_1009` → `/thank-you`; end-to-end curl smoke: POST → 303 → captured "Thank You for Requesting Your Flock Safety Demo" page.

**Two-axis review** (code-review, parallel sub-agents) found: duplicate-id silent skip (fixed — now warned), protocol-relative redirect hole (fixed), duplicated serving helpers (fixed — extracted), stale pass-list comment (fixed), missing scheduler fixture coverage (fixed), captured `method=` hole (fixed). Declined with rationale: inline the thankyou override table (needed by "keyed per form"), un-route Webflow forms (ticket header: every served form), drop the `&quot;` guard (load-bearing against attribute-value corruption), dedupe test regexes (standards forbid shared test internals).
