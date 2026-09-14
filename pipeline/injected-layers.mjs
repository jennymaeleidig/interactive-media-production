// The Recreation's own injected bytes, and their one owner.
//
// Everything else in `served/` is the Capture's. These are ours: the six
// site-wide runtime/CSS layers (`motion`, `interactions`, `nav`, `chat`,
// `story-hook`, `scroll`), the page-scoped `legibility` patch (only on
// `/safe-cities`), and the six page-scoped Lottie heroes (`lottie-<name>`, one
// product page each). Each is injected into a served page carrying
// `data-flock-parody="<layer>"`, and each exists twice — a maintained source in
// `pipeline/`, and the bytes the tree ships (an `/assets/<name>` file, or an
// inline body). This module is the only place that knows both sides, so it is
// the only thing that can say whether they still agree.
//
// It is plain JS, not TS, for the reason `served-tree.mjs` gives: its two
// readers cannot share a language. The serving check (`regression/routes.mjs`)
// is plain JS and needs the per-page roster and the mirror comparison; the DOM
// seams are TS and need a page's marked members in document order. It is pure —
// the shipped bytes and the maintained source come in as readers — so a test can
// pin the whole comparison without touching the 660 MB tree.
//
// Three things it deliberately does NOT do. It does not publish: rewriting a
// marked layer (new bytes, new content-addressed name, every carrying page
// rewritten, `assets.json` regenerated) is a rare deliberate write that owns the
// record files it invalidates, and it is deferred until a layer actually changes
// (a deliberate, deferred write). It does not own the Capture's strip invariant —
// `audit.mjs` owns the half that keeps captured scripts out; this owns the half
// that keeps our own sources on the allow-list-free side (`injected-source.mjs`).
// And it does not treat an asset name as stable across publishes: the name is a
// hash of the bytes, so it is read from the page, never assumed.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGIBILITY_PATCHES } from './config.mjs';
import { MARKER_ATTR } from './marker.mjs';

/**
 * One piece of a layer: the kind of source it is (`css` or `js`), the form the
 * page carries it in (`asset` for an `/assets/<name>` reference, `inline` for a
 * body written into the tag), and where it is maintained (`source`, a path
 * relative to the repo root) — except a `patch` part, whose bytes come from
 * `LEGIBILITY_PATCHES` per page instead of a file.
 * @typedef {{ kind: 'css'|'js', delivery: 'asset'|'inline', source?: string, patch?: true, outbound?: 'none'|'self' }} Part
 */

/**
 * A roster part as one page carries it: the declared part plus the address of
 * its bytes on that page — `ref` for an `/assets/<name>` reference, `body` for
 * an inline one.
 * @typedef {{ name: string } & Part & { ref?: string, body?: string }} MarkedMember
 */

/**
 * One marked member. `scope` is `site` (every served page carries it) or `page`
 * (only the paths in `pages` do). The order of `LAYERS`, and of `parts` within a
 * layer, records the order the tree ships, because that order is real: the
 * layers share one document, and the frozen page bytes are the only place it is
 * written down. A page that disagrees is reported (`mirrorFindings`), not
 * corrected.
 * @typedef {{ name: string, scope: 'site'|'page', pages?: string[], parts: Part[] }} Layer
 */

/**
 * The declared roster: what every served page is expected to carry, in the
 * order it carries it. Declaring the set is what makes a vanished member fail; a
 * page-scoped member being declared with its page is what makes `legibility`
 * visible instead of a stray seventh marker nobody owns.
 * @type {Layer[]}
 */
