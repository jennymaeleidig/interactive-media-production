// The publish artifact's seams: the pure mapping core (route → artifact path,
// the generated redirect page's bytes, the 404 body, the budget arithmetic),
// the materialization edge over a small fixture tree, and one plan over the
// committed tree — cheap, because it stats without copying.
//
// The materializer turns the committed `served/` tree into the static artifact
// a host can serve: the tree verbatim, a route-path copy of every non-root page,
// one client-side redirect page per local `served/redirects.json` entry, and one
// `404.html` carrying the serving layer's own not-found body. It refuses a
// collision or an over-budget artifact *before* it writes.
//
// SPDX-License-Identifier: CC0-1.0
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_FOUND_BODY } from '../pipeline/not-found.mjs';
import {
  ARTIFACT_BYTE_CAP,
  ArtifactRefusedError,
  artifactBytes,
  budgetFailures,
  listFiles,
  materialize,
  planArtifact,
  redirectPageBytes,
} from '../pipeline/publish-artifact.mjs';
import { notFound } from '../lib/serving';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SERVED = path.join(ROOT, 'served');
const FIXTURE_ROOT = path.join(ROOT, '.tmp/publish-artifact-test');

let fixture: string | null = null;

/** A fresh fixture tree under `.tmp/` (the repo's scratch dir) and its served/ dir. */
function makeServed(files: Record<string, string>): { servedDir: string; outDir: string } {
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  fixture = fs.mkdtempSync(path.join(FIXTURE_ROOT, 'case-'));
  const servedDir = path.join(fixture, 'served');
  fs.mkdirSync(servedDir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(servedDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return { servedDir, outDir: path.join(fixture, 'out') };
}

/** Every file under `dir`, as relative POSIX paths, with a content hash. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    if (!fs.statSync(full).isFile()) continue;
    out[rel.split(path.sep).join('/')] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return out;
}

afterEach(() => {
  if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
  fixture = null;
});

describe('planArtifact', () => {
  const files = ['index.html', 'a.html', 'a/b.html', 'assets/x.svg', 'redirects.json'];
  const redirects = { '/old/thing': '/a/b' };

  it('copies the tree verbatim, adds a route-path copy per non-root page, one redirect page per manifest entry, and the 404 body', () => {
    const { entries, failures } = planArtifact({ files, redirects });
    expect(failures).toEqual([]);
    const at = (p: string) => entries.find((e) => e.path === p);

    // verbatim
    expect(at('index.html')).toMatchObject({ copy: 'index.html' });
    expect(at('a/b.html')).toMatchObject({ copy: 'a/b.html' });
    expect(at('assets/x.svg')).toMatchObject({ copy: 'assets/x.svg' });

    // the root page has no route-path copy — it already is one
    expect(entries.filter((e) => e.path === 'index.html')).toHaveLength(1);

    // route-path copies are byte-identical copies of the page file
    expect(at('a/index.html')).toMatchObject({ copy: 'a.html' });
    expect(at('a/b/index.html')).toMatchObject({ copy: 'a/b.html' });

    // one redirect page per manifest entry, at the source's route path
    expect(at('old/thing/index.html')).toMatchObject({ body: redirectPageBytes('/a/b') });

    // one 404 carrying the serving layer's own body
    expect(at('404.html')).toMatchObject({ body: NOT_FOUND_BODY });
  });

  it('does not duplicate a page already living at its route index', () => {
    const { entries, failures } = planArtifact({ files: ['index.html', 'foo/index.html'], redirects: {} });
    expect(failures).toEqual([]);
    expect(entries.filter((e) => e.path === 'foo/index.html')).toHaveLength(1);
  });

  it('names both claimants when a redirect source collides with a real page', () => {
    const { entries, failures } = planArtifact({ files: ['foo.html'], redirects: { '/foo': '/bar' } });
    expect(entries.length).toBeGreaterThan(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('foo/index.html');
    expect(failures[0]).toContain('served/foo.html');
    expect(failures[0]).toContain("redirect '/foo'");
  });

  it('refuses a route-path copy that would overwrite another served page', () => {
    const { failures } = planArtifact({ files: ['foo.html', 'foo/index.html'], redirects: {} });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('foo/index.html');
  });

  it('normalizes a redirect source with a trailing or repeated slash to the same route path', () => {
    const a = planArtifact({ files: ['index.html'], redirects: { '/foo/': '/bar' } });
    const b = planArtifact({ files: ['index.html'], redirects: { '//foo': '/bar' } });
    expect(a.failures).toEqual([]);
    expect(a.entries.find((e) => e.path === 'foo/index.html')).toBeDefined();
    expect(b.entries.find((e) => e.path === 'foo/index.html')).toBeDefined();
  });

  it('treats a non-local redirect target as absent, the way the serving layer does', () => {
    const { entries, failures } = planArtifact({
      files: ['index.html'],
      redirects: { '/away': '//other.example/x', '/ftp': 'ftp://other/x' },
    });
    expect(failures).toEqual([]);
    expect(entries.find((e) => e.path === 'away/index.html')).toBeUndefined();
    expect(entries.find((e) => e.path === 'ftp/index.html')).toBeUndefined();
  });
});

describe('redirectPageBytes', () => {
  const body = redirectPageBytes('/book-a-demo');

  it('carries a canonical link, a refresh, a JS fallback, noindex, and a visible link', () => {
    expect(body).toContain('<link rel="canonical" href="/book-a-demo">');
    expect(body).toContain('<meta http-equiv="refresh" content="0; url=/book-a-demo">');
    expect(body).toContain('<meta name="robots" content="noindex">');
    expect(body).toContain('location.href = "/book-a-demo";');
    expect(body).toContain('<a href="/book-a-demo">');
  });

  it('escapes the target for HTML attributes and for the script string', () => {
    const tricky = redirectPageBytes('/a?x=1&y="b"<c>');
    expect(tricky).toContain('href="/a?x=1&amp;y=&quot;b&quot;&lt;c&gt;"');
    expect(tricky).toContain('location.href = "/a?x=1&y=\\"b\\"\\u003cc\\u003e";');
  });

  it('is deterministic', () => {
    expect(redirectPageBytes('/x')).toBe(redirectPageBytes('/x'));
  });
});

describe('artifactBytes / budgetFailures', () => {
  it('sums copied file sizes and generated byte lengths', () => {
    const { entries } = planArtifact({ files: ['index.html'], redirects: {} });
    const sizes: Record<string, number> = { 'index.html': 10 };
    const total = artifactBytes(entries, (from) => sizes[from]);
    // index.html + 404.html (`Not found` = 9 bytes)
    expect(total).toBe(10 + Buffer.byteLength(NOT_FOUND_BODY));
  });

  it('passes under the cap and names the overage when over', () => {
    expect(budgetFailures(ARTIFACT_BYTE_CAP)).toEqual([]);
    expect(budgetFailures(ARTIFACT_BYTE_CAP + 5)).toHaveLength(1);
    expect(budgetFailures(ARTIFACT_BYTE_CAP + 5)[0]).toContain(`over the ${ARTIFACT_BYTE_CAP}-byte`);
  });
});

describe('materialize', () => {
  it('writes exactly the tree, the route copies, the redirect pages and the 404, and leaves the served tree untouched', async () => {
    const { servedDir, outDir } = makeServed({
      'index.html': '<html>home</html>',
      'deep/page.html': '<html>deep</html>',
      'assets/a.svg': '<svg/>',
      'redirects.json': JSON.stringify({ '/old': '/deep/page' }),
      'build-log.json': '[]',
    });
    const before = snapshot(servedDir);
    const result = await materialize({ servedDir, outDir });

    expect(snapshot(outDir)).toEqual({
      'index.html': expect.any(String),
      'deep/page.html': expect.any(String),
      'deep/page/index.html': expect.any(String),
      'assets/a.svg': expect.any(String),
      'redirects.json': expect.any(String),
      'build-log.json': expect.any(String),
      'old/index.html': expect.any(String),
      '404.html': expect.any(String),
    });
    expect(fs.readFileSync(path.join(outDir, 'deep/page/index.html'), 'utf8')).toBe('<html>deep</html>');
    expect(fs.readFileSync(path.join(outDir, 'old/index.html'), 'utf8')).toBe(redirectPageBytes('/deep/page'));
    expect(fs.readFileSync(path.join(outDir, '404.html'), 'utf8')).toBe(NOT_FOUND_BODY);

    // the materialization only ever reads the tree
    expect(snapshot(servedDir)).toEqual(before);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.files).toBe(8);
  });

  it('refuses a collision with a real page and writes nothing', async () => {
    const { servedDir, outDir } = makeServed({
      'index.html': '<html>home</html>',
      'foo.html': '<html>foo</html>',
      'redirects.json': JSON.stringify({ '/foo': '/bar' }),
    });
    await expect(materialize({ servedDir, outDir })).rejects.toBeInstanceOf(ArtifactRefusedError);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('refuses an over-budget artifact and writes nothing', async () => {
    const { servedDir, outDir } = makeServed({
      'index.html': '<html>home</html>',
      'redirects.json': '{}',
    });
    await expect(materialize({ servedDir, outDir, cap: 4 })).rejects.toBeInstanceOf(ArtifactRefusedError);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('treats an absent redirects.json as no redirects, the way the serving layer does', async () => {
    const { servedDir, outDir } = makeServed({ 'index.html': '<html>home</html>' });
    const result = await materialize({ servedDir, outDir });
    expect(snapshot(outDir)).toEqual({ 'index.html': expect.any(String), '404.html': expect.any(String) });
    expect(result.files).toBe(2);
  });

  it('refuses an output directory inside the served tree', async () => {
    const { servedDir } = makeServed({ 'index.html': 'home', 'redirects.json': '{}' });
    await expect(materialize({ servedDir, outDir: path.join(servedDir, 'out') })).rejects.toThrow(/inside/);
  });
});

describe("the serving layer's not-found body", () => {
  it('is exactly the bytes the 404.html carries', async () => {
    expect(NOT_FOUND_BODY).toBe('Not found');
    expect(await notFound().text()).toBe(NOT_FOUND_BODY);
  });
});

describe('the committed tree', () => {
  it('plans cleanly, under the published-site cap, with a copy per non-root page and the manifest redirects', async () => {
    const files = await listFiles(SERVED);
    const redirects = JSON.parse(fs.readFileSync(path.join(SERVED, 'redirects.json'), 'utf8'));
    const { entries, failures } = planArtifact({ files, redirects });
    expect(failures).toEqual([]);

    const pages = files.filter((f) => f.endsWith('.html'));
    const routeCopies = entries.filter((e) => 'copy' in e && e.path !== e.copy);
    expect(routeCopies).toHaveLength(pages.filter((p) => p !== 'index.html').length);
    expect(Object.keys(redirects).every((s) => entries.some((e) => e.path === `${s.replace(/^\/+/, '')}/index.html`))).toBe(true);
    expect(entries.find((e) => e.path === '404.html')).toBeDefined();

    const bytes = artifactBytes(entries, (from) => fs.statSync(path.join(SERVED, from)).size);
    expect(bytes).toBeLessThanOrEqual(ARTIFACT_BYTE_CAP);
  });
});
