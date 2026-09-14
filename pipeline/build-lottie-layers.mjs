// Build the six page-scoped Lottie layers.
//
// The Lottie heroes on the six product pages were inert in the Capture: the
// page carries `data-animation-type=lottie` and a remote `data-src`, and nothing
// on the served page ever loads a player, so the box stays empty. This script
// vendors the animation JSONs as the source of truth (the analogue of
// `dialogue/flock.yarn`) and emits one self-contained runtime per page that
// carries the player, the animation data, and the mount.
//
// The player is lottie-web 5.13.0, full build, vendored unmodified at
// `pipeline/vendor/lottie.min.js` (MIT, see `pipeline/vendor/LOTTIE-CITATION.md`).
// It is read, never edited: the two neuters below rewrite the exact snippets the
// `isInertSource` rule refuses, and the script asserts the union — banner +
// neutered player + animation data + mount — is inert before it writes a byte.
//
// Why the two neuters, and why they are safe:
//
//   1. The asset loader builds `new XMLHttpRequest` to fetch a `data-src` when a
//      caller passes a URL instead of `animationData`. Every generated layer
//      passes `animationData`, so that path is never taken; the stub throws, and
//      its message names no banned primitive.
//
//   2–3. The ExpressionManager closure declares `XMLHttpRequest=null,fetch=null`
//      (and lists them in `__preventDeadCodeRemoval`) so a compiled expression
//      cannot reach the network. Expressions are compiled with `eval` inside that
//      closure, so the declarations are bindings that shadow the globals: they
//      can only be *dropped*, never renamed. `window=null`, `document=null` and
//      `frames=null` stay — they are not banned, and a null `window` is what
//      actually blocks reach. Dropping the two network names is safe because the
//      vendored JSONs are ours: this script scans every `x` expression in all six
//      and fails if one names a banned primitive.
//
// Usage: `node pipeline/build-lottie-layers.mjs` (rewrites `pipeline/lottie/*.runtime.js`).
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NETWORK_PRIMITIVES, isInertSource } from './injected-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'pipeline/vendor/lottie.min.js');
const LOTTIE_DIR = path.join(ROOT, 'pipeline/lottie');

/**
 * The six heroes, in the order the roster ships them. `stamp` is the Webflow
 * asset id that starts the captured `data-src` filename — the mount uses it to
 * pick *its* container on a page that carries more than one Lottie (only
 * `/products/flock-dfr` does; the vendor's own `data-src` names no host and
 * never ships, because the runtime removes the attribute).
 *
 * `flock-dfr` is the recon's one correction: the vendored `flock-dfr.json`
 * is the 4,668 B CDN `697aa404c8693265548d6485_46eaf6ace16345d0a3c77a77b862a440.json`,
 * the first of the page's three `.l-img.cc-dfr` boxes. The page has seven
 * `data-animation-type=lottie` containers and no `product-hero_lottie`; the
 * stamp keeps the runtime on the one animation we vendored and leaves the other
 * six exactly as captured (inert).
 * @type {{ name: string, route: string, json: string, stamp: string }[]}
 */
const HEROES = [
  { name: 'flock-dfr', route: '/products/flock-dfr', json: 'flock-dfr.json', stamp: '697aa404c8693265548d6485_' },
  { name: 'flock-freeform', route: '/products/flock-freeform', json: 'flock-freeform.json', stamp: '686287b72c241200cdd5044f_' },
  { name: 'flock-os', route: '/products/flock-os', json: 'flock-os.json', stamp: '685d8d69194804a7cdd5c666_' },
  { name: 'flock-safety-platform', route: '/products/flock-safety-platform', json: 'flock-safety-platform.json', stamp: '68618f0085bf4baa1110082c_' },
  { name: 'gunshot-detection', route: '/products/gunshot-detection', json: 'gunshot-detection.json', stamp: '685bcd69fc6a6e0809525986_' },
  { name: 'video-cameras', route: '/products/video-cameras', json: 'video-cameras.json', stamp: '68618f027169b5bd9b1f59b1_' },
];

/**
 * One exact transform on the vendored player: find the snippet, insist it
 * appears the expected number of times, replace it. A drift in the vendored
 * bytes fails loudly rather than shipping a player with a live network path.
 * @type {{ id: string, find: string, replace: string, count: number, why: string }[]}
 */
const NEUTERS = [
  {
    id: 'asset-loader',
    find: 'new XMLHttpRequest',
    replace: '(function(){throw new Error("lottie: data-src loading is disabled in The Recreation")})()',
    count: 1,
    why: 'the data-src fetch path, never taken because every layer passes animationData',
  },
  {
    id: 'expression-globals',
    find: 'window=null,document=null,XMLHttpRequest=null,fetch=null,frames=null,',
    replace: 'window=null,document=null,frames=null,',
    count: 1,
    why: 'ExpressionManager shadow bindings — the two network names can only be dropped, not renamed',
  },
  {
    id: 'expression-keepalive',
    find: '[window,document,XMLHttpRequest,fetch,frames,',
    replace: '[window,document,frames,',
    count: 1,
    why: 'the same two names in __preventDeadCodeRemoval',
  },
];

