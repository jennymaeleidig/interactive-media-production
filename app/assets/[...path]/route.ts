// The extracted-asset route: GET /assets/<sha>.<ext> streams a
// content-addressed file the build wrote from a Capture's inlined `data:` URI.
//
// More specific than the `[[...path]]` page catch-all, so asset requests land
// here. The name is a hash of the bytes, so the response is immutable — the URL
// changes whenever the bytes do. Missing, malformed, or escaping names 404
// (lib/serving.ts readAsset is the traversal guard).
import { notFound, readAsset } from '@/lib/serving';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segs = [] } = await params;
  const asset = await readAsset(segs.join('/'));
  if (asset === null) return notFound();
  return new Response(asset.body, {
    status: 200,
    headers: {
      'content-type': asset.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
