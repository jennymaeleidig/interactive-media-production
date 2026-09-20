// The artifact check's verdicts, over synthetic probes.
//
// The check itself needs a build and a server, so it is an npm script rather
// than a suite member; what is testable here is what it *concludes*, and the
// serving seam it concludes from. Every assertion below is a way the published
// artifact could be wrong while the sources look fine: a missing page, a wrong
// media type, bytes that drifted from the maintained source, and a host page
// that stopped naming the chat. `probe` drives the real serving logic against a
// real temporary directory, so the seam covers file resolution and the
// directory-escape guard without a socket.
//
// SPDX-License-Identifier: CC0-1.0
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findingsFor, insideOut, probe } from '../test/artifact.mjs';

/** The shape of a probe the check hands to `findingsFor`. */
const ok = (url: string, body: string, contentType = 'text/html; charset=utf-8') => ({ url, status: 200, contentType, body });

describe('findingsFor', () => {
  const expected = {
    '/': {
      contentType: 'text/html',
      references: ['/chat/runtime.js', 'An artwork, not Flock Safety.', 'og:title', 'og:description', 'name="description"'],
    },
    '/chat/runtime.js': { contentType: 'text/javascript; charset=utf-8', body: 'console.log(1)', source: 'scripts/chat-runtime.js' },
  };

  it('says nothing when the artifact is what it should be', () => {
    const probes = [
      ok(
        '/',
        '<title>Flock Safety</title><meta property="og:title" content="An artwork, not Flock Safety."><meta property="og:description"><meta name="description"><script src="/chat/runtime.js">',
      ),
      ok('/chat/runtime.js', 'console.log(1)', 'text/javascript; charset=utf-8'),
    ];
    expect(findingsFor(probes, expected)).toEqual([]);
  });

  it('reports a URL that is not there', () => {
    const findings = findingsFor([{ url: '/', status: 404, contentType: 'text/plain', body: 'Not found' }], expected);
    expect(findings).toEqual(['/: answered 404']);
  });

  it('reports a page that no longer names the chat runtime', () => {
    const findings = findingsFor([ok('/', '<p>nothing here</p>')], expected);
    expect(findings).toContain('/: does not reference /chat/runtime.js');
  });

  it('reports a page that lost the honest preview metadata', () => {
    const findings = findingsFor([ok('/', '<title>Flock Safety</title><script src="/chat/runtime.js">')], expected);
    expect(findings).toContain('/: does not reference An artwork, not Flock Safety.');
    expect(findings).toContain('/: does not reference og:title');
    expect(findings).toContain('/: does not reference og:description');
    expect(findings).toContain('/: does not reference name="description"');
  });

  it('reports bytes that drifted from the maintained source', () => {
    const findings = findingsFor([ok('/chat/runtime.js', 'console.log(2)', 'text/javascript; charset=utf-8')], expected);
    expect(findings).toEqual(['/chat/runtime.js: does not carry the bytes of scripts/chat-runtime.js']);
  });

  it('reports a media type the path should not have', () => {
    const findings = findingsFor([ok('/chat/runtime.js', 'console.log(1)', 'text/html; charset=utf-8')], expected);
    expect(findings).toEqual(['/chat/runtime.js: answered text/html; charset=utf-8, expected text/javascript; charset=utf-8']);
  });
});

describe('probe', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'flock-artifact-'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><script src="/chat/runtime.js">');
    await mkdir(path.join(root, 'legal'), { recursive: true });
    await writeFile(path.join(root, 'legal/privacy-policy.html'), '<h1>privacy</h1>');
    await mkdir(path.join(root, 'deep'), { recursive: true });
    await writeFile(path.join(root, 'deep/index.html'), '<h1>deep index</h1>');
    await mkdir(path.join(root, 'chat'), { recursive: true });
    await writeFile(path.join(root, 'chat/runtime.js'), 'console.log(1)');
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('serves the export directory index for the root', async () => {
    const res = await probe(root, '/');
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('/chat/runtime.js');
  });

  it('serves the file the export writes for a route', async () => {
    const res = await probe(root, '/legal/privacy-policy');
    expect(res.status).toBe(200);
    expect(res.body).toContain('privacy');
  });

  it('falls back to a directory index when the export writes one', async () => {
    const res = await probe(root, '/deep');
    expect(res.status).toBe(200);
    expect(res.body).toContain('deep index');
  });

  it('serves a published file as itself, with its media type', async () => {
    const res = await probe(root, '/chat/runtime.js');
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('text/javascript; charset=utf-8');
    expect(res.body).toBe('console.log(1)');
  });

  it('answers 404 for a URL the directory does not carry', async () => {
    const res = await probe(root, '/nope');
    expect(res.status).toBe(404);
    expect(res.contentType).toBe('text/plain; charset=utf-8');
  });

  it('feeds the verdicts: a served directory composes with findingsFor', async () => {
    const expected = {
      '/chat/runtime.js': { contentType: 'text/javascript', body: 'console.log(1)', source: 'scripts/chat-runtime.js' },
    };
    const { status, contentType, body } = await probe(root, '/chat/runtime.js');
    expect(findingsFor([{ url: '/chat/runtime.js', status, contentType, body }], expected)).toEqual([]);
  });

  it('reports a media type the path should not have, from the served bytes', async () => {
    const expected = { '/chat/runtime.js': { contentType: 'text/html', body: 'console.log(1)' } };
    const { status, contentType, body } = await probe(root, '/chat/runtime.js');
    expect(findingsFor([{ url: '/chat/runtime.js', status, contentType, body }], expected)).toEqual([
      '/chat/runtime.js: answered text/javascript; charset=utf-8, expected text/html',
    ]);
  });
});

describe('insideOut', () => {
  const root = '/tmp/out';

  it('accepts a file under the directory it serves', () => {
    expect(insideOut(root, '/tmp/out/index.html')).toBe(true);
    expect(insideOut(root, '/tmp/out/a/b.html')).toBe(true);
  });

  it('refuses a path that leaves it, and the directory itself', () => {
    expect(insideOut(root, '/tmp/out/../secret')).toBe(false);
    expect(insideOut(root, '/tmp/elsewhere.html')).toBe(false);
    expect(insideOut(root, root)).toBe(false);
  });
});
