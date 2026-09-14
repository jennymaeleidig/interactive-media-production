// The form mock route: every captured lead form POSTs here to a
// key the build chose per (page, form). The submission is swallowed — the
// body is never read — and the visitor is 303-redirected to the captured
// thank-you page, exactly where the live flow lands. The redirect table is
// the build's forms-manifest.json (same tree the catch-all serves), so a
// route only exists if the build routed a form to it; anything else is 404.
// No submission ever leaves the machine: the only data movement is a local
// redirect to a build-authored, root-relative path.
//
// SERVED_DIR overrides the tree location (tests point it at a fixture build);
// it defaults to <cwd>/served — see lib/serving.ts.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isLocalTarget } from '@/pipeline/run-manifest.mjs';
import { notFound, servedDir } from '@/lib/serving';

export const dynamic = 'force-dynamic';

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
  // the mock only ever points at a root-relative local path — not
  // protocol-relative (`//host` would leave the machine), not absolute. A
  // manifest entry without one is a build bug, not a redirect. Same predicate
  // the serving layer applies to redirects.json, so the two cannot drift.
  if (!isLocalTarget(redirectTo)) return notFound();
  return new Response(null, {
    status: 303,
    headers: { location: redirectTo, 'cache-control': 'no-store' },
  });
}
