// The Recreation's own injected bytes have one owner: the roster, each member's
// delivery form, the order a page actually carries, and whether the bytes the
// tree ships still match the source we maintain. Pure (the asset reader is
// injected), and shared by two tiers that cannot import each other's language
// (the plain-JS serving check and the TS seams), so it is pinned here rather
// than only through `npm run routes`.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LAYERS,
  maintainedSource,
  markedMembers,
  mirrorFindings,
  shippedSource,
} from '../pipeline/injected-layers.mjs';

/** A page carrying one marked member of each delivery form, in the tree's syntax. */
const PAGE = [
  '<html><head>',
  '<link rel=stylesheet href=/assets/aaaaaaaaaaaaaaaa.css data-flock-parody="motion">',
  '<script data-flock-parody="motion" src=/assets/bbbbbbbbbbbbbbbb.js>',
  '<link rel=stylesheet href=/assets/cccccccccccccccc.css data-flock-parody="interactions">',
  '<script data-flock-parody="interactions" src=/assets/dddddddddddddddd.js>',
  '<link rel=stylesheet href=/assets/eeeeeeeeeeeeeeee.css data-flock-parody="nav">',
  '<script data-flock-parody="nav" src=/assets/ffffffffffffffff.js>',
  '<link rel=stylesheet href=/assets/1111111111111111.css data-flock-parody="chat">',
  '<script data-flock-parody="chat" src=/assets/2222222222222222.js>',
  '<script data-flock-parody="story-hook" src=/assets/3333333333333333.js>',
  '<style data-flock-parody="scroll">\nhtml.fpm-scroll .marker { transform-box: fill-box; }\n</style>',
  '<script data-flock-parody="scroll" src=/assets/4444444444444444.js>',
  '</head><body></body></html>',
].join('\n');

/** The readers `mirrorFindings` takes: the shipped bytes and the maintained source. */
const readers = (shipped: Record<string, string>, maintained: Record<string, { bytes: string; origin: string }>) => ({
  shipped: (m: { name: string; kind: string }) => shipped[`${m.name}/${m.kind}`] ?? null,
  maintained: (name: string, kind: string) => maintained[`${name}/${kind}`] ?? null,
});

