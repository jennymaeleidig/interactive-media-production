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
//   2. rewrite — internal hrefs https://(www.)flocksafety.com/X → /X
//                (Recreation routes); external links stay live.
//   3. forms   — captured lead forms carry no action (their live submission
//                went through the stripped JS), so the pass injects a POST to
//                a local mock API route keyed per form; the mock route
//                swallows the submission and 303-redirects to the captured
//                thank-you page (spec, Forms). Nothing ever leaves the
//                machine: the only actions in served bytes are the injected
//                local ones, and the audit counts any external form action.
//   4. motion  — the motion reveal layer (ticket 04): normalize every captured
//                animation FROM-state to its end-state in the static DOM
//                (no-JS pages are the styled end-state by construction),
//                annotate split words with per-word --fpm-i stagger indices,
//                tag generic inline zero-opacity from-states for the observer,
//                then inject motion.css + motion-runtime.js inline. Reveals
//                fire one-shot only when JS runs and reduced motion allows.
//   5. interactions — the delegated interaction layer (ticket 05): inject
//                interactions.css + interactions-runtime.js inline. One
//                delegated click listener operates tabs, dropdowns,
//                accordions, and sliders by captured classes and geometry —
//                zero per-page bespoke logic, and reduced motion never blocks
//                function. The CSS half is suppress-only: it silences the
//                captured accordion height tween the ticket rules
//                function-only, and never adds an animation.
//   6. story-hook — the dormant DOM-patching seam, injected inline on every
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
// Later passes land here per their tickets: whole-site scale + redirect
// manifest (07).
//
// Usage: node pipeline/build.mjs [--run <captureRunDir>] [--out <dir>]
//                                [--pages /a,/b] [--list <file>]
//   Defaults: --run pipeline/config.mjs CAPTURE_RUN, --out served,
//             pages from pipeline/pages.list.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---- strip targets ----------------------------------------------------------
// DOM subtrees removed whole. `mode: 'balance'` scans to the balanced close of
// `tag`; `mode: 'to-close'` scans to `close`. `all: true` repeats until the
// pattern is gone (Qualified injects several orphaned style blocks with the
// same id prefix into <head>). `contentRe` keys a target on its content, so an
// ordinary block that happens to match `start` is kept.
const STRIP_TARGETS = [
  { name: 'qualified-offer-host', start: /<div[^>]*\sid=("|')?_qualified-offer-host-/i, mode: 'balance', tag: 'div' },
  { name: 'q-root (chat launcher)', start: /<q-root\b/i, mode: 'balance', tag: 'q-root' },
  { name: 'q-focus-sentinel', start: /<q-focus-sentinel\b/i, mode: 'balance', tag: 'q-focus-sentinel' },
  { name: 'qualified-offer-style-element', start: /<style[^>]*\sid=("|')?qualified-offer-/i, mode: 'to-close', close: /<\/style\s*>/i, all: true },
  { name: 'qualified-offer CSS (bare style)', start: /<style[^>]*>/i, mode: 'to-close', close: /<\/style\s*>/i, contentRe: /qualified-offer-/, all: true },
  { name: 'onetrust-pc-dark-filter', start: /<div[^>]*class=("|')?[^>]*\bonetrust-pc-dark-filter\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-consent-sdk (empty root)', start: /<div[^>]*\sid=("|')?onetrust-consent-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-banner-sdk', start: /<div[^>]*\sid=("|')?onetrust-banner-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-pc-sdk', start: /<div[^>]*\sid=("|')?onetrust-pc-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-style', start: /<style[^>]*\sid=("|')?onetrust-style\b/i, mode: 'to-close', close: /<\/style\s*>/i },
];

// Post-strip audit regexes — any hit suggests strip-list incompleteness.
// onetrust targets the consent-stack MACHINERY (ids/classes/scripts), not the
// brand string: the footer "Your Privacy Choices" link (a
// privacyportal.onestrust.com webform URL) is site content and stays under the
// link policy, so the bare word "onestrust" may remain inside it.
const AUDIT_RES = {
  qualified: /qualified/i,
  onetrust: /onetrust-(?:banner|pc|consent|style|accept|reject|close|privacy|policy|customize|filter)|ot-sdk|ot-sync/i,
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

// ---- pass 2: rewrite links ---------------------------------------------------

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

// ---- form routing (ticket 02) ------------------------------------------------

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

// ---- motion reveal layer (ticket 04) -------------------------------------------

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

  const motionTag = `<style data-flock-parody="motion">\n${css}\n</style>\n<script data-flock-parody="motion">\n${runtime}\n</script>`;
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + motionTag + '\n' + html.slice(closeBody);
  } else {
    // capture truncated before </body> — inject at EOF; the write pass appends the closing tags after it
    html = html + '\n' + motionTag;
  }
  entry.injected = entry.injected ?? [];
  entry.injected.push(MOTION_INJECTED);
  return html;
}

// ---- interactions layer (ticket 05) ------------------------------------------

const INTERACTIONS_INJECTED = 'interactions layer (style+script, inline)';

/**
 * Inject the delegated interaction runtime + its suppress-only CSS inline,
 * verbatim, after the motion layer and before the story-hook seam (or at EOF
 * when the capture is truncated — the write pass appends the closing tags
 * after it). Pure injection: the layer reads the captured DOM it finds, so
 * unlike the motion pass this one makes no per-page mutations to log.
 */
function interactionsPass(html, entry, css, runtime) {
  const tag = `<style data-flock-parody="interactions">\n${css}\n</style>\n<script data-flock-parody="interactions">\n${runtime}\n</script>`;
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + tag + '\n' + html.slice(closeBody);
  } else {
    html = html + '\n' + tag;
  }
  entry.injected = entry.injected ?? [];
  entry.injected.push(INTERACTIONS_INJECTED);
  return html;
}

// ---- story-hook seam (ticket 03) ----------------------------------------------

const STORY_HOOK_MARKER = 'data-flock-parody="story-hook"';

/**
 * Inject the story-hook runtime inline, verbatim, before </body> (or at EOF
 * when the capture is truncated — the write pass appends the closing tags
 * after it). No captured byte carries `flockParody`, so the only occurrences
 * in served bytes are the runtime's own definition.
 */
function storyHookPass(html, entry, source) {
  const tag = `<script ${STORY_HOOK_MARKER}>\n${source}\n</script>`;
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + tag + '\n' + html.slice(closeBody);
  } else {
    html = html + '\n' + tag;
  }
  entry.injected = (entry.injected ?? []);
  entry.injected.push('story-hook seam (inline, dormant)');
  return html;
}

// ---- pipeline ----------------------------------------------------------------

/**
 * Per-page mutation log entry — every mutation the build made to one page.
 * @typedef {Object} LogEntry
 * @property {string} page  Original site path, e.g. "/products/x".
 * @property {number} [bytesIn]  Capture size before the passes.
 * @property {number} [bytesOut]  Served size after the passes.
 * @property {Record<string, number>} [stripped]  Strip target → bytes (or element count) removed.
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
 * Run the build over `pages` from the capture run at `runDir`, writing the
 * served tree to `outDir`. Returns the per-page mutation log (also written to
 * <outDir>/build-log.json).
 *
 * @param {{runDir: string, pages: string[], outDir: string}} opts
 * @returns {Promise<{ log: LogEntry[] }>}
 */
export async function runPipeline(opts) {
  const { runDir, pages, outDir } = opts;
  const log = [];
  const formsManifest = {}; // form route key → { page, formId, redirectTo }
  // read once — every page inlines the same runtime bytes verbatim
  const storyHookSource = fs.readFileSync(path.join(HERE, 'story-hook.js'), 'utf8');
  const motionCss = fs.readFileSync(path.join(HERE, 'motion.css'), 'utf8');
  const motionRuntime = fs.readFileSync(path.join(HERE, 'motion-runtime.js'), 'utf8');
  const interactionsCss = fs.readFileSync(path.join(HERE, 'interactions.css'), 'utf8');
  const interactionsRuntime = fs.readFileSync(path.join(HERE, 'interactions-runtime.js'), 'utf8');

  for (const page of pages) {
    const src = captureFileFor(runDir, page);
    if (!fs.existsSync(src)) {
      log.push({ page, error: 'capture file missing' });
      continue;
    }
    const before = fs.readFileSync(src, 'utf8');
    let html = before;
    const entry = { page, bytesIn: before.length, stripped: {}, warnings: [] };

    html = stripPass(html, entry);

    html = rewritePass(html, entry);

    html = formsPass(html, entry, page, formsManifest);

    html = motionPass(html, entry, motionCss, motionRuntime);

    html = interactionsPass(html, entry, interactionsCss, interactionsRuntime);

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

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'build-log.json'), JSON.stringify(log, null, 2));
  // The mock route's redirect table (ticket 02): written even when empty so
  // the route answers cleanly (unknown key → 404) on every build.
  fs.writeFileSync(path.join(outDir, 'forms-manifest.json'), JSON.stringify(formsManifest, null, 2));
  return { log };
}

// ---- summary (CLI) ------------------------------------------------------------

function summarize(log) {
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
}

// ---- CLI ----------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  function arg(name) {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  }

  const { CAPTURE_RUN } = await import('./config.mjs');
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

  const { log } = await runPipeline({ runDir, pages, outDir });
  summarize(log);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
