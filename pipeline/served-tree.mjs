// The served tree's rules: how a request path resolves to a file inside it,
// what it means to be inside it at all, and the content type a file comes back
// with.
//
// Plain JavaScript, like `pipeline/run-manifest.mjs`, and for the same reason:
// both tiers need these rules and only one of them is TypeScript. The Next
// route (`app/[[...path]]/route.ts`, TS) reads pages through them, the serving
// check (`regression/routes.mjs`, plain JS) enumerates the candidates through
// them, and `lib/serving.ts` guards the asset directory with them. Before this
// module the resolution order was written twice — once in the route and once in
// the check, whose comment said it "mirrors" the route — which is exactly the
// drift the byte-identity check cannot see: a check that resolves differently
// from the server passes while serving the wrong page.
//
// The MIME table lives here because its only askers are the two things that
// answer a request for a file's bytes — the route and this check.
// (`extForMime`, the inverse, named an extracted file and belonged to the
// retired build's asset pass.)
//
// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';

/** Extension → MIME, the served tree's content-type table. */
const MIME_BY_EXT = {
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mpeg: 'video/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  css: 'text/css',
  js: 'text/javascript',
};

/**
 * The content type the serving layer answers a file with.
 * @param {string} ext  without the dot
 * @returns {string}
 */
export function mimeForExt(ext) {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The files a route path may be answered from, in the order the route tries
 * them: `<rel>.html`, then `<rel>/index.html` (the root resolves to
 * `index.html`). The one copy of a rule the server and the check both need.
 * @param {string} servedDir
 * @param {string} page  a route path, e.g. '/' or '/a/b'
 * @returns {string[]}
 */
export function pageCandidates(servedDir, page) {
  const rel = page.replace(/^\/+/, '');
  if (rel === '') return [path.join(servedDir, 'index.html')];
  return [path.join(servedDir, `${rel}.html`), path.join(servedDir, rel, 'index.html')];
}

/**
 * Whether a resolved path stays inside its root — the traversal guard, in one
 * place, for the page candidates and the asset directory alike. Compares
 * *resolved* paths, so `..`, an encoded `..`, and a compound segment are all
 * caught the same way.
 * @param {string} root
 * @param {string} file
 * @returns {boolean}
 */
export function insideTree(root, file) {
  return path.resolve(file).startsWith(path.resolve(root) + path.sep);
}
