// Ticket 03's seam: the **copy projection** — the prose the Recreation
// reproduces — and the live-versus-served comparison built on it. Both are pure
// functions of a page's HTML, so the whole of ticket 03 is pinned here: the
// projection's rules, the diff it feeds, the per-page findings and the run's
// counts, and the committed tree fed in as both sides.
//
// The network edge (`regression/upstream-watch-cli.mjs`) is hand-run and
// deliberately outside the suite. The measured live-versus-served delta is
// ticket 03's evidence and lives on the ticket, not in `npm test`.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copyDiff, copyDigest, copyFinding, copyReport, copyRuns, PROSE_ELEMENTS } from '../regression/upstream-copy.mjs';

const SERVED_DIR = new URL('../served/', import.meta.url);

/** Every HTML file the committed tree serves, in path order. */
const servedPages = readdirSync(SERVED_DIR, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('.html'))
  .map((name) => ({ name, file: new URL(name, SERVED_DIR) }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

describe('copyRuns — the projection is a pure function of HTML', () => {
  it('declares the element set it treats as prose, and applies it', () => {
    for (const name of PROSE_ELEMENTS) expect(copyRuns(`<${name}>text</${name}>`)).toEqual(['text']);
    // A bare div or span is layout, not prose.
    expect(copyRuns('<div>layout</div><span>inline</span>')).toEqual([]);
  });

  it('reads headings, paragraphs, list items and blockquotes in document order', () => {
    const html = `
      <h1>Hello &amp; welcome</h1>
      <p>  Line
         break </p>
      <ul><li>First</li><li>Second</li></ul>
      <blockquote>Quoted&nbsp;text</blockquote>`;
    expect(copyRuns(html)).toEqual(['Hello & welcome', 'Line break', 'First', 'Second', 'Quoted text']);
  });

  it('normalizes entities and whitespace the way a reader sees them', () => {
    // The same prose, written four ways: named entity, decimal, hex, and a
    // literal glyph. All four must project alike.
    expect(copyRuns('<p>a &amp; b</p>')).toEqual(['a & b']);
    expect(copyRuns('<p>a &#38; b</p>')).toEqual(['a & b']);
    expect(copyRuns('<p>a &#x26; b</p>')).toEqual(['a & b']);
    expect(copyRuns('<p>a\t \n b</p>')).toEqual(['a b']);
    expect(copyRuns('<p>a&nbsp;b</p>')).toEqual(['a b']);
  });

  it('does not read bare layout text, scripts, styles, svg or templates', () => {
    const html = `
      <div>nav chrome, not prose</div>
      <script>var x = '<p>fake</p>';</script>
      <style>p { color: red }</style>
      <svg><text>icon label</text></svg>
      <template><p>inert</p></template>
      <p>real</p>`;
    expect(copyRuns(html)).toEqual(['real']);
  });

  it('takes the outermost prose element once, not its nested prose again', () => {
    // A list item whose text is wrapped in a div (the nav's shape), and a
    // blockquote of paragraphs, are one run each.
    expect(copyRuns('<ul><li><a href="/x"><div>License Plate Readers</div></a></li></ul>')).toEqual(['License Plate Readers']);
    expect(copyRuns('<blockquote><p>One</p><p>Two</p></blockquote>')).toEqual(['One Two']);
  });

  it('projects the same run from closed and unclosed list items', () => {
    // The Capture leaves `<li>` unclosed where Webflow closes it; the tree
    // constructor applies the same implied end tags, so both serialize alike.
    const closed = '<ul><li><a><div>Audio Detection</div></a></li><li><a><div>Cameras</div></a></li></ul>';
    const unclosed = '<ul><li><a><div>Audio Detection</div></a><li><a><div>Cameras</div></a></ul>';
    expect(copyRuns(unclosed)).toEqual(copyRuns(closed));
    expect(copyRuns(unclosed)).toEqual(['Audio Detection', 'Cameras']);
  });

  it('projects the same run from a split-word heading and a plain one', () => {
    // The Capture froze GSAP's split words as child divs; live ships the text.
    const split = '<h2 aria-label="Public safety works better together"><div class=word>Public</div><div class=word>safety</div><div class=word>works better together</div></h2>';
    const plain = '<h2>Public safety works better together</h2>';
    expect(copyRuns(split)).toEqual(copyRuns(plain));
    expect(copyRuns(split)).toEqual(['Public safety works better together']);
  });

  it('does not read a script-generated region, whose capture-time fill a raw fetch cannot reproduce', () => {
    // The measured cases: Webflow's table of contents is filled at runtime, and
    // Finsweet's CMS filter empty state moves relative to the list at runtime.
    // The Capture froze both populated and placed; the raw live page carries the
    // template and the pre-script order. Neither read is copy, or the widget is
    // reported as drift on every page that carries it.
    const tocPopulated = '<aside data-toc><nav><ul><li><span>One</span></li><li><span>Two</span></li></ul></nav></aside><p>Body</p>';
    const tocTemplate = '<aside data-toc><nav><ul><li><span>Introduction</span></li></ul></nav></aside><p>Body</p>';
    expect(copyRuns(tocPopulated)).toEqual(['Body']);
    expect(copyRuns(tocTemplate)).toEqual(['Body']);
    expect(copyDiff(copyRuns(tocPopulated), copyRuns(tocTemplate))).toEqual([]);

    const emptyBefore = '<div fs-cmsfilter-element="empty"><h4>No items found</h4></div><ul><li>Post one</li></ul>';
    const emptyAfter = '<ul><li>Post one</li></ul><div fs-cmsfilter-element="empty"><h4>No items found</h4></div>';
    expect(copyRuns(emptyBefore)).toEqual(['Post one']);
    expect(copyRuns(emptyAfter)).toEqual(['Post one']);

    // A template the page's script fills: placeholder in raw HTML, real content
    // in the Capture. The ATS-linked jobs list, the event speaker popup, and the
    // Wistia player's own transcript are the three the measurement found.
    const jobsTemplate = '<div class=jobs-card><h4 data-job-name>Job Title</h4></div>';
    const jobsPopulated = '<div class=jobs-card><h4 data-job-name>Product Deployment Specialist</h4></div>';
    expect(copyRuns(jobsTemplate)).toEqual([]);
    expect(copyRuns(jobsPopulated)).toEqual([]);
    expect(copyRuns('<div data-user="content"><p>Lorem ipsum</p></div><p>Real</p>')).toEqual(['Real']);
    expect(copyRuns('<wistia-player><p>Preloaded transcript</p></wistia-player><p>Real</p>')).toEqual(['Real']);
  });

  it('collapses zero-width characters, the corpus’s empty paragraphs', () => {
    expect(copyRuns('<p>‍</p><p>Real</p>')).toEqual(['Real']);
    expect(copyRuns('<p>One‍</p>')).toEqual(copyRuns('<p>One</p>'));
  });
});

describe('copyDiff — the differing runs, not a page-level boolean', () => {
  it('is empty for the same runs', () => {
    expect(copyDiff(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(copyDiff([], [])).toEqual([]);
  });

  it('reports a changed paragraph as the served run and the live run', () => {
    expect(copyDiff(['intro', 'old', 'outro'], ['intro', 'new', 'outro'])).toEqual([{ served: ['old'], live: ['new'] }]);
  });

  it('reports an insertion as one hunk, without shifting the runs after it', () => {
    expect(copyDiff(['a', 'b'], ['a', 'inserted', 'b'])).toEqual([{ served: [], live: ['inserted'] }]);
    expect(copyDiff(['a', 'b'], ['a'])).toEqual([{ served: ['b'], live: [] }]);
  });

  it('groups changes that touch into hunks and keeps distant ones apart', () => {
    expect(copyDiff(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'D'])).toEqual([
      { served: ['b'], live: ['B'] },
      { served: ['d'], live: ['D'] },
    ]);
  });
});

describe('copyFinding — one page, naming the path and the differing runs', () => {
  const served = '<h1>Welcome</h1><p>The quick brown fox.</p><p>Second paragraph.</p>';
  const live = served.replace('The quick brown fox.', 'The quick red fox.');

  it('reports the path and the one changed run', () => {
    expect(copyFinding('/a', served, live)).toEqual({
      path: '/a',
      hunks: [{ served: ['The quick brown fox.'], live: ['The quick red fox.'] }],
    });
  });

  it('reports nothing when the two projections agree', () => {
    expect(copyFinding('/a', served, served)).toBeNull();
  });
});

describe('copyReport — the run counts and the baseline digests', () => {
  const served = '<h1>Welcome</h1><p>The quick brown fox.</p>';
  const changed = served.replace('The quick brown fox.', 'The quick red fox.');

  it('reports how many pages were compared and how many differed', () => {
    const report = copyReport([
      { path: '/a', served, live: changed },
      { path: '/b', served, live: served },
      { path: '/c', served, live: served },
    ]);
    expect(report.compared).toBe(3);
    expect(report.differed).toBe(1);
    expect(report.findings).toEqual([{ path: '/a', hunks: [{ served: ['The quick brown fox.'], live: ['The quick red fox.'] }] }]);
  });

  it('digests each live page’s projection, and the digest is stable and change-sensitive', () => {
    const report = copyReport([{ path: '/a', served, live: served }]);
    expect(report.digests['/a']).toBe(copyDigest(copyRuns(served)));
    // A rewrite of an attribute (a link target) does not move the prose digest...
    expect(copyDigest(copyRuns('<p><a href="/x">Same words</a></p>'))).toBe(copyDigest(copyRuns('<p><a href="/y">Same words</a></p>')));
    // ...but a paragraph edit does, and a digest is a short stable string.
    expect(copyDigest(copyRuns(changed))).not.toBe(report.digests['/a']);
    expect(report.digests['/a']).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('the committed tree fed in as both sides', () => {
  it('is the steady state: every served page projects to itself with no finding', () => {
    const pages = servedPages.map((page) => {
      const html = readFileSync(page.file, 'utf8');
      return { path: page.name, served: html, live: html };
    });
    const report = copyReport(pages);
    expect(report.compared).toBe(servedPages.length);
    expect(report.differed).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('projects prose from every served page — no page is a silent blank', () => {
    for (const page of servedPages) {
      expect(copyRuns(readFileSync(page.file, 'utf8')).length, page.name).toBeGreaterThan(0);
    }
  });
});
