// PROTOTYPE (wayfinder ticket 05) — the capture→served build pass.
// Throwaway: answers "what is the repeatable pipeline from capture run to a
// served page that hits the fidelity bar with minimum work?" Not production.
//
// Reads SingleFile captures (ground truth), applies per page:
//   1. strip   — Qualified pounce host subtree, OneTrust banner/PC/style (DOM surgery;
//                captures carry no executable scripts — only 2 JSON-LD blocks — so
//                zero-outbound is true by construction once strip DOM is gone)
//   2. rewrite — internal hrefs https://(www.)flocksafety.com/X → /X (external stay live)
//   3. forms   — inject method/action on configured main-flow forms → /api/forms/<slug>
//   4. inject  — dormant story-hooks runtime (<script> before </body>, CSP 'unsafe-inline' ok)
// Writes a mirrored tree to served/ plus redirects.json (from the run's
// manifest-uncaptured.csv) and build-log.json (every mutation, per page).
//
// Usage: node pipeline/build.mjs [--run <captureRunDir>] [--pages /a,/b] [--out served]
//   default pages: pipeline/pages.list (prototype subset); empty file = all capture-list.txt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTO = path.dirname(HERE); // prototype/snapshot-serving
const DEFAULT_RUN = path.join(PROTO, '../../research/flocksafety/2026-09-09');

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}
const RUN = path.resolve(arg('--run') ?? DEFAULT_RUN);
const OUT = path.resolve(PROTO, arg('--out') ?? 'served');

let pagesArg = arg('--pages');
let pages;
if (pagesArg) {
  pages = pagesArg.split(',').map((s) => s.trim()).filter(Boolean);
} else {
  const listFile = path.join(HERE, 'pages.list');
  if (fs.existsSync(listFile)) {
    pages = fs.readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  } else {
    pages = fs
      .readFileSync(path.join(RUN, 'capture-list.txt'), 'utf8')
      .split('\n').map((s) => s.trim()).filter(Boolean);
  }
}

// ---- config ----------------------------------------------------------------

// Main-flow form injections: page → (marker inside the <form> tag, mock route, thank-you path).
// Homepage has no forms; /book-a-demo's visible Marketo form is the proof case.
const FORM_INJECTIONS = {
  '/book-a-demo': { marker: 'id=mktoForm_1009', action: '/api/forms/book-a-demo', redirect: '/thank-you' },
};

