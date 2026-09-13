// The scoped re-capture driver (ticket 11): inventory + scope → a fresh dated
// run folder with a capture list, an uncaptured manifest, per-page status, and
// a title repair pass. The Docker walk is injected, so the driver's bookkeeping
// is tested without touching the network or the daemon.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertFreshRunDir,
  buildCaptureList,
  buildUncapturedManifest,
  captureRunDir,
  dockerCapture,
  fullStatusRows,
  mergeStatusRows,
  repairTitle,
  runRecapture,
  singleFileArgs,
  urlToRel,
} from '../pipeline/recapture.mjs';

const row = (path: string, status: string, over: Partial<{ title: string; type: string; redirect_target: string }> = {}) => ({
  path,
  title: over.title ?? path,
  nav: 'sitemap-only',
  type: over.type ?? 'post',
  status,
  redirect_target: over.redirect_target ?? '',
  url: `https://www.flocksafety.com${path}`,
});

const tmpDirs: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recapture-test-'));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('run folder', () => {
  it('is dated under the capture runs, not the inventory directory', () => {
    expect(captureRunDir('2026-09-12')).toBe('.scratch/flock-parody/research/flocksafety/2026-09-12');
  });

  it('refuses a run folder that already exists, so earlier runs are never overwritten', () => {
    const dir = tmp();
    expect(() => assertFreshRunDir(dir)).not.toThrow();
    fs.writeFileSync(path.join(dir, 'index.html'), 'x');
    expect(() => assertFreshRunDir(dir)).toThrow(/already exists/);
  });
});

describe('URL → capture path', () => {
  it.each([
    ['https://www.flocksafety.com/', 'index.html'],
    ['https://www.flocksafety.com/blog', 'blog.html'],
    ['https://www.flocksafety.com/blog/a-post', 'blog/a-post.html'],
    ['https://www.flocksafety.com/trust/', 'trust.html'],
  ])('%s → %s', (url, rel) => {
    expect(urlToRel(url)).toBe(rel);
  });
});

describe('SingleFile flags', () => {
  it('keeps hidden elements and unused styles — the corrected defaults (ticket 15)', () => {
    const args = singleFileArgs('https://www.flocksafety.com/a', 'a.html');
    expect(args).toContain('--remove-hidden-elements=false');
    expect(args).toContain('--remove-unused-styles=false');
    expect(args.at(-2)).toBe('https://www.flocksafety.com/a');
    expect(args.at(-1)).toBe('/data/a.html');
  });

  it('embeds videos instead of blocking them (ticket 12)', () => {
    const args = singleFileArgs('https://www.flocksafety.com/a', 'a.html');
    expect(args).toContain('--block-videos=false');
    const i = args.indexOf('--blocked-url-pattern');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('r2\\.vidzflow\\.com');
  });

  it('records the URL of every frame it empties (ticket 12, blog videos)', () => {
    // SingleFile strips a frame's `src` and only re-adds it when it can inline
    // the frame document; a cross-origin player frame is left empty, so without
    // this flag the Capture loses the only record of what the frame pointed at.
    const args = singleFileArgs('https://www.flocksafety.com/a', 'a.html');
    expect(args).toContain('--save-original-urls');
  });
});

describe('capture list', () => {
  const rows = [row('/', '200'), row('/blog/a', '200'), row('/gone', '404', { type: 'dead' }), row('/events/test-event', '401', { type: 'auth-gated' })];

  it('captures every live page when no scope is given', () => {
    expect(buildCaptureList(rows)).toEqual(['https://www.flocksafety.com/', 'https://www.flocksafety.com/blog/a']);
  });

  it('captures exactly the scoped live paths, in the fresh-inventory order', () => {
    expect(buildCaptureList(rows, ['/blog/a', '/gone', '/blog/a'])).toEqual(['https://www.flocksafety.com/blog/a']);
  });
});

