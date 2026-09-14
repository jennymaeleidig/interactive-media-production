// The catch-all serving route: the Recreation answers original site paths
// from the build's served tree. GET /a/b → served/a/b.html, or served/a/b/
// index.html; a miss consults the build's redirect table (the route classes) and
// answers the legacy stubs' permanent redirect; anything else is a 404 —
// reproducing the live site's observed behavior IS the fidelity bar (dead
// collection roots and dropped scaffold/test pages 404 here). Pages are read
// from disk per request (the served tree is committed — the freeze, not a build
// output).
//
// The resolution order and the traversal guard are `pipeline/served-tree.mjs`,
// shared with the serving check so the two cannot disagree about which file a
// route names. SERVED_DIR overrides the tree location; it defaults to
// <cwd>/served — see lib/serving.ts.
import { readFile } from 'node:fs/promises';
import { insideTree, pageCandidates } from '@/pipeline/served-tree.mjs';
import { notFound, permanentRedirect, redirectFor, servedDir } from '@/lib/serving';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segs = [] } = await params;
  const rel = segs.join('/');
  const root = servedDir();
  const candidates = pageCandidates(root, '/' + rel);
  // Traversal guard: every candidate must resolve inside the served tree
  // (compound/encoded segments included).
  if (candidates.some((file) => !insideTree(root, file))) {
    return notFound();
  }
  const html = await readServed(candidates);
  if (html !== null) {
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const target = await redirectFor('/' + rel);
  if (target !== null) return permanentRedirect(target);
  return notFound();
}

/** The first candidate that exists, or null — served pages are plain files. */
async function readServed(candidates: string[]): Promise<string | null> {
  for (const file of candidates) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      // try the next candidate
    }
  }
  return null;
}
