// The served tree's rules — path resolution, containment, and the content type
// a file comes back with. Pure, and shared by two tiers that cannot import each
// other's language (the TS route and the plain-JS serving check), so it is
// pinned here rather than only through `npm run routes`.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { insideTree, mimeForExt, pageCandidates, routeIndexFile, routeOfPage } from '../pipeline/served-tree.mjs';

describe('pageCandidates', () => {
  it('resolves a route path in the order the route tries it', () => {
    expect(pageCandidates('served', '/a/b')).toEqual(['served/a/b.html', 'served/a/b/index.html']);
  });

  it('resolves the root to index.html', () => {
    expect(pageCandidates('served', '/')).toEqual(['served/index.html']);
  });

  it('tolerates a bare or repeated leading slash', () => {
    expect(pageCandidates('served', 'a/b')).toEqual(pageCandidates('served', '/a/b'));
    expect(pageCandidates('served', '//a/b')).toEqual(pageCandidates('served', '/a/b'));
  });

  it('keeps the directory-style candidate for a path that reads as a directory', () => {
    expect(pageCandidates('served', '/legal/privacy-policy')).toContain(path.join('served', 'legal/privacy-policy', 'index.html'));
  });
});

describe('routeIndexFile', () => {
  it('names the directory index a route is served from', () => {
    expect(routeIndexFile('/')).toBe('index.html');
    expect(routeIndexFile('/a/b')).toBe('a/b/index.html');
    expect(routeIndexFile('a/b')).toBe('a/b/index.html');
  });

  it('is the second candidate pageCandidates tries', () => {
    expect(pageCandidates('served', '/a/b')[1]).toBe(path.join('served', routeIndexFile('/a/b')));
  });
});

describe('routeOfPage', () => {
  it('maps a page file back to the route it answers', () => {
    expect(routeOfPage('index.html')).toBe('/');
    expect(routeOfPage('a/b.html')).toBe('/a/b');
    expect(routeOfPage('a/b/index.html')).toBe('/a/b');
  });

  it('is null for a file that is not a page', () => {
    expect(routeOfPage('assets/x.svg')).toBeNull();
    expect(routeOfPage('redirects.json')).toBeNull();
  });

  it('round-trips a route through its index file', () => {
    expect(routeOfPage(routeIndexFile('/a/b'))).toBe('/a/b');
  });
});

describe('insideTree', () => {
  it('accepts a resolved path inside the root', () => {
    expect(insideTree('served', 'served/a/b.html')).toBe(true);
    expect(insideTree(path.resolve('served'), path.resolve('served/index.html'))).toBe(true);
  });

  it('refuses a path that climbs out', () => {
    expect(insideTree('served', 'served/../etc/passwd')).toBe(false);
    expect(insideTree('served', 'served/a/../../etc/passwd')).toBe(false);
  });

  it('refuses the root itself and a sibling of the root whose name starts the same', () => {
    expect(insideTree('served', 'served')).toBe(false);
    expect(insideTree('served', 'served-other/index.html')).toBe(false);
  });
});

describe('mimeForExt', () => {
  it('maps the types the tree actually carries', () => {
    expect(mimeForExt('woff2')).toBe('font/woff2');
    expect(mimeForExt('svg')).toBe('image/svg+xml');
    expect(mimeForExt('woff')).toBe('font/woff');
    expect(mimeForExt('mpeg')).toBe('video/mpeg');
    expect(mimeForExt('css')).toBe('text/css');
    expect(mimeForExt('js')).toBe('text/javascript');
  });

  it('is case-insensitive and falls back to a byte stream', () => {
    expect(mimeForExt('SVG')).toBe('image/svg+xml');
    expect(mimeForExt('nope')).toBe('application/octet-stream');
    expect(mimeForExt('')).toBe('application/octet-stream');
  });
});
