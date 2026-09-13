// The capture HTML's source text: the tokenizer's views, and the dialects that
// are kept rather than merged. Pure, so it is pinned here rather than only
// through the site build.
//
// Two of these tests are regressions, not descriptions — each is a failure mode
// a pass hit when it owned its own scanner (ticket 12):
//
//   1. A multi-megabyte *unquoted* attribute value. SingleFile writes a video's
//      `src=data:video/mp4;base64,…` unquoted; the regex alternation that reads
//      tags recurses once per scanned unit of such a value and overflows the
//      engine's stack. `openTags` is a scanner, and must walk it.
//   2. A nested document in `srcdoc`. A scanner that lets any `"` open a quoted
//      section swallows the nested `<iframe srcdoc=…>` and rewrites the
//      stylesheets of the *inner* document as if the outer page carried them.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  addAttr,
  attrOf,
  attrValue,
  bodySlots,
  contentSegments,
  editAttr,
  hasAttr,
  openTags,
  rawAttr,
  replaceTags,
  srcdocSpans,
  tagEnd,
  unquote,
} from '../pipeline/html.mjs';

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

  it('keeps a hyphenated name whole (the guarded dialect)', () => {
    expect([...openTags('<wistia-player media-id=abc>')][0].name).toBe('wistia-player');
  });

  it('the loose dialect splits that name on the hyphen instead', () => {
    // Harmless where the write pass reads it (its callbacks take the name and
    // ignore it) — but a future pass that reads `name` must pick its dialect.
    expect([...openTags('<wistia-player media-id=abc>', 'backtracking')][0]).toMatchObject({
      name: 'wistia',
      attrs: '-player media-id=abc',
    });
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

describe('the tag-end dialects', () => {
  // The captures write `style=background-image:url(&quot;/assets/x.png&quot;)`
  // unquoted. The careful rule (bodySlots) ends the tag at the `>`; a rule that
  // let a `"` open a quoted section ran past it into the next tag entirely.
  const escaped = '<div style=background-image:url(&quot;/a.png&quot;)><p>after</p>';

  it('the careful rule ends at the tag\'s own `>`', () => {
    expect(tagEnd(escaped, 0)).toBe(escaped.indexOf('>'));
  });

  it('the loose rule runs to the `>` after the next quote pair', () => {
    const loose = [...openTags(escaped, 'backtracking')][0];
    expect(loose.tag).toBe('<div style=background-image:url(&quot;/a.png&quot;)>');
  });
});

describe('bodySlots', () => {
  it('finds style and script elements in document order with their spans', () => {
    const html = '<style>a</style><p>x</p><script>b</script>';
    expect(bodySlots(html).map((s) => [s.kind, s.body])).toEqual([
      ['style', 'a'],
      ['script', 'b'],
    ]);
  });

  it('steps over comments, bogus markup, and whole SVG subtrees', () => {
    const html = '<!-- <style>no</style> --><!doctype html><svg><style>svg</style></svg><style>yes</style>';
    expect(bodySlots(html).map((s) => s.body)).toEqual(['yes']);
  });

  it('drops an unterminated body rather than rewriting to the document end', () => {
    expect(bodySlots('<style>never closed')).toEqual([]);
  });
});

describe('srcdocSpans', () => {
  it('returns the carrying tag and the escaped value', () => {
    const html = '<iframe srcdoc="&lt;style&gt;x&lt;/style&gt;" sandbox></iframe>';
    const [span] = srcdocSpans(html);
    expect(span.tag).toBe('<iframe srcdoc="&lt;style&gt;x&lt;/style&gt;" sandbox>');
    expect(span.value).toBe('&lt;style&gt;x&lt;/style&gt;');
  });

  it('ignores a srcdoc-looking string inside a script body it is handed', () => {
    expect(srcdocSpans('<div data-x=srcdoc=y>')).toHaveLength(0);
  });
});

describe('replaceTags / contentSegments', () => {
  it('rewrites open tags and leaves close tags alone', () => {
    // Only open tags carry attributes, so only they are ever rewritten; the
    // closing-tag restore is a separate write pass.
    expect(replaceTags('<div a=1>x</div>', (tag) => tag.replace('<div', '<section'))).toBe('<section a=1>x</div>');
  });

  it('keeps the skip zones out of the rewrite', () => {
    // The nested document (regression 2): the inner stylesheet is text inside
    // the outer tag's attribute, so the outer pass must not edit it.
    const html = '<style>.a{opacity:0}</style><!-- <div id=main-progress> --><iframe srcdoc="<style>.b{opacity:0}</style>"></iframe>';
    const touched = [];
    const out = contentSegments(html, (seg) =>
      replaceTags(seg, (tag, _name, attrs) => {
        const id = attrValue(attrs, 'id');
        if (id === 'main-progress') touched.push(id);
        return tag;
      }),
    );
    expect(out).toBe(html);
    expect(touched).toEqual([]);
  });

  it('still reaches an element inside an inline SVG (the scroll pass edits one)', () => {
    const html = '<svg><path id=main-progress style="stroke-dashoffset:100px"/></svg>';
    const out = contentSegments(html, (seg) =>
      replaceTags(seg, (tag, _name, attrs) =>
        attrValue(attrs, 'id') === 'main-progress'
          ? (editAttr(tag, 'style', () => 'stroke-dashoffset:0') ?? tag)
          : tag,
      ),
    );
    expect(out).toBe('<svg><path id=main-progress style="stroke-dashoffset:0"/></svg>');
  });
});

describe('the attribute dialects', () => {
  // The real corpus shape (145 occurrences in the frozen tree): a suffixed
  // attribute carrying the same name sits *before* the real one. The frozen
  // bytes were produced under the loose rule, so the loose rule is what stays —
  // and `attrOf` is the exact reader for callers that need the real attribute.
  const tag = '<div class=grecaptcha-badge data-style=bottomright style="width:256px">';
  const attrs = tag.slice('<div'.length, -1);

  it('attrValue reads the suffixed attribute (the loose `\\b` rule)', () => {
    expect(attrValue(attrs, 'style')).toBe('bottomright');
  });

  it('attrOf reads the attribute whose name is complete', () => {
    expect(attrOf(attrs, 'style')).toBe('width:256px');
  });

  it('rawAttr requires the name to start the tag or follow whitespace', () => {
    expect(rawAttr(tag, 'style')).toBe('"width:256px"');
    expect(unquote(rawAttr(tag, 'style'))).toBe('width:256px');
  });

  it('hasAttr is loose on the same rule, which the tree relies on', () => {
    expect(hasAttr(' data-split-title id=x', 'data-split-title')).toBe(true);
    expect(hasAttr(' data-split-title id=x', 'split-title')).toBe(true);
    expect(hasAttr(' id=x', 'data-split-title')).toBe(false);
  });
});

describe('editAttr / addAttr', () => {
  it('returns the tag untouched when the edit changes nothing', () => {
    expect(editAttr('<div a="1">', 'a', (v) => v)).toBe('<div a="1">');
  });

  it('returns null when the attribute is absent', () => {
    expect(editAttr('<div a="1">', 'b', (v) => v)).toBeNull();
  });

  it('drops the attribute whole when the edit returns empty', () => {
    expect(editAttr('<div a="1" b=2>', 'a', () => '')).toBe('<div b=2>');
  });

  it('rewrites in place, keeping the quoting style', () => {
    expect(editAttr('<div a=1>', 'a', () => '2')).toBe('<div a=2>');
    expect(editAttr("<div a='1'>", 'a', () => '2')).toBe("<div a='2'>");
  });

  it('adds an attribute before the closing `>`, slash-aware', () => {
    expect(addAttr('<img src=x>', 'alt=""')).toBe('<img src=x alt="">');
    expect(addAttr('<img src=x/>', 'alt=""')).toBe('<img src=x alt=""/>');
  });
});
