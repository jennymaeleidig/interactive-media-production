// Inline-body deduplication (ADR 0003): the pass that moves each style/script
// body above the inline threshold into a content-addressed file, and the CSP
// grant that makes the browser willing to load it. Pure, so it is pinned here
// rather than only through the site build.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { BODY_MIME, KEEP_INLINE_BYTES, dedupeBodies, scanBodies } from '../pipeline/dedupe.mjs';

const CSP = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:; frame-src 'self' data:; connect-src 'self';";
const PAGE = (body: string) =>
  `<!DOCTYPE html><html><head><meta http-equiv=content-security-policy content="${CSP}"><title>t</title>${body}</head><body><p>x</p></body></html>`;

/** A style body of exactly `n` characters (the pass keys on body size). */
const styleOf = (n: number) => `.c{${'a'.repeat(n - 4)}}`;

describe('scanBodies', () => {
  it('finds style and script elements in document order, with their spans', () => {
    const html = `<style>a</style><p>x</p><script>b</script>`;
    expect(scanBodies(html)).toEqual([
      { kind: 'style', start: 0, end: 16, openTag: '<style>', body: 'a' },
      { kind: 'script', start: 24, end: 42, openTag: '<script>', body: 'b' },
    ]);
  });

  it('does not read markup inside an attribute value as an element', () => {
    // The captured player documents are raw `<style>`/`<script>` inside a
    // `srcdoc="..."` value — text, not elements (they are a nested document
    // with its own CSP, and rewriting them is what a naive scan gets wrong).
    const html = `<div><iframe srcdoc="<style>nested</style><p>y</p>"></iframe><style>outer</style></div>`;
    const slots = scanBodies(html);
    expect(slots.map((s) => s.body)).toEqual(['outer']);
  });

  it('ends an unquoted attribute value at whitespace, not at a quote inside it', () => {
    // `style=background-image:url("x.png")` is an UNQUOTED value that happens
    // to contain quotes; treating its first `"` as a delimiter swallowed one
    // page's iframe — srcdoc payload included — and rewrote the nested
    // document's stylesheets.
    const html = `<div class=grecaptcha-badge style=background-image:url("/assets/x.png")><style>after</style></div>`;
    expect(scanBodies(html).map((s) => s.body)).toEqual(['after']);
  });

  it('skips markup inside a comment and inside an SVG subtree', () => {
    const html = `<!--<style>commented</style>--><svg><style>svg css</style></svg><style>real</style>`;
    expect(scanBodies(html).map((s) => s.body)).toEqual(['real']);
  });

  it('does not read a style in a script body, or a script in a style body', () => {
    const html = `<script>var t="<style>inside</style>";</script><style>/* <script>x</script> */</style>`;
    expect(scanBodies(html).map((s) => s.kind)).toEqual(['script', 'style']);
  });
});

