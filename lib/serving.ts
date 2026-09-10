// Shared by every route that answers from the build's served tree (the
// catch-all page route and the form mock route). SERVED_DIR overrides the
// tree location (tests point it at a fixture build); it defaults to
// <cwd>/served.
import path from 'node:path';

export function servedDir(): string {
  return process.env.SERVED_DIR ?? path.join(process.cwd(), 'served');
}

export function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
