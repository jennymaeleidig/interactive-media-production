// The chat's shipped file, served from its maintained source.
//
// `pipeline/chat-assets.mjs` declares which maintained file each published path
// carries; this route is the only thing that answers that path, and the
// declarations are what the artifact check and the asset seam read too, so the
// three cannot disagree about what the piece serves.
//
// The build exports statically (`next.config.ts`), so `generateStaticParams`
// is what turns each declaration into a real file under `out/chat/`;
// `dynamicParams = false` keeps every other name out.
//
// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import { CHAT_ASSETS, assetFor, readAsset } from '@/pipeline/chat-assets.mjs';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** The published name of every declaration, e.g. `runtime.js`. */
export function generateStaticParams() {
  return CHAT_ASSETS.map((asset) => ({ name: path.posix.basename(asset.path) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const asset = assetFor(`/chat/${name}`);
  if (asset === null) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(readAsset(asset), {
    headers: { 'content-type': asset.contentType, 'cache-control': 'public, max-age=0, must-revalidate' },
  });
}
