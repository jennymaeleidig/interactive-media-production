// The mutation-log summary projection (pipeline/summary.mjs). This file pins the
// compatibility surface build-summary.json is read through — the exact top-level
// and group key order — and proves the acceptance claim that a new whole-site
// metric is one row in the table, not a new reduce in build.mjs.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SUMMARY_GROUPS,
  assetTotals,
  bodyTotals,
  bytesOnDisk,
  project,
  projectGroups,
  render,
} from '../pipeline/summary.mjs';

/** One served page's mutation-log slice, plus one that failed to build. */
const ENTRIES = [
  {
    page: '/',
    chatLauncher: true,
    originalUrls: 2,
    deduped: { style: 1, script: 2, kept: 3, files: 1, bytesIn: 100, bytesOut: 40 },
    assets: { references: 4 },
    embeds: {
      live: 2, srcdoc: 1, element: 0, component: 0, frame: 1,
      popover: 0, dead: 0, youtube: 0, vidzflow: 0, unreachable: 0,
    },
  },
  {
    page: '/b',
    chatLauncher: false,
    originalUrls: 0,
    deduped: { style: 0, script: 0, kept: 1, files: 0, bytesIn: 50, bytesOut: 50 },
    assets: { references: 0 },
    embeds: {
      live: 0, srcdoc: 0, element: 0, component: 0, frame: 0,
      popover: 0, dead: 1, youtube: 0, vidzflow: 0, unreachable: 0,
    },
  },
  { page: '/missing', error: 'ENOENT' },
];

let assetDir: string;
let run: {
  captureRun: string;
  requested: number;
  dropped: string[];
  redirects: { count: number; invalid: string[]; dangling: string[] };
  deadRoots: string[];
  authGated: string[];
  assetDir: string;
  assetNames: string[];
  bodyFiles: Set<string>;
};

beforeAll(() => {
  assetDir = mkdtempSync(path.join(tmpdir(), 'summary-'));
  writeFileSync(path.join(assetDir, 'aa.css'), '0123456789'); // 10 bytes
  writeFileSync(path.join(assetDir, 'bb.js'), '01234567890123456789'); // 20 bytes
  writeFileSync(path.join(assetDir, 'cc.css'), '01234'); // 5 bytes
  run = {
    captureRun: 'test/fixtures/capture-run',
    requested: 4,
    dropped: ['/form-test'],
    redirects: { count: 1, invalid: ['a → b'], dangling: ['c → d'] },
    deadRoots: ['/ebooks'],
    authGated: ['/events'],
    assetDir,
    assetNames: ['aa.css', 'bb.js'],
    bodyFiles: new Set(['cc.css']),
  };
});

afterAll(() => {
  rmSync(assetDir, { recursive: true, force: true });
});

describe('summary projection', () => {
  it('folds the log into the whole-site counts', () => {
    const summary = project(ENTRIES, run);
    expect(summary).toMatchObject({
      captureRun: 'test/fixtures/capture-run',
      requested: 4,
      served: 2,
      dropped: ['/form-test'],
      errors: ['/missing'],
      deadRoots: ['/ebooks'],
      authGated: ['/events'],
      chat: { mounted: 1, absent: 1 },
      originalUrls: 2,
      bodies: { styles: 1, scripts: 2, kept: 4, files: 1, bytes: 5, bytesIn: 150, bytesOut: 90 },
      assets: { references: 4, distinct: 2, bytes: 30 },
    });
    expect(summary.embeds).toEqual({
      live: 2, pages: 1, srcdoc: 1, element: 0, component: 0, frame: 1,
      popover: 0, dead: 1, youtube: 0, vidzflow: 0, unreachable: 0,
    });
  });

  it('keeps the exact key order build-summary.json is read through', () => {
    const summary = project(ENTRIES, run);
    expect(Object.keys(summary)).toEqual([
      'captureRun', 'requested', 'served', 'dropped', 'errors', 'redirects',
      'deadRoots', 'authGated', 'chat', 'originalUrls', 'bodies', 'assets', 'embeds',
    ]);
    expect(Object.keys(summary.bodies)).toEqual([
      'styles', 'scripts', 'kept', 'files', 'bytes', 'bytesIn', 'bytesOut',
    ]);
    expect(Object.keys(summary.assets)).toEqual(['references', 'distinct', 'bytes']);
    expect(Object.keys(summary.chat)).toEqual(['mounted', 'absent']);
  });

  it('is a pure fold: the run facts the log cannot carry come through unchanged', () => {
    const summary = project(ENTRIES, run);
    expect(summary.redirects).toEqual({ count: 1, invalid: ['a → b'], dangling: ['c → d'] });
    // the served/absent counts are the served entries, not the requested list
    expect(summary.served + summary.dropped.length + summary.errors.length).toBe(summary.requested);
  });

  it('declares a new metric in one row (no projection change)', () => {
    const extended = [
      ...SUMMARY_GROUPS,
      { group: 'custom', metrics: [{ key: 'heroes', from: 'embeds.live', kind: 'sum' }] },
    ];
    // the generic fold core takes any table; `project` itself is fixed to
    // SUMMARY_GROUPS, so no test-only parameter leaks into production
    const slices = projectGroups(
      ENTRIES.filter((e) => !e.error) as never,
      extended as never,
    ) as unknown as { custom: { heroes: number }; embeds: { live: number } };
    // the new row folds the existing slice with no code change...
    expect(slices.custom.heroes).toBe(2);
    // ...and the declared groups are untouched
    expect(slices.embeds.live).toBe(2);
  });
});

describe('summary helpers', () => {
  it('sums on-disk bytes for a set of content-addressed names', () => {
    expect(bytesOnDisk(assetDir, ['aa.css', 'bb.js'])).toBe(30);
  });

  it('builds the ADR-0002 and ADR-0003 groups in build-summary key order', () => {
    const bodies = bodyTotals(assetDir, new Set(['cc.css']), {
      styles: 1, scripts: 2, kept: 3, bytesIn: 100, bytesOut: 40,
    });
    expect(bodies).toEqual({ styles: 1, scripts: 2, kept: 3, files: 1, bytes: 5, bytesIn: 100, bytesOut: 40 });
    expect(Object.keys(bodies)).toEqual(['styles', 'scripts', 'kept', 'files', 'bytes', 'bytesIn', 'bytesOut']);
    const assets = assetTotals(assetDir, ['aa.css', 'bb.js'], 4);
    expect(assets).toEqual({ references: 4, distinct: 2, bytes: 30 });
  });
});

describe('summary render', () => {
  it('renders the CLI lines the build prints', () => {
    const lines = render(project(ENTRIES, run));
    expect(lines[0]).toBe('build summary: 2 served + 1 dropped = 4 requested (1 error(s): /missing)');
    expect(lines[1]).toBe('route classes: 1 redirect(s) → 301, 1 dead root(s) 404, 1 auth-gated 404');
    expect(lines[2]).toBe('chat census: 1 page(s) mounted the launcher, 1 did not');
    expect(lines[3]).toContain('embeds: 2 live player frame(s) on 1 page(s)');
    expect(lines[4]).toBe('capture url bookkeeping: 2 data-sf-original-* attribute(s) dropped from served bytes');
    expect(lines[5]).toBe('assets: 4 inlined reference(s) → 2 content-addressed file(s), 0MB decoded');
    expect(lines[6]).toContain('bodies: 1 style + 2 script body(ies) → 1 file(s)');
    // warning lines follow, one per invalid/dangling redirect
    expect(lines.slice(7)).toEqual(['⚠ redirect: a → b', '⚠ redirect: c → d']);
  });
});
