// Data-URI extraction core (ADR 0002): the serve-from-a-file rewrite the build
// applies to every Capture-inlined asset. Pure, so it is locked here rather
// than only exercised through a 10 GB build — the corpus's quoting shapes
// (single-quoted raw SVG carrying `"`, HTML-escaped `&quot;` values inside
// inline styles, CSS backslash escapes in bare `url()`) are the regressions
// this pins.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cssUnescape, decodeDataUri, extForMime, extractDataUris, parseDataUri } from '../pipeline/assets.mjs';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_B64 = PNG.toString('base64');
const shaOf = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

describe('parseDataUri', () => {
  it('splits a base64 URI into media type and payload', () => {
    expect(parseDataUri(`data:image/png;base64,${PNG_B64}`)).toEqual({ mime: 'image/png', isBase64: true, payload: PNG_B64 });
  });

  it('reads a charset parameter and a non-base64 payload', () => {
    expect(parseDataUri('data:image/svg+xml;charset=utf-8,%3Csvg/%3E')).toEqual({
      mime: 'image/svg+xml',
      isBase64: false,
      payload: '%3Csvg/%3E',
    });
  });

  it('defaults a typeless URI to text/plain', () => {
    expect(parseDataUri('data:,hello')).toEqual({ mime: 'text/plain', isBase64: false, payload: 'hello' });
  });

  it('rejects a non-data URI', () => {
    expect(parseDataUri('https://example.com/a.png')).toBeNull();
  });
});

describe('decodeDataUri', () => {
  it('decodes base64 payloads byte-for-byte', () => {
    expect(decodeDataUri(parseDataUri(`data:image/png;base64,${PNG_B64}`)!)).toEqual(PNG);
  });

  it('percent-decodes a textual payload', () => {
    expect(decodeDataUri(parseDataUri('data:image/svg+xml,%3Csvg/%3E')!)?.toString()).toBe('<svg/>');
  });

  it('takes a raw, unencoded payload verbatim', () => {
    expect(decodeDataUri(parseDataUri('data:image/svg+xml,<svg a="b"/>')!)?.toString()).toBe('<svg a="b"/>');
  });
});

describe('extForMime', () => {
  it('maps the captured media types', () => {
    expect(extForMime('image/svg+xml')).toBe('svg');
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('font/woff2')).toBe('woff2');
  });

  it('falls back to the subtype, then to .bin', () => {
    expect(extForMime('image/heic')).toBe('heic');
    expect(extForMime('image/x-thing+xml')).toBe('x-thing');
    expect(extForMime('application/octet-stream')).toBe('octet-stream');
    expect(extForMime('weird')).toBe('bin');
  });

  it('maps the legacy aliases the captures actually carry', () => {
    // without these the fallback would name a font `.x-font-woff` and serve it
    // as application/octet-stream (the audio resource too)
    expect(extForMime('application/x-font-woff')).toBe('woff');
    expect(extForMime('application/font-woff')).toBe('woff');
    expect(extForMime('video/mpeg')).toBe('mpeg');
  });
});

describe('cssUnescape', () => {
  it('reverses the escaped-space and escaped-quote forms the captures use', () => {
    expect(cssUnescape("data:image/svg+xml,%3Csvg\\ viewBox=\\'0\\ 0\\'\\ xmlns")).toBe(
      "data:image/svg+xml,%3Csvg viewBox='0 0' xmlns",
    );
  });

  it('reverses hex escapes and a backslash-newline continuation', () => {
    expect(cssUnescape('\\41\\42')).toBe('AB');
    expect(cssUnescape('a\\\nb')).toBe('ab');
  });

  it('leaves base64 payloads alone (no backslash in the alphabet)', () => {
    expect(cssUnescape(PNG_B64)).toBe(PNG_B64);
  });
});

