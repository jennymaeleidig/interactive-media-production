// Data-URI extraction (ADR 0002): every asset in a Capture is inlined as a
// `data:` URI, once per referencing page. Across the served tree that is
// 86,079 occurrences / 7.8 GB of base64 text for only 2,830 distinct files
// (a 14.9x re-encoding tax — the same logo is re-encoded on all 1,180 pages).
//
// This pass finds each inlined asset, writes it once under a content-addressed
// name (`/assets/<sha16>.<ext>`), and rewrites the reference. Identical bytes
// collapse to one file by construction, so the name is also the dedup key and
// can be cached forever (`immutable` — the URL changes when the bytes do).
//
// Pure: HTML in, rewritten HTML + the distinct assets out. The caller writes
// the files, so the same core runs in the build and in the tests.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';

/** MIME → file extension, for the assets the captures inline. */
const EXT_BY_MIME = {
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff2': 'woff2',
  'application/font-woff': 'woff',
  'application/x-font-woff': 'woff',
  'application/x-font-ttf': 'ttf',
  'application/x-font-truetype': 'ttf',
  'application/x-font-opentype': 'otf',
  'application/vnd.ms-fontobject': 'eot',
  'video/mpeg': 'mpeg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
};

/** Extension → MIME, the serving route's content-type table (the inverse). */
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
};

/**
 * The extension an inlined asset is written under: the known mapping, else the
 * MIME subtype (`image/heic` → `heic`), else `.bin` for a typeless payload.
 * @param {string} mime
 * @returns {string}
 */
export function extForMime(mime) {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const sub = mime.split('/')[1] ?? '';
  const clean = sub.replace(/\+.*$/, '').replace(/[^a-z0-9-]/gi, '');
  return clean === '' ? 'bin' : clean.toLowerCase();
}

/**
 * The content type the asset route answers an extracted file with.
 * @param {string} ext  without the dot
 * @returns {string}
 */
export function mimeForExt(ext) {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Split a `data:` URI into its media type and payload.
 * @param {string} uri
 * @returns {{mime: string, isBase64: boolean, payload: string}|null}
 */
export function parseDataUri(uri) {
  if (!uri.startsWith('data:')) return null;
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const parts = uri.slice(5, comma).split(';');
  const mime = (parts.shift() ?? '').trim().toLowerCase() || 'text/plain';
  const isBase64 = parts.some((p) => p.trim().toLowerCase() === 'base64');
  return { mime, isBase64, payload: uri.slice(comma + 1) };
}

/**
 * The bytes a parsed data URI carries, or null when the payload does not
 * decode (a malformed capture — leave the reference alone rather than write a
 * truncated asset).
 * @param {{mime: string, isBase64: boolean, payload: string}} parsed
 * @returns {Buffer|null}
 */
export function decodeDataUri(parsed) {
  if (parsed.isBase64) {
    try {
      return Buffer.from(parsed.payload, 'base64');
    } catch {
      return null;
    }
  }
  try {
    return Buffer.from(decodeURIComponent(parsed.payload), 'utf8');
  } catch {
    // not percent-encoded (raw SVG is often left as-is) — take it verbatim
    return Buffer.from(parsed.payload, 'utf8');
  }
}

/**
 * The served path an extracted asset is referenced by.
 * @param {string} sha
 * @param {string} ext
 * @returns {string}
 */
export function assetPath(sha, ext) {
  return `/assets/${sha}.${ext}`;
}

// A value span: quoted (plain `'`/`"` or HTML-escaped `&quot;`/`&#39;`, both of
// which the captures carry) or bare. A bare value may carry CSS backslash
// escapes (`\ `, `\'`, `\HHHHHH`) — the captures' raw-SVG `url()` payloads use
// them. An escape is CSS syntax, not payload bytes, so `cssUnescape` reverses it
// before the URI is decoded.
//
// A bare value ends differently in the two contexts, so the two classes differ:
// in an attribute it ends at whitespace, a quote, `>` (the tag ends there), or
// `)`; in `url(...)` it ends only at whitespace, a quote, or the closing paren.
// `>` is ordinary payload there — an inlined raw SVG carries `<svg …><path …>`
// unescaped, and treating `>` as a terminator silently skips 244 references.
const ESCAPES = String.raw`\\(?:[0-9a-fA-F]{1,6}[ \t]?|[\s\S])`;
const BARE_ATTR = String.raw`(?:${ESCAPES}|[^\s"'>)])*`;
const BARE_URL = String.raw`(?:${ESCAPES}|[^\s"')])*`;
const quoted = String.raw`&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|"[^"]*"|'[^']*'`;
const VALUE_ATTR = `(${quoted}|${BARE_ATTR})`;
const VALUE_URL = `(${quoted}|${BARE_URL})`;
const SRC_RE = new RegExp(String.raw`(\ssrc\s*=\s*)${VALUE_ATTR}`, 'gi');
const POSTER_RE = new RegExp(String.raw`(\sposter\s*=\s*)${VALUE_ATTR}`, 'gi');
// `href` on `<link rel=icon>`/inline-SVG `<use>` carries the favicon's data URI
// (the corpus has no `<a href="data:…">`, which is why this is safe to take).
const HREF_RE = new RegExp(String.raw`(\shref\s*=\s*)${VALUE_ATTR}`, 'gi');
// CSS `url(...)` — where every inlined background image and `--sf-img-*`
// custom property carries its payload. Base64 padding `=` is part of the
// value, not a terminator.
const URL_RE = new RegExp(String.raw`url\(\s*${VALUE_URL}\s*\)`, 'gi');

/**
 * Reverse CSS backslash escapes: `\ ` → space, `\'` → `'`, `\HHHHHH ` → the
 * codepoint, `\<newline>` → nothing. A no-op for base64 payloads, whose
 * alphabet contains no backslash.
 * @param {string} value
 * @returns {string}
 */
export function cssUnescape(value) {
  return value.replace(/\\([0-9a-fA-F]{1,6})[ \t]?|\\([\s\S])/g, (_match, hex, ch) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
    }
    return ch === '\n' ? '' : ch;
  });
}

