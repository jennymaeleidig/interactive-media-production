// PROTOTYPE (wayfinder ticket 05) — serve the processed capture tree at URL paths.
// GET /a/b → served/a/b.html | served/a/b/index.html | 301 (redirect manifest) | 404.
// Dead collection roots (/ebooks, /webinar, /video, /events) get the 404 — the live
// site 404s them too; reproducing the observed behavior IS the fidelity bar.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import redirects from '../../served/redirects.json';

const SERVED = path.join(process.cwd(), 'served');

function candidateFiles(segs: string[]): string[] {
  if (segs.length === 0) return [path.join(SERVED, 'index.html')];
  const rel = segs.join('/');
  return [path.join(SERVED, `${rel}.html`), path.join(SERVED, rel, 'index.html')];
}

export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segs = [] } = await params;
  if (segs.some((s) => s === '.' || s === '..')) {
    return new Response('Not found', { status: 404 });
  }
  for (const file of candidateFiles(segs)) {
    try {
      const html = await readFile(file, 'utf8');
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    } catch {
      // try next candidate
    }
  }
  const rel = '/' + segs.join('/');
  const target = (redirects as Record<string, string>)[rel];
  if (target) {
    return new Response(null, { status: 301, headers: { location: target } });
  }
  return new Response('Not found', { status: 404 });
}