describe('the declared roster', () => {
  it('names thirteen marked members: six site-wide and seven page-scoped', () => {
    expect(LAYERS.map((l: { name: string }) => l.name)).toEqual([
      'motion',
      'interactions',
      'nav',
      'chat',
      'story-hook',
      'legibility',
      'scroll',
      'lottie-flock-dfr',
      'lottie-flock-freeform',
      'lottie-flock-os',
      'lottie-flock-safety-platform',
      'lottie-gunshot-detection',
      'lottie-video-cameras',
    ]);
    expect(LAYERS.filter((l: { scope: string }) => l.scope === 'site')).toHaveLength(6);
    const legibility = LAYERS.find((l: { name: string }) => l.name === 'legibility')!;
    expect(legibility.scope).toBe('page');
    expect(legibility.pages).toEqual(['/safe-cities']);
  });

  it('scopes each Lottie hero to its own product page, one route each', () => {
    const lottie = LAYERS.filter((l: { name: string }) => l.name.startsWith('lottie-'));
    expect(lottie).toHaveLength(6);
    for (const layer of lottie) {
      expect(layer.scope).toBe('page');
      expect(layer.pages ?? []).toHaveLength(1);
      expect(layer.pages?.[0]).toMatch(/^\/products\//);
      expect(layer.parts).toHaveLength(1);
      expect(layer.parts[0]).toMatchObject({ kind: 'js', delivery: 'asset' });
      expect(layer.parts[0].source).toBe(`pipeline/lottie/${layer.name.slice('lottie-'.length)}.runtime.js`);
    }
  });

  it('gives every member a delivery form, and a source except the page patch', () => {
    for (const layer of LAYERS) {
      expect(layer.parts.length).toBeGreaterThan(0);
      for (const part of layer.parts) {
        expect(['css', 'js']).toContain(part.kind);
        expect(['asset', 'inline']).toContain(part.delivery);
        // the page-scoped legibility patch is sourced from the config map
        if (layer.name !== 'legibility') expect(part.source).toMatch(/^pipeline\//);
      }
    }
  });

  it('records the order the tree ships: css before js, legibility and scroll before the Lottie heroes', () => {
    const flat = LAYERS.flatMap((l: { name: string; parts: { kind: string }[] }) =>
      l.parts.map((p: { kind: string }) => `${l.name}/${p.kind}`),
    );
    expect(flat).toEqual([
      'motion/css',
      'motion/js',
      'interactions/css',
      'interactions/js',
      'nav/css',
      'nav/js',
      'chat/css',
      'chat/js',
      'story-hook/js',
      'legibility/css',
      'scroll/css',
      'scroll/js',
      'lottie-flock-dfr/js',
      'lottie-flock-freeform/js',
      'lottie-flock-os/js',
      'lottie-flock-safety-platform/js',
      'lottie-gunshot-detection/js',
      'lottie-video-cameras/js',
    ]);
  });
});

describe('markedMembers', () => {
  it('reads the marked members out of a page in document order', () => {
    expect(markedMembers(PAGE).map((m: { name: string; kind: string }) => `${m.name}/${m.kind}`)).toEqual([
      'motion/css',
      'motion/js',
      'interactions/css',
      'interactions/js',
      'nav/css',
      'nav/js',
      'chat/css',
      'chat/js',
      'story-hook/js',
      'scroll/css',
      'scroll/js',
    ]);
  });

  it('resolves an asset reference to the name under /assets', () => {
    expect(markedMembers(PAGE)[0]).toMatchObject({
      name: 'motion',
      kind: 'css',
      delivery: 'asset',
      ref: 'aaaaaaaaaaaaaaaa.css',
    });
  });

  it('keeps an inline body as the member bytes', () => {
    const scroll = markedMembers(PAGE).find((m: { name: string; kind: string }) => m.name === 'scroll' && m.kind === 'css')!;
    expect(scroll.delivery).toBe('inline');
    expect(scroll.body).toContain('transform-box');
  });

  it('reads no member out of an unmarked page', () => {
    expect(markedMembers('<html><head><style>body{}</style></head></html>')).toEqual([]);
  });
});

describe('mirrorFindings', () => {
  it('reports nothing when every page member matches its source', () => {
    const members = markedMembers(PAGE);
    const same = Object.fromEntries(
      members.map((m: { name: string; kind: string; body?: string }) => [`${m.name}/${m.kind}`, m.body ?? `body of ${m.name}`]),
    );
    const sources = Object.fromEntries(
      Object.keys(same).map((k) => [k, { bytes: same[k], origin: `pipeline/${k}` }]),
    );
    expect(mirrorFindings({ page: '/', members, ...readers(same, sources) })).toEqual({ failures: [], notes: [] });
  });

  it('fails a declared site member that the page does not carry', () => {
    const members = markedMembers(PAGE).filter((m: { name: string }) => m.name !== 'nav');
    const { failures } = mirrorFindings({ page: '/', members, ...readers({}, {}) });
    expect(failures).toContain('missing member: / does not carry nav/css');
  });

  it('fails a marked member the roster does not declare', () => {
    const members = markedMembers(PAGE).concat([
      { name: 'not-a-layer', kind: 'js', delivery: 'asset', ref: '9999999999999999.js' },
    ]);
    const { failures } = mirrorFindings({ page: '/', members, ...readers({}, {}) });
    expect(failures.some((f: string) => f.includes('undeclared member') && f.includes('not-a-layer'))).toBe(true);
  });

  it('fails a page-scoped member on a page it does not belong to', () => {
    const members = markedMembers(PAGE).concat([
      { name: 'legibility', kind: 'css', delivery: 'inline', body: '.x{color:#fff}' },
    ]);
    const { failures } = mirrorFindings({ page: '/', members, ...readers({}, {}) });
    expect(failures.some((f: string) => f.includes('out of scope') && f.includes('legibility'))).toBe(true);
  });

  it('fails a member delivered in the wrong form', () => {
    const wrong = { name: 'motion', kind: 'css', delivery: 'inline', body: 'x' } as const;
    const members = markedMembers(PAGE)
      .filter((m: { name: string; kind: string }) => !(m.name === 'motion' && m.kind === 'css'))
      .concat([wrong]);
    const { failures } = mirrorFindings({ page: '/', members, ...readers({}, {}) });
    expect(failures.some((f: string) => f.includes('motion/css') && f.includes('inline'))).toBe(true);
  });

  it('fails a member whose shipped bytes diverge from its source in code', () => {
    const members = markedMembers(PAGE);
    const same = Object.fromEntries(members.map((m: { name: string; kind: string; body?: string }) => [`${m.name}/${m.kind}`, 'shared body']));
    const drifted = { ...same, 'scroll/js': 'a different body entirely' };
    const sources = Object.fromEntries(Object.keys(same).map((k) => [k, { bytes: same[k], origin: `pipeline/${k}` }]));
    const { failures } = mirrorFindings({ page: '/', members, ...readers(drifted, sources) });
    expect(failures).toEqual([expect.stringContaining('code drift: scroll/js')]);
  });

  it('notes a member that differs only in comments, and does not fail it', () => {
    const members = markedMembers(PAGE);
    const same = Object.fromEntries(members.map((m: { name: string; kind: string; body?: string }) => [`${m.name}/${m.kind}`, 'var a = 1;']));
    const shipped = { ...same, 'nav/js': '/* a newer comment */\nvar a = 1;' };
    const sources = Object.fromEntries(Object.keys(same).map((k) => [k, { bytes: same[k], origin: `pipeline/${k}` }]));
    const { failures, notes } = mirrorFindings({ page: '/', members, ...readers(shipped, sources) });
    expect(failures).toEqual([]);
    expect(notes).toEqual([expect.stringContaining('prose drift: nav/js')]);
  });

  it('notes a page whose members are out of the roster order without failing it', () => {
    const members = markedMembers(PAGE);
    const swapped = [...members];
    const i = swapped.findIndex((m: { name: string; kind: string }) => m.name === 'nav' && m.kind === 'css');
    const j = swapped.findIndex((m: { name: string; kind: string }) => m.name === 'nav' && m.kind === 'js');
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    const same = Object.fromEntries(members.map((m: { name: string; kind: string; body?: string }) => [`${m.name}/${m.kind}`, 'body']));
    const sources = Object.fromEntries(Object.keys(same).map((k) => [k, { bytes: 'body', origin: `pipeline/${k}` }]));
    const { failures, notes } = mirrorFindings({ page: '/', members: swapped, ...readers(same, sources) });
    expect(failures).toEqual([]);
    expect(notes.some((n: string) => n.includes('order'))).toBe(true);
  });

  it('fails a member with no maintained source', () => {
    const members = markedMembers(PAGE);
    const { failures } = mirrorFindings({ page: '/', members, ...readers({}, {}) });
    expect(failures.some((f: string) => f.includes('no source'))).toBe(true);
  });
});

describe('against the committed tree', () => {
  const pageFile = (page: string) =>
    path.join('served', page === '/' ? 'index.html' : `${page.replace(/^\//, '')}.html`);

  const real = (page: string) =>
    mirrorFindings({
      page,
      members: markedMembers(readFileSync(pageFile(page), 'utf8')),
      shipped: (m: { ref?: string; body?: string }) => m.body ?? shippedSource('served', m.ref as string),
      // the page argument is the seam: a page-scoped patch is looked up by the
      // page the mirror is reporting on, which must be the one mirrorFindings
      // passes, not the one this helper closed over
      maintained: (name: string, kind: string, pageArg: string) => maintainedSource(name, kind, pageArg),
    });

  it('finds the homepage carrying all six site-wide members and drifting nowhere in code', () => {
    const { failures } = real('/');
    expect(failures).toEqual([]);
  });

  it('finds safe-cities carrying all seven, including the page patch', () => {
    const { failures } = real('/safe-cities');
    expect(failures).toEqual([]);
  });

  it('finds a product page carrying its Lottie hero after the site-wide members', () => {
    const { failures, notes } = real('/products/flock-dfr');
    expect(failures).toEqual([]);
    // the Lottie hero adds no note of its own — only the six site-wide prose drifts
    expect(notes).toHaveLength(6);
    expect(notes.some((n: string) => n.includes('lottie'))).toBe(false);
  });

  it('reports the comment-only drift the tree cannot rebuild away, as notes', () => {
    const { notes } = real('/');
    expect(notes.some((n: string) => n.includes('prose drift'))).toBe(true);
  });
});
