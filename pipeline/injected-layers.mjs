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
 *
 * `insert: true` marks the parts whose tag the publisher may *create*: a page in
 * the layer's scope that carries no such member is then a pending insertion
 * rather than a failure. Everything else keeps the hard failure it has always
 * been, so the six Lottie heroes — hand-inserted into their pages before the
 * roster could declare them — are the only members the write may add, and a page
 * that loses its `nav` is still a finding, not a silent repair.
 * @typedef {{ kind: 'css'|'js', delivery: 'asset'|'inline', source?: string, patch?: true, insert?: true, outbound?: 'none'|'self' }} Part
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

/** The product pages carrying a Lottie hero, by their bare name. */
const LOTTIE_HEROES = [
  'flock-dfr',
  'flock-freeform',
  'flock-os',
  'flock-safety-platform',
  'gunshot-detection',
  'video-cameras',
];

/**
 * One Lottie hero layer, from its page name alone: six layers differing only in
 * that name, so the roster cannot drift into five right and one wrong.
 * @param {string} name
 * @returns {Layer}
 */
const lottieLayer = (name) => ({
  name: `lottie-${name}`,
  scope: 'page',
  pages: [`/products/${name}`],
  parts: [{ kind: 'js', delivery: 'asset', source: `pipeline/lottie/${name}.runtime.js`, insert: true }],
});

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
  // The six Lottie heroes, one per product page, in the order they ship. Each
  // runtime is generated by `pipeline/build-lottie-layers.mjs`, which reads this
  // roster for the pages and the source paths and holds only the vendored JSON
  // and its stamp. They carry no `outbound` because the embedded animation data
  // is all `data:` URIs and the neutered player names no network primitive
  // (`injected-source.mjs`).
  //
  // They sit after `scroll` because that is where each page carries them — the
  // tag goes immediately after the last site-wide marked script — and they are
  // the roster's `insert: true` members: their tags were written by hand before
  // the publisher could write one, and it can now recreate them byte-for-byte.
  ...LOTTIE_HEROES.map(lottieLayer),
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
 * One marked tag as the tree writes it: the member name it carries, the element
 * that carries it, the delivery form the tag itself implies, the `/assets/<name>`
 * reference it points at (`null` when its bytes are inline), and the half-open
 * `[start, end)` span of the open tag.
 * @typedef {{ name: string, element: string, kind: 'css'|'js', delivery: 'asset'|'inline', ref: string|null, start: number, end: number }} MarkedTag
 */

/**
 * Every marked tag in a page, in document order, with the offsets a rewrite
 * needs. This is the one scan for `data-flock-parody` tags: `markedMembers` is it
 * read as members, and the publisher is it read as spans. A second locator would
 * be a second definition of which tag a member is, free to disagree with this
 * one about the element or the marker.
 * @param {string} html
 * @returns {MarkedTag[]}
 */
export function markedTags(html) {
  /** @type {MarkedTag[]} */
  const tags = [];
  MARKED.lastIndex = 0;
  let m;
  while ((m = MARKED.exec(html))) {
    const [tag, element, name] = m;
    const ref = assetRef(attribute(tag, 'src') ?? attribute(tag, 'href'));
    tags.push({
      name,
      element,
      kind: element === 'script' ? 'js' : 'css',
      delivery: ref ? 'asset' : 'inline',
      ref,
      start: m.index,
      end: m.index + tag.length,
    });
  }
  return tags;
}

/**
 * The tag a marked member ships as, built the way the tree already writes one:
 * the marker first on a `script`, the reference before the marker on a `link` —
 * the two orders the Capture's pages carry, and the order a re-insertion has to
 * reproduce byte-for-byte. `markedTags` reads this shape; this writes it, so the
 * form is stated once.
 * @param {{ name: string, kind: 'css'|'js', ref?: string|null, body?: string|null }} member
 * @returns {string}
 */
export function markedTagText({ name, kind, ref = null, body = null }) {
  const marker = `${MARKER_ATTR}="${name}"`;
  if (kind === 'css' && ref) return `<link rel=stylesheet href=/assets/${ref} ${marker}>`;
  if (kind === 'css') return `<style ${marker}>${body ?? ''}</style>`;
  return `<script ${marker}${ref ? ` src=/assets/${ref}` : ''}>${body ?? ''}</script>`;
}

/**
 * The offset just past a marked tag's whole element: past its closing tag when it
 * has one (`script`, `style`), past the open tag when it is void (`link`).
 * `markedTags` spans the open tag, because that is what a rewrite replaces; a
 * splice into the page needs the element's end, so the two are stated together.
 * @param {string} html
 * @param {MarkedTag} tag
 * @returns {number}
 */
export function elementEnd(html, tag) {
  if (tag.element === 'link') return tag.end;
  const close = html.toLowerCase().indexOf(`</${tag.element}>`, tag.end);
  return close === -1 ? tag.end : close + tag.element.length + 3;
}

/**
 * A page's marked members, in document order — the roster as this page actually
 * carries it. Reads both delivery forms: an `/assets/<name>` reference becomes
 * `{ ref }`, anything written into the tag becomes `{ body }`.
 * @param {string} html
 * @returns {MarkedMember[]}
 */
export function markedMembers(html) {
  return markedTags(html).map((tag) =>
    tag.ref
      ? { name: tag.name, kind: tag.kind, delivery: 'asset', ref: tag.ref }
      : { name: tag.name, kind: tag.kind, delivery: 'inline', body: inlineBody(html, tag.end, tag.element) },
  );
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
 * Exported because the publisher asks the same question — which parts this page
 * owes, and which of them it may create — and a second flattening of the roster
 * would be free to disagree with this one about what a page is missing.
 * @returns {({ name: string } & Part)[]}
 */
export const expectedParts = (page) =>
  LAYERS.filter((layer) => coversPage(layer, page)).flatMap((layer) => layer.parts.map((part) => ({ name: layer.name, ...part })));

/**
 * Comment-and-whitespace-folded source, the comparator this comparison has
 * always used (it arrived with `test/serving.seam.test.ts`). Two files are
 * "the same code" when this says so and "prose drift" when it does not — the
 * tree cannot be rebuilt from `pipeline/`, so comment-only differences between
 * a maintained source and the shipped bytes are expected and are reported, never
 * fatal.
 *
 * Exported because the publisher asks the same question when it decides *which*
 * member to rewrite: a second copy of this fold would be a second definition of
 * "the same code", and the two would be free to disagree (`publish-layers.mjs`).
 * @param {string} source
 * @returns {string}
 */
export const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether two byte strings are the same code. Prose-only differences are `true`.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export const sameCode = (a, b) => codeOf(a) === codeOf(b);

/**
 * The one line that says a page does not carry a member the roster expects, in
 * the shape `mirrorFindings` reports it — written here so a caller that handles a
 * missing member itself (the publisher creates the `insert` parts) can name the
 * same finding without restating its wording.
 * @param {string} page
 * @param {string} name
 * @param {string} kind
 * @returns {string}
 */
export const missingMember = (page, name, kind) => `missing member: ${page} does not carry ${name}/${kind}`;

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
      failures.push(missingMember(page, part.name, part.kind));
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
