// The build pipeline: Capture in → served tree + per-page mutation log out.
// A pure transformation (spec, Testing Decisions): no live site, no network.
//
// Passes: the order and the preconditions that make it load-bearing live in
// pipeline/passes.mjs — one table, one numbering, one place. The injected
// layers (their markers, inline files, mount predicates, and CSP grants) live
// in pipeline/layers.mjs. This file is the implementations and the
// orchestration; read those two tables for what the build does.
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
//        node pipeline/build.mjs --dedupe-tree [<dir>] [--dry-run]
//   Defaults: --run pipeline/config.mjs CAPTURE_RUN, --out served,
//             pages from pipeline/pages.list (empty = the full capture list).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUncapturedManifest } from './run-manifest.mjs';
import { extractDataUris } from './assets.mjs';
import { dedupeBodies } from './dedupe.mjs';
import { embedPass, stripHiddenVidzflow, stripOriginalUrls } from './embeds.mjs';
import { audit, isInertScript, scriptCensus } from './audit.mjs';
import { DEAD_VIDEO_IDS, LEGIBILITY_PATCHES } from './config.mjs';
import { addAttr, attrValue, contentSegments, editAttr, hasAttr, openTags, replaceTags } from './html.mjs';
import { applyGrant } from './csp.mjs';
import { grantLayer, layerNamed, mountLayer, readLayerBodies } from './layers.mjs';
import { PASSES } from './passes.mjs';
import { assetTotals, bodyTotals, project, render } from './summary.mjs';
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