describe('uncaptured manifest', () => {
  it('routes redirect stubs, dead roots, and auth-gated stubs, and flags unreachable pages', () => {
    const rows = [
      row('/', '200'),
      row('/legal/privacy-notice', '200 (redirect)', { type: 'redirect', redirect_target: '/legal/privacy-policy' }),
      row('/ebooks', '404', { type: 'dead' }),
      row('/events/test-event', '401', { type: 'auth-gated' }),
      row('/flaky', 'unreachable'),
    ];
    const manifest = buildUncapturedManifest(rows);
    expect(manifest.unreachable).toEqual(['/flaky']);
    expect(manifest.rows).toEqual([
      { path: '/ebooks', url: 'https://www.flocksafety.com/ebooks', type: 'dead', status: '404', redirect_target: '', capture: 'dead-not-captured' },
      { path: '/events/test-event', url: 'https://www.flocksafety.com/events/test-event', type: 'auth-gated', status: '401', redirect_target: '', capture: 'auth-gated' },
      { path: '/legal/privacy-notice', url: 'https://www.flocksafety.com/legal/privacy-notice', type: 'redirect', status: '200 (redirect)', redirect_target: '/legal/privacy-policy', capture: 'redirect-stub' },
    ]);
    expect(manifest.csv.split('\n')[0]).toBe('path,url,type,status,redirect_target,capture');
  });
});

describe('status rows', () => {
  it('merges retries by URL, last row winning, preserving first-seen order', () => {
    const merged = mergeStatusRows(
      [
        'url,rel,exit,bytes,secs,verdict',
        '/blog/a,blog/a.html,1,0,3.0,failed',
        '/blog/b,blog/b.html,0,2000,4.0,saved',
      ].join('\n'),
      [
        { url: '/blog/a', rel: 'blog/a.html', exit: 0, bytes: 3000, secs: 5.0, verdict: 'saved' },
        { url: '/blog/c', rel: 'blog/c.html', exit: 0, bytes: 4000, secs: 6.0, verdict: 'saved' },
      ],
    );
    expect(merged.map((r) => r.url)).toEqual(['/blog/a', '/blog/b', '/blog/c']);
    expect(merged[0].verdict).toBe('saved');
  });
});

describe('title repair', () => {
  it('restores the inventory title when the live script swapped it', () => {
    const { html, changed } = repairTitle('<head><title>Message from Flock Safety</title></head>', 'Pricing');
    expect(html).toBe('<head><title>Pricing</title></head>');
    expect(changed).toBe(true);
  });

  it('is a no-op when the title already matches, and escapes markup', () => {
    expect(repairTitle('<title>Pricing</title>', 'Pricing').changed).toBe(false);
    expect(repairTitle('<title>x</title>', 'A & B <C>').html).toBe('<title>A &amp; B &lt;C&gt;</title>');
  });

  it('reports no change when the capture has no title at all', () => {
    expect(repairTitle('<html></html>', 'Pricing')).toEqual({ html: '<html></html>', changed: false });
  });
});

describe('full status', () => {
  it('keeps captured rows and marks live pages outside the scope skipped-stale-capture, in inventory order', () => {
    const rows = [row('/', '200'), row('/blog/a', '200'), row('/blog/b', '200'), row('/gone', '404', { type: 'dead' })];
    const captured = [{ url: 'https://www.flocksafety.com/', rel: 'index.html', exit: 0, bytes: 10, secs: 1, verdict: 'saved' }];
    expect(fullStatusRows(rows, captured)).toEqual([
      { url: 'https://www.flocksafety.com/', rel: 'index.html', exit: 0, bytes: 10, secs: 1, verdict: 'saved' },
      { url: 'https://www.flocksafety.com/blog/a', rel: 'blog/a.html', exit: 0, bytes: 0, secs: 0, verdict: 'skipped-stale-capture' },
      { url: 'https://www.flocksafety.com/blog/b', rel: 'blog/b.html', exit: 0, bytes: 0, secs: 0, verdict: 'skipped-stale-capture' },
    ]);
  });
});

