// Upstream video drift check (ops tool — NOT part of the build; it is the
// documented network exception, like `regression/routes.mjs` is the
// environmental exception). Re-probes every video in a dated inventory to
// answer one question: does the upstream ground truth still exist?
//
// Two tiers:
//   fast — Wistia media JSON (status + assets) + YouTube oembed + HEAD on
//          each Wistia delivery contentUrl. Seconds for the whole set.
//   deep — everything in fast, plus `yt-dlp --simulate` on every URL: the
//          authoritative "a downloader can fetch it" check.
//
// Usage:
//   node pipeline/video-probe.mjs --inv .scratch/flock-parody-impl/video-inventory/2026-09-11
//   node pipeline/video-probe.mjs --inv <dir> --tier deep
//   node pipeline/video-probe.mjs --inv <dir> --diff <dir>/playability.csv
//
// Writes playability.csv (fast) or playability-deep.csv (deep) into the
// inventory dir. Exits 1 when any video fails, or — with --diff — when any
// video that played in the reference file now fails (drift alarm for ticket
// 11's phase-gate cadence).
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { makeArg, invokedDirectly } from './cli.mjs';
import { csv } from './video-inventory.mjs';

const CONC = 12;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

/**
 * Probe one Wistia media: media JSON must return status=ready with assets,
 * and the recorded delivery contentUrl must still serve.
 * @param {string} id
 * @param {string|null} contentUrl
 * @returns {Promise<{status: string, playable: string, detail: string}>}
 */
async function probeWistia(id, contentUrl) {
  let r;
  try {
    r = await fetch(`https://fast.wistia.com/embed/medias/${id}.json`, { headers: { 'user-agent': UA } });
  } catch (e) {
    return { status: 'error', playable: '?', detail: String(e) };
  }
  if (r.status === 404) return { status: 'gone', playable: 'no', detail: 'media JSON 404' };
  if (!r.ok) return { status: 'error', playable: '?', detail: `HTTP ${r.status}` };
  const body = await r.text();
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return { status: 'gone', playable: 'no', detail: `media JSON body: ${body.slice(0, 60)}` };
  }
  const m = j.media ?? j;
  const st = m.status ?? m.state;
  if (!(st === 2 || st === 'ready')) return { status: `bad-status:${st ?? 'unknown'}`, playable: 'no', detail: body.slice(0, 60) };
  const nAssets = (m.assets ?? []).length;
  if (nAssets === 0) return { status: 'no-assets', playable: 'no', detail: m.name ?? '' };

  // The delivery stream the captured page points at must still resolve.
  if (contentUrl) {
    try {
      const h = await fetch(contentUrl, { method: 'HEAD', headers: { 'user-agent': UA, referer: 'https://fast.wistia.net/' } });
      if (!h.ok) return { status: 'delivery-dead', playable: 'maybe', detail: `${m.name ?? ''} | delivery HTTP ${h.status}` };
    } catch (e) {
      return { status: 'error', playable: '?', detail: `delivery HEAD: ${e}` };
    }
  }
  return { status: 'ok', playable: 'yes', detail: `${m.name ?? ''} | ${Math.round(m.duration ?? 0)}s | assets:${nAssets}` };
}

/**
 * Probe one YouTube video via oembed — a 200 is exactly the "the embeddable
 * watch page exists" check an iframe needs; 404 = deleted/private.
 * @param {string} id
 * @returns {Promise<{status: string, playable: string, detail: string}>}
 */
async function probeYouTube(id) {
  let r;
  try {
    r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { headers: { 'user-agent': UA } });
  } catch (e) {
    return { status: 'error', playable: '?', detail: String(e) };
  }
  if (r.status === 200) {
    try {
      const j = await r.json();
      return { status: 'ok', playable: 'yes', detail: j.title ?? '' };
    } catch {
      return { status: 'ok', playable: 'yes', detail: '' };
    }
  }
  if (r.status === 404) return { status: 'gone', playable: 'no', detail: 'deleted/private (oembed 404)' };
  if (r.status === 401 || r.status === 403) return { status: 'restricted', playable: 'maybe', detail: `oembed ${r.status} — embed-disabled; watch page may still play` };
  return { status: 'error', playable: '?', detail: `HTTP ${r.status}` };
}

/**
 * Deep-tier check: can a real downloader actually fetch this URL?
 * @param {string} url YouTube watch URL or `wistia:<id>`
 * @returns {{status: string, playable: string, detail: string}}
 */
