// The diff pass (ticket 11): old inventory vs fresh inventory → what changed,
// what needs re-capturing, and what route actions the removals drive. Pure:
// CSV rows in, report + scope + actions out.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  diffCsvPath,
  diffInventories,
  diffMdPath,
  formatDiffCsv,
  recaptureListPath,
  recaptureScope,
  renderDiffMarkdown,
  routeActions,
} from '../pipeline/inventory-diff.mjs';
import { parseInventoryCsv } from '../pipeline/inventory.mjs';

const row = (
  path: string,
  title: string,
  status: string,
  over: Partial<{ nav: string; type: string; redirect_target: string }> = {},
) => ({
  path,
  title,
  nav: over.nav ?? 'sitemap-only',
  type: over.type ?? 'post',
  status,
  redirect_target: over.redirect_target ?? '',
  url: `https://www.flocksafety.com${path}`,
});

const oldRows = [
  row('/', 'Flock Safety', '200', { type: 'index', nav: 'header+footer' }),
  row('/blog/stays', 'Stays', '200'),
  row('/blog/old-post', 'Old Post', '200'),
  row('/legal/privacy-notice', 'Privacy Policy', '200 (redirect)', { type: 'redirect', redirect_target: '/legal/privacy-policy' }),
  row('/pricing', 'Pricing', '200', { type: 'marketing', nav: 'header' }),
  row('/blog/comes-alive', 'Comes Alive', '404', { type: 'dead' }),
  row('/blog/now-redirect', 'Now Redirect', '200'),
  row('/blog/now-dead', 'Now Dead', '200'),
];

const newRows = [
  row('/', 'Flock Safety', '200', { type: 'index', nav: 'header+footer' }),
  row('/blog/stays', 'Stays Renamed', '200'),
  row('/blog/new-post', 'New Post', '200'),
  row('/pricing', 'Pricing', '200', { type: 'marketing', nav: 'header [not-in-sitemap]' }),
  row('/blog/comes-alive', 'Comes Alive', '200'),
  row('/blog/now-redirect', 'Now Redirect', '200 (redirect)', { type: 'redirect', redirect_target: '/blog/new-post' }),
  row('/blog/now-dead', 'Now Dead', '404', { type: 'dead' }),
];

describe('diffInventories', () => {
  const diff = diffInventories(oldRows, newRows);

  it('classifies added and removed paths', () => {
    expect(diff.added.map((e) => e.path)).toEqual(['/blog/new-post']);
    expect(diff.removed.map((e) => e.path)).toEqual(['/blog/old-post', '/legal/privacy-notice']);
  });

  it('classifies retitled, status-changed, and advisory nav drift', () => {
    expect(diff.retitled.map((e) => e.path)).toEqual(['/blog/stays']);
    expect(diff.statusChanged.map((e) => e.path)).toEqual(['/blog/comes-alive', '/blog/now-dead', '/blog/now-redirect']);
    expect(diff.navChanged.map((e) => e.path)).toEqual(['/pricing']);
    expect(diff.typeChanged.map((e) => e.path)).toEqual(['/blog/comes-alive', '/blog/now-dead', '/blog/now-redirect']);
  });

  it('counts every class and the unchanged rows', () => {
    expect(diff.counts).toMatchObject({
      old: oldRows.length,
      new: newRows.length,
      added: 1,
      removed: 2,
      retitled: 1,
      statusChanged: 3,
      navChanged: 1,
      typeChanged: 3,
      unchanged: 1,
    });
  });

  it('is empty for identical inventories', () => {
    const same = diffInventories(oldRows, oldRows);
    expect(same.added).toEqual([]);
    expect(same.removed).toEqual([]);
    expect(same.retitled).toEqual([]);
    expect(same.statusChanged).toEqual([]);
    expect(same.counts.unchanged).toBe(oldRows.length);
  });
});