/**
 * Strip one pair of matching value delimiters, returning the inner text and
 * the delimiters to re-emit (so an HTML-escaped value stays escaped).
 * @param {string} value
 * @returns {{inner: string, open: string, close: string}}
 */
function undelimit(value) {
  for (const delim of ['&quot;', '&#39;', '"', "'"]) {
    if (value.length > delim.length * 2 && value.startsWith(delim) && value.endsWith(delim)) {
      return { inner: value.slice(delim.length, value.length - delim.length), open: delim, close: delim };
    }
  }
  return { inner: value, open: '', close: '' };
}

/**
 * Extract every inlined asset from one page.
 *
 * Rewrites `src`, `poster`, and CSS `url(data:…)` references to
 * `/assets/<sha16>.<ext>` and returns the distinct assets to write. A page's
 * 200 image references typically resolve to far fewer distinct files, so the
 * caller should dedup across the whole build (by `sha`) before writing.
 *
 * @param {string} html
 * @returns {{html: string, assets: Map<string, {sha: string, mime: string, ext: string, bytes: Buffer}>, references: number}}
 */
export function extractDataUris(html) {
  /** @type {Map<string, {sha: string, mime: string, ext: string, bytes: Buffer}>} */
  const assets = new Map();
  let references = 0;

  /**
   * @param {string} uri
   * @returns {string|null} the replacement path, or null to leave the URI as-is
   */
  const rewrite = (raw) => {
    const uri = raw.trim();
    const parsed = parseDataUri(uri);
    if (parsed === null) return null;
    const bytes = decodeDataUri(parsed);
    if (bytes === null || bytes.length === 0) return null;
    const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const ext = extForMime(parsed.mime);
    if (!assets.has(sha)) assets.set(sha, { sha, mime: parsed.mime, ext, bytes });
    references++;
    return assetPath(sha, ext);
  };

  const attrReplace = (match, prefix, value) => {
    const { inner, open, close } = undelimit(value);
    const replacement = rewrite(inner);
    if (replacement === null) return match;
    return `${prefix}${open}${replacement}${close}`;
  };
  const urlReplace = (match, value) => {
    const { inner, open, close } = undelimit(value);
    const replacement = rewrite(cssUnescape(inner));
    if (replacement === null) return match;
    return `url(${open}${replacement}${close})`;
  };

  const out = html
    .replace(SRC_RE, attrReplace)
    .replace(POSTER_RE, attrReplace)
    .replace(HREF_RE, attrReplace)
    .replace(URL_RE, urlReplace);

  return { html: out, assets, references };
}