export const LAYERS = [
  {
    name: 'motion',
    scope: 'site',
    parts: [
      { kind: 'css', delivery: 'asset', source: 'pipeline/motion.css' },
      { kind: 'js', delivery: 'asset', source: 'pipeline/motion-runtime.js' },
    ],
  },
  {
    name: 'interactions',
    scope: 'site',
    parts: [
      { kind: 'css', delivery: 'asset', source: 'pipeline/interactions.css' },
      { kind: 'js', delivery: 'asset', source: 'pipeline/interactions-runtime.js' },
    ],
  },
  {
    name: 'nav',
    scope: 'site',
    parts: [
      { kind: 'css', delivery: 'asset', source: 'pipeline/nav.css' },
      { kind: 'js', delivery: 'asset', source: 'pipeline/nav-runtime.js' },
    ],
  },
  {
    name: 'chat',
    scope: 'site',
    parts: [
      { kind: 'css', delivery: 'asset', source: 'pipeline/chat-widget.css' },
      // The widget plus the dialogue engine that answers it, one generated
      // asset: `pipeline/build-chat-runtime.mjs` bundles `chat-engine.mjs` and
      // concatenates `chat-widget.js`, so the conversation runs in the page and
      // the mimic needs no server (`injected-source.mjs`).
      { kind: 'js', delivery: 'asset', source: 'pipeline/chat-runtime.js' },
    ],
  },
  {
    name: 'story-hook',
    scope: 'site',
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/story-hook.js' }],
  },
  {
    name: 'legibility',
    scope: 'page',
    pages: ['/safe-cities'],
    parts: [{ kind: 'css', delivery: 'inline', patch: true }],
  },
  {
    name: 'scroll',
    scope: 'site',
    parts: [
      // the only layer whose CSS ships inline rather than as an asset — under
      // the build's 1 KB inline rule, not by accident. The homepage and
      // /safe-cities both carry it as a `<style>` body.
      { kind: 'css', delivery: 'inline', source: 'pipeline/scroll.css' },
      { kind: 'js', delivery: 'asset', source: 'pipeline/scroll-runtime.js' },
    ],
  },
  // The six Lottie heroes, one per product page. Each runtime is generated by
  // `pipeline/build-lottie-layers.mjs`: it embeds the vendored lottie-web player
  // and the page's animation JSON verbatim, and mounts the page's
  // `[data-animation-type=lottie]` container on scroll-into-view. They carry no
  // `outbound` because the embedded animation data is all `data:` URIs and the
  // neutered player names no network primitive (`injected-source.mjs`).
  //
  // They sit after `scroll` because that is where each page carries them: the
  // tag goes immediately after the last site-wide marked script.
  {
    name: 'lottie-flock-dfr',
    scope: 'page',
    pages: ['/products/flock-dfr'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/flock-dfr.runtime.js' }],
  },
  {
    name: 'lottie-flock-freeform',
    scope: 'page',
    pages: ['/products/flock-freeform'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/flock-freeform.runtime.js' }],
  },
  {
    name: 'lottie-flock-os',
    scope: 'page',
    pages: ['/products/flock-os'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/flock-os.runtime.js' }],
  },
  {
    name: 'lottie-flock-safety-platform',
    scope: 'page',
    pages: ['/products/flock-safety-platform'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/flock-safety-platform.runtime.js' }],
  },
  {
    name: 'lottie-gunshot-detection',
    scope: 'page',
    pages: ['/products/gunshot-detection'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/gunshot-detection.runtime.js' }],
  },
  {
    name: 'lottie-video-cameras',
    scope: 'page',
    pages: ['/products/video-cameras'],
    parts: [{ kind: 'js', delivery: 'asset', source: 'pipeline/lottie/video-cameras.runtime.js' }],
  },
];

/**
 * The marked open tag of any element that can carry our bytes. Built from the
 * shared attribute name (`marker.mjs`) so the roster can never drift from the
 * audit's census; the value is always double-quoted in the tree.
 */
const MARKED = new RegExp(`<(link|script|style)\\b[^>]*${MARKER_ATTR}="([^"]+)"[^>]*>`, 'gi');

/**
 * The value of one attribute, quoted or unquoted — the tree writes both.
 * @param {string} tag
 * @param {string} name
 * @returns {string|null}
 */
const attribute = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
};

/**
 * The file name an asset reference points at, or null if it points elsewhere.
 * @param {string|null} value
 * @returns {string|null}
 */
const assetRef = (value) => {
  if (!value) return null;
  const m = /(?:^|\/)assets\/([^"'?#\s>]+)$/.exec(value);
  return m ? m[1] : null;
};

/**
 * The text between a marked open tag's end and its own closing tag.
 * @param {string} html
 * @param {number} from
 * @param {string} element
 * @returns {string}
 */
const inlineBody = (html, from, element) => {
  const close = html.toLowerCase().indexOf(`</${element}>`, from);
  return close === -1 ? '' : html.slice(from, close);
};

/**
 * A page's marked members, in document order — the roster as this page actually
 * carries it. Reads both delivery forms: an `/assets/<name>` reference becomes
 * `{ ref }`, anything written into the tag becomes `{ body }`.
 * @param {string} html
 * @returns {MarkedMember[]}
 */
export function markedMembers(html) {
  /** @type {MarkedMember[]} */
  const members = [];
  MARKED.lastIndex = 0;
  let m;
  while ((m = MARKED.exec(html))) {
    const [tag, element, name] = m;
    const kind = element === 'script' ? 'js' : 'css';
    const ref = assetRef(attribute(tag, 'src') ?? attribute(tag, 'href'));
    if (ref) members.push({ name, kind, delivery: 'asset', ref });
    else members.push({ name, kind, delivery: 'inline', body: inlineBody(html, m.index + tag.length, element) });
  }
  return members;
}

/**
 * Whether the roster puts this layer on this page.
 * @param {Layer} layer
 * @param {string} page
 * @returns {boolean}
 */
const coversPage = (layer, page) => layer.scope === 'site' || (layer.pages ?? []).includes(page);

/**
 * The parts a page is expected to carry, flattened in roster order.
 * @param {string} page
 * @returns {({ name: string } & Part)[]}
 */
const expectedParts = (page) =>
  LAYERS.filter((layer) => coversPage(layer, page)).flatMap((layer) => layer.parts.map((part) => ({ name: layer.name, ...part })));

/**
 * Comment-and-whitespace-folded source, the comparator this comparison has
 * always used (it arrived with `test/serving.seam.test.ts`). Two files are
 * "the same code" when this says so and "prose drift" when it does not — the
 * tree cannot be rebuilt from `pipeline/`, so comment-only differences between
 * a maintained source and the shipped bytes are expected and are reported, never
 * fatal.
 * @param {string} source
 */
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Compare one page's marked members against the roster and their maintained
 * sources. The readers are injected so this stays pure: `shipped(member)` gives
 * the bytes the tree carries for a marked member, `maintained(name, kind)` gives
 * `{ bytes, origin }` for the source we keep.
 *
 * Failures are things that must not happen: a declared member missing from a
 * page, a marked member the roster does not declare, a member on a page it is
 * not scoped to, a member in the wrong delivery form, bytes that diverge in
 * code, a member with no source at all. Notes are things worth knowing and
 * expected to be true today: comment-only drift, and a page whose members are in
 * a different order from the roster's.
 * @param {{ page: string, members: MarkedMember[], shipped: (m: MarkedMember) => string|null, maintained: (name: string, kind: string, page: string) => { bytes: string, origin: string }|null }} input
 * @returns {{ failures: string[], notes: string[] }}
 */
export function mirrorFindings({ page, members, shipped, maintained }) {
  const failures = [];
  const notes = [];
  /** @param {string} name @param {string} kind @returns {string} */
  const key = (name, kind) => `${name}/${kind}`;
  const observed = new Map(members.map((member) => [key(member.name, member.kind), member]));
  const declared = new Map(LAYERS.map((layer) => [layer.name, layer]));
  const expected = expectedParts(page);

  for (const part of expected) {
    const found = observed.get(key(part.name, part.kind));
    if (!found) {
      failures.push(`missing member: ${page} does not carry ${key(part.name, part.kind)}`);
    } else if (found.delivery !== part.delivery) {
      failures.push(`delivery mismatch: ${page} ships ${key(part.name, part.kind)} as ${found.delivery}, the roster says ${part.delivery}`);
    }
  }

  for (const member of members) {
    const layer = declared.get(member.name);
    if (!layer) {
      failures.push(`undeclared member: ${page} carries ${key(member.name, member.kind)}, which the roster does not declare`);
    } else if (!coversPage(layer, page)) {
      failures.push(`out of scope: ${page} carries ${key(member.name, member.kind)}, but ${member.name} is scoped to ${(layer.pages ?? []).join(', ')}`);
    } else if (!layer.parts.some((part) => part.kind === member.kind)) {
      failures.push(`undeclared kind: ${page} carries ${key(member.name, member.kind)}, which ${member.name} does not declare`);
    }
  }

  /** @param {({ name: string, kind: string })[]} parts @returns {string} */
  const orderOf = (parts) => parts.map((part) => key(part.name, part.kind)).join(', ');
  if (orderOf(members) !== orderOf(expected)) {
    notes.push(`order: ${page} carries ${orderOf(members)}; the roster records ${orderOf(expected)}`);
  }

  for (const part of expected) {
    const found = observed.get(key(part.name, part.kind));
    if (!found) continue;
    const source = maintained(part.name, part.kind, page);
    if (!source) {
      failures.push(`no source: ${key(part.name, part.kind)} has no maintained source for ${page}`);
      continue;
    }
    const bytes = shipped(found);
    if (bytes === null) {
      failures.push(`unreadable: ${page} names bytes for ${key(part.name, part.kind)} the tree does not carry`);
    } else if (bytes === source.bytes) {
      continue;
    } else if (codeOf(bytes) === codeOf(source.bytes)) {
      notes.push(`prose drift: ${key(part.name, part.kind)} differs only in comments from ${source.origin}`);
    } else {
      failures.push(`code drift: ${key(part.name, part.kind)} on ${page} ships different code from ${source.origin}`);
    }
  }

  return { failures, notes };
}

/**
 * The roster part for one layer and kind, by name, or `null` when the roster
 * declares neither. The one lookup every reader of the roster uses — the
 * maintained source below, a member's outbound allowance, a test's fixture.
 * @param {string} name
 * @param {string} kind
 * @returns {({ name: string } & Part)|null}
 */
export function partOf(name, kind) {
  const part = LAYERS.find((layer) => layer.name === name)?.parts.find((p) => p.kind === kind);
  return part ? { name, ...part } : null;
}

/**
 * The maintained source for one member of one page: the file named by its part,
 * or the page-scoped patch map for a `patch` part. `null` when the roster has no
 * such member, or the page has no patch.
 * @param {string} name
 * @param {string} kind
 * @param {string} page
 * @param {string} [root] repo root, for reading `pipeline/`
 * @returns {{ bytes: string, origin: string }|null}
 */
export function maintainedSource(name, kind, page, root = '.') {
  const part = partOf(name, kind);
  if (!part) return null;
  if (part.patch) {
    const bytes = LEGIBILITY_PATCHES[page];
    return bytes == null ? null : { bytes, origin: `LEGIBILITY_PATCHES['${page}']` };
  }
  const source = part.source;
  if (source === undefined) return null;
  return { bytes: readFileSync(path.join(root, source), 'utf8'), origin: source };
}

/**
 * The bytes the tree ships for an asset-backed member, by the file name the page
 * names. `null` when the file is not there — a failure the caller reports rather
 * than a crash (a page can name an asset the tree no longer carries).
 * @param {string} servedDir
 * @param {string} ref
 * @returns {string|null}
 */
export function shippedSource(servedDir, ref) {
  try {
    return readFileSync(path.join(servedDir, 'assets', ref), 'utf8');
  } catch (err) {
    // a page naming an asset the tree does not carry is a finding, not a crash
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}
