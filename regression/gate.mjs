// The regression gate (ticket 06) — the fidelity bar's automated instrument,
// one command: `npm run gate`.
//
//   CONTROL  identical content rendered twice in the same headless chromium
//            must be 0 px apart — the determinism proof. Runs FIRST: without
//            it, every other 0 px in the report means nothing. A nonzero
//            control aborts the run before the matrix is shot.
//   GATE     the served tree rendered over HTTP vs the same bytes from disk,
//            in the same browser at 1440x900 / 768x1024 / 390x844, with the
//            motion layer aboard and reduced motion forced (see shoot.mjs) —
//            0 px required. Measures the serving layer: pixel-invisible.
//   STRIP    each raw Capture vs its served page — expected non-zero;
//            deltas must stay confined to the reviewed strip-list regions
//            (the Qualified offer bar, the OneTrust consent card, the
//            reclaimed header-height reflow) plus the motion pass's logged
//            from-state normalizations. Informational, human-reviewed: the
//            report writes a red-marked diff image and per-region bands per
//            page and viewport; it never fails the run (spec, Verification).
//
// Exit code 0 only when the control and gate comparisons are all 0 px.
// The whole check runs against the real capture run and Docker — by design,
// it is the gate run itself, not part of `npm test` (fresh-clone rule).
//
// Usage: node regression/gate.mjs [--pages /a,/b]   (default: every page in
//        served/build-log.json)  [--control /]  [--out .tmp/gate]
// SPDX-License-Identifier: CC0-1.0
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { diffPixels, verdict } from './compare.mjs';
import { dockerAvailable, shoot } from './shoot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 390, h: 844 }];
const VIEWPORT_TAG = (v) => `${v.w}x${v.h}`;

/** Original page path → shot filename stem ("/" → "index", "/a/b" → "a_b"). */
function slugFor(pagePath) {
  return pagePath === '/' ? 'index' : pagePath.replace(/^\//, '').replaceAll('/', '_');
}

/** pagePath → capture-tree/served-tree relative file — same mapping as the pipeline's write pass. */
function relFileFor(pagePath) {
  return pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '.html';
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('unexpected listen address')));
      }
    });
    srv.on('error', reject);
  });
}

/**
 * Start the production server on a free port (the gate measures the serving
 * layer as visitors get it) and resolve once it answers. Dies with the
 * command — the sandbox forbids orphaned port squatters.
 */
async function startServer() {
  if (!fs.existsSync(path.join(ROOT, '.next/BUILD_ID'))) {
    fail('.next/BUILD_ID missing — run `npm run build` first (the gate serves the production build)');
  }
  const port = await freePort();
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) fail(`next start exited early (${child.exitCode})`);
    try {
      await fetch(base + '/');
      break; // any response means it is up — route status is the tests' business
    } catch {
      if (Date.now() > deadline) fail('next start did not become ready in 60s');
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return {
    base,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already gone */ }
          resolve();
        }, 3000);
      });
    },
  };
}