describe('recaptureScope', () => {
  it('is exactly the added live pages, the retitled pages, and the newly-live pages', () => {
    const scope = recaptureScope(diffInventories(oldRows, newRows));
    expect(scope.map((r) => r.path)).toEqual(['/blog/comes-alive', '/blog/new-post', '/blog/stays']);
    // removed and now-dead pages are route actions, never captures
    expect(scope.map((r) => r.path)).not.toContain('/blog/now-dead');
    expect(scope.map((r) => r.path)).not.toContain('/blog/old-post');
  });

  it('does not re-capture an added redirect stub or dead root', () => {
    const old2 = [row('/a', 'A', '200')];
    const new2 = [row('/a', 'A', '200'), row('/b', 'Privacy', '200 (redirect)', { type: 'redirect', redirect_target: '/a' }), row('/c', 'Not Found', '404', { type: 'dead' })];
    expect(recaptureScope(diffInventories(old2, new2)).map((r) => r.path)).toEqual([]);
  });

  it('does not re-capture a status change that stays non-live', () => {
    const old2 = [row('/a', 'A', '200 (redirect)', { type: 'redirect', redirect_target: '/b' })];
    const new2 = [row('/a', 'A', '200 (redirect)', { type: 'redirect', redirect_target: '/c' })];
    expect(recaptureScope(diffInventories(old2, new2))).toEqual([]);
  });
});

describe('routeActions', () => {
  it('turns removals and demotions into drop-route / redirect actions', () => {
    expect(routeActions(diffInventories(oldRows, newRows))).toEqual([
      { path: '/blog/now-dead', action: 'drop-route', target: '', reason: 'live page now 404' },
      { path: '/blog/now-redirect', action: 'redirect', target: '/blog/new-post', reason: 'live page now redirects' },
      { path: '/blog/old-post', action: 'drop-route', target: '', reason: 'removed from live inventory' },
    ]);
  });

  it('leaves a removed redirect stub alone (it was never a Recreation route)', () => {
    const old2 = [row('/legal/privacy-notice', 'Privacy Policy', '200 (redirect)', { type: 'redirect', redirect_target: '/legal/privacy-policy' })];
    expect(routeActions(diffInventories(old2, []))).toEqual([]);
  });
});

describe('diff report', () => {
  const diff = diffInventories(oldRows, newRows);

  it('renders counts, the re-capture list, and the route actions', () => {
    const md = renderDiffMarkdown(diff, { oldLabel: '2026-09-09', newLabel: '2026-09-12' });
    expect(md).toContain('# Inventory diff — 2026-09-09 → 2026-09-12');
    expect(md).toContain('| added | 1 |');
    expect(md).toContain('| removed | 2 |');
    expect(md).toContain('/blog/new-post');
    expect(md).toContain('/blog/comes-alive');
    expect(md).toContain('/blog/stays');
    expect(md).toContain('/blog/now-redirect');
    expect(md).toContain('drop-route');
  });

  it('writes a CSV with the established columns and one row per change', () => {
    const csv = formatDiffCsv(diff);
    const rows = parseInventoryCsv(csv);
    expect(csv.split('\n')[0]).toBe('path,change,old_status,new_status,old_title,new_title,old_nav,new_nav,old_type,new_type,redirect_target,action');
    const byPath = new Map(rows.map((r) => [r.path, r]));
    expect(byPath.get('/blog/new-post')).toMatchObject({ change: 'added' });
    expect(byPath.get('/blog/stays')).toMatchObject({ change: 'retitled', new_title: 'Stays Renamed' });
    expect(byPath.get('/blog/comes-alive')).toMatchObject({ change: 'status-changed;type-changed', old_status: '404', new_status: '200' });
    expect(byPath.get('/blog/now-redirect')).toMatchObject({ change: 'status-changed;type-changed', redirect_target: '/blog/new-post', action: 'redirect' });
    expect(byPath.get('/pricing')).toMatchObject({ change: 'nav-changed' });
    expect(rows.length).toBe(new Set([...diff.added, ...diff.removed, ...diff.retitled, ...diff.statusChanged, ...diff.navChanged, ...diff.typeChanged].map((e) => e.path)).size);
  });
});

describe('diff output paths', () => {
  it('sits beside the fresh inventory', () => {
    expect(diffMdPath('2026-09-12')).toBe('research/inventory/2026-09-12-diff.md');
    expect(diffCsvPath('2026-09-12')).toBe('research/inventory/2026-09-12-diff.csv');
    expect(recaptureListPath('2026-09-12')).toBe('research/inventory/2026-09-12-recapture.txt');
  });
});

// A retitled row that also changed status appears once in the CSV (its classes
// join), so the row count is the union of the class sets, not their sum.
describe('diff CSV row count', () => {
  it('counts a multi-class path once', () => {
    const a = [row('/x', 'Title', '200')];
    const b = [row('/x', 'Retitled', '200 (redirect)', { type: 'redirect', redirect_target: '/y' })];
    const rows = parseInventoryCsv(formatDiffCsv(diffInventories(a, b))) as unknown as { change: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].change).toContain('retitled');
    expect(rows[0].change).toContain('status-changed');
  });
});
