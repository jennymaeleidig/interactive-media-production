// The build pipeline: Capture in → served tree + per-page mutation log out.
// A pure transformation (spec, Testing Decisions): no live site, no network.
//
// Passes (this effort, ticket 01 carries the first two):
//   1. strip   — remove the third-party machinery from the captured DOM
//                (Qualified offer host + chat launcher + styles, OneTrust
//                consent stack). Captures carry zero executable scripts
//                (SingleFile stripped them at capture time), so once the
//                strip DOM is gone, "zero outbound requests" is true by
//                construction — the audit pass asserts it per page.
//   2. (retired) header-restore — ticket 14 grafted the shared header's lost
//                bytes (mega-menu panels, nav state CSS, sticky offset) from a
//                vendored corrected-flags homepage artifact. Ticket 15 moved
//                the whole build to a corrected-flags capture run, whose
//                stylesheet keeps every nav rule and whose DOM keeps every
//                hidden subtree (images ride along as SingleFile's --sf-img
//                background vars, and the mobile take-over CTA carries its
//                live demo href), so the graft is retired. The nav behavior
//                layer stays (pass 7) because the captures carry no scripts.
//   3. rewrite — internal hrefs https://(www.)flocksafety.com/X → /X
//                (Recreation routes); external links stay live.
//   4. forms   — captured lead forms carry no action (their live submission
//                went through the stripped JS), so the pass injects a POST to
//                a local mock API route keyed per form; the mock route
//                swallows the submission and 303-redirects to the captured
//                thank-you page (spec, Forms). Nothing ever leaves the
//                machine: the only actions in served bytes are the injected
//                local ones, and the audit counts any external form action.
//   5. motion  — the motion reveal layer (ticket 04): normalize every captured
//                animation FROM-state to its end-state in the static DOM
//                (no-JS pages are the styled end-state by construction),
//                annotate split words with per-word --fpm-i stagger indices,
//                tag generic inline zero-opacity from-states for the observer,
//                then inject motion.css + motion-runtime.js inline. Reveals
//                fire one-shot only when JS runs and reduced motion allows.
//   6. interactions — the delegated interaction layer (ticket 05): inject
//                interactions.css + interactions-runtime.js inline. One
//                delegated click listener operates tabs, dropdowns,
//                accordions, and sliders by captured classes and geometry —
//                zero per-page bespoke logic, and reduced motion never blocks
//                function. The CSS half is suppress-only: it silences the
//                captured accordion height tween the ticket rules
//                function-only, and never adds an animation.
//   7. nav     — the shared header's behavior layer (ticket 14): inject
//                nav.css + nav-runtime.js inline. It moves the class
//                vocabulary the restored live CSS renders — .header-z.scroll
//                on scroll, .nav__dd.show on desktop hover and mobile tap,
//                .header__bg.is-open plus the mobile take-over on the
//                hamburger. Ticket 05's sf-hidden nav placeholder is gone, and
//                the trigger click still navigates on desktop.
//   8. chat    — mount the Chat mimic (ticket 10) on exactly the pages whose
//                Capture mounted the Qualified launcher (the per-page census
//                this pass records). chat-widget.css + chat-widget.js are
//                injected inline, verbatim; the runtime creates the whole
//                widget DOM (no-JS pages stay at the captured end-state), so
//                the launcher behaves identically on every mounted page. One
//                outbound request: the same-origin POST to /api/chat.
//   9. story-hook — the dormant DOM-patching seam, injected inline on every
//                page (pipeline/story-hook.js, ticket 03). It only DEFINES
//                window.flockParody — nothing in the Recreation calls it; the
//                Parody layer will. DOM-only, zero network, and it degrades
//                to the captured end-state with JavaScript disabled (it ships
//                inert). The data-flock-parody attribute marks the script so
//                the census can tell the Recreation's own runtime from
//                capture residue (which must stay at zero executable).
//   W. write   — mirrored tree under the output dir; captures are truncated
//                before </body></html> (SingleFile CLI never emits them), so
//                the pass restores the closing tags; every mutation lands in
//                build-log.json, per page.
//
// Build-level outputs (ticket 07):
//   redirects.json  — the run's uncaptured manifest filtered to legacy
//                     redirect stubs → local targets; the serving route
//                     answers them with a permanent redirect.
//   build-summary.json — requested / served / dropped / error counts, the
//                     redirect count, and any warning (invalid or dangling
//                     redirect targets). The whole-site count check reads it.
//   Scaffold/test pages (pipeline/config.mjs DROPPED_PAGES) are not written
//   and any stale served file for one is removed — dropped from serving
//   entirely.
//
// Usage: node pipeline/build.mjs [--run <captureRunDir>] [--out <dir>]
//                                [--pages /a,/b] [--list <file>]
//   Defaults: --run pipeline/config.mjs CAPTURE_RUN, --out served,
//             pages from pipeline/pages.list (empty = the full capture list).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUncapturedManifest } from './run-manifest.mjs';
import { makeArg, invokedDirectly } from './cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---- strip targets ----------------------------------------------------------
// The captured launcher census marker: Qualified mounted its chat launcher as
// the <q-root> custom element on exactly the pages that had chat (corpus:
// 1,189 of 1,199 captures). The same marker is the strip target below, so the
// ticket-10 census (which pages get the mimic mounted) and the strip can never
// drift apart.
const LAUNCHER_RE = /<q-root\b/i;