/** diff two shot files; returns the entry for the report. */
function compareShots(shotsDir, fileA, fileB, entry, { overlay = false, overlayPath = null } = {}) {
  const a = PNG.sync.read(fs.readFileSync(path.join(shotsDir, fileA)));
  const b = PNG.sync.read(fs.readFileSync(path.join(shotsDir, fileB)));
  const r = diffPixels(a, b, { overlay });
  if (r.error) return { ...entry, error: r.error };
  if (overlay && r.overlay) fs.writeFileSync(path.join(shotsDir, overlayPath), r.overlay);
  const { px, pct, bands } = r;
  return { ...entry, px, pct, bands };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };

  const { CAPTURE_RUN } = await import('../pipeline/config.mjs');
  const runDir = path.resolve(ROOT, CAPTURE_RUN);
  const servedDir = path.join(ROOT, 'served');
  const outDir = path.resolve(ROOT, arg('--out') ?? '.tmp/gate');
  const shotsDir = path.join(outDir, 'shots');
  const controlPage = arg('--control') ?? '/';

  // ---- preconditions ---------------------------------------------------------
  if (!dockerAvailable()) fail('docker unreachable — the gate renders headless chromium in Docker (colima up; see CODING_STANDARDS)');
  if (!fs.existsSync(servedDir)) fail('served/ missing — run `npm run pipeline` first');
  const buildLogPath = path.join(servedDir, 'build-log.json');
  if (!fs.existsSync(buildLogPath)) fail('served/build-log.json missing — run `npm run pipeline` first');
  if (!fs.existsSync(runDir)) fail(`capture run missing at ${runDir} — the capture pointer (pipeline/config.mjs) is stale`);

  const pages = arg('--pages')
    ? arg('--pages').split(',').map((s) => s.trim()).filter(Boolean)
    : JSON.parse(fs.readFileSync(buildLogPath, 'utf8')).filter((e) => !e.error).map((e) => e.page);
  if (pages.length === 0) fail('no pages to check — build log empty?');

  // every page needs both trees on disk; a mismatch aborts before any shot
  for (const page of pages) {
    if (!fs.existsSync(path.join(servedDir, relFileFor(page)))) fail(`served file missing for ${page} — build log and served tree are out of sync; re-run \`npm run pipeline\``);
    if (!fs.existsSync(path.join(runDir, relFileFor(page)))) fail(`capture file missing for ${page} — served tree and capture run are out of sync`);
  }
  if (!fs.existsSync(path.join(servedDir, relFileFor(controlPage)))) fail(`control page ${controlPage} not served — pick a --control page from the served tree`);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(shotsDir, { recursive: true });

  console.log('Fidelity gate (ticket 06) — control + serving gate + strip report');
  console.log(`  capture run: ${path.relative(ROOT, runDir)}`);
  console.log(`  served tree: ${path.relative(ROOT, servedDir)} (${pages.length} page(s))`);
  console.log(`  shots + report: ${path.relative(ROOT, outDir)}`);
  console.log(`  viewports: ${VIEWPORTS.map(VIEWPORT_TAG).join(' ')} · reduced motion forced · 0-px tolerance\n`);

  /** @type {import('./compare.mjs').GateReport} */
  const report = { control: [], gate: [], strip: [] };

  const server = await startServer();
  try {
    const host = `host.docker.internal:${new URL(server.base).port}`;

    // ---- control: determinism proof, first ------------------------------------
    // A nonzero control aborts before the matrix: those results would be
    // meaningless, and `process.exit` here would orphan the server — so the
    // loop breaks and the run exits through the normal path below.
    let controlFailed = false;
    console.log('CONTROL — identical content rendered twice must be 0 px apart');
    for (const vp of VIEWPORTS) {
      const tag = VIEWPORT_TAG(vp);
      const shotArgs = {
        shotsDir,
        mountDir: servedDir,
        url: `file:///capsule/${relFileFor(controlPage)}`,
        viewport: vp,
      };
      shoot({ ...shotArgs, outPath: `ctrlA_${tag}.png` });
      shoot({ ...shotArgs, outPath: `ctrlB_${tag}.png` });
      const entry = compareShots(shotsDir, `ctrlA_${tag}.png`, `ctrlB_${tag}.png`, { page: controlPage, viewport: tag });
      report.control.push(entry);
      if (entry.error || entry.px > 0) {
        console.log(`  ✗ ${controlPage} @${tag}: ${entry.error ?? entry.px + ' px'}`);
        controlFailed = true;
        break;
      }
      console.log(`  ✓ ${controlPage} @${tag}: 0 px`);
    }

    // ---- matrix: gate + strip per page × viewport ------------------------------
    if (!controlFailed) for (const page of pages) {
      const slug = slugFor(page);
      const rel = relFileFor(page);
      console.log(`\n${page}`);
      for (const vp of VIEWPORTS) {
        const tag = VIEWPORT_TAG(vp);
        shoot({ shotsDir, mountDir: runDir, url: `file:///capsule/${rel}`, viewport: vp, outPath: `raw_${slug}_${tag}.png` });
        shoot({ shotsDir, mountDir: servedDir, url: `file:///capsule/${rel}`, viewport: vp, outPath: `srvfile_${slug}_${tag}.png` });
        // the container reaches the host server via host.docker.internal
        shoot({ shotsDir, url: `http://${host}${page}`, viewport: vp, outPath: `srvhttp_${slug}_${tag}.png` });

        const gate = compareShots(shotsDir, `srvhttp_${slug}_${tag}.png`, `srvfile_${slug}_${tag}.png`, { page, viewport: tag });
        if (!gate.error && gate.px > 0) {
          // diagnosis image: diffs marked red over the disk render
          compareShots(shotsDir, `srvhttp_${slug}_${tag}.png`, `srvfile_${slug}_${tag}.png`, gate, { overlay: true, overlayPath: `diff_gate_${slug}_${tag}.png` });
        }
        report.gate.push(gate);
        console.log(`  ${gate.error ? '✗' : gate.px === 0 ? '✓' : '✗'} GATE  @${tag}: ${gate.error ?? gate.px + ' px'}${gate.px > 0 ? ` → shots/diff_gate_${slug}_${tag}.png` : ''}`);

        const strip = compareShots(shotsDir, `raw_${slug}_${tag}.png`, `srvhttp_${slug}_${tag}.png`, { page, viewport: tag }, { overlay: true, overlayPath: `diff_strip_${slug}_${tag}.png` });
        if (!strip.error) strip.diff = `shots/diff_strip_${slug}_${tag}.png`;
        report.strip.push(strip);
        const bandStr = strip.bands?.map((b) => `[y ${b.y0}–${b.y1} × x ${b.x0}–${b.x1}] ${b.px.toLocaleString('en-US')} px`).join(' ') ?? strip.error;
        console.log(`  • STRIP @${tag}: ${strip.error ?? `${strip.px.toLocaleString('en-US')} px (${strip.pct}%)`} — ${strip.bands?.length ?? '?'} band(s): ${bandStr}`);
      }
    }
  } finally {
    await server.stop();
  }

  writeReport(outDir, report, pages);

  const v = verdict(report);
  console.log('\n' + (v.ok ? '✓ Gate green — serving layer pixel-invisible, renderer deterministic.' : '✗ Gate FAILED:'));
  for (const f of v.failures) console.log(`  ${f}`);
  console.log(`\nStrip report is informational — review the diff images and bands in ${path.relative(ROOT, outDir)}/report.md against the strip-list regions (offer bar, consent card, header reflow) before signing off.`);
  if (!v.ok) process.exit(1);
}