describe('runRecapture', () => {
  it('writes a fresh run folder: list, manifest, status, and title repairs', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' }), row('/blog/a', '200', { title: 'Post A' }), row('/gone', '404', { type: 'dead' })];
    const written: string[] = [];
    const capture = async (url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `<html><head><title>Message from Flock Safety</title></head></html>`);
      written.push(url);
      return { exit: 0, bytes: 42, secs: 1.5, verdict: 'saved' as const };
    };
    const result = await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, scope: ['/', '/blog/a'], capture, concurrency: 2 });

    expect(written.sort()).toEqual(['https://www.flocksafety.com/', 'https://www.flocksafety.com/blog/a']);
    expect(result.saved).toBe(2);
    expect(fs.readFileSync(path.join(dir, 'capture-list.txt'), 'utf8')).toBe('https://www.flocksafety.com/\nhttps://www.flocksafety.com/blog/a\n');
    expect(fs.readFileSync(path.join(dir, 'manifest-uncaptured.csv'), 'utf8')).toContain('/gone');
    expect(fs.readFileSync(path.join(dir, 'capture-status.csv'), 'utf8').split('\n')[0]).toBe('url,rel,exit,bytes,secs,verdict');
    const repairs = fs.readFileSync(path.join(dir, 'title-repairs.csv'), 'utf8');
    expect(repairs).toContain('/blog/a');
    expect(fs.readFileSync(path.join(dir, 'blog/a.html'), 'utf8')).toContain('<title>Post A</title>');
  });

  it('writes the full status CSV and always writes errors.log', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' }), row('/blog/a', '200', { title: 'Post A' })];
    const capture = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>Flock Safety</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1.5, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, scope: ['/'], capture, concurrency: 1 });
    const status = fs.readFileSync(path.join(dir, 'capture-status.csv'), 'utf8');
    expect(status).toContain('/blog/a');
    expect(status).toContain('skipped-stale-capture');
    expect(fs.existsSync(path.join(dir, 'errors.log'))).toBe(true);
  });

  it('resuming appends only capture-list URLs that are not already listed', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200'), row('/blog/a', '200')];
    const capture = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>t</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 1 });
    const before = fs.readFileSync(path.join(dir, 'capture-list.txt'), 'utf8');
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 1, resume: true });
    expect(fs.readFileSync(path.join(dir, 'capture-list.txt'), 'utf8')).toBe(before);
  });

  it('resuming clears errors.log when the retry succeeds', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' })];
    const failing = async () => ({ exit: 1, bytes: 0, secs: 0, verdict: 'failed' as const, stderr: 'Load timeout' });
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture: failing, concurrency: 1 });
    expect(fs.readFileSync(path.join(dir, 'errors.log'), 'utf8')).toContain('Load timeout');

    const capture = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>Flock Safety</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 1, resume: true });
    // errors.log describes this pass: a clean retry leaves it empty.
    expect(fs.readFileSync(path.join(dir, 'errors.log'), 'utf8')).toBe('');
  });

  it('keeps the run-wide title-repair record across a resume', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' }), row('/blog/a', '200', { title: 'Post A' })];
    // Mirrors dockerCapture: an existing capture is skipped, never re-written,
    // so on a resume the repaired titles are already in place.
    const capture = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      if (fs.existsSync(file)) return { exit: 0, bytes: fs.statSync(file).size, secs: 0, verdict: 'skipped-existing' as const };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>Message from Flock Safety</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 2 });
    const first = fs.readFileSync(path.join(dir, 'title-repairs.csv'), 'utf8');
    expect(first).toContain('Post A');
    expect(first.split('\n').filter(Boolean)).toHaveLength(3);

    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 2, resume: true });
    // The retry pass repairs nothing (already done), but the run's record keeps
    // what the first pass repaired.
    expect(fs.readFileSync(path.join(dir, 'title-repairs.csv'), 'utf8')).toBe(first);
  });

  it('a scoped resume keeps the earlier pass verdicts for out-of-scope pages', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' }), row('/blog/a', '200', { title: 'Post A' }), row('/blog/b', '200', { title: 'Post B' })];
    const capture = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `<html><head><title>${rel}</title></head></html>`);
      return { exit: 0, bytes: 42, secs: 1, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 2 });
    // Re-capture one page in place: the other two are out of scope, and must
    // keep their `saved` verdicts rather than revert to `skipped-stale-capture`.
    fs.rmSync(path.join(dir, 'blog/b.html'));
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, scope: ['/blog/b'], capture, concurrency: 1, resume: true });
    const status = fs.readFileSync(path.join(dir, 'capture-status.csv'), 'utf8');
    expect(status).not.toContain('skipped-stale-capture');
    expect(status.split('\n').filter(Boolean)).toHaveLength(4);
  });

  it('a resume never downgrades a page this run saved', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: 'Flock Safety' })];
    const saving = async (_url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>Flock Safety</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1, verdict: 'saved' as const };
    };
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture: saving, concurrency: 1 });
    const skipping = async (_url: string, rel: string) => ({ exit: 0, bytes: fs.statSync(path.join(dir, rel)).size, secs: 0, verdict: 'skipped-existing' as const });
    await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture: skipping, concurrency: 1, resume: true });
    // `saved` is the record that the capture came from this run; a retry that
    // only finds the file in place must not erase that.
    const status = fs.readFileSync(path.join(dir, 'capture-status.csv'), 'utf8');
    expect(status).toContain(',saved');
    expect(status).not.toContain('skipped-existing');
  });

  it('refuses to write into an existing run folder', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'index.html'), 'old');
    await expect(runRecapture({ rows: [row('/', '200')], runDate: '2026-09-12', runDir: dir, capture: async () => ({ exit: 0, bytes: 1, secs: 0, verdict: 'saved' as const }) })).rejects.toThrow(/already exists/);
  });

  it('falls back to the prior inventory when the fresh title regressed to empty', async () => {
    const dir = path.join(tmp(), 'run');
    const rows = [row('/', '200', { title: '' }), row('/blog/a', '200', { title: '' })];
    const fallbackRows = [row('/', '200', { title: 'Flock Safety' }), row('/blog/a', '200', { title: 'Post A' })];
    const capture = async (url: string, rel: string) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<html><head><title>Message from Flock Safety</title></head></html>');
      return { exit: 0, bytes: 42, secs: 1.5, verdict: 'saved' as const };
    };
    await runRecapture({ rows, fallbackRows, runDate: '2026-09-12', runDir: dir, capture, concurrency: 2 });
    expect(fs.readFileSync(path.join(dir, 'blog/a.html'), 'utf8')).toContain('<title>Post A</title>');
    const repairs = fs.readFileSync(path.join(dir, 'title-repairs.csv'), 'utf8');
    expect(repairs).toContain('Post A');
  });
});

describe('docker capture', () => {
  it('spawns asynchronously so the worker pool captures pages in parallel (ticket 12)', async () => {
    const dir = path.join(tmp(), 'run');
    let active = 0;
    let peak = 0;
    const run = async (args: string[]) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const out = args.at(-1)!.replace('/data/', `${dir}/`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, 'x'.repeat(2000));
      active -= 1;
      return { status: 0, stderr: '' };
    };
    const rows = ['/a', '/b', '/c', '/d'].map((p) => row(p, '200'));
    const result = await runRecapture({ rows, runDate: '2026-09-12', runDir: dir, capture: dockerCapture(dir, run), concurrency: 4 });
    expect(result.saved).toBe(4);
    expect(peak).toBeGreaterThan(1);
  });
});
