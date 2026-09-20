// The chat's shipped bytes: which published path carries which maintained file,
// and with what media type.
//
// This is the one place that knows both sides of the delivery, because three
// readers need to agree about it and none of them can see the others: the asset
// route that answers the paths, the artifact check that verifies the built
// export, and the seam that mounts the bytes. A published path is fixed rather
// than content-addressed, and nothing is mirrored.
//
// The React shell ships in the page's own Next bundle, so the roster holds one
// entry: the engine and the compiled program together (`CONTEXT.md` "Chat
// runtime").
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} ChatAsset
 * @property {string} path  The published URL path, absolute.
 * @property {string} source  The maintained file, repo-relative.
 * @property {string} contentType  What the path answers with.
 */

/** @type {readonly ChatAsset[]} */
export const CHAT_ASSETS = [
  {
    path: '/chat/runtime.js',
    source: 'scripts/chat-runtime.js',
    contentType: 'text/javascript; charset=utf-8',
  },
];

/**
 * The member published at `pathname`, or null when nothing is published there.
 * @param {string} pathname
 * @returns {ChatAsset | null}
 */
export function assetFor(pathname) {
  return CHAT_ASSETS.find((asset) => asset.path === pathname) ?? null;
}

/**
 * One member's maintained bytes — exactly what its published path answers with.
 * @param {ChatAsset} asset
 * @returns {string}
 */
export function readAsset(asset) {
  return readFileSync(path.join(ROOT, asset.source), 'utf8');
}
