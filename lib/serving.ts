// Shared by every route that answers from the build's served tree (the
// catch-all page route and the form mock route). SERVED_DIR overrides the
// tree location (tests point it at a fixture build); it defaults to
// <cwd>/served.
//
// The tree also carries the run's route tables: forms-manifest.json (ticket
// 02) and redirects.json (ticket 07), both written by the build.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isLocalTarget } from '../pipeline/run-manifest.mjs';
import { mimeForExt } from '../pipeline/assets.mjs';

export function servedDir(): string {
  return process.env.SERVED_DIR ?? path.join(process.cwd(), 'served');
}

/**
 * The build's extracted-asset directory (ADR 0002) — content-addressed copies
 * of every asset the Captures had inlined as a `data:` URI.
 */
export function assetsDir(): string {
  return path.join(servedDir(), 'assets');
}

/**
 * Read one extracted asset by its content-addressed name, with the content
 * type its extension declares — or null when the name is absent, escapes the
 * assets directory, or is not a regular file. The name is a hash of the bytes,
 * so callers may cache the response forever.
 * @param {string} name  e.g. `9ae1e31069356573.svg`
 * @returns {Promise<{body: Uint8Array<ArrayBuffer>, contentType: string} | null>}
 */
export async function readAsset(name: string): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  if (name === '' || name.includes('/')) return null;
  const root = path.resolve(assetsDir());
  const file = path.resolve(path.join(root, name));
  if (!file.startsWith(root + path.sep)) return null;
  try {
    // `Uint8Array<ArrayBuffer>` (not Node's `Buffer`, nor the `ArrayBufferLike`
    // default) is what the DOM lib's `BodyInit` accepts
    return { body: new Uint8Array(await readFile(file)), contentType: mimeForExt(path.extname(file).slice(1)) };
  } catch {
    return null;
  }
}

export function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The local target for a legacy redirect stub, or null. The build's
 * redirects.json maps original path → root-relative Recreation route; only a
 * root-relative, non-protocol-relative target is a local route (a
 * protocol-relative target would leave the machine — zero-outbound
 * invariant), so anything else is treated as absent.
 */
export async function redirectFor(pathname: string): Promise<string | null> {
  let table: Record<string, unknown>;
  try {
    table = JSON.parse(await readFile(path.join(servedDir(), 'redirects.json'), 'utf8'));
  } catch (err) {
    // An absent table is legitimate (the run had no redirect stubs). A table
    // that exists but does not parse is a corrupt build artifact — fail loudly
    // (the route check catches it) instead of silently 404ing every stub.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw err;
  }
  const target = table[pathname];
  if (!isLocalTarget(target)) return null;
  return target;
}

/** A permanent redirect to a local Recreation route — the live site's observed legacy behavior. */
export function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 301,
    headers: { location, 'cache-control': 'no-store' },
  });
}