function ytDlpSimulate(url) {
  const p = spawnSync('yt-dlp', ['--simulate', '--no-warnings', '--print', '%(title)s', url], { encoding: 'utf8', timeout: 60_000 });
  if (p.status === 0) return { status: 'ok', playable: 'yes', detail: (p.stdout.trim().split('\n').pop() ?? '').slice(0, 120) };
  const err = (p.stderr ?? '').split('\n').filter(Boolean).pop() ?? 'unknown error';
  return { status: 'dlp-fail', playable: 'no', detail: err.slice(0, 160) };
}

/**
 * Run `fn` over `items` with a concurrency cap.
 * @template T
 * @param {T[]} items
 * @param {(t: T) => Promise<any>} fn
 * @param {(done: number) => void} onProgress
 * @returns {Promise<any[]>}
 */
async function pooled(items, fn, onProgress) {
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      results.push(await fn(items[i++]));
      onProgress(results.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  return results;
}

/**
 * @param {string} invDir inventory dir containing videos.json
 * @param {'fast'|'deep'} tier
 * @param {string|null} diffPath reference playability csv for drift detection
 * @returns {Promise<{ok: boolean, summary: Record<string, number>, drifted: string[]}>}
 */
export async function run(invDir, tier, diffPath) {
  const inv = JSON.parse(fs.readFileSync(path.join(invDir, 'videos.json'), 'utf8'));
  const rows = await pooled(inv.videos, async (v) => {
    let res = v.host === 'wistia' ? await probeWistia(v.id, v.contentUrl) : await probeYouTube(v.id);
    if (tier === 'deep') {
      const deep = ytDlpSimulate(v.url.replace(/^https:\/\/fast\.wistia\.com\/embed\/medias\/.*$/, `wistia:${v.id}`));
      res = { ...res, deep, playable: deep.playable === 'yes' ? 'yes' : (res.playable === 'yes' ? `fast-ok-deep-fail` : res.playable), detail: `${res.detail} || dlp: ${deep.detail}` };
    }
    return { ...res, v };
  }, (done) => { if (done % 25 === 0) console.error(`  ${done}/${inv.videos.length}`); });

  rows.sort((a, b) => (a.v.host + a.v.id).localeCompare(b.v.host + b.v.id));
  const out = ['key,host,probe_status,playable,title,detail',
    ...rows.map((r) => [r.v.key, r.v.host, r.status, r.playable, csv(r.detail.split('||')[0]), csv(r.detail)].join(','))];
  const outName = tier === 'deep' ? 'playability-deep.csv' : 'playability.csv';
  fs.writeFileSync(path.join(invDir, outName), out.join('\n') + '\n');

  const tally = {};
  for (const r of rows) tally[`${r.v.host}:${r.status}`] = (tally[`${r.v.host}:${r.status}`] ?? 0) + 1;

  // Drift: anything that played in the reference file but fails now.
  /** @type {string[]} */
  let drifted = [];
  if (diffPath) {
    const ref = new Map(fs.readFileSync(diffPath, 'utf8').split('\n').slice(1).filter(Boolean)
      .map((l) => {
        const f = csvSplit(l);
        return f[0] ? [f[0], f[3]] : ['', ''];
      }));
    drifted = rows.filter((r) => {
      const was = ref.get(r.v.key);
      return was === 'yes' && r.playable !== 'yes';
    }).map((r) => r.v.key);
    if (drifted.length) console.error(`DRIFT: ${drifted.length} previously-playing video(s) now failing: ${drifted.join(' ')}`);
  }

  const failed = rows.filter((r) => r.playable !== 'yes').length;
  return { ok: failed === 0, summary: tally, drifted };
}

/** Minimal quoted-CSV splitter for reference rows we wrote ourselves. @param {string} line */
function csvSplit(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** CLI entry. */
async function main() {
  const arg = makeArg(process.argv.slice(2));
  const invDir = arg('--inv');
  if (!invDir) {
    console.error('usage: node pipeline/video-probe.mjs --inv <inventory-dir> [--tier fast|deep] [--diff <playability.csv>]');
    process.exitCode = 2;
    return;
  }
  const tier = (arg('--tier') ?? 'fast');
  const { ok, summary } = await run(invDir, tier, arg('--diff'));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = ok ? 0 : 1;
}

if (invokedDirectly(import.meta.url)) await main();
