// The injected layers, one record each.
//
// A "layer" is a runtime and/or stylesheet the Recreation mounts into a served
// page. Before this module a layer lived in five hand-maintained places: its
// pass function, a `*_INJECTED` label constant, a `data-flock-parody` marker
// literal, the eleven `readFileSync` calls plus `INJECTED_BYTES` in
// test/pipeline.test.ts, and a vitest project. A seventh layer — the
// ghpages-publish disclaimer banner — was certain, and adding it meant
// coordinating all five. Now a layer IS one record: the marker it stamps, the
// label the mutation log carries, the style/script halves it ships, the
// predicate that mounts it, and the CSP grant it needs.
//
// `injectBeforeClose` and `layerTag` take the record, so no call site repeats
// the marker or the log label; `readLayerBodies` reads every inline file once;
// `mountLayer` is the one mount operation. The audit's "injected" census reads
// the marker attribute from here too, so a tag's provenance is one definition.
//
// Two layers are not a plain pair. `story-hook` ships a script half only.
// `legibility` ships a style half only, and its body is the page-scoped CSS a
// caller passes in (not a file), trimmed.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGrant } from './csp.mjs';
import { MARKER_ATTR, MARKER_RE } from './marker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The marker is the audit's too, so it lives in ./marker.mjs and is re-exported
// here for the call sites that stamp it.
export { MARKER_ATTR, MARKER_RE };

/**
 * @typedef {object} LayerGrant
 * @property {string} directive  the CSP directive to widen (e.g. `connect-src`)
 * @property {string[]} sources  the sources to add
 * @property {string[]} [defaults]  sources for an appended directive (default: `sources`)
 * @property {boolean} [append]  append the directive when absent (default: true)
 * @property {string} note       the mutation-log note appended after the grant
 * @property {string} missing    warning when the page carries no CSP meta
 * @property {string} noContent  warning when the meta has no content attribute
 *
 * @typedef {object} Layer
 * @property {string} name       the marker value: `data-flock-parody="<name>"`
 * @property {string} label      the mutation-log line pushed to `entry.injected`
 * @property {('style'|'script')[]} parts  the tag halves, in document order
 * @property {string|null} css     stylesheet file under pipeline/, or null
 * @property {string|null} runtime runtime file under pipeline/, or null
 * @property {boolean} [trim]    trim the css body (page-scoped patch CSS)
 * @property {(entry: any, ctx: any) => boolean} [mounts]  whether the layer
 *   mounts; absent means always, and the pass that owns a conditional layer
 *   gates on it (so a grant on a layer that does not mount is never made)
 * @property {LayerGrant[]} grants  the CSP the layer needs to function
 */

/**
 * Every injected layer, in mount order. The order is load-bearing only as the
 * document order of the tags; the mutation log's `injected` list follows it.
 * @type {Layer[]}
 */
export const LAYERS = [
  {
    name: 'motion',
    label: 'motion layer (style+script, inline)',
    parts: ['style', 'script'],
    css: 'motion.css',
    runtime: 'motion-runtime.js',
    grants: [],
  },
  {
    name: 'interactions',
    label: 'interactions layer (style+script, inline)',
    parts: ['style', 'script'],
    css: 'interactions.css',
    runtime: 'interactions-runtime.js',
    grants: [],
  },
  {
    name: 'nav',
    label: 'nav layer (style+script, inline)',
    parts: ['style', 'script'],
    css: 'nav.css',
    runtime: 'nav-runtime.js',
    grants: [],
  },
  {
    name: 'chat',
    label: 'chat widget (style+script, inline)',
    parts: ['style', 'script'],
    css: 'chat-widget.css',
    runtime: 'chat-widget.js',
    // Mounted on exactly the pages whose Capture mounted the launcher (the
    // census the strip pass takes before it removes the launcher).
    mounts: (entry) => Boolean(entry.chatLauncher),
    grants: [
      {
        // The captured policy is `default-src 'none'` with no `connect-src`, so
        // it refuses the widget's same-origin POST to /api/chat until the
        // directive exists. `'self'` is the Recreation origin only.
        directive: 'connect-src',
        sources: ["'self'"],
        note: 'chat mount',
        missing: 'chat: no CSP meta found — the widget POST may be blocked',
        noContent: 'chat: CSP meta has no content attribute — the widget POST may be blocked',
      },
    ],
  },
  {
    name: 'story-hook',
    label: 'story-hook seam (inline, dormant)',
    parts: ['script'],
    css: null,
    runtime: 'story-hook.js',
    grants: [],
  },
  {
    name: 'legibility',
    label: 'legibility CSS (inline)',
    parts: ['style'],
    css: null,
    runtime: null,
    trim: true,
    // Data-driven from config.LEGIBILITY_PATCHES, keyed by page path.
    mounts: (_entry, ctx) => Boolean(ctx.legibilityPatches?.[ctx.page]),
    grants: [],
  },
  {
    name: 'scroll',
    label: 'scroll layer (style+script, inline)',
    parts: ['style', 'script'],
    css: 'scroll.css',
    runtime: 'scroll-runtime.js',
    grants: [],
  },
];