describe('dedupeBodies', () => {
  it('moves a body to /assets/<sha>.css and leaves a link where it stood', () => {
    const body = styleOf(KEEP_INLINE_BYTES + 1);
    expect(body).toHaveLength(KEEP_INLINE_BYTES + 1);
    const result = dedupeBodies(PAGE(`<style>${body}</style>`));
    expect(result.externalized).toEqual({ style: 1, script: 0 });
    expect(result.kept).toEqual({ style: 0, script: 0 });
    expect(result.html).toContain('<link rel=stylesheet href=/assets/');
    expect(result.html).not.toContain(body);
    expect([...result.files.values()]).toEqual([
      { name: expect.stringMatching(/^[0-9a-f]{16}\.css$/), mime: 'text/css', bytes: Buffer.from(body, 'utf8') },
    ]);
    // the same bytes, one file, named by their hash
    const [name, file] = [...result.files.entries()][0];
    expect(result.html).toContain(`href=/assets/${name}`);
    expect(file.bytes.toString('utf8')).toBe(body);
  });

  it('keeps a body under the threshold inline, and counts it', () => {
    const body = 'a'.repeat(KEEP_INLINE_BYTES - 1);
    expect(body).toHaveLength(KEEP_INLINE_BYTES - 1);
    const result = dedupeBodies(PAGE(`<style>${body}</style>`));
    expect(result.externalized).toEqual({ style: 0, script: 0 });
    expect(result.kept).toEqual({ style: 1, script: 0 });
    expect(result.html).toContain(`<style>${body}</style>`);
    expect(result.files.size).toBe(0);
    expect(result.bytesIn).toBe(result.bytesOut);
  });

  it('carries the element\u2019s own attributes onto the stand-in', () => {
    const result = dedupeBodies(PAGE(`<style data-flock-parody="motion">${styleOf(2000)}</style><script data-flock-parody="motion">${'x'.repeat(2000)}</script>`));
    expect(result.html).toContain('data-flock-parody="motion"');
    expect(result.html).toMatch(/<link rel=stylesheet href=\/assets\/[0-9a-f]{16}\.css data-flock-parody="motion">/);
    expect(result.html).toMatch(/<script data-flock-parody="motion" src=\/assets\/[0-9a-f]{16}\.js><\/script>/);
    expect(BODY_MIME).toEqual({ style: 'text/css', script: 'text/javascript' });
  });

  it('leaves JSON-LD and templated scripts inline — they are data, not code', () => {
    const ld = `<script type=application/ld+json>{"x":"${'y'.repeat(2000)}"}</script>`;
    const tmpl = `<script type=text/template>${'z'.repeat(2000)}</script>`;
    const src = `<script src=/assets/existing.js></script>`;
    const result = dedupeBodies(PAGE(`${ld}${tmpl}${src}`));
    expect(result.externalized.script).toBe(0);
    expect(result.kept.script).toBe(3);
    expect(result.html).toContain(ld);
  });

  it('grants \u2018self\u2019 in the two directives it needs, and replaces them', () => {
    const result = dedupeBodies(PAGE(`<style>${styleOf(2000)}</style><script>${'x'.repeat(2000)}</script>`));
    expect(result.csp).toContain("style-src 'unsafe-inline' 'self'");
    expect(result.csp).toContain("script-src 'unsafe-inline' data: 'self'");
    // a second directive would intersect with the captured one and keep the
    // files blocked, so the count must not grow
    expect(result.csp?.match(/style-src/g)).toHaveLength(1);
    expect(result.csp?.match(/script-src/g)).toHaveLength(1);
    expect(result.html).toContain(`content="${result.csp}"`);
  });

  it('leaves the bodies inline when there is no directive to grant', () => {
    const noScript = PAGE(`<script>${'x'.repeat(2000)}</script>`).replace('script-src \'unsafe-inline\' data:;', '');
    const result = dedupeBodies(noScript);
    expect(result.externalized.script).toBe(0);
    expect(result.kept.script).toBe(1);
    expect(result.blocked).toEqual(['no script-src directive to grant — script bodies left inline']);
    expect(result.html).toContain('<script>');
  });

  it('leaves the bodies inline when the page carries no CSP meta at all', () => {
    const result = dedupeBodies(`<html><style>${styleOf(2000)}</style></html>`);
    expect(result.externalized.style).toBe(0);
    expect(result.blocked).toEqual(['no CSP meta — bodies left inline']);
  });

  it('is idempotent, and preserves every byte outside the elements it moved', () => {
    const body = styleOf(3000);
    const page = PAGE(`<div class=a><style>${body}</style><p>keep me</p><script>${'y'.repeat(3000)}</script></div>`);
    const once = dedupeBodies(page);
    const twice = dedupeBodies(once.html);
    expect(twice.html).toBe(once.html);
    expect(once.html).toContain('<p>keep me</p>');
  });

  it('writes one file for a body that appears twice, and counts both references', () => {
    const body = styleOf(2000);
    const result = dedupeBodies(PAGE(`<style>${body}</style><style>${body}</style>`));
    expect(result.externalized.style).toBe(2);
    expect(result.files.size).toBe(1);
    expect(result.html.match(/<link rel=stylesheet href=\/assets\/[0-9a-f]{16}\.css>/g)).toHaveLength(2);
  });

  it('is linear on a page with multi-megabyte inline stylesheets', () => {
    const page = PAGE(`<style>${'.x{background:url(data:image/webp;base64,AAAA)}\n'.repeat(40000)}</style><style>${styleOf(2000)}</style>`);
    const started = Date.now();
    const result = dedupeBodies(page);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.externalized.style).toBe(2);
    // the data: URIs inside the moved body stay where they are — they are the
    // asset pass's business, not this one's
    expect(result.files.size).toBe(2);
  });
});