// DOM subtrees removed whole. `mode: 'balance'` scans to the balanced close of
// `tag`; `mode: 'to-close'` scans to `close`. `all: true` repeats until the
// pattern is gone (Qualified injects several orphaned style blocks with the
// same id prefix into <head>). `contentRe` keys a target on its content, so an
// ordinary block that happens to match `start` is kept.
const STRIP_TARGETS = [
  { name: 'qualified-offer-host', start: /<div[^>]*\sid=("|')?_qualified-offer-host-/i, mode: 'balance', tag: 'div' },
  { name: 'q-root (chat launcher)', start: LAUNCHER_RE, mode: 'balance', tag: 'q-root' },
  { name: 'q-focus-sentinel', start: /<q-focus-sentinel\b/i, mode: 'balance', tag: 'q-focus-sentinel' },
  { name: 'qualified-offer-style-element', start: /<style[^>]*\sid=("|')?qualified-offer-/i, mode: 'to-close', close: /<\/style\s*>/i, all: true },
  { name: 'qualified-offer CSS (bare style)', start: /<style[^>]*>/i, mode: 'to-close', close: /<\/style\s*>/i, contentRe: /qualified-offer-/, all: true },
  { name: 'onetrust-pc-dark-filter', start: /<div[^>]*class=("|')?[^>]*\bonetrust-pc-dark-filter\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-consent-sdk (empty root)', start: /<div[^>]*\sid=("|')?onetrust-consent-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-banner-sdk', start: /<div[^>]*\sid=("|')?onetrust-banner-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-pc-sdk', start: /<div[^>]*\sid=("|')?onetrust-pc-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-style', start: /<style[^>]*\sid=("|')?onetrust-style\b/i, mode: 'to-close', close: /<\/style\s*>/i },
  // Account surfaces are stripped, not mocked: the live site's Sign In chrome
  // (header button, footer link) points at the account portal, and the one
  // inline copy link points at the auth host. Chrome anchors go wholesale;
  // copy links are unwrapped below so the words survive (word-for-word bar).
  // Keyed on the host, never on the word "account" — the corpus uses that word
  // in ordinary copy ("Account Executive", "account representative").
  { name: 'account sign-in link', start: /<a\b[^>]*?\bhref\s*=\s*("|')?(?:https?:)?\/\/(?:users|login)\.flocksafety\.com[^>]*>/i, mode: 'balance', tag: 'a', all: true, contentRe: /\bclass\s*=\s*("|')?[^"'>]*\b(?:button|footer-5_link|sign-in)\b/i },
];

// Post-strip audit regexes — any hit suggests strip-list incompleteness.
// Both vendor keys target the MACHINERY (ids/classes/scripts/var names), not
// the English word: the footer "Your Privacy Choices" link keeps the brand
// string, and page copy legitimately says "qualified" ("qualified
// electrician", "qualified applicants" — corpus: 16 pages), so a bare-word
// match would flag content as residue. Machinery markers, by contrast, must
// be zero.
const AUDIT_RES = {
  qualified: /qualified-offer-|qualified\.com|_qualified-|q-root\b|q-focus-sentinel|q-launcher|q-messenger-frame/i,
  onetrust: /onetrust-(?:banner|pc|consent|style|accept|reject|close|privacy|policy|customize|filter)|ot-sdk|ot-sync/i,
  // no account/auth affordance or route off the machine may survive the strip
  // (the account portals and the Auth0 login host)
  account: /(?:users|login)\.flocksafety\.com/i,
  'known trackers': /googletagmanager\.com|google-analytics\.com|hotjar\.com|hockeystack\.com|bing\.com\/bat|linkedin\.com\/px|connect\.facebook\.net|snap\.licdn\.com|6sense\.com|marketo\.com|munchkin\.marketo/i,
  // a form action that leaves the machine (ticket 02): absolute or
  // protocol-relative. Injected mock actions are root-relative /api/... and
  // never match; the count must stay zero on every page.
  externalFormActions: /<form\b[^>]*?\saction\s*=\s*("|')?(?:https?:)?\/\//i,
};

// ---- helpers ----------------------------------------------------------------

/** End index (exclusive) of the balanced `tag` subtree opening at `start`. */
function balanceEnd(html, start, tag) {
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth += 1;
    }
  }
  return -1; // unbalanced — caller logs and leaves the subtree in place
}

/** End index (exclusive) of the first `close` match at/after `start`. */
function toCloseEnd(html, start, close) {
  const m = close.exec(html.slice(start));
  return m ? start + m.index + m[0].length : -1;
}

/** `pagePath` → capture-tree/served-tree relative file ("/" is the root capture). */
function relFileFor(pagePath) {
  return pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '.html';
}

function captureFileFor(runDir, pagePath) {
  return path.join(runDir, relFileFor(pagePath));
}

function servedFileFor(outDir, pagePath) {
  return path.join(outDir, relFileFor(pagePath));
}

/** The only script type allowed in served bytes — inert JSON-LD data. */
const LD_JSON_TYPE = /\btype\s*=\s*("|')?application\/ld\+json/i;

// ---- pass 1: strip -----------------------------------------------------------

function stripPass(html, entry) {
  for (const t of STRIP_TARGETS) {
    let removed = 0;
    const re = new RegExp(t.start.source, t.start.flags.replace('g', '') + 'g');
    for (let guard = 0; guard < 100; guard++) {
      const m = re.exec(html);
      if (!m) break;
      const start = m.index;
      const end = t.mode === 'balance' ? balanceEnd(html, start, t.tag) : toCloseEnd(html, start, t.close);
      if (end < 0) {
        entry.warnings.push(`${t.name}: UNBALANCED — left in place`);
        break;
      }
      const content = html.slice(start, end);
      if (t.contentRe && !t.contentRe.test(content)) {
        // content-keyed target: this block isn't strip residue — keep scanning after it
        re.lastIndex = end;
        continue;
      }
      html = html.slice(0, start) + html.slice(end);
      removed += end - start;
      re.lastIndex = 0; // html shifted — rescan from the top
      if (!t.all) break;
    }
    if (removed > 0) entry.stripped[t.name] = removed;
  }

  // Inline account/auth links that are page copy (the FAQ's "Help Center"
  // link) keep their words but lose the link — word-for-word copy stays
  // intact, and no account affordance or route off the machine remains.
  const accountCopyRe = /<a\b[^>]*?\bhref\s*=\s*("|')?(?:https?:)?\/\/(?:users|login)\.flocksafety\.com[^>]*>([\s\S]*?)<\/a>/gi;
  let unwrapped = 0;
  html = html.replace(accountCopyRe, (_m, _q, inner) => {
    unwrapped += 1;
    return inner;
  });
  if (unwrapped > 0) entry.stripped['account link unwrapped (copy kept)'] = unwrapped;

  // Attribute cleanup — Qualified smeared a header-shift flag onto real page
  // elements and left its layout-shift var inline on <html>/<body>.
  const attrHits = html.match(/\squalified-offer-header-shifted-element=("true"|true)/g);
  if (attrHits) {
    html = html.replace(/\squalified-offer-header-shifted-element=("true"|true)/g, '');
    entry.stripped['qualified header-shift attrs'] = attrHits.length;
  }
  const varHits = html.match(/--qualified-offer-header-height:[^;"'>]*/g);
  if (varHits) {
    html = html.replace(/--qualified-offer-header-height:[^;"'>]*;?/g, '');
    // the var may have been a style attribute's only content — drop the now-empty attr
    html = html.replace(/\sstyle=(""|''|(?=[>\s]))/g, '');
    entry.stripped['qualified header-height var'] = varHits.length;
  }
  // …and Qualified also injected REFERENCES to its header vars into real
  // elements' inline styles — corpus: 4 pages carry the Vocal Video popover's
  // `top: calc(0px + var(--qualified-offer-header-inline-style-offset,
  // var(--qualified-offer-header-height,0px)))`. With the assignment gone the
  // reference resolves to its innermost 0px fallback — the reclaimed
  // header-height state — so the whole var() reference is replaced with that
  // fallback instead of leaving machinery DNA (and the strip audit red).
  const refHits = html.match(/var\(--qualified-offer-header-/g);
  if (refHits) {
    html = html.replace(/var\(--qualified-offer-header-[a-z-]+(?:\([^()]*\)|[^()])*\)/g, '0px');
    entry.stripped['qualified header-height var references'] = refHits.length;
  }

  // Strip every remaining executable <script>. Captures should carry zero
  // executable scripts (SingleFile removed the page's JS at capture time), but
  // frozen helper shims survive in places (e.g. a shadow-DOM reparenting
  // function on /products/license-plate-readers). Only application/ld+json
  // data blocks stay — inert, and part of the captured DOM.
  html = stripExecutableScripts(html, entry);

  return html;
}

function stripExecutableScripts(html, entry) {
  let removed = 0;
  let pos = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const openRe = /<script\b[^>]*>/gi;
    openRe.lastIndex = pos;
    const m = openRe.exec(html);
    if (!m) {
      if (guard === 999) entry.warnings.push('executable scripts: guard limit hit — rescan aborted, served bytes may still carry scripts');
      break;
    }
    const closeRe = /<\/script\s*>/gi;
    closeRe.lastIndex = m.index + m[0].length;
    const cm = closeRe.exec(html);
    // unclosed script tag: remove the tag alone (nothing executable can hide behind it)
    const end = cm ? cm.index + cm[0].length : m.index + m[0].length;
    if (LD_JSON_TYPE.test(m[0])) {
      pos = end; // inert data — keep whole, and don't scan inside it
    } else {
      html = html.slice(0, m.index) + html.slice(end);
      removed += end - m.index;
      pos = m.index; // html shifted — rescan from here
    }
  }
  if (removed > 0) entry.stripped['executable scripts'] = removed;
  return html;
}

// ---- pass 3: rewrite links ---------------------------------------------------

/** Rewrite internal hrefs (quoted, single-quoted, unquoted; absolute + protocol-relative) to root-relative Recreation routes. */
function rewritePass(html, entry) {
  let count = 0;
  const rewrite = (rest) => {
    count += 1;
    return rest.startsWith('/') ? rest : '/' + rest;
  };
  html = html.replace(/href="(https?:)?\/\/(www\.)?flocksafety\.com([^"]*)"/gi, (_, _p, _w, rest) => `href="${rewrite(rest)}"`);
  html = html.replace(/href='(https?:)?\/\/(www\.)?flocksafety\.com([^']*)'/gi, (_, _p, _w, rest) => `href='${rewrite(rest)}'`);
  html = html.replace(/href=(https?:)?\/\/(www\.)?flocksafety\.com([^\s">]+)/gi, (_, _p, _w, rest) => `href=${rewrite(rest)}`);
  if (count > 0) entry.linksRewritten = count;
  return html;
}

function auditHtml(html) {
  const audit = {};
  for (const [name, re] of Object.entries(AUDIT_RES)) {
    audit[name] = (html.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) || []).length;
  }
  return audit;
}
/** Script census of served bytes. `executable` counts capture-derived scripts — must stay 0 (the audit invariant). `ldJson` are inert data blocks; `injected` are the Recreation's own marked runtimes (data-flock-parody). */
function scriptCensus(html) {
  const openTags = html.match(/<script\b[^>]*>/gi) ?? [];
  const injected = openTags.filter((t) => /data-flock-parody=/i.test(t)).length;
  const ldJson = openTags.filter((t) => LD_JSON_TYPE.test(t)).length;
  const executable = openTags.length - injected - ldJson;
  return { total: openTags.length, executable, ldJson, injected };
}

// ---- pass 4: form routing (ticket 02) ----------------------------------------

// The captured demo flow's thank-you page — the one redirect target the live
// site's main flow observably lands on. Per-page overrides go in the table
// below as capture evidence for other flows arrives; until then every routed
// form points here (the capture's markup itself never reveals the target —
// the live choice lived in the stripped JS).
const THANKYOU_DEFAULT = '/thank-you';
const THANKYOU_BY_PAGE = {}; // original page path → thank-you path

// A form routes iff its id is in this allowlist AND it is not Webflow filter
// furniture (fs-cmsfilter-element, a client-side filter whose original
// behavior was JS, not submission). Hidden Marketo clones carry no id, so the
// allowlist keeps them inert by construction — never touched, as captured.
const ROUTED_FORM_ID = /^(?:mktoForm_\d+|wf-form-[A-Za-z0-9_-]+|email-form)$/;

/** Original page path → URL-safe manifest-key segment ("/" → "index"). */
function pageKeyFor(pagePath) {
  return pagePath === '/' ? 'index' : pagePath.replace(/^\//, '');
}

function thankyouFor(pagePath) {
  return THANKYOU_BY_PAGE[pagePath] ?? THANKYOU_DEFAULT;
}

/**
 * Inject `action` + `method=post` on every routable form; return the per-page
 * routing records and the manifest additions. Tags whose attrs carry `&quot;`
 * are HTML-escaped pseudo-forms (nested chat markup inside an attribute
 * value) — never real DOM forms, left untouched.
 */
function formsPass(html, entry, pagePath, manifest) {
  const routed = [];
  html = html.replace(/<form\b([^>]*)>/gi, (tag, attrs) => {
    if (/&quot;/i.test(attrs)) return tag; // escaped pseudo-form, not a real form open tag
    const idMatch = /\bid\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const formId = idMatch ? (idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? '') : '';
    if (!ROUTED_FORM_ID.test(formId)) return tag;
    if (/\bfs-cmsfilter-element\b/i.test(attrs)) return tag; // filter furniture — inert
    if (routed.some((r) => r.formId === formId)) {
      // duplicate id — route the first, log the anomaly (log discipline:
      // warnings for anything left in place)
      entry.warnings.push(`${formId}: duplicate form id — only the first is routed`);
      return tag;
    }
    const key = `${pageKeyFor(pagePath)}/${formId}`;
    const action = `/api/forms/${key}`;
    const redirectTo = thankyouFor(pagePath);
    if (/\baction\s*=/i.test(attrs) || /\bmethod\s*=/i.test(attrs)) {
      // no captured form in this corpus carries an action or method (census:
      // 0/0); if a future capture ever does, neither may survive the
      // injection — replace, don't append (no duplicate attributes)
      entry.warnings.push(`${formId}: captured action/method replaced with the local mock route`);
      attrs = attrs.replace(/\s*action\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
      attrs = attrs.replace(/\s*method\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
    }
    routed.push({ key, formId, action, redirectTo });
    manifest[key] = { page: pagePath, formId, redirectTo };
    return `<form action="${action}" method="post"${attrs}>`;
  });
  if (routed.length > 0) entry.forms = routed;
  return html;
}

// ---- pass 5: motion reveal layer (ticket 04) ----------------------------------

// Open-tag pattern that honors quoted attribute values (SingleFile emits
// quoted and unquoted attrs side by side). Fresh regex per pass — these
// functions combine exec loops and String.replace, which fight over lastIndex.
function openTagRe() {
  return /<([a-z][a-z0-9]*)((?:[^<>"]|"[^"]*"|'[^']*')*)>/gi;
}

// Zones whose contents are never page DOM: <style>/<script> bodies (the
// inlined site CSS is full of `opacity:0` declarations — corpus scan: 15 on
// one post), comments, and srcdoc-embedded documents (the frozen scheduler
// iframe). Mutations apply to content segments only.
const SKIP_ZONE = /(<style[^>]*>[\s\S]*?<\/style\s*>|<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--[\s\S]*?-->|\bsrcdoc\s*=\s*"[^"]*")/gi;

/** Apply `map` to the content segments of `html` (odd split indexes are skip zones). */
function mapContentSegments(html, map) {
  const parts = html.split(SKIP_ZONE);
  for (let i = 0; i < parts.length; i += 2) parts[i] = map(parts[i]);
  return parts.join('');
}

/** Raw attribute value in an open tag's attr string, honoring quoting; null when absent. */
function attrValue(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

/** Presence of an attribute, bare (`data-split-title`) or valued (`data-x=v`). */
function hasAttr(attrs, name) {
  return new RegExp(`\\b${name}(?=\\s*=|[\\s/>]|$)`, 'i').test(attrs);
}

/**
 * Rewrite attribute `name` of an open `tag` through `edit(value) → value`.
 * An empty result drops the attribute whole; an unchanged result returns the
 * tag untouched; a missing attribute returns null.
 */
function editAttr(tag, name, edit) {
  const m = new RegExp(`(\\b${name}\\s*=\\s*)("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return null;
  const quote = m[2][0] === '"' || m[2][0] === "'" ? m[2][0] : '';
  const raw = quote ? m[2].slice(1, -1) : m[2];
  const next = edit(raw);
  if (next === raw) return tag;
  if (next === '') {
    let start = m.index;
    while (start > 0 && /\s/.test(tag[start - 1])) start -= 1;
    return tag.slice(0, start) + tag.slice(m.index + m[0].length);
  }
  const value = quote ? quote + next + quote : next;
  return tag.slice(0, m.index) + m[1] + value + tag.slice(m.index + m[0].length);
}

/** Append an attribute (full `name` or `name=value` text) before an open tag's closing `>` (slash-aware). */
function withAddedAttr(tag, attr) {
  const m = /\s*\/?>$/.exec(tag);
  return tag.slice(0, m.index) + ` ${attr}` + m[0];
}

/** Remove a bare `opacity:0` declaration (never `opacity:0.45`); null when absent. */
function stripBareOpacity(v) {
  if (!/(?:^|;)opacity:0(?=$|;)/i.test(v)) return null;
  return v.replace(/;?opacity:0(?=$|;)/gi, '').replace(/^;+/, '');
}

// The captured split-word from-inline (census patterns 2/3): slate color,
// blur 15px or 20px variants, rise, 0.45 opacity. Layout props
// (position/display/translate-none/will-change) stay — the page's CSS
// contract needs them. The captured blur radius is PRESERVED per element as
// a custom property (motion.css reads it with a 15px fallback); the other
// from-props are dropped outright — motion.css re-supplies them.
const WORD_FROM_TOKENS = [
  { re: /;?color:rgb\(142,168,184\)/gi, sub: () => '' },
  { re: /;?filter:blur\((\d+)px\)/gi, sub: (_m, px) => (px === '15' ? '' : `;--fpm-blur:${px}px`) },
  { re: /;?transform:translate\(0px,0\.42em\)/gi, sub: () => '' },
  { re: /;?opacity:0\.45/gi, sub: () => '' },
];

/**
 * Split-word normalization + --fpm-i annotation. Within each split container
 * (data-split-gsap=words, or the masked variant data-animation-gsap=words|lines),
 * the captured from-props are stripped from every .word/.split-word div and a
 * per-container DOM-order stagger index is prepended — the captured 58ms/word
 * transition-delay is calc()'d from it in motion.css.
 */
function annotateSplitWords(seg, counts, warnings) {
  let out = '';
  let pos = 0;
  const re = openTagRe();
  let m;
  while ((m = re.exec(seg))) {
    if (m.index < pos) continue; // inside a container already processed
    const marker = attrValue(m[2], 'data-split-gsap') ?? attrValue(m[2], 'data-animation-gsap');
    if (marker !== 'words' && marker !== 'lines') continue;
    const end = balanceEnd(seg, m.index, m[1]);
    if (end < 0) {
      warnings.push(`motion: split container (${m[1]}) unbalanced — left as captured`);
      continue;
    }
    let block = seg.slice(m.index, end);
    let i = 0;
    block = block.replace(openTagRe(), (tag, _name, attrs) => {
      const cls = attrValue(attrs, 'class');
      if (!cls || !cls.split(/\s+/).some((c) => c === 'word' || c === 'split-word')) return tag;
      const edited = editAttr(tag, 'style', (v) => {
        let cleaned = v;
        for (const token of WORD_FROM_TOKENS) cleaned = cleaned.replace(token.re, token.sub);
        return `--fpm-i:${i++};` + cleaned;
      });
      return edited ?? withAddedAttr(tag, `style=--fpm-i:${i++}`);
    });
    if (i > 0) counts['split words normalized+annotated'] = (counts['split words normalized+annotated'] ?? 0) + i;
    out += seg.slice(pos, m.index) + block;
    pos = end;
  }
  return out + seg.slice(pos);
}

/**
 * Explicit GSAP-pattern normalization (census patterns 4-7): captured
 * from-states → the end-state the static DOM then carries. Only elements
 * carrying the pattern attribute are touched.
 */
// Explicit GSAP pattern values the pass knows (words/lines are normalized by
// the split-word annotator above); anything else is logged as unrecognized so
// review sees census misses instead of silently frozen elements.
const KNOWN_GSAP_MARKERS = new Set(['fade-in', 'fade-in-2', 'image-clip', 'clip-in', 'words', 'lines']);

/**
 * Explicit GSAP-pattern normalization (census patterns 4-7): captured
 * from-states → the end-state the static DOM then carries. Only elements
 * carrying the pattern attribute are touched.
 */
function normalizeExplicitReveals(seg, counts, warnings) {
  const bump = (key) => (counts[key] = (counts[key] ?? 0) + 1);
  return seg.replace(openTagRe(), (tag, _name, attrs) => {
    const marker = attrValue(attrs, 'data-animation-gsap');
    if (marker == null) return tag;
    if (!KNOWN_GSAP_MARKERS.has(marker)) {
      bump('unrecognized data-animation-gsap (left as captured)');
      return tag;
    }
    if (marker === 'fade-in-2' || marker === 'fade-in') {
      let next = tag;
      let rose = false;
      if (marker === 'fade-in') {
        // rise-24 from-state (captured); GSAP's identity-axis markers stay
        const afterRise = editAttr(next, 'style', (v) => v.replace(/transform:translate\(0px,24px\);opacity:0/gi, '')) ?? next;
        rose = afterRise !== next;
        next = afterRise;
      }
      const afterBare0 = editAttr(next, 'style', (v) => stripBareOpacity(v) ?? v) ?? next;
      let afterBare = afterBare0;
      if (marker === 'fade-in-2') {
        if (afterBare !== next) bump('fade-in-2 from-states');
      } else {
        if (rose) bump('fade-in rise-24 from-states');
        // a bare opacity:0 the rise token didn't consume = the bare fade
        // variant (captured from-state had no transform) — annotate so
        // motion.css replays it as a pure fade, without the rise
        if (afterBare !== next && !rose) {
          bump('fade-in bare opacity');
          afterBare = withAddedAttr(afterBare, 'data-fpm-fade');
        }
      }
      // a captured shape variant the tokens didn't fully consume would leave
      // the element invisible or displaced in the static end-state — surface it
      if (afterBare !== tag) {
        const remaining = attrValue(afterBare, 'style') ?? '';
        if (/(?:^|;)opacity:0(?=$|;)/i.test(remaining) || /transform:translate\(0px,24px\)/i.test(remaining)) {
          warnings.push(`motion: fade-in from-state not fully consumed (marker=${marker}) — left as captured`);
        }
      }
      return afterBare;
    }
    if (marker === 'image-clip') {
      // captured from-clip → captured end-clip (flock-ecosystem ground truth)
      const next = editAttr(tag, 'style', (v) => v.replace(/clip-path:inset\(6% 10% 0% 10%round var\(--clip-r\)\)/gi, 'clip-path:inset(0% 0% 0% 0%round var(--clip-r))'));
      if (next != null && next !== tag) bump('image-clip from→end');
      return next ?? tag;
    }
    if (marker === 'clip-in') {
      // captured from-class opacity-0 → drop the class, keep the rest
      const next = editAttr(tag, 'class', (v) => {
        const kept = v.split(/\s+/).filter((c) => c && c !== 'opacity-0').join(' ');
        return kept === v ? v : kept;
      });
      if (next != null && next !== tag) bump('clip-in from-class');
      return next ?? tag;
    }
    return tag;
  });
}

// Inline-style signatures of states that must stay frozen: self-animated
// player chrome (Wistia controls), hover-tween from-states (Tier 1 hover
// territory), positioned chrome, and interactively hidden panes. None of
// these are scroll-reveal from-states in the captured corpus.
const NOT_A_REVEAL = /pointer-events:none|transition:|position:fixed|position:absolute|display:none|transform:/i;

/**
 * The generic sweep (census pattern 9, IX2 scroll-reveals): inline zero-opacity
 * from-states on elements NO explicit rule names are normalized to their
 * end-state and tagged data-fpm-reveal for the observer. Every hit is logged
 * per page for human review.
 */
function normalizeGenericZeroOpacity(seg, counts) {
  return seg.replace(openTagRe(), (tag, _name, attrs) => {
    if (attrValue(attrs, 'data-animation-gsap') != null) return tag;
    if (attrValue(attrs, 'data-split-gsap') != null) return tag;
    if (attrValue(attrs, 'data-split-title') != null) return tag;
    const edited = editAttr(tag, 'style', (v) => {
      if (/(?:^|;)opacity:0(?=$|;)/i.test(v) && !NOT_A_REVEAL.test(v)) return stripBareOpacity(v) ?? v;
      return v;
    });
    if (edited == null || edited === tag) return tag;
    counts['generic zero-opacity normalized+tagged'] = (counts['generic zero-opacity normalized+tagged'] ?? 0) + 1;
    return withAddedAttr(edited, 'data-fpm-reveal');
  });
}

const MOTION_INJECTED = 'motion layer (style+script, inline)';

/**
 * Insert `tag` inline before </body> — or append at EOF when the capture is
 * truncated (the write pass restores the closing tags after it) — and log
 * `label` under the page's injected list. Shared by every injection pass.
 */
function injectBeforeClose(html, entry, label, tag) {
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + tag + '\n' + html.slice(closeBody);
  } else {
    html = html + '\n' + tag;
  }
  entry.injected = entry.injected ?? [];
  entry.injected.push(label);
  return html;
}

/**
 * The inline `<style>` + `<script>` pair every injected runtime layer ships.
 * Both halves carry the layer's `data-flock-parody` marker, so the script
 * census can tell a Recreation runtime from capture residue (which must stay
 * zero executable) — shared so a new layer cannot drift from the marker shape.
 */
function layerTag(name, css, runtime) {
  return `<style data-flock-parody="${name}">\n${css}\n</style>\n<script data-flock-parody="${name}">\n${runtime}\n</script>`;
}

/** The motion pass: normalize → annotate → tag → inject the CSS+runtime pair. */
function motionPass(html, entry, css, runtime) {
  const counts = {};
  let heroes = 0;
  html = mapContentSegments(html, (seg) => {
    seg = annotateSplitWords(seg, counts, entry.warnings);
    seg = normalizeExplicitReveals(seg, counts, entry.warnings);
    seg = normalizeGenericZeroOpacity(seg, counts);
    // hero split-title detection rides the same content-only scan: captured
    // ON (end-state); the runtime re-fires its visibility class — logged so
    // review sees the page shape
    seg.replace(openTagRe(), (tag, _name, attrs) => {
      if (hasAttr(attrs, 'data-split-title')) heroes += 1;
      return tag;
    });
    return seg;
  });
  if (heroes > 0) counts['hero split-title re-fire targets'] = heroes;
  entry.motion = counts;

  const motionTag = layerTag('motion', css, runtime);
  return injectBeforeClose(html, entry, MOTION_INJECTED, motionTag);
}

// ---- pass 6: interactions layer (ticket 05) ----------------------------------

const INTERACTIONS_INJECTED = 'interactions layer (style+script, inline)';

/**
 * Inject the delegated interaction runtime + its suppress-only CSS inline,
 * verbatim, after the motion layer and before the story-hook seam. Pure
 * injection: the layer reads the captured DOM it finds, so unlike the motion
 * pass this one makes no per-page mutations to log.
 */
function interactionsPass(html, entry, css, runtime) {
  return injectBeforeClose(html, entry, INTERACTIONS_INJECTED, layerTag('interactions', css, runtime));
}

// ---- pass 7: nav layer (ticket 14) --------------------------------------------

const NAV_INJECTED = 'nav layer (style+script, inline)';

/**
 * Inject the shared header's behavior runtime + its CSS half inline, verbatim
 * (ticket 14). Pure injection: the restored live CSS keys every state on the
 * classes the runtime moves, so unlike the motion pass this one makes no
 * per-page DOM mutation to log.
 */
function navPass(html, entry, css, runtime) {
  return injectBeforeClose(html, entry, NAV_INJECTED, layerTag('nav', css, runtime));
}

// ---- pass 8: chat mount (ticket 10) ----------------------------------------

const CHAT_INJECTED = 'chat widget (style+script, inline)';

/** The captured CSP meta every served page carries (identical across the corpus). */
const CSP_META_RE = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;

/**
 * The captured CSP is `default-src 'none'` with no `connect-src`, so it
 * refuses every fetch/XHR — the chat runtime's same-origin POST to /api/chat
 * is blocked on every real served page. (Found in the ticket-10 browser
 * smoke; jsdom does not enforce CSP, so the DOM seam cannot see it.) The chat
 * mount grants exactly the one source the mimic needs — `connect-src 'self'`
 * — and nothing else: `'self'` is the Recreation origin, so the grant cannot
 * reach a third party, and it is applied only on the launcher pages, the only
 * pages that carry the mimic.
 */
function grantConnectSelf(html, entry) {
  const meta = CSP_META_RE.exec(html);
  if (!meta) {
    entry.warnings.push('chat: no CSP meta found — the widget POST may be blocked');
    return html;
  }
  const edited = editAttr(meta[0], 'content', (value) => {
    if (/(?:^|;)\s*connect-src\b/i.test(value)) return value; // already granted
    return value.replace(/[;\s]+$/, '') + "; connect-src 'self';";
  });
  if (edited === null) {
    entry.warnings.push('chat: CSP meta has no content attribute — the widget POST may be blocked');
    return html;
  }
  if (edited === meta[0]) return html;
  entry.csp = "connect-src 'self' (chat mount)";
  return html.slice(0, meta.index) + edited + html.slice(meta.index + meta[0].length);
}

/**
 * Mount the Chat mimic on exactly the pages whose Capture mounted the
 * launcher, and nowhere else: the caller passes the census the strip pass
 * took from the same `<q-root>` marker it removed, so the mounted set and the
 * stripped set cannot drift (ticket 10). The runtime creates the whole widget
 * DOM — no-JS pages boot to the captured end-state (no launcher), exactly as
 * the original's script-injected launcher did. One request leaves the page:
 * the same-origin POST to /api/chat.
 */
function chatPass(html, entry, css, runtime) {
  if (!entry.chatLauncher) return html;
  html = grantConnectSelf(html, entry);
  return injectBeforeClose(html, entry, CHAT_INJECTED, layerTag('chat', css, runtime));
}

// ---- pass 9: story-hook seam (ticket 03) -----------------------------------

const STORY_HOOK_MARKER = 'data-flock-parody="story-hook"';

/**
 * Inject the story-hook runtime inline, verbatim, before </body> (or at EOF
 * when the capture is truncated — the write pass appends the closing tags
 * after it). No captured byte carries `flockParody`, so the only occurrences
 * in served bytes are the runtime's own definition.
 */
function storyHookPass(html, entry, source) {
  const tag = `<script ${STORY_HOOK_MARKER}>\n${source}\n</script>`;
  return injectBeforeClose(html, entry, 'story-hook seam (inline, dormant)', tag);
}

// ---- pipeline ----------------------------------------------------------------

/**
 * Per-page mutation log entry — every mutation the build made to one page.
 * @typedef {Object} LogEntry
 * @property {string} page  Original site path, e.g. "/products/x".
 * @property {number} [bytesIn]  Capture size before the passes.
 * @property {number} [bytesOut]  Served size after the passes.
 * @property {Record<string, number>} [stripped]  Strip target → bytes (or element count) removed.
 * @property {boolean} [chatLauncher]  Whether the Capture mounted the Qualified chat launcher (`<q-root>`) — the chat-mount census (ticket 10).
 * @property {string} [csp]  The CSP grant the chat mount added to the captured policy, if any — only ever `connect-src 'self'`.
 * @property {string[]} [warnings]  Anomalies that left bytes in place (e.g. unbalanced strip scans).
 * @property {number} [linksRewritten]  Internal hrefs rewritten to Recreation routes.
 * @property {{key: string, formId: string, action: string, redirectTo: string}[]} [forms]  Form routing injected on this page (ticket 02).
 * @property {Record<string, number>} [motion]  Motion-pass normalization/annotation counts + the hero detection, per page (ticket 04).
 * @property {string[]} [injected]  Recreation runtimes injected inline on this page (motion layer, interactions layer, story-hook seam — tickets 04, 05, 03).
 * @property {string[]} [restored]  Structural repairs (closing tags restored to truncated captures).
 * @property {Record<string, number>} [audit]  Post-strip tracker-residue counts; all zeros is clean.
 * @property {{total: number, executable: number, ldJson: number}} [scripts]  Script census of served bytes.
 * @property {string} [error]  Set instead of the pass data when the page could not be built.
 */

/**
 * Build-level summary (ticket 07): the whole-site counts and the route classes
 * the serving layer answers beside the mirrored tree.
 * @typedef {Object} BuildSummary
 * @property {string} captureRun  Capture run the build read, relative to the repo root.
 * @property {number} requested  Pages the caller listed, before dropping.
 * @property {number} served  Pages written (requested − dropped − errors).
 * @property {string[]} dropped  Scaffold/test pages dropped from serving (those the request listed).
 * @property {string[]} errors  Requested pages that failed to build (missing capture, …).
 * @property {{count: number, invalid: string[], dangling: string[]}} redirects  Legacy stubs → local targets, plus warnings.
 * @property {string[]} deadRoots  Dead collection roots (404, as the live site).
 * @property {string[]} authGated  Auth-gated stubs (not captured, not served).
 * @property {{mounted: number, absent: number}} chat  The chat-mount census over served pages (ticket 10): how many Captures mounted the launcher, how many did not.
 */

/**
 * Run the build over `pages` from the capture run at `runDir`, writing the
 * served tree to `outDir`. Returns the per-page mutation log (also written to
 * <outDir>/build-log.json) and the build summary (<outDir>/build-summary.json).
 *
 * `dropPages` are removed from the build and their served files deleted even
 * when the caller listed them — "dropped from serving entirely" (spec, Serving
 * and links). The CLI passes pipeline/config.mjs DROPPED_PAGES.
 *
 * @param {{runDir: string, pages: string[], outDir: string, dropPages?: string[]}} opts
 * @returns {Promise<{ log: LogEntry[], summary: BuildSummary }>}
 */
export async function runPipeline(opts) {
  const { runDir, pages, outDir, dropPages = [] } = opts;
  const dropSet = new Set(dropPages);
  // A dropped page must not be reachable, even if an earlier build wrote its
  // served file: remove it before building, and never write it.
  for (const page of dropSet) fs.rmSync(servedFileFor(outDir, page), { force: true });
  const buildPages = pages.filter((p) => !dropSet.has(p));
  const log = [];
  const formsManifest = {}; // form route key → { page, formId, redirectTo }
  // read once — every page inlines the same runtime bytes verbatim
  const storyHookSource = fs.readFileSync(path.join(HERE, 'story-hook.js'), 'utf8');
  const motionCss = fs.readFileSync(path.join(HERE, 'motion.css'), 'utf8');
  const motionRuntime = fs.readFileSync(path.join(HERE, 'motion-runtime.js'), 'utf8');
  const interactionsCss = fs.readFileSync(path.join(HERE, 'interactions.css'), 'utf8');
  const interactionsRuntime = fs.readFileSync(path.join(HERE, 'interactions-runtime.js'), 'utf8');
  const chatCss = fs.readFileSync(path.join(HERE, 'chat-widget.css'), 'utf8');
  const chatRuntime = fs.readFileSync(path.join(HERE, 'chat-widget.js'), 'utf8');
  const navCss = fs.readFileSync(path.join(HERE, 'nav.css'), 'utf8');
  const navRuntime = fs.readFileSync(path.join(HERE, 'nav-runtime.js'), 'utf8');

  for (const page of buildPages) {
    const src = captureFileFor(runDir, page);
    if (!fs.existsSync(src)) {
      log.push({ page, error: 'capture file missing' });
      continue;
    }
    const before = fs.readFileSync(src, 'utf8');
    let html = before;
    // The chat-mount census (ticket 10): taken from the Capture before the
    // strip removes the launcher, recorded per page in the mutation log.
    const entry = { page, bytesIn: before.length, stripped: {}, chatLauncher: LAUNCHER_RE.test(before), warnings: [] };

    html = stripPass(html, entry);

    html = rewritePass(html, entry);

    html = formsPass(html, entry, page, formsManifest);

    html = motionPass(html, entry, motionCss, motionRuntime);

    html = interactionsPass(html, entry, interactionsCss, interactionsRuntime);

    html = navPass(html, entry, navCss, navRuntime);

    html = chatPass(html, entry, chatCss, chatRuntime);

    html = storyHookPass(html, entry, storyHookSource);

    // Write pass: captures are truncated before </body></html> (SingleFile CLI
    // never emits them) — restore whichever closing tags the capture lacks.
    const missing = [];
    if (!/<\/body>/i.test(html)) missing.push('</body>');
    if (!/<\/html>/i.test(html)) missing.push('</html>');
    if (missing.length > 0) {
      html += '\n' + missing.join('');
      entry.restored = [`${missing.join('')} (capture was truncated)`];
    }

    const outFile = servedFileFor(outDir, page);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    entry.bytesOut = html.length;
    entry.audit = auditHtml(html);
    entry.scripts = scriptCensus(html);
    log.push(entry);
  }

  // The run's route classes: legacy redirect stubs become the serving route's
  // 301 table; dead roots and auth-gated stubs stay unserved (404).
  const uncaptured = loadRunManifest(runDir);
  const redirects = uncaptured.redirects;
  const served = log.filter((e) => !e.error).map((e) => e.page);
  const servedSet = new Set(served);
  // A redirect target that no served page (and no other redirect) answers
  // would send a visitor into a 404 — surface it instead of letting the gate
  // discover it by pixels.
  const dangling = Object.entries(redirects)
    .filter(([, target]) => !servedSet.has(target) && !(target in redirects))
    .map(([p, target]) => `${p} → ${target}`);
  const errors = log.filter((e) => e.error).map((e) => e.page);
  const servedEntries = log.filter((e) => !e.error);
  const chatMounted = servedEntries.filter((e) => e.chatLauncher).length;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'build-log.json'), JSON.stringify(log, null, 2));
  // The mock route's redirect table (ticket 02): written even when empty so
  // the route answers cleanly (unknown key → 404) on every build.
  fs.writeFileSync(path.join(outDir, 'forms-manifest.json'), JSON.stringify(formsManifest, null, 2));
  // The serving route's permanent-redirect table (ticket 07), written even
  // when empty so the route answers cleanly on every build.
  fs.writeFileSync(path.join(outDir, 'redirects.json'), JSON.stringify(redirects, null, 2));

  /** @type {BuildSummary} */
  const summary = {
    captureRun: path.relative(ROOT, runDir),
    requested: pages.length,
    served: served.length,
    // the dropped pages among the requested list — the count identity is
    // served + dropped + errors === requested. (Pages the config drops that a
    // scoped subset build never requested are absent from the tree too; the
    // route check asserts every configured drop 404s.)
    dropped: pages.filter((p) => dropSet.has(p)),
    errors,
    redirects: { count: Object.keys(redirects).length, invalid: uncaptured.invalidRedirects, dangling },
    deadRoots: uncaptured.dead,
    authGated: uncaptured.authGated,
    chat: { mounted: chatMounted, absent: servedEntries.length - chatMounted },
  };
  fs.writeFileSync(path.join(outDir, 'build-summary.json'), JSON.stringify(summary, null, 2));
  return { log, summary };
}

/**
 * Read the run's uncaptured manifest, or an empty route set when the run has
 * none (fixture runs) — the build stays a pure transformation of what exists.
 * @param {string} runDir
 * @returns {import('./run-manifest.mjs').UncapturedManifest}
 */
function loadRunManifest(runDir) {
  const file = path.join(runDir, 'manifest-uncaptured.csv');
  if (!fs.existsSync(file)) return { redirects: {}, dead: [], authGated: [], invalidRedirects: [] };
  return parseUncapturedManifest(fs.readFileSync(file, 'utf8'));
}

// ---- summary (CLI) ------------------------------------------------------------

function summarize(log, summary) {
  for (const e of log) {
    if (e.error) {
      console.log(`✗ ${e.page}: ${e.error}`);
      continue;
    }
    const stripStr = [
      ...Object.entries(e.stripped ?? {}).map(([k, v]) => `${k}:${v < 1024 ? v + 'B' : Math.round(v / 1024) + 'kB'}`),
      ...(e.warnings ?? []),
    ].join(' ');
    const auditStr = Object.entries(e.audit).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || 'clean';
    console.log(
      `✓ ${e.page}  (${Math.round(e.bytesIn / 1e6)}MB → ${Math.round(e.bytesOut / 1e6)}MB)  `
      + `strip[${stripStr}]  audit: ${auditStr}  scripts: ${e.scripts.executable} executable / ${e.scripts.ldJson} ld+json`
    );
  }
  console.log(`\n${log.length} page(s) processed`);
  const dropped = summary.dropped.length;
  console.log(
    `build summary: ${summary.served} served + ${dropped} dropped = ${summary.requested} requested`
    + (summary.errors.length > 0 ? ` (${summary.errors.length} error(s): ${summary.errors.join(', ')})` : '')
  );
  console.log(
    `route classes: ${summary.redirects.count} redirect(s) → 301, ${summary.deadRoots.length} dead root(s) 404, `
    + `${summary.authGated.length} auth-gated 404`
  );
  console.log(`chat census: ${summary.chat.mounted} page(s) mounted the launcher, ${summary.chat.absent} did not`);
  for (const w of [...summary.redirects.invalid, ...summary.redirects.dangling]) console.log(`⚠ redirect: ${w}`);
}

// ---- CLI ----------------------------------------------------------------------

async function main() {
  const arg = makeArg(process.argv.slice(2));

  const { CAPTURE_RUN, DROPPED_PAGES } = await import('./config.mjs');
  const runDir = path.resolve(ROOT, arg('--run') ?? CAPTURE_RUN);
  const outDir = path.resolve(ROOT, arg('--out') ?? 'served');

  let pages;
  const pagesArg = arg('--pages');
  const listArg = arg('--list');
  if (pagesArg) {
    pages = pagesArg.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const listFile = path.resolve(ROOT, listArg ?? path.join(HERE, 'pages.list'));
    if (fs.existsSync(listFile)) {
      pages = fs.readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    } else {
      pages = [];
    }
    // empty/missing subset list = the full capture list (all captured pages)
    if (pages.length === 0) {
      pages = fs.readFileSync(path.join(runDir, 'capture-list.txt'), 'utf8')
        .split('\n').map((s) => s.trim()).filter(Boolean)
        .map((url) => new URL(url).pathname);
    }
  }

  const { log, summary } = await runPipeline({ runDir, pages, outDir, dropPages: DROPPED_PAGES });
  summarize(log, summary);
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
