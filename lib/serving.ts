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

export function servedDir(): string {
  return process.env.SERVED_DIR ?? path.join(process.cwd(), 'served');
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
  } catch {
    return null; // no table → the run had no redirect stubs
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
