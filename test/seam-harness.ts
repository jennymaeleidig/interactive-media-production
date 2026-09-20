// The seam harness for the chat's DOM seams.
//
// The question a DOM seam asks is "do the exact bytes the host serves behave in
// a real DOM?" The bytes come from `pipeline/chat-assets.mjs` — the same
// declaration the asset route answers from — so a seam cannot silently test a
// different file than the one that ships. jsdom itself is provided by vitest's
// `environment: 'jsdom'` and owned by the test, not by this module: the shell
// seam mounts React with `@testing-library/react`, and the engine seam drives
// the module directly.
//
// SPDX-License-Identifier: CC0-1.0
import { assetFor, readAsset } from '../pipeline/chat-assets.mjs';

/**
 * One published file's maintained bytes — exactly what its path answers with.
 * Throws for a path nothing is published at, so a typo fails loudly instead of
 * mounting an empty document.
 */
export function shippedAsset(pathname: string): string {
  const asset = assetFor(pathname);
  if (asset === null) throw new Error(`nothing is published at ${JSON.stringify(pathname)}`);
  return readAsset(asset);
}
