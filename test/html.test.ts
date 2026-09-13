// The capture HTML's source text: the three views the strip audit reads a page
// through. Pure, so it is pinned here rather than only through the served tree.
//
// Two of these tests are regressions, not descriptions — each is a failure mode
// a pass hit when it owned its own scanner (ticket 12):
//
//   1. A multi-megabyte *unquoted* attribute value. SingleFile writes a video's
//      `src=data:video/mp4;base64,…` unquoted; the regex alternation that reads
//      tags recurses once per scanned unit of such a value and overflows the
//      engine's stack. `openTags` is a scanner, and must walk it.
//   2. A nested document in `srcdoc`. A scanner that lets any `"` open a quoted
//      section swallows the nested `<iframe srcdoc=…>` and reads the inner
//      document's markup as if the outer page carried it.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { attrOf, openTags, srcdocSpans } from '../pipeline/html.mjs';

describe('openTags', () => {
  it('yields the open tags, and not the close ones', () => {
    expect([...openTags('<div class=x>hi</div>')]).toEqual([
      { name: 'div', attrs: ' class=x', index: 0, tag: '<div class=x>' },
    ]);
  });

  it('reads a `>` inside a quoted value as part of the value', () => {
    const [tag] = [...openTags('<a title="a > b" href=/x>')];
    expect(tag.attrs).toBe(' title="a > b" href=/x');
  });

  it('keeps a hyphenated name whole', () => {
    expect([...openTags('<wistia-player media-id=abc>')][0].name).toBe('wistia-player');
  });

  it('ends the tag at its own `>`, not at the first quote pair it can reach', () => {
    // The captures write `style=background-image:url(&quot;/assets/x.png&quot;)`
    // unquoted — quotes, but no raw `"`. A rule that scanned forward for a quote
    // pair to make a "quoted section" ran past this tag's `>` into the next one.
    const escaped = '<div style=background-image:url(&quot;/a.png&quot;)><p>after</p>';
    const [tag] = [...openTags(escaped)];
    expect(tag.tag).toBe('<div style=background-image:url(&quot;/a.png&quot;)>');
  });

  it('walks a multi-megabyte unquoted value without overflowing the stack', () => {
    // The ticket-12 shape: SingleFile writes this value unquoted.
    const giant = `<video src=data:video/mp4;base64,${'A'.repeat(3_000_000)} poster=/p.jpg></video>`;
    const [tag] = [...openTags(giant)];
    expect(tag.name).toBe('video');
    expect(tag.attrs.startsWith(' src=data:video/mp4;base64,AAAA')).toBe(true);
    expect(tag.attrs.endsWith(' poster=/p.jpg')).toBe(true);
  });

  it('does not read a tag inside an unterminated quote', () => {
    expect([...openTags('<div class="oops')]).toEqual([]);
  });
});

describe('srcdocSpans', () => {
  it('returns the carrying tag and the escaped value', () => {
    const html = '<iframe srcdoc="&lt;style&gt;x&lt;/style&gt;" sandbox></iframe>';
    const [span] = srcdocSpans(html);
    expect(span.tag).toBe('<iframe srcdoc="&lt;style&gt;x&lt;/style&gt;" sandbox>');
    expect(span.value).toBe('&lt;style&gt;x&lt;/style&gt;');
  });

  it('ignores a srcdoc-looking string that is not an attribute value', () => {
    expect(srcdocSpans('<div data-x=srcdoc=y>')).toHaveLength(0);
  });
});

describe('attrOf', () => {
  // The real corpus shape (145 occurrences in the frozen tree): a suffixed
  // attribute carrying the same name sits *before* the real one.
  const tag = '<div class=grecaptcha-badge data-style=bottomright style="width:256px">';
  const attrs = tag.slice('<div'.length, -1);

  it('reads the attribute whose name is complete', () => {
    expect(attrOf(attrs, 'style')).toBe('width:256px');
  });

  it('does not read a `data-src` as a `src`', () => {
    expect(attrOf(' data-src="https://cdn.example/a.jpg"', 'src')).toBeNull();
  });

  it('reads the value in every quote form the captures write', () => {
    expect(attrOf(' a="1" b=2 c=\'3\'', 'a')).toBe('1');
    expect(attrOf(' a="1" b=2 c=\'3\'', 'b')).toBe('2');
    expect(attrOf(' a="1" b=2 c=\'3\'', 'c')).toBe('3');
  });
});