/** The `<name>_<hash>.json` filename a captured `data-src` ends with, host-free. */
const citation = `// Citation: Airbnb — lottie-web (v5.13.0) [MIT]
// Source: https://unpkg.com/lottie-web@5.13.0/build/player/lottie.min.js
// Accessed: 2026-09-14
// Vendored unmodified at pipeline/vendor/lottie.min.js; see pipeline/vendor/LOTTIE-CITATION.md.
// Modified for this repository by pipeline/build-lottie-layers.mjs on 2026-09-14 — two
// network primitives removed so the embedded copy satisfies isInertSource.`;

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function occurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/**
 * The neutered player: every transform applied with its count proven.
 * @param {string} source
 * @returns {string}
 */
function neuter(source) {
  let out = source;
  for (const step of NEUTERS) {
    const found = occurrences(out, step.find);
    if (found !== step.count) {
      throw new Error(`neuter '${step.id}': expected ${step.count} occurrence(s) of ${JSON.stringify(step.find)}, found ${found} — the vendored player drifted`);
    }
    out = out.split(step.find).join(step.replace);
  }
  if (isInertSource(out) !== true) throw new Error('neuter: the transformed player is not inert');
  return out;
}

/**
 * Every Lottie expression string in one animation: the `x` property wherever a
 * property object carries it. Returns `{ total, banned }` — `banned` entries
 * name the primitive and the expression so the failure is actionable.
 * @param {unknown} value
 * @returns {{ total: number, banned: { expr: string, primitive: string }[] }}
 */
function scanExpressions(value) {
  const expressions = [];
  /** @param {unknown} node */
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'x' && typeof child === 'string') expressions.push(child);
        walk(child);
      }
    }
  };
  walk(value);
  const banned = [];
  for (const expr of expressions) {
    const match = NETWORK_PRIMITIVES.exec(expr);
    // the shared regex carries no /g flag, so lastIndex never moves
    if (match) banned.push({ expr, primitive: match[0] });
    NETWORK_PRIMITIVES.lastIndex = 0;
  }
  return { total: expressions.length, banned };
}

/**
 * The mount and play policy, one per page. `STAMP` selects this page's container
 * when more than one `[data-animation-type=lottie]` exists; the single-container
 * case (five of six pages) takes the only one. ES5-safe, DOM-only.
 * @param {string} stamp
 * @returns {string}
 */
const mount = (stamp) => `;(function () {
  var DATA = __ANIMATION_DATA__;
  var STAMP = '${stamp}';
  function initiate() {
    var nodes = document.querySelectorAll('[data-animation-type=lottie]');
    var container = null;
    for (var i = 0; i < nodes.length; i++) {
      var src = nodes[i].getAttribute('data-src') || '';
      if (src.indexOf(STAMP) !== -1) { container = nodes[i]; break; }
    }
    if (!container && nodes.length === 1) container = nodes[0];
    if (!container) return;
    container.removeAttribute('data-src');
    var loop = container.getAttribute('data-loop') !== '0';
    var anim = window.lottie.loadAnimation({
      container: container,
      renderer: 'svg',
      loop: loop,
      autoplay: false,
      animationData: DATA
    });
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      var total = (DATA.op || 0) - (DATA.ip || 0);
      anim.goToAndStop(total - 1, true);
      return;
    }
    if (!('IntersectionObserver' in window)) { anim.play(); return; }
    var observer = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isIntersecting) { anim.play(); observer.disconnect(); return; }
      }
    });
    observer.observe(container);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initiate, false);
  else initiate();
})();
`;

function main() {
  const vendor = readFileSync(VENDOR, 'utf8');
  const player = neuter(vendor);
  console.log(`vendor: pipeline/vendor/lottie.min.js (${statSync(VENDOR).size} B) → neutered ${player.length} chars, inert=${isInertSource(player)}`);

  for (const hero of HEROES) {
    const jsonPath = path.join(LOTTIE_DIR, hero.json);
    const raw = readFileSync(jsonPath, 'utf8');
    let animation;
    try {
      animation = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${hero.json}: not valid JSON — ${err instanceof Error ? err.message : err}`);
    }
    const { total, banned } = scanExpressions(animation);
    if (banned.length > 0) {
      const first = banned[0];
      throw new Error(`${hero.json}: expression names ${first.primitive}: ${JSON.stringify(first.expr)} — the ExpressionManager neuter cannot ship`);
    }
    const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    if (/[\u2028\u2029]/.test(body)) throw new Error(`${hero.json}: contains a raw line separator that is not ES5-safe`);
    const runtime = `${citation}\n${player}\n${mount(hero.stamp).replace('__ANIMATION_DATA__', () => body)}`;
    if (isInertSource(runtime) !== true) throw new Error(`${hero.name}.runtime.js is not inert — refusing to write`);
    const out = path.join(LOTTIE_DIR, `${hero.name}.runtime.js`);
    writeFileSync(out, runtime, 'utf8');
    const hash = createHash('sha256').update(runtime).digest('hex').slice(0, 16);
    console.log(
      `  ${hero.name.padEnd(24)} exprs=${String(total).padStart(2)}  ${String(runtime.length).padStart(9)} chars  sha256_16=${hash}  → pipeline/lottie/${hero.name}.runtime.js`,
    );
  }
}

main();