/** report.json (machine) + report.md (the human-review artifact). */
function writeReport(outDir, report, pages) {
  const clean = {
    pages,
    control: report.control.map(({ overlay, ...e }) => e),
    gate: report.gate.map(({ overlay, ...e }) => e),
    strip: report.strip.map(({ overlay, ...e }) => e),
    verdict: verdict(report),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(clean, null, 2));

  const lines = [
    '# Strip report — human review', '',
    'Deltas between each raw Capture and its served page. Confined to the',
    'reviewed regions (Qualified offer bar, OneTrust consent card, reclaimed',
    'header-height reflow) plus the motion pass\'s logged from-state',
    'normalizations. Anything outside those regions is a strip bug.', '',
    `Verdict: ${clean.verdict.ok ? 'gate green (control + serving gate all 0 px)' : 'GATE FAILED — see below'}`, '',
  ];
  if (clean.verdict.failures.length > 0) {
    lines.push('## Failures', '', ...clean.verdict.failures.map((f) => `- ${f}`), '');
  }
  for (const s of clean.strip) {
    lines.push(`## ${s.page} @${s.viewport}`, '');
    if (s.error) {
      lines.push(`error: ${s.error}`, '');
      continue;
    }
    lines.push(`${s.px.toLocaleString('en-US')} px (${s.pct}%) · diff image: ${s.diff}`, '');
    for (const b of s.bands ?? []) {
      lines.push(`- band y ${b.y0}–${b.y1} × x ${b.x0}–${b.x1}: ${b.px.toLocaleString('en-US')} px`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
