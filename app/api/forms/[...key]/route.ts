// The form mock route (ticket 02): every captured lead form POSTs here to a
// key the build chose per (page, form). The submission is swallowed — the
// body is never read — and the visitor is 303-redirected to the captured
// thank-you page, exactly where the live flow lands. The redirect table is
// the build's forms-manifest.json (same tree the catch-all serves), so a
// route only exists if the build routed a form to it; anything else is 404.
// No submission ever leaves the machine: the only data movement is a local
// redirect to a build-authored, root-relative path.
//
// SERVED_DIR overrides the tree location (tests point it at a fixture build);
// it defaults to <cwd>/served.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function servedDir(): string {
  return process.env.SERVED_DIR ?? path.join(process.cwd(), 'served');
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ key?: string[] }> }) {
  const { key: segs = [] } = await params;
  let manifest: Record<string, { redirectTo?: unknown }>;
  try {
    manifest = JSON.parse(await readFile(path.join(servedDir(), 'forms-manifest.json'), 'utf8'));
  } catch {
    return notFound(); // no manifest → the build routed no forms
  }
  const route = manifest[segs.join('/')];
  const redirectTo = typeof route?.redirectTo === 'string' ? route.redirectTo : null;
  // the mock only ever points at a local path — a manifest entry without one
  // is a build bug, not a redirect
  if (!redirectTo || !redirectTo.startsWith('/')) return notFound();
  return new Response(null, {
    status: 303,
    headers: { location: redirectTo, 'cache-control': 'no-store' },
  });
}
