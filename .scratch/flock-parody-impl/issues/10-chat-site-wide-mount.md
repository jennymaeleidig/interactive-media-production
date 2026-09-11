# 10: Chat site-wide mount

**What to build:** The mimic appears wherever the original had it, and nowhere else. A census of the Captures records which pages mounted the launcher; the serving layer mounts the mimic on exactly those pages.

**Blocked by:** 07, 09.

## Comments

- From ticket 09 (2026-09-10): the widget stylesheet now carries the
  Capture's own `Inter var` regular face inline (~303KB of base64 in
  `components/chat-widget.css`). Mounting the widget site-wide puts that CSS
  into every served page. The original capture inlined the same fonts, so
  this is faithful and keeps the zero-outbound-requests invariant — but it is
  a site-weight line item to weigh (or subset) when this ticket lands.

**Status:** resolved
Label: ready-for-agent

- [x] The build records, per page, whether the original mounted the chat launcher.
- [x] The mimic is mounted on every page where the original had it.
- [x] The mimic is absent from pages where the original did not have it.
- [x] The launcher and its behavior are consistent across all mounted pages.
- [x] The serving check (`npm run routes`) remains green with the mimic mounted site-wide.

## Implementation (2026-09-10)

**The census is taken from the Captures, at the strip seam.** Qualified mounted
its launcher as the `<q-root>` custom element on exactly the pages that had
chat. The build now tests that marker on the capture bytes *before* the strip
removes it (`LAUNCHER_RE` in `pipeline/build.mjs` — the same constant is the
strip target, so census and strip can never drift), records `chatLauncher`
per page in `served/build-log.json`, and counts it into `build-summary.json`
(`chat: {mounted, absent}`). Full run: **1,171 mounted + 9 absent = 1,180
served**; the 9 are `/safety-without-overtime-flock-safety-fifa-2026` and
eight `/blog/*` posts. The one dropped capture that also lacked the launcher
(`/webinar/webinar-test-evens-page`) is not served, so it is absent from the
mounted/absent identity by construction.

**The mount is a build pass, on the frozen-tree rule.** The served tree is
frozen and byte-identity is the serving layer's guarantee, so the mimic is
injected by a new pass (`chatPass`, after interactions, before the story-hook
seam) and only into pages whose census flag is set. The pass inlines
`pipeline/chat-widget.css` + `pipeline/chat-widget.js` under
`data-flock-parody="chat"`, so the script census counts them as the
Recreation's own runtimes and the executable count stays 0.

**The widget was ported from React to an injected runtime.** The ticket-09
`components/ChatWidget.tsx` could not run on captured pages (they are raw
served HTML, and the serving route returns build bytes unmodified), so its
logic became `pipeline/chat-widget.js` — plain browser JS, ES5-safe, DOM-only,
the standards' documented injected-runtime exception. The runtime creates the
whole widget DOM: no launcher in the static markup, so a no-JS page boots to
the captured end-state exactly as the original's script-injected launcher did.
The dev driver page (`app/chat-demo`) and the now-unused `components/` files
and root `app/layout.tsx` are gone. One behavioral fix over the React port: a
session that goes live while a pounce is armed cancels the timer (the
captured "a live session never re-pounces" contract), with a race test.

**Widget stylesheet mount adaptation.** The token block moved from `:root` to
`.fpc-root`. The original widget ran in a Qualified iframe with its own
document; inlined into a served page, `:root` would be the host page's root,
where any of the 94 `--THEME_*`/`--MESSAGE_*` names could leak into page CSS.
Every rule in the injected CSS is now `.fpc-` scoped (verified: 34/34
selectors), with the one captured `@font-face` (the served pages themselves
carry no `Inter var` face — it lived in the stripped `q-root` srcdoc).

**Site-weight decision (the ticket-09 comment's open question).** The full
339KB stylesheet (303KB of it the captured `Inter var` face) is inlined on
each mounted page: **served/ grew 2.8GB → 3.2GB (~410MB)**. Kept unsubsetted,
because subsetting would pin the face to the fixture's current glyphs and
silently break the artist's real Yarn content, and because it is faithful:
the Capture already inlined this same face in the stripped `q-root` srcdoc, so
each served page is still *smaller* than its Capture (`/` 10.3MB vs 12.0MB).
Revisit only if publication makes the served tree's size a real constraint.

**Footer privacy link.** The captured widget linked `legal/privacy-policy` out
to the live site; per the Recreation's link policy the injected widget points
at the local `/legal/privacy-policy` (served), same text.

**Captured CSP — a real-browser find the DOM seam could not see.** Every one
of the 1,180 served pages carries the Capture's own CSP meta:
`default-src 'none'; font-src 'self' data:; … script-src 'unsafe-inline'
data:; …` — with **no `connect-src`**, so `default-src 'none'` refuses every
`fetch`/XHR. The captured page never needed one (Qualified ran in an iframe);
the mimic's same-origin `POST /api/chat` does. The first browser smoke showed
the pounce firing with an *empty* card — the fetch was blocked. The mount now
appends exactly `connect-src 'self';` to the captured policy on launcher
pages only (logged as `csp` per page in the build log); `'self'` is the
Recreation origin, so the grant cannot reach a third party, and the rest of
the policy — `default-src 'none'` included — is byte-untouched. jsdom does not
enforce CSP, so this is guarded by pipeline + serving-seam tests rather than
the DOM seam. Re-verified in a real browser: launcher 54×54 inset 17px,
pounce card 332px wide with the pinned greeting + hub chips, a chip turn
echoing once as a user bubble with the next reply, session surviving reload.

### Verification

- `npx tsc --noEmit` clean; `npm test` **168 green across 9 projects** (the
  re-pointed `chat-widget-seam` runs the injected bytes in jsdom: 12 tests;
  the serving seam adds the mount + CSP-grant assertions over HTTP).
- `npm run pipeline` full run: 1,180 served, every page audit clean, 0
  executable scripts, census 1,171/9.
- `npm run build` succeeds (no `/chat-demo` route remains).
- `npm run routes`: **1,279 routes green**, 1,180/1,180 byte-identical bodies,
  count identity and site-wide strip audit clean with the mimic mounted.
- Two-axis code review (Standards / Spec) in parallel sub-agents: no hard
  standards violations, no scope creep; its findings drove the shared
  `layerTag` helper, the `absorb` → `applyResponse` rename, the
  `CODING_STANDARDS.md` edit, and deleting the now-dead `app/layout.tsx`.