// ---- strip -------------------------------------------------------------------

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
    if (isInertScript(m[0])) {
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

// ---- rewrite links -----------------------------------------------------------

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

// ---- motion reveal layer (ticket 04) ------------------------------------------

// `openTagRe`/`SKIP_ZONE`/`mapContentSegments`/`attrValue`/`hasAttr`/`editAttr`/
// `withAddedAttr` live in html.mjs now (ticket: one home for the capture-HTML
// rules). This pass reads through `contentSegments`/`replaceTags`/`openTags`
// and edits through `editAttr`/`addAttr`.

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
  for (const open of openTags(seg, 'backtracking')) {
    if (open.index < pos) continue; // inside a container already processed
    const marker = attrValue(open.attrs, 'data-split-gsap') ?? attrValue(open.attrs, 'data-animation-gsap');
    if (marker !== 'words' && marker !== 'lines') continue;
    const end = balanceEnd(seg, open.index, open.name);
    if (end < 0) {
      warnings.push(`motion: split container (${open.name}) unbalanced — left as captured`);
      continue;
    }
    let block = seg.slice(open.index, end);
    let i = 0;
    block = replaceTags(block, (tag, _name, attrs) => {
      const cls = attrValue(attrs, 'class');
      if (!cls || !cls.split(/\s+/).some((c) => c === 'word' || c === 'split-word')) return tag;
      const edited = editAttr(tag, 'style', (v) => {
        let cleaned = v;
        for (const token of WORD_FROM_TOKENS) cleaned = cleaned.replace(token.re, token.sub);
        return `--fpm-i:${i++};` + cleaned;
      });
      return edited ?? addAttr(tag, `style=--fpm-i:${i++}`);
    });
    if (i > 0) counts['split words normalized+annotated'] = (counts['split words normalized+annotated'] ?? 0) + i;
    out += seg.slice(pos, open.index) + block;
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
  return replaceTags(seg, (tag, _name, attrs) => {
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
          afterBare = addAttr(afterBare, 'data-fpm-fade');
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
  return replaceTags(seg, (tag, _name, attrs) => {
    if (attrValue(attrs, 'data-animation-gsap') != null) return tag;
    if (attrValue(attrs, 'data-split-gsap') != null) return tag;
    if (attrValue(attrs, 'data-split-title') != null) return tag;
    const edited = editAttr(tag, 'style', (v) => {
      if (/(?:^|;)opacity:0(?=$|;)/i.test(v) && !NOT_A_REVEAL.test(v)) return stripBareOpacity(v) ?? v;
      return v;
    });
    if (edited == null || edited === tag) return tag;
    counts['generic zero-opacity normalized+tagged'] = (counts['generic zero-opacity normalized+tagged'] ?? 0) + 1;
    return addAttr(edited, 'data-fpm-reveal');
  });
}

/** The motion pass: normalize → annotate → mount the CSS+runtime pair. */
function motionPass(html, entry, bodies) {
  const counts = {};
  let heroes = 0;
  html = contentSegments(html, (seg) => {
    seg = annotateSplitWords(seg, counts, entry.warnings);
    seg = normalizeExplicitReveals(seg, counts, entry.warnings);
    seg = normalizeGenericZeroOpacity(seg, counts);
    // hero split-title detection rides the same content-only scan: captured
    // ON (end-state); the runtime re-fires its visibility class — logged so
    // review sees the page shape
    for (const open of openTags(seg, 'backtracking')) {
      if (hasAttr(open.attrs, 'data-split-title')) heroes += 1;
    }
    return seg;
  });
  if (heroes > 0) counts['hero split-title re-fire targets'] = heroes;
  entry.motion = counts;

  return mountLayer(html, entry, layerNamed('motion'), bodies);
}

// ---- chat mount (ticket 10) ------------------------------------------------

/**
 * The captured CSP is `default-src 'none'` with no `connect-src`, so it
 * refuses every fetch/XHR — the chat runtime's same-origin POST to /api/chat
 * is blocked on every real served page. (Found in the ticket-10 browser
 * smoke; jsdom does not enforce CSP, so the DOM seam cannot see it.) The layer
 * record's grant adds exactly the one source the mimic needs — `connect-src
 * 'self'` — and nothing else: `'self'` is the Recreation origin, so it cannot
 * reach a third party, and only the launcher pages carry the mimic.
 */

/**
 * The captured policy allows frames only from `'self' data:`, so a live embed
 * needs its host named *there* — and the directive has to be replaced, not
 * appended to: a second `frame-src` would intersect with the captured one and
 * the players would stay blocked. Only the hosts the pass actually used are
 * added, and only on pages that carry a live frame (ADR 0002).
 *
 * @param {string} html
 * @param {LogEntry} entry
 * @param {string[]} hosts
 * @returns {string}
 */
function grantFrameSrc(html, entry, hosts) {
  const sources = hosts.map((h) => `https://${h}`);
  return applyGrant(html, entry, {
    directive: 'frame-src',
    sources,
    defaults: ["'self'", 'data:', ...sources],
    note: 'live embeds',
    missing: 'embeds: no CSP meta found — the live players will be blocked',
    noContent: 'embeds: CSP meta has no content attribute — the live players will be blocked',
  });
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
function chatPass(html, entry, bodies) {
  const layer = layerNamed('chat');
  if (!layer.mounts(entry)) return html;
  html = grantLayer(html, entry, layer);
  return mountLayer(html, entry, layer, bodies);
}

/**
 * Page-scoped legibility CSS (ticket 12): the Capture froze some scroll-driven
 * text at its dark start state, and the live page's own low-contrast rules
 * sometimes leave dark text on a dark screen — neither is readable in a static
 * page. Data-driven from `config.LEGIBILITY_PATCHES`, keyed by page path, and
 * injected as one marked, inert `<style>` before `</body>`. No script, no
 * network, no captured byte touched.
 * @param {string} html
 * @param {LogEntry} entry
 * @param {string} page
 * @param {Record<string, string>} patches
 * @returns {string}
 */
function legibilityPass(html, entry, page, patches) {
  const layer = layerNamed('legibility');
  if (!layer.mounts(entry, { page, legibilityPatches: patches })) return html;
  return mountLayer(html, entry, layer, { css: patches[page] });
}

// ---- scroll choreography + modals (ticket 21) -------------------------------

/**
 * Normalize the captured scroll from-states to their static end-states (a page
 * without the runtime must be the settled layout), then inject the scroll
 * runtime and its CSS half inline. Keyed on captured attributes/classes only —
 * `[animate="scrub-word"]` spans, `.line-label`, `#main-progress`,
 * `.c-modal__panel`, `.bg-screen.scroller` — so it is not per-page logic.
 * @param {string} html
 * @param {LogEntry} entry
 * @param {string} css
 * @param {string} runtime
 * @returns {string}
 */
function scrollPass(html, entry, bodies) {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  html = contentSegments(html, (seg) => replaceTags(seg, (tag, _name, attrs) => {
    const cls = (attrValue(attrs, 'class') ?? '').split(/\s+/);
    // .line-label wrapper: the captured scale(0,0) is its reveal's from-state.
    if (cls.includes('line-label')) {
      const next = editAttr(tag, 'style', (v) => v.replace(/scale\(0(?:px)?,\s*0(?:px)?\)/, 'scale(1,1)'));
      if (next && next !== tag) { bump('line-label scale (0→1)'); return next; }
    }
    // .line-label--marker: the captured translateY(170%) is its from-state.
    if (cls.includes('line-label--marker')) {
      const next = editAttr(tag, 'style', (v) => v.replace(/translate\(0px,\s*170%\)/, 'translate(0px,0%)'));
      if (next && next !== tag) { bump('line-label marker slide (170%→0)'); return next; }
    }
    // scrub-word spans: drop the captured dark from-color; the heading's own
    // light color is the end-state, and the runtime animates the sequence.
    if (cls.includes('gsap_split_word') && /color:rgb\(34,\s*40,\s*31\)/.test(attrValue(attrs, 'style') ?? '')) {
      const next = editAttr(tag, 'style', (v) => v.replace(/;?color:rgb\(34,\s*40,\s*31\)/, ''));
      if (next && next !== tag) { bump('scrub-word from-color'); return next; }
    }
    // route path: the captured stroke-dashoffset is the draw's from-state.
    if (attrValue(attrs, 'id') === 'main-progress') {
      const next = editAttr(tag, 'style', (v) => v.replace(/stroke-dashoffset:\s*[0-9.]+(?:px)?/i, 'stroke-dashoffset:0'));
      if (next && next !== tag) { bump('main-progress draw (undrawn→drawn)'); return next; }
    }
    // modal panel: the captured translate(0,6rem) is the open animation's from-state.
    if (cls.includes('c-modal__panel')) {
      const next = editAttr(tag, 'style', (v) => v.replace(/translate\(0px,\s*6rem\)/, 'translate(0px,0px)'));
      if (next && next !== tag) { bump('modal panel slide'); return next; }
    }
    // `.bg-screen.scroller` sections: the captured inline `scale(0.9)` is the
    // from-state of the site's scroll zoom (live settles at scale 1). Dropping
    // it keeps the settled geometry from depending on a stale transform.
    if (cls.includes('bg-screen') && cls.includes('scroller')) {
      const next = editAttr(tag, 'style', (v) => v.replace(/;?transform:\s*scale\(0\.9(?:,\s*0\.9)?\)/i, ''));
      if (next && next !== tag) { bump('section zoom settle (0.9→1)'); return next; }
    }
    return tag;
  }));
  if (Object.keys(counts).length > 0) entry.scroll = counts;
  return mountLayer(html, entry, layerNamed('scroll'), bodies);
}

// ---- live media embeds (ADR 0002) --------------------------------------------

/**
 * Swap each video slot's inert snapshot for the live player document.
 *
 * The Recreation cannot play a video, so a Capture keeps one of three inert
 * snapshots (an inlined `srcdoc` player document, the JS-built player chrome, or
 * a `<wistia-player>` web component with a declarative shadow root) — see
 * `pipeline/embeds.mjs` for the shapes and for what is deliberately left alone.
 * A fourth shape is an empty frame: the Capture could not inline a cross-origin
 * player, so nothing is left to play — the pass re-points it at the URL the
 * Capture remembered (`data-sf-original-src`, the blog's rich-text YouTube
 * figures).
 *
 * Runs before the asset pass so the snapshots' own inlined data URIs are never
 * extracted: the bytes are about to be discarded. The frame-src grant goes in
 * here, on the pages that actually carry a live frame (or a slot the
 * interactions runtime will arm on click), and nowhere else.
 *
 * @param {string} html
 * @param {LogEntry} entry
 * @returns {string}
 */
function applyEmbeds(html, entry, deadVideoIds) {
  // The hidden Vidzflow player documents go first: their bytes are dead weight
  // and nothing below needs to see them.
  const { html: stripped, removed: vidzflow } = stripHiddenVidzflow(html);
  const { html: out, reshaped, rewritten, unreachable, hosts } = embedPass(stripped, { dead: deadVideoIds });
  // A page can carry a video story without carrying a *live* slot: a dead media,
  // a media the page's JSON-LD names but no slot markup rewrote, a stripped
  // Vidzflow document, or a YouTube panel that only gains its `src` on click.
  // Record all of them, or the summary loses exactly the cases an operator needs
  // to see.
  const touched = rewritten.length > 0 || reshaped.dead > 0 || reshaped.popover > 0
    || reshaped.youtube > 0 || reshaped.frame > 0 || vidzflow > 0 || unreachable.length > 0;
  if (!touched) return html;
  // `live` counts *frames*, not distinct medias: five pages embed the same media
  // twice, and a reader comparing the summary against the served bytes should get
  // the same number. `rewritten` stays deduped because it feeds `unreachable`.
  const live = reshaped.srcdoc + reshaped.element + reshaped.component + reshaped.frame;
  entry.embeds = { ...reshaped, live, vidzflow, unreachable: unreachable.length };
  if (hosts.length === 0) return stripped;
  // Only the hosts the pass actually used — never the whole allow-list, which
  // would grant a host this page has no player for.
  return grantFrameSrc(out, entry, hosts);
}

// ---- drop the Capture's URL bookkeeping (ticket 12) --------------------------
/**
 * The `data-sf-original-*` attributes `--save-original-urls` writes are how the
 * embed pass finds a player the Capture emptied. Everything else they carry is
 * the Capture's own record of a URL it removed or inlined, and serving it would
 * print the original's asset URLs into our HTML (the publication/rights
 * question ADR 0002 flags) for no reader.
 *
 * @param {string} html
 * @param {LogEntry} entry
 * @returns {string}
 */
function originalUrlsPass(html, entry) {
  const { html: out, removed } = stripOriginalUrls(html);
  if (removed > 0) entry.originalUrls = removed;
  return out;
}

// ---- asset extraction (ADR 0002) ---------------------------------------------
/**
 * Write every asset a Capture inlined as a `data:` URI once, under a
 * content-addressed name, and point the page at it (`/assets/<sha>.<ext>`).
 *
 * The captures re-encode the same image on every page that shows it — 86,079
 * occurrences for 2,830 distinct files across the served tree, a 14.9x tax.
 * Identical bytes collapse to one file by construction (the name *is* the
 * hash), so the caller's `written` set makes each file land on disk once per
 * build and the reference is immutable-cacheable forever.
 *
 * Runs after the strip (so nothing is extracted from a subtree the strip
 * removes) but before every injection pass, whose bytes stay verbatim. Assets
 * are written even when their only referencing page is dropped later in the
 * run (the write pass cannot know); an unreferenced file in an ignored build
 * directory costs nothing and is gone on the next clean build.
 *
 * @param {string} html
 * @param {LogEntry} entry
 * @param {string} assetDir
 * @param {Set<string>} written  build-wide set of asset keys already on disk
 * @returns {string}
 */
function assetsPass(html, entry, assetDir, written) {
  const { html: out, assets, references } = extractDataUris(html);
  if (assets.size === 0 && references === 0) return html;
  fs.mkdirSync(assetDir, { recursive: true });
  let bytes = 0;
  for (const asset of assets.values()) {
    bytes += asset.bytes.length;
    const name = `${asset.sha}.${asset.ext}`;
    if (written.has(name)) continue;
    fs.writeFileSync(path.join(assetDir, name), asset.bytes);
    written.add(name);
  }
  entry.assets = { references, distinct: assets.size, bytes };
  return out;
}

// ---- body deduplication (ADR 0003) -------------------------------------------
/**
 * Write every style/script body above the inline threshold once as a
 * content-addressed file, and leave a `<link>`/`<script src>` where the body
 * was.
 *
 * A Capture re-encodes the page's stylesheets once per page — 29,686 `<style>`
 * elements holding 1,642 MB of CSS — and the Recreation inlines its six
 * runtimes on every page as well. Identical bodies hash identically, so the
 * caller's `written` set puts each one on disk once per build and every page
 * after the first pays a cache hit. That is what makes the tree publishable at
 * all: GitHub Pages caps a published site at 1 GB and the tree is 2.36 GB
 * (docs/adr/0003-bodies-ship-as-files.md).
 *
 * Runs last, after every injection pass, so the bodies it moves are the final
 * ones — the runtimes are injected verbatim, and their bytes are not rewritten
 * by moving them. A body whose kind could not be granted `'self'` in the CSP
 * stays inline (the module says so in `blocked`) rather than becoming a request
 * the browser refuses.
 *
 * @param {string} html
 * @param {LogEntry} entry
 * @param {string} assetDir
 * @param {Set<string>} written  build-wide set of asset keys already on disk
 * @param {Set<string>} bodies  build-wide set of body file names (for the summary)
 * @returns {string}
 */
function dedupePass(html, entry, assetDir, written, bodies) {
  const result = dedupeBodies(html);
  for (const reason of result.blocked) {
    const warning = `dedupe: ${reason}`;
    if (!entry.warnings.includes(warning)) entry.warnings.push(warning);
  }
  // Logged even when nothing moved, the way the motion pass logs an empty
  // record: the mutation log says what happened here, including "nothing".
  entry.deduped = {
    style: result.externalized.style,
    script: result.externalized.script,
    kept: result.kept.style + result.kept.script,
    files: result.files.size,
    bytesIn: result.bytesIn,
    bytesOut: result.bytesOut,
  };
  if (result.externalized.style === 0 && result.externalized.script === 0) return html;
  fs.mkdirSync(assetDir, { recursive: true });
  for (const file of result.files.values()) {
    bodies.add(file.name);
    if (written.has(file.name)) continue;
    fs.writeFileSync(path.join(assetDir, file.name), file.bytes);
    written.add(file.name);
  }
  if (result.csp !== null) {
    const grants = [];
    if (result.externalized.style > 0) grants.push("style-src 'self' (deduped stylesheet)");
    if (result.externalized.script > 0) grants.push("script-src 'self' (deduped runtime)");
    const grant = grants.join('; ');
    entry.csp = entry.csp ? `${entry.csp}; ${grant}` : grant;
  }
  return result.html;
}

/**
 * The write pass: captures are truncated before </body></html> (SingleFile CLI
 * never emits them) — restore whichever closing tags the capture lacks. Runs
 * after every injection (their tags would otherwise land past EOF) and before
 * the body dedupe (whose scan needs the close).
 * @param {string} html
 * @param {LogEntry} entry
 * @returns {string}
 */
function writePass(html, entry) {
  const missing = [];
  if (!/<\/body>/i.test(html)) missing.push('</body>');
  if (!/<\/html>/i.test(html)) missing.push('</html>');
  if (missing.length > 0) {
    html += '\n' + missing.join('');
    entry.restored = [`${missing.join('')} (capture was truncated)`];
  }
  return html;
}

/**
 * The build's pass implementations, keyed by the `pipeline/passes.mjs` table.
 * Each takes the page HTML and the per-page `ctx` and returns the next HTML.
 * The sequence module owns the order and the preconditions; this table owns
 * only the functions, so the two can be read together.
 * @type {Record<string, (html: string, ctx: any) => string>}
 */
const PASS_IMPL = {
  strip: (html, ctx) => stripPass(html, ctx.entry),
  rewrite: (html, ctx) => rewritePass(html, ctx.entry),
  forms: (html, ctx) => formsPass(html, ctx.entry, ctx.page, ctx.formsManifest),
  embeds: (html, ctx) => applyEmbeds(html, ctx.entry, ctx.deadVideoIds),
  originalUrls: (html, ctx) => originalUrlsPass(html, ctx.entry),
  assets: (html, ctx) => assetsPass(html, ctx.entry, ctx.assetDir, ctx.writtenAssets),
  motion: (html, ctx) => motionPass(html, ctx.entry, ctx.bodies.get('motion')),
  interactions: (html, ctx) => mountLayer(html, ctx.entry, layerNamed('interactions'), ctx.bodies.get('interactions')),
  nav: (html, ctx) => mountLayer(html, ctx.entry, layerNamed('nav'), ctx.bodies.get('nav')),
  chat: (html, ctx) => chatPass(html, ctx.entry, ctx.bodies.get('chat')),
  storyHook: (html, ctx) => mountLayer(html, ctx.entry, layerNamed('story-hook'), ctx.bodies.get('story-hook')),
  legibility: (html, ctx) => legibilityPass(html, ctx.entry, ctx.page, ctx.legibilityPatches),
  scroll: (html, ctx) => scrollPass(html, ctx.entry, ctx.bodies.get('scroll')),
  write: (html, ctx) => writePass(html, ctx.entry),
  dedupe: (html, ctx) => dedupePass(html, ctx.entry, ctx.assetDir, ctx.writtenAssets, ctx.writtenBodies),
};

// The two tables must agree: pipeline/passes.mjs owns the order and numbering,
// PASS_IMPL the implementations. A name in one and not the other is a build
// that silently skips a pass. Checked at import, and pinned by
// test/pipeline.test.ts.
export const PASS_IMPL_NAMES = Object.keys(PASS_IMPL);
for (const pass of PASSES) {
  if (typeof PASS_IMPL[pass.name] !== 'function') {
    throw new Error(`pipeline/passes.mjs names the pass "${pass.name}" but build.mjs implements none`);
  }
}
for (const name of PASS_IMPL_NAMES) {
  if (!PASSES.some((pass) => pass.name === name)) {
    throw new Error(`build.mjs implements the pass "${name}" but pipeline/passes.mjs does not list it`);
  }
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
 * @property {string} [csp]  The CSP grant(s) the build added to the captured policy, `'; '`-joined in pass order: `connect-src 'self'` for the chat mount, `frame-src <hosts>` for live embeds (ADR 0002).
 * @property {{srcdoc: number, element: number, component: number, frame: number, popover: number, dead: number, youtube: number, live: number, vidzflow: number, unreachable: number}} [embeds]  Video slots this page carried (ADR 0002): `live` counts the player frames made live; `srcdoc`/`element`/`component`/`frame` say which shape each replaced (`frame` = a frame the Capture emptied and remembered); `popover` counts the popover slots inlined; `youtube` counts the panels the interactions runtime arms on click; `vidzflow` counts the hidden Vidzflow player documents stripped (ticket 19); `dead` is the slots deliberately left as captured; `unreachable` counts the medias this page's JSON-LD names that no slot markup rewrote (mostly dead medias, which is why it overlaps them).
 * @property {number} [originalUrls]  `data-sf-original-*` attributes dropped from the served bytes — the Capture's own URL bookkeeping, consumed by the embed pass where it matters (ticket 12).
 * @property {string[]} [warnings]  Anomalies that left bytes in place (e.g. unbalanced strip scans).
 * @property {number} [linksRewritten]  Internal hrefs rewritten to Recreation routes.
 * @property {{key: string, formId: string, action: string, redirectTo: string}[]} [forms]  Form routing injected on this page (ticket 02).
 * @property {Record<string, number>} [motion]  Motion-pass normalization/annotation counts + the hero detection, per page (ticket 04).
 * @property {Record<string, number>} [scroll]  Scroll-pass from-state normalizations, per page (ticket 21).
 * @property {string[]} [injected]  Recreation runtimes injected inline on this page (motion, interactions, nav, chat, story-hook, legibility CSS, scroll — tickets 04, 05, 14, 10, 03, 12, 21).
 * @property {string[]} [restored]  Structural repairs (closing tags restored to truncated captures).
 * @property {Record<string, number>} [audit]  Post-strip tracker-residue counts; all zeros is clean.
 * @property {{total: number, executable: number, ldJson: number, injected: number, srcdocAllowScripts: number}} [scripts]  Script census of served bytes.
 * @property {{references: number, distinct: number, bytes: number}} [assets]  Inlined data URIs on this page: references rewritten, distinct assets, decoded bytes (ADR 0002).
 * @property {{style: number, script: number, kept: number, files: number, bytesIn: number, bytesOut: number}} [deduped]  Style/script bodies this page wrote out as content-addressed files (ADR 0003): `style`/`script` count the bodies externalized, `kept` the ones left inline (too small, JSON-LD, or no CSP grant), `files` the distinct files among them, `bytesIn`/`bytesOut` the page's size across the pass.
 * @property {string} [error]  Set instead of the pass data when the page could not be built.
 */

/**
 * The build summary (`BuildSummary`) and its metric table live in
 * pipeline/summary.mjs — the mutation log owns its projection, and the build,
 * `--dedupe-tree`, and the CLI all read that one definition.
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
 * @param {{runDir: string, pages: string[], outDir: string, dropPages?: string[], deadVideoIds?: string[], legibilityPatches?: Record<string, string>}} opts
 * @returns {Promise<{ log: LogEntry[], summary: import('./summary.mjs').BuildSummary }>}
 */
export async function runPipeline(opts) {
  const { runDir, pages, outDir, dropPages = [], deadVideoIds = DEAD_VIDEO_IDS, legibilityPatches = LEGIBILITY_PATCHES } = opts;
  const dropSet = new Set(dropPages);
  // A dropped page must not be reachable, even if an earlier build wrote its
  // served file: remove it before building, and never write it.
  for (const page of dropSet) fs.rmSync(servedFileFor(outDir, page), { force: true });
  const buildPages = pages.filter((p) => !dropSet.has(p));
  const log = [];
  const formsManifest = {}; // form route key → { page, formId, redirectTo }
  const assetDir = path.join(outDir, 'assets');
  const writtenAssets = new Set(); // asset sha → already on disk this build
  const writtenBodies = new Set(); // style/script body files written this build
  // read once — every page mounts the same runtime bytes verbatim
  const bodies = readLayerBodies();

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

    // The pass order and its preconditions live in pipeline/passes.mjs; the
    // implementations are keyed by pass name above. `ctx` is the per-page
    // state a pass reads (and, through `entry`, mutates).
    const ctx = { entry, page, formsManifest, deadVideoIds, assetDir, writtenAssets, writtenBodies, bodies, legibilityPatches };
    for (const pass of PASSES) html = PASS_IMPL[pass.name](html, ctx);

    const outFile = servedFileFor(outDir, page);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    entry.bytesOut = html.length;
    entry.audit = audit(html);
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
  // The extracted-asset manifest (ADR 0002): exactly what THIS build wrote, so
  // the serving check walks the references the build resolved rather than
  // whatever happens to sit in the directory. A referenced-but-unwritten asset
  // then still fails the check instead of dropping out of the work list, and an
  // orphan left by an earlier build (the directory is never swept) is not
  // claimed as this build's output.
  const assetNames = [...writtenAssets].sort();
  fs.writeFileSync(path.join(outDir, 'assets.json'), JSON.stringify(assetNames, null, 2));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'build-log.json'), JSON.stringify(log, null, 2));
  // The mock route's redirect table (ticket 02): written even when empty so
  // the route answers cleanly (unknown key → 404) on every build.
  fs.writeFileSync(path.join(outDir, 'forms-manifest.json'), JSON.stringify(formsManifest, null, 2));
  // The serving route's permanent-redirect table (ticket 07), written even
  // when empty so the route answers cleanly on every build.
  fs.writeFileSync(path.join(outDir, 'redirects.json'), JSON.stringify(redirects, null, 2));

  // The summary is the mutation log's projection (pipeline/summary.mjs): the
  // metric table lives there, so the build, `--dedupe-tree`, and the CLI read
  // one definition rather than three copies of the same accounting.
  const summary = project(log, {
    captureRun: path.relative(ROOT, runDir),
    requested: pages.length,
    dropped: pages.filter((p) => dropSet.has(p)),
    redirects: { count: Object.keys(redirects).length, invalid: uncaptured.invalidRedirects, dangling },
    deadRoots: uncaptured.dead,
    authGated: uncaptured.authGated,
    assetDir,
    assetNames,
    bodyFiles: writtenBodies,
  });
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

// ---- tree mode: dedupe an already-built tree ---------------------------------
/** Every `.html` under `dir`, assets excluded. */
function servedHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'assets') servedHtmlFiles(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/** The page path a served file holds (`served/a/b.html` → `/a/b`). */
function pageForServedFile(outDir, file) {
  const rel = path.relative(outDir, file).split(path.sep).join('/');
  return rel === 'index.html' ? '/' : `/${rel.replace(/\.html$/, '')}`;
}

/**
 * Run the dedupe pass over a served tree that already exists, in place, and keep its
 * manifests true.
 *
 * The pass runs inside the build, so a build's own output comes out deduped
 * already. This entry point is for a tree a build wrote before the pass existed
 * (the scrapped capture run's, which cannot be rebuilt until a fresh capture)
 * and for re-running the pass after a threshold change. Same pass, page by
 * page, then `assets.json`, `build-log.json` and `build-summary.json` are
 * updated to match: the serving check reads all three and asserts they agree
 * with the tree and with each other.
 *
 * @param {string} outDir
 * @param {{dryRun?: boolean}} [options]
 * @returns {{pages: number, pagesChanged: number, files: number, externalized: {style: number, script: number}, kept: number, bytesIn: number, bytesOut: number, blocked: string[]}}
 */
export function dedupeTree(outDir, { dryRun = false } = {}) {
  const assetDir = path.join(outDir, 'assets');
  const files = servedHtmlFiles(outDir).sort();
  const written = new Set();
  const logFile = path.join(outDir, 'build-log.json');
  const summaryFile = path.join(outDir, 'build-summary.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : null;
  const summary = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : null;
  const byPage = new Map((log ?? []).map((e) => [e.page, e]));
  const externalized = { style: 0, script: 0 };
  const blocked = new Set();
  let kept = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  let pagesChanged = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const result = dedupeBodies(before);
    bytesIn += result.bytesIn;
    bytesOut += result.bytesOut;
    externalized.style += result.externalized.style;
    externalized.script += result.externalized.script;
    kept += result.kept.style + result.kept.script;
    for (const reason of result.blocked) blocked.add(reason);
    if (result.externalized.style === 0 && result.externalized.script === 0) continue;
    pagesChanged += 1;
    for (const bodyFile of result.files.values()) {
      if (written.has(bodyFile.name)) continue;
      written.add(bodyFile.name);
      if (!dryRun) {
        fs.mkdirSync(assetDir, { recursive: true });
        fs.writeFileSync(path.join(assetDir, bodyFile.name), bodyFile.bytes);
      }
    }
    if (dryRun) continue;
    fs.writeFileSync(file, result.html);
    const entry = byPage.get(pageForServedFile(outDir, file));
    if (entry !== undefined) {
      entry.deduped = {
        style: result.externalized.style,
        script: result.externalized.script,
        kept: result.kept.style + result.kept.script,
        files: result.files.size,
        bytesIn: result.bytesIn,
        bytesOut: result.bytesOut,
      };
      entry.bytesOut = result.html.length;
      // The pass moves bodies, so everything the audit and the census read has
      // to be re-read rather than carried over from the pre-dedupe bytes.
      entry.audit = audit(result.html);
      entry.scripts = scriptCensus(result.html);
      if (result.csp !== null) {
        const grants = [];
        if (result.externalized.style > 0) grants.push("style-src 'self' (deduped stylesheet)");
        if (result.externalized.script > 0) grants.push("script-src 'self' (deduped runtime)");
        const grant = grants.join('; ');
        entry.csp = entry.csp ? `${entry.csp}; ${grant}` : grant;
      }
    }
  }
  if (dryRun) {
    return { pages: files.length, pagesChanged, files: written.size, externalized, kept, bytesIn, bytesOut, blocked: [...blocked] };
  }
  // The asset manifest is what the serving check walks, so the new files must
  // be in it, and the summary's count must match the manifest it is checked
  // against.
  const assetsFile = path.join(outDir, 'assets.json');
  const named = new Set(fs.existsSync(assetsFile) ? JSON.parse(fs.readFileSync(assetsFile, 'utf8')) : []);
  for (const name of written) named.add(name);
  const assetNames = [...named].sort();
  fs.writeFileSync(assetsFile, JSON.stringify(assetNames, null, 2));
  if (log !== null) fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  if (summary !== null) {
    // The same projection the build uses (pipeline/summary.mjs): tree mode may
    // not keep its own copy of the summary's shape.
    summary.assets = assetTotals(assetDir, assetNames, summary.assets.references);
    summary.bodies = bodyTotals(assetDir, written, {
      styles: externalized.style,
      scripts: externalized.script,
      kept,
      bytesIn,
      bytesOut,
    });
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  }
  return { pages: files.length, pagesChanged, files: written.size, externalized, kept, bytesIn, bytesOut, blocked: [...blocked] };
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
  for (const line of render(summary)) console.log(line);
}

// ---- CLI ----------------------------------------------------------------------

async function main() {
  const arg = makeArg(process.argv.slice(2));

  // Tree mode: apply the dedupe pass to a served tree that already exists, in place.
  // The build runs the pass itself, so this is for the tree a build wrote
  // before the pass existed (and for a threshold change) — the captures it came
  // from need not exist. `npm run dedupe` is the script.
  const treeIndex = process.argv.indexOf('--dedupe-tree');
  if (treeIndex >= 0) {
    const next = process.argv[treeIndex + 1];
    const treeDir = path.resolve(ROOT, next !== undefined && !next.startsWith('--') ? next : 'served');
    const dryRun = process.argv.includes('--dry-run');
    const r = dedupeTree(treeDir, { dryRun });
    console.log(
      `${dryRun ? '(dry run) ' : ''}dedupe ${r.pages} page(s): ${r.externalized.style} style + ${r.externalized.script} script body(ies) → `
      + `${r.files} file(s) (${r.pagesChanged} page(s) rewritten), ${r.kept} kept inline`
    );
    console.log(`html: ${(r.bytesIn / 1e6).toFixed(1)}MB → ${(r.bytesOut / 1e6).toFixed(1)}MB`);
    for (const reason of r.blocked) console.log(`⚠ dedupe: ${reason}`);
    return;
  }

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