// Strip targets: DOM subtrees removed whole. Each: { name, start: RegExp,
// mode: 'balance' (balanced open/close scan of `tag`) | 'to-close' (scan to `close`) }.
// Findings of the first run: the Qualified chat LAUNCHER lives in a <q-root> custom
// element (with AI-assistant a11y guard divs) outside the pounce host, and its
// layout-shift <style id=qualified-offer-style-element-N> blocks sit in <head>.
const STRIP_TARGETS = [
  { name: 'qualified-offer-host', start: /<div[^>]*\sid=("|')?_qualified-offer-host-/i, mode: 'balance', tag: 'div' },
  { name: 'q-root (chat launcher)', start: /<q-root\b/i, mode: 'balance', tag: 'q-root' },
  { name: 'qualified-offer-style-element', start: /<style[^>]*\sid=("|')?qualified-offer-/i, mode: 'to-close', close: /<\/style\s*>/i, all: true },
  { name: 'qualified-offer CSS (bare style)', start: /<style[^>]*>/i, mode: 'to-close', close: /<\/style\s*>/i, contentRe: /qualified-offer-/, all: true },
  { name: 'onetrust-pc-dark-filter', start: /<div[^>]*class=("|')?[^>]*\bonetrust-pc-dark-filter\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-consent-sdk (empty root)', start: /<div[^>]*\sid=("|')?onetrust-consent-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'q-focus-sentinel', start: /<q-focus-sentinel\b/i, mode: 'balance', tag: 'q-focus-sentinel' },
  { name: 'onetrust-banner-sdk', start: /<div[^>]*\sid=("|')?onetrust-banner-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-pc-sdk', start: /<div[^>]*\sid=("|')?onetrust-pc-sdk\b/i, mode: 'balance', tag: 'div' },
  { name: 'onetrust-style', start: /<style[^>]*\sid=("|')?onetrust-style\b/i, mode: 'to-close', close: /<\/style\s*>/i },
];

// Post-strip audit: any of these remaining suggests strip-list incompleteness.
const AUDIT_RES = [
  ['qualified', /qualified/i],
  ['onetrust/ot-sdk', /onetrust|ot-sdk|ot-sync/i],
  ['known trackers', /googletagmanager\.com|google-analytics\.com|hotjar\.com|hockeystack\.com|bing\.com\/bat|linkedin\.com\/px|connect\.facebook\.net|snap\.licdn\.com|6sense\.com|marketo\.com|munchkin\.marketo/i],
];

// ---- helpers ---------------------------------------------------------------

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
  return -1; // unbalanced — caller logs and skips
}

/** End index of the first `close` match after `start`. */
function toCloseEnd(html, start, close) {
  const m = close.exec(html.slice(start));
  return m ? start + m.index + m[0].length : -1;
}

function captureFileFor(pagePath) {
  const rel = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '.html';
  return path.join(RUN, rel);
}

function servedFileFor(pagePath, outDir) {
  const rel = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '.html';
  return path.join(outDir, rel);
}

/** Rewrite internal hrefs (quoted + unquoted, absolute + protocol-relative) to root-relative. */
function rewriteLinks(html) {
  let count = 0;
  html = html.replace(/href="(https?:)?\/\/(www\.)?flocksafety\.com([^"]*)"/gi, (_, _p, _w, rest) => {
    count += 1;
    return `href="${rest.startsWith('/') ? rest : '/' + rest}"`;
  });
  html = html.replace(/href=(https?:)?\/\/(www\.)?flocksafety\.com([^\s">]+)/gi, (_, _p, _w, rest) => {
    count += 1;
    return `href=${rest.startsWith('/') ? rest : '/' + rest}`;
  });
  return { html, count };
}

// ---- redirects from the run manifest ---------------------------------------

function loadRedirects() {
  const csv = fs.readFileSync(path.join(RUN, 'manifest-uncaptured.csv'), 'utf8').trim().split('\n');
  const map = {};
  for (const line of csv.slice(1)) {
    const [p, , type, , target] = line.split(',');
    if (type === 'redirect' && target) map[p] = target;
  }
  return map;
}

// ---- pipeline per page ------------------------------------------------------

const log = [];

for (const page of pages) {
  const src = captureFileFor(page);
  if (!fs.existsSync(src)) {
    log.push({ page, error: 'capture file missing', src });
    continue;
  }
  const before = fs.readFileSync(src, 'utf8');
  let html = before;
  const entry = { page, bytesIn: before.length, stripped: {}, linksRewritten: 0, formsInjected: 0, injected: [] };

  // 1. strip (`all: true` repeats until the pattern is gone — Qualified injects
  // several orphaned style blocks with the same id prefix into <head>)
  for (const t of STRIP_TARGETS) {
    let removed = 0;
    const re = new RegExp(t.start.source, t.start.flags.replace('g', '') + 'g');
    for (let guard = 0; guard < 100; guard++) {
      const m = re.exec(html);
      if (!m) break;
      const start = m.index;
      const end = t.mode === 'balance' ? balanceEnd(html, start, t.tag) : toCloseEnd(html, start, t.close);
      if (end < 0) {
        entry.stripped[t.name] = 'UNBALANCED — left in place';
        break;
      }
      const content = html.slice(start, end);
      if (t.contentRe && !t.contentRe.test(content)) {
        // content-keyed target: this block isn't strip residue, keep scanning after it
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

  // 1b. attribute cleanup — Qualified marked real page elements with this flag,
  // and left its layout-shift var inline on <body>
  {
    const attrHits = html.match(/\squalified-offer-header-shifted-element=true/g);
    if (attrHits) {
      html = html.replace(/\squalified-offer-header-shifted-element=true/g, '');
      entry.stripped['qualified header-shift attrs'] = attrHits.length + ' attrs';
    }
    const varHits = html.match(/--qualified-offer-header-height:[^;"']*/g);
    if (varHits) {
      html = html.replace(/--qualified-offer-header-height:[^;"']*;?/g, '');
      entry.stripped['qualified header-height var'] = varHits.length;
    }
  }

  // 2. link rewrite
  const rw = rewriteLinks(html);
  html = rw.html;
  entry.linksRewritten = rw.count;

  // 3. form injection
  const formCfg = FORM_INJECTIONS[page];
  if (formCfg) {
    const formTagRe = /<form[^>]*>/gi;
    let fm;
    while ((fm = formTagRe.exec(html))) {
      if (!fm[0].includes(formCfg.marker)) continue;
      let tag = fm[0];
      if (/\baction=/i.test(tag)) tag = tag.replace(/\saction=[^\s>]+/i, '');
      tag = tag.replace(/\smethod=[^\s>]+/i, '');
      tag = `${tag.slice(0, -1)} method=post action=${formCfg.action}>`;
      html = html.slice(0, fm.index) + tag + html.slice(fm.index + fm[0].length);
      entry.formsInjected += 1;
      entry.formRedirect = formCfg.redirect;
      break;
    }
  }

  // 4. story-hook injection (dormant runtime, inline — CSP meta allows 'unsafe-inline').
  // Captures are TRUNCATED before </body></html> (SingleFile CLI never emits them),
  // so anchor at EOF and restore the closing tags while we're there.
  const hook = fs.readFileSync(path.join(HERE, 'story-hooks.js'), 'utf8');
  const hookTag = `<script data-flock-parody="story-hooks">\n${hook}\n</script>`;
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + hookTag + '\n' + html.slice(closeBody);
    entry.injected.push('story-hooks.js (inline, dormant)');
  } else {
    html = html + '\n' + hookTag + '\n</body></html>';
    entry.injected.push('story-hooks.js (inline, dormant) + restored </body></html> (capture was truncated)');
  }

  // write
  const outFile = servedFileFor(page, OUT);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  entry.bytesOut = html.length;

  // audit
  entry.audit = {};
  for (const [name, re] of AUDIT_RES) {
    entry.audit[name] = (html.match(new RegExp(re.source, 'gi')) || []).length;
  }
  entry.scripts = (html.match(/<script\b/gi) || []).length; // expect: 2 JSON-LD + 1 hook
  log.push(entry);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'redirects.json'), JSON.stringify(loadRedirects(), null, 2));
fs.writeFileSync(path.join(OUT, 'build-log.json'), JSON.stringify(log, null, 2));

// summary
for (const e of log) {
  if (e.error) {
    console.log(`✗ ${e.page}: ${e.error}`);
    continue;
  }
  const stripStr = Object.entries(e.stripped).map(([k, v]) => `${k}:${typeof v === 'number' ? Math.round(v / 1024) + 'kB' : v}`).join(' ');
  const auditStr = Object.entries(e.audit).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || 'clean';
  console.log(`✓ ${e.page}  (${Math.round(e.bytesIn / 1e6)}MB → ${Math.round(e.bytesOut / 1e6)}MB)  strip[${stripStr}]  links:${e.linksRewritten}  forms:${e.formsInjected}  scripts:${e.scripts}  audit: ${auditStr}`);
}
console.log(`\n${log.length} page(s) → ${OUT}`);