/** @type {Map<string, Layer>} */
const BY_NAME = new Map(LAYERS.map((layer) => [layer.name, layer]));

/**
 * The layer with `name`, or a throw naming the unknown layer (a table lookup
 * that silently returns undefined would mount nothing and log nothing).
 * @param {string} name
 * @returns {Layer}
 */
export function layerNamed(name) {
  const layer = BY_NAME.get(name);
  if (layer === undefined) throw new Error(`unknown layer: ${name}`);
  return layer;
}

/**
 * The file a layer's half comes from (`pipeline/<file>`), or a throw when the
 * layer ships no such half. The six seam harnesses read their runtime through
 * this instead of naming the file, so renaming a runtime is one table edit.
 * @param {string} name
 * @param {'css'|'runtime'} kind
 * @returns {string}
 */
export function layerFile(name, kind) {
  const layer = layerNamed(name);
  const file = kind === 'css' ? layer.css : layer.runtime;
  if (file === null) throw new Error(`layer ${name} ships no ${kind}`);
  return file;
}

/**
 * Read every layer's inline bodies once, keyed by layer name. A layer with no
 * file half contributes no key for it.
 * @returns {Map<string, {css?: string, runtime?: string}>}
 */
export function readLayerBodies() {
  const bodies = new Map();
  for (const layer of LAYERS) {
    /** @type {{css?: string, runtime?: string}} */
    const body = {};
    if (layer.css !== null) body.css = fs.readFileSync(path.join(HERE, layer.css), 'utf8');
    if (layer.runtime !== null) body.runtime = fs.readFileSync(path.join(HERE, layer.runtime), 'utf8');
    bodies.set(layer.name, body);
  }
  return bodies;
}

/**
 * The inline tag text a layer ships: each half carries the layer's marker, so
 * the census can tell a Recreation runtime from capture residue (which must
 * stay zero executable) — one shape, so a new layer cannot drift from it.
 * @param {Layer} layer
 * @param {{css?: string, runtime?: string}} bodies
 * @returns {string}
 */
export function layerTag(layer, bodies) {
  const parts = [];
  if (layer.parts.includes('style')) {
    const css = layer.trim ? (bodies.css ?? '').trim() : bodies.css;
    parts.push(`<style ${MARKER_ATTR}="${layer.name}">\n${css}\n</style>`);
  }
  if (layer.parts.includes('script')) {
    parts.push(`<script ${MARKER_ATTR}="${layer.name}">\n${bodies.runtime}\n</script>`);
  }
  return parts.join('\n');
}

/**
 * Insert `tag` inline before `</body>` — or append at EOF when the capture is
 * truncated (the write pass restores the closing tags after it) — and log the
 * layer's label under the page's injected list.
 * @param {string} html
 * @param {any} entry
 * @param {Layer} layer
 * @param {string} tag
 * @returns {string}
 */
export function injectBeforeClose(html, entry, layer, tag) {
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    html = html.slice(0, closeBody) + tag + '\n' + html.slice(closeBody);
  } else {
    html = html + '\n' + tag;
  }
  entry.injected = entry.injected ?? [];
  entry.injected.push(layer.label);
  return html;
}

/**
 * Mount one layer: its tag, before `</body>`. The one mount operation.
 * @param {string} html
 * @param {any} entry
 * @param {Layer} layer
 * @param {{css?: string, runtime?: string}} bodies
 * @returns {string}
 */
export function mountLayer(html, entry, layer, bodies) {
  return injectBeforeClose(html, entry, layer, layerTag(layer, bodies));
}

/**
 * Apply a layer's CSP grants, recording each as one mutation-log note. Only
 * the layers whose runtime makes a network request carry grants; the grant
 * semantics (replace, never append) live in `./csp.mjs`.
 * @param {string} html
 * @param {any} entry
 * @param {Layer} layer
 * @returns {string}
 */
export function grantLayer(html, entry, layer) {
  for (const grant of layer.grants) html = applyGrant(html, entry, grant);
  return html;
}