describe('extractDataUris', () => {
  it('rewrites a double-quoted base64 src and returns the decoded bytes', () => {
    const { html, assets, references } = extractDataUris(`<img src="data:image/png;base64,${PNG_B64}" alt>`);
    expect(html).toBe(`<img src="/assets/${shaOf(PNG)}.png" alt>`);
    expect(references).toBe(1);
    expect(assets.get(shaOf(PNG))?.bytes).toEqual(PNG);
  });

  it('rewrites a single-quoted raw SVG that carries double quotes inside', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="413"></svg>';
    const out = extractDataUris(`<img src='data:image/svg+xml,${svg}' loading=lazy>`);
    // the delimiters the capture used are preserved, so the rewrite stays valid
    expect(out.html).toBe(`<img src='/assets/${shaOf(Buffer.from(svg))}.svg' loading=lazy>`);
    expect(out.assets.get(shaOf(Buffer.from(svg)))?.bytes.toString()).toBe(svg);
  });

  it('keeps the escape form it found, for an escaped url() value in an inline style', () => {
    const out = extractDataUris(`<div style="background-image:url(&quot;data:image/png;base64,${PNG_B64}&quot;)">`);
    expect(out.html).toBe(`<div style="background-image:url(&quot;/assets/${shaOf(PNG)}.png&quot;)">`);
  });

  it('rewrites a bare url() whose payload carries CSS escapes', () => {
    const out = extractDataUris("a:before{background-image:url(data:image/svg+xml,%3Csvg\\ viewBox=\\'0\\ 0\\'/%3E)}");
    const decoded = '<svg viewBox=\'0 0\'/>';
    expect(out.html).toBe(`a:before{background-image:url(/assets/${shaOf(Buffer.from(decoded))}.svg)}`);
    expect(out.assets.get(shaOf(Buffer.from(decoded)))?.bytes.toString()).toBe(decoded);
  });

  it('rewrites poster and the favicon link', () => {
    const out = extractDataUris(`<video poster="data:image/png;base64,${PNG_B64}"></video><link rel=icon href="data:image/png;base64,${PNG_B64}">`);
    expect(out.html).toBe(`<video poster="/assets/${shaOf(PNG)}.png"></video><link rel=icon href="/assets/${shaOf(PNG)}.png">`);
    expect(out.references).toBe(2);
  });

  it('collapses identical bytes across every reference to one asset', () => {
    const out = extractDataUris(`<img src="data:image/png;base64,${PNG_B64}"><img src='data:image/png;base64,${PNG_B64}'>`);
    expect(out.assets.size).toBe(1);
    expect(out.references).toBe(2);
  });

  it('names each asset by the first 16 hex of its own bytes', () => {
    const out = extractDataUris(`<img src="data:image/png;base64,${PNG_B64}">`);
    const [asset] = [...out.assets.values()];
    expect(asset.sha).toBe(shaOf(asset.bytes));
    expect(asset.sha).toHaveLength(16);
  });

  it('keeps a bare url() payload whole across a raw `>` in an inlined SVG', () => {
    // the 244 reference case: `>` is payload inside url(), not a terminator
    const payload = String.raw`<svg\ xmlns=\&quot;http://www.w3.org/2000/svg\&quot;><path\ d=\&quot;M0\ 0\ 1\ 1\&quot;\/><\/svg>`;
    const out = extractDataUris(`a:after{-webkit-mask-image:url(data:image/svg+xml;charset=utf-8,${payload})}`);
    // inside a <style> element the HTML parser does NOT decode entities, so
    // `\&quot;` unescapes to the literal `&quot;` the browser feeds the SVG
    const decoded = '<svg xmlns=&quot;http://www.w3.org/2000/svg&quot;><path d=&quot;M0 0 1 1&quot;/></svg>';
    expect(out.html).toBe(`a:after{-webkit-mask-image:url(/assets/${shaOf(Buffer.from(decoded))}.svg)}`);
    expect(out.assets.get(shaOf(Buffer.from(decoded)))?.bytes.toString()).toBe(decoded);
  });

  it('ends a bare attribute value at `>`, where the tag ends', () => {
    const gif = Buffer.from('474946383961', 'hex');
    const out = extractDataUris(`<img src=data:image/png;base64,${PNG_B64}><img src=data:image/gif;base64,${gif.toString('base64')}>`);
    expect(out.references).toBe(2);
    // an unquoted value stays unquoted — the rewrite only swaps the reference
    expect(out.html).toBe(`<img src=/assets/${shaOf(PNG)}.png><img src=/assets/${shaOf(gif)}.gif>`);
  });

  it('extracts an unquoted multi-megabyte video source without overflowing (ticket 12)', () => {
    // SingleFile writes an inlined video source unquoted; the retired
    // alternation pattern recursed once per scanned character and blew the
    // regex engine's stack above ~9 MB of value.
    const payload = 'A'.repeat(12_000_000);
    const out = extractDataUris(`<video><source data-wf-ignore=true src=data:video/mp4;base64,${payload}></video>`);
    expect(out.references).toBe(1);
    const sha = [...out.assets.keys()][0];
    expect(out.html).toBe(`<video><source data-wf-ignore=true src=/assets/${sha}.mp4></video>`);
    expect(out.assets.get(sha)?.mime).toBe('video/mp4');
  });

  it('rewrites an asset inside a srcdoc payload, where the quotes are escaped twice', () => {
    // a player document inlined as `srcdoc` is escaped once for the inlining and
    // again as the attribute value, so its quotes read `&amp;quot;`
    const out = extractDataUris(`<iframe srcdoc="<img src=&amp;quot;data:image/png;base64,${PNG_B64}&amp;quot;>"></iframe>`);
    expect(out.html).toBe(`<iframe srcdoc="<img src=&amp;quot;/assets/${shaOf(PNG)}.png&amp;quot;>"></iframe>`);
    expect(out.assets.get(shaOf(PNG))?.bytes).toEqual(PNG);
  });

  it('rewrites an SVG <image> that carries its payload on xlink:href', () => {
    const out = extractDataUris(`<image xlink:href="data:image/png;base64,${PNG_B64}" width=40></image>`);
    expect(out.html).toBe(`<image xlink:href="/assets/${shaOf(PNG)}.png" width=40></image>`);
    expect(out.assets.get(shaOf(PNG))?.bytes).toEqual(PNG);
  });

  it('leaves ordinary references, fragments, and an empty data URI untouched', () => {
    const html = '<img src="/a.png"><use href="#icon"><a href="/b"><div style="background:url(data:,)">';
    const out = extractDataUris(html);
    expect(out.html).toBe(html);
    expect(out.assets.size).toBe(0);
    expect(out.references).toBe(0);
  });

  it('leaves a data: URI in the page text alone (the CSP meta is not a reference)', () => {
    const html = `<meta http-equiv=content-security-policy content="img-src 'self' data:; font-src 'self' data:">`;
    expect(extractDataUris(html).html).toBe(html);
  });
});
