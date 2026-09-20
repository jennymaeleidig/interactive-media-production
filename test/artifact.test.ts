// The artifact check's verdicts, over synthetic probes.
//
// The check itself needs a build and a server, so it is an npm script rather
// than a suite member; what is testable here is what it *concludes*. Every
// assertion below is a way the published artifact could be wrong while the
// sources look fine: a missing page, a wrong media type, bytes that drifted from
// the maintained source, and a host page that stopped naming the chat.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { candidatesFor, findingsFor, insideOut } from '../regression/artifact.mjs';

/** The shape of a probe the check hands to `findingsFor`. */
const ok = (url: string, body: string, contentType = 'text/html; charset=utf-8') => ({ url, status: 200, contentType, body });

describe('findingsFor', () => {
  const expected = {
    '/': {
      contentType: 'text/html',
      references: ['/chat/runtime.js', 'An artwork, not Flock Safety.', 'og:title', 'og:description', 'name="description"'],
    },
    '/chat/runtime.js': { contentType: 'text/javascript; charset=utf-8', body: 'console.log(1)', source: 'pipeline/chat-runtime.js' },
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
    expect(findings).toEqual(['/chat/runtime.js: does not carry the bytes of pipeline/chat-runtime.js']);
  });

  it('reports a media type the path should not have', () => {
    const findings = findingsFor([ok('/chat/runtime.js', 'console.log(1)', 'text/html; charset=utf-8')], expected);
    expect(findings).toEqual(['/chat/runtime.js: answered text/html; charset=utf-8, expected text/javascript; charset=utf-8']);
  });
});


describe('candidatesFor', () => {
  it('answers the export directory for the root', () => {
    expect(candidatesFor('/')).toEqual(['index.html']);
  });

  it('prefers the file the export writes, and falls back to a directory index', () => {
    expect(candidatesFor('/legal/privacy-policy')).toEqual([
      'legal/privacy-policy.html',
      'legal/privacy-policy/index.html',
    ]);
    expect(candidatesFor('/legal/privacy-policy/')).toEqual([
      'legal/privacy-policy.html',
      'legal/privacy-policy/index.html',
    ]);
  });

  it('answers a published file as itself, and never appends an extension to it', () => {
    expect(candidatesFor('/chat/runtime.js')).toEqual(['chat/runtime.js']);
    expect(candidatesFor('/favicon-32.png')).toEqual(['favicon-32.png']);
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
