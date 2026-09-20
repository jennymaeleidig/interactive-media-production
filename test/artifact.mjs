// The artifact check: the built export is the chat, and it is reachable.
//
// The unit suite proves behaviour from sources; this proves the *artifact*. It
// serves the export directory over HTTP the way a host would and asks the
// questions a source suite cannot answer:
//
//   * the host page exists and is HTML;
//   * it names the one path `scripts/chat-assets.mjs` publishes;
//   * it carries the honest preview metadata, the only out-of-frame carrier that
//     survives a browser warning, and the in-page `?` disclosure is present;
//   * the published bytes are identical to the maintained source they declare;
//   * the privacy path resolves.
//
// It is environmental rather than a suite member: it needs a build first, and it
// costs a server and a directory walk. `npm test` stays the fast suite a
// developer runs on every edit.
//
//   npm run build && npm run check:artifact
//
// SPDX-License-Identifier: CC0-1.0
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_ASSETS, readAsset } from '../scripts/chat-assets.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the static export lands. */
export const OUT_DIR = path.join(ROOT, 'out');

/** The documents the export must carry, as published URLs. */
export const PAGES = ['/', '/legal/privacy-policy'];

/**
 * The honest preview surface, pinned: the first sentence must stand alone, and
 * the unfurl tags must survive Meta's first-megabyte crawl (the exported head is
 * under a hundred kilobytes, so presence is early enough). The disclosure
 * toggle's accessible name comes from the shell's own HTML.
 */
export const HONEST_PREVIEW_REFERENCES = [
  'An artwork, not Flock Safety.',
  'og:title',
  'og:description',
  'name="description"',
  'What is this?',
];

/**
 * The files that could answer one published URL: a URL that already names a
 * file (it carries an extension) resolves to that file, and a route may answer
 * as the file the export writes (`a/b.html`) or as the directory index a
 * directory-shaped host would serve (`a/b/index.html`).
 * @param {string} pathname
 * @returns {string[]}
 */
function candidatesFor(pathname) {
  const relative = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (relative === '') return ['index.html'];
  if (path.extname(relative) !== '') return [relative];
  return [`${relative}.html`, `${relative}/index.html`];
}

/**
 * Whether a resolved path is inside the directory being served. The guard is
 * what makes `candidatesFor`'s output safe to resolve — a URL segment may be
 * `..`, and the export is not allowed to name a file outside itself.
 * @param {string} root
 * @param {string} file
 * @returns {boolean}
 */
export function insideOut(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** @param {string} file */
function mimeFor(file) {
  switch (path.extname(file).slice(1).toLowerCase()) {
    case 'html':
      return 'text/html; charset=utf-8';
    case 'js':
      return 'text/javascript; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

/**
 * @typedef {object} Probe
 * @property {string} url
 * @property {number} status
 * @property {string} contentType
 * @property {string} body
 */

/**
 * One URL answered from a static directory, as data.
 * @typedef {object} Served
 * @property {number} status
 * @property {string} contentType
 * @property {string} body
 */

/**
 * @typedef {object} Expectation
 * @property {string} [contentType]  The media type the URL must answer with (parameters ignored).
 * @property {string} [body]  The exact bytes it must answer with.
 * @property {string} [source]  The maintained file to name when they differ.
 * @property {string[]} [references]  Substrings the body must contain.
 */

/**
 * What every artifact URL must be, derived from the one declaration — so the
 * check cannot disagree with what the app publishes.
 * @returns {Record<string, Expectation>}
 */
export function expectations() {
  /** @type {Record<string, Expectation>} */
  const expected = {};
  for (const page of PAGES) {
    expected[page] = { contentType: 'text/html', references: [] };
  }
  expected['/'] = {
    ...expected['/'],
    references: [...CHAT_ASSETS.map((asset) => asset.path), ...HONEST_PREVIEW_REFERENCES],
  };
  for (const asset of CHAT_ASSETS) {
    expected[asset.path] = {
      contentType: asset.contentType,
      body: readAsset(asset),
      source: asset.source,
    };
  }
  return expected;
}

/** The media type without its parameters, for comparison. @param {string} contentType */
function baseType(contentType) {
  return contentType.split(';')[0].trim().toLowerCase();
}

/**
 * Every way an artifact probe falls short, as printable lines — empty when the
 * artifact is what it should be. Pure, so the verdicts are testable without a
 * build: hand it probes and expectations and read the findings.
 * @param {Probe[]} probes
 * @param {Record<string, Expectation>} expected
 * @returns {string[]}
 */
export function findingsFor(probes, expected) {
  /** @type {string[]} */
  const findings = [];
  for (const probe of probes) {
    const want = expected[probe.url];
    if (probe.status !== 200) {
      findings.push(`${probe.url}: answered ${probe.status}`);
      continue;
    }
    if (want?.contentType !== undefined && baseType(probe.contentType) !== baseType(want.contentType)) {
      findings.push(`${probe.url}: answered ${probe.contentType || '(no content type)'}, expected ${want.contentType}`);
    }
    if (want?.body !== undefined && probe.body !== want.body) {
      findings.push(`${probe.url}: does not carry the bytes of ${want.source}`);
    }
    for (const reference of want?.references ?? []) {
      if (!probe.body.includes(reference)) findings.push(`${probe.url}: does not reference ${reference}`);
    }
  }
  return findings;
}

/**
 * Serve one URL from a static directory the way a host would: the first
 * candidate that exists inside `root`, or a 404. Returns the response as data,
 * so the seam can drive the real serving logic against a real directory without
 * a socket; the check's HTTP listener is a thin adapter over this.
 * @param {string} root
 * @param {string} url
 * @returns {Promise<Served>}
 */
export async function probe(root, url) {
  const pathname = new URL(url, 'http://localhost').pathname;
  for (const candidate of candidatesFor(pathname)) {
    const file = path.resolve(path.join(root, candidate));
    if (!insideOut(root, file)) continue;
    try {
      const body = await readFile(file, 'utf8');
      return { status: 200, contentType: mimeFor(file), body };
    } catch {
      // try the next candidate
    }
  }
  return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found\n' };
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    console.error(`no export at ${path.relative(ROOT, OUT_DIR)} — run \`npm run build\` first`);
    process.exit(1);
  }
  const server = createServer((req, res) => {
    probe(OUT_DIR, req.url ?? '/')
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { 'content-type': contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('error\n');
      });
  });
  /** @type {Promise<void>} */
  const listening = new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  await listening;
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the check server has no port');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const expected = expectations();
    /** @type {Probe[]} */
    const probes = [];
    for (const url of Object.keys(expected)) {
      const res = await fetch(base + url);
      probes.push({
        url,
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        body: await res.text(),
      });
    }
    const findings = findingsFor(probes, expected);
    if (findings.length > 0) {
      for (const finding of findings) console.error(finding);
      process.exit(1);
    }
    console.log(`artifact ok: ${probes.length} URLs over ${path.relative(ROOT, OUT_DIR)}`);
    for (const probe of probes) console.log(`  ${probe.url} — ${probe.body.length} bytes`);
  } finally {
    server.close();
  }
}

// Only as a command: the verdicts are imported by their own test.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
