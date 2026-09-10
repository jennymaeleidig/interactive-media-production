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
// The gate also runs the full-scale route check first (ticket 07): a routing
// mistake fails cheaply, before the pixel matrix.
//
// Exit code 0 only when the control and gate comparisons are all 0 px.
// The whole check runs against the real capture run and Docker — by design,
// it is the gate run itself, not part of `npm test` (fresh-clone rule).
//
// Usage: node regression/gate.mjs [--pages /a,/b | --list <file>]  (default:
//        every page in served/build-log.json)  [--control /]  [--out .tmp/gate]
//        [--no-strip]   skip the informational strip report (the raw-Capture
//                       renders + diff images) — the 0-px serving gate is
//                       unchanged, so a full-family sample is cheap on a
//                       constrained machine; the exhaustive strip sweep is
//                       the ticket-12 phase-gate run.
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { diffPixels, verdict } from './compare.mjs';
import { checkRoutes } from './routes.mjs';
import { startServer } from './server.mjs';
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

/** one contiguous diff region, formatted identically for console + report */
const fmtBand = (b) => `y ${b.y0}–${b.y1} × x ${b.x0}–${b.x1}: ${b.px.toLocaleString('en-US')} px`;

/**
 * diff two shot files; returns the entry for the report. With `overlayPath`,
 * the red-marked diff image is written only when px > 0 (an identical pair
 * needs no review image) and the entry records its path as `diff`.
 */
function compareShots(shotsDir, fileA, fileB, entry, { overlayPath = null } = {}) {
  const a = PNG.sync.read(fs.readFileSync(path.join(shotsDir, fileA)));
  const b = PNG.sync.read(fs.readFileSync(path.join(shotsDir, fileB)));
  const r = diffPixels(a, b, { overlay: overlayPath != null });
  if (r.error) return { ...entry, error: r.error };
  if (r.overlay && r.px > 0) {
    fs.writeFileSync(path.join(shotsDir, overlayPath), r.overlay);
    return { ...entry, px: r.px, pct: r.pct, bands: r.bands, diff: `shots/${overlayPath}` };
  }
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
  // --no-strip skips the informational strip report (the raw-Capture renders +
  // diff images, the heaviest third of the run). The serving gate — the 0-px
  // contract this ticket must keep green — is unchanged. Use it for cheap
  // full-family samples on constrained hardware; the exhaustive strip sweep is
  // the human phase-gate run (ticket 12).
  const noStrip = argv.includes('--no-strip');

  // ---- preconditions ---------------------------------------------------------
  if (!dockerAvailable()) fail('docker unreachable — the gate renders headless chromium in Docker (colima up; see CODING_STANDARDS)');
  if (!fs.existsSync(servedDir)) fail('served/ missing — run `npm run pipeline` first');
  const buildLogPath = path.join(servedDir, 'build-log.json');
  if (!fs.existsSync(buildLogPath)) fail('served/build-log.json missing — run `npm run pipeline` first');
  for (const artifact of ['build-summary.json', 'redirects.json']) {
    if (!fs.existsSync(path.join(servedDir, artifact))) fail(`served/${artifact} missing — run \`npm run pipeline\` first`);
  }
  if (!fs.existsSync(runDir)) fail(`capture run missing at ${runDir} — the capture pointer (pipeline/config.mjs) is stale`);

  const pages = arg('--pages')
    ? arg('--pages').split(',').map((s) => s.trim()).filter(Boolean)
    : arg('--list')
      ? fs.readFileSync(path.resolve(ROOT, arg('--list')), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
      : JSON.parse(fs.readFileSync(buildLogPath, 'utf8')).filter((e) => !e.error).map((e) => e.page);
  if (pages.length === 0) fail('no pages to check — build log empty?');

  // captured per-page motion normalizations (logFor), surfaced beside each
  // strip section in report.md so human review can attribute deltas (spec:
  // normalizations are "logged per page and surfaced through the strip report")
  const buildLog = JSON.parse(fs.readFileSync(buildLogPath, 'utf8'));
  const logFor = (page) => buildLog.find((e) => e.page === page);

  // every page needs both trees on disk AND content-consistent with the log —
  // a stale served/ (or capture run) from an older pass would existence-check
  // clean while strip quietly measured the wrong pairing. The log records
  // string lengths (html.length), so compare the files decoded the same way.
  for (const page of pages) {
    const entry = logFor(page);
    const servedFile = path.join(servedDir, relFileFor(page));
    const captureFile = path.join(runDir, relFileFor(page));
    if (!fs.existsSync(servedFile)) fail(`served file missing for ${page} — build log and served tree are out of sync; re-run \`npm run pipeline\``);
    if (!fs.existsSync(captureFile)) fail(`capture file missing for ${page} — served tree and capture run are out of sync`);
    const servedLen = fs.readFileSync(servedFile, 'utf8').length;
    const captureLen = fs.readFileSync(captureFile, 'utf8').length;
    if (entry?.bytesOut !== undefined && entry.bytesOut !== servedLen) fail(`served ${page} is ${servedLen} chars but the build log recorded ${entry.bytesOut} — stale served tree; re-run \`npm run pipeline\``);
    if (entry?.bytesIn !== undefined && entry.bytesIn !== captureLen) fail(`captured ${page} is ${captureLen} chars but the build log recorded ${entry.bytesIn} — stale capture run; point pipeline/config.mjs at the run the served tree was built from`);
  }
  if (!fs.existsSync(path.join(servedDir, relFileFor(controlPage)))) fail(`control page ${controlPage} not served — pick a --control page from the served tree`);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(shotsDir, { recursive: true });

  console.log(`Fidelity gate (ticket 06) — control + serving gate${noStrip ? '' : ' + strip report'}`);
  console.log(`  capture run: ${path.relative(ROOT, runDir)}`);
  console.log(`  served tree: ${path.relative(ROOT, servedDir)} (${pages.length} page(s))`);
  console.log(`  shots + report: ${path.relative(ROOT, outDir)}`);
  console.log(`  viewports: ${VIEWPORTS.map(VIEWPORT_TAG).join(' ')} · reduced motion forced · 0-px tolerance${noStrip ? ' · strip report skipped (--no-strip)' : ''}\n`);

  /** @type {import('./compare.mjs').GateReport} */
  const report = { control: [], gate: [], strip: [] };

  let server = null;
  try {
    server = await startServer();
    const host = `host.docker.internal:${new URL(server.base).port}`;

    // ---- route classes first: cheap, and a routing mistake should fail
    // before the pixel matrix spends hours rendering (ticket 07) -------------
    console.log('ROUTES — every route class over HTTP (200 / 301 / 404)');
    const routes = await checkRoutes(server.base, { servedDir, runDir });
    console.log(`  ${routes.failures.length === 0 ? '✓' : '✗'} ${routes.checked} route(s): ${routes.counts.served} served 200 · ${routes.counts.redirects} stub 301 · ${routes.counts.dropped} dropped/test 404 · ${routes.counts.dead} dead 404 · ${routes.counts.authGated} auth-gated 404`);
    for (const f of routes.failures) console.log(`    ✗ ${f}`);
    if (routes.failures.length > 0) throw new Error(`${routes.failures.length} route-class failure(s) — fix routing before the pixel matrix`);

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
      // shot stems: raw_ = the capture tree as captured; srvfile_ = the served
      // tree read from disk; srvhttp_ = the served tree over HTTP
      console.log(`\n${page}`);
      for (const vp of VIEWPORTS) {
        const tag = VIEWPORT_TAG(vp);
        // shot stems: raw_ = the capture tree as captured; srvfile_ = the served
        // tree read from disk; srvhttp_ = the served tree over HTTP
        if (!noStrip) shoot({ shotsDir, mountDir: runDir, url: `file:///capsule/${rel}`, viewport: vp, outPath: `raw_${slug}_${tag}.png` });
        shoot({ shotsDir, mountDir: servedDir, url: `file:///capsule/${rel}`, viewport: vp, outPath: `srvfile_${slug}_${tag}.png` });
        // the container reaches the host server via host.docker.internal
        shoot({ shotsDir, url: `http://${host}${page}`, viewport: vp, outPath: `srvhttp_${slug}_${tag}.png` });

        const gate = compareShots(shotsDir, `srvhttp_${slug}_${tag}.png`, `srvfile_${slug}_${tag}.png`, { page, viewport: tag }, { overlayPath: `diff_gate_${slug}_${tag}.png` });
        report.gate.push(gate);
        console.log(`  ${gate.error ? '✗' : gate.px === 0 ? '✓' : '✗'} GATE  @${tag}: ${gate.error ?? gate.px + ' px'}${gate.px > 0 ? ` → ${gate.diff}` : ''}`);

        if (noStrip) continue;
        const strip = compareShots(shotsDir, `raw_${slug}_${tag}.png`, `srvhttp_${slug}_${tag}.png`, { page, viewport: tag }, { overlayPath: `diff_strip_${slug}_${tag}.png` });
        report.strip.push(strip);
        const bandStr = strip.bands?.map((b) => `[${fmtBand(b)}]`).join(' ') ?? strip.error;
        console.log(`  • STRIP @${tag}: ${strip.error ?? `${strip.px.toLocaleString('en-US')} px (${strip.pct}%)`} — ${strip.bands?.length ?? '?'} band(s): ${bandStr}`);
      }
    }
  } finally {
    if (server) await server.stop();
  }

  writeReport(outDir, report, pages, logFor);

  const v = verdict(report);
  console.log('\n' + (v.ok ? '✓ Gate green — serving layer pixel-invisible, renderer deterministic.' : '✗ Gate FAILED:'));
  for (const f of v.failures) console.log(`  ${f}`);
  console.log(`\n${noStrip ? 'Strip report skipped (--no-strip).' : 'Strip report is informational — review the diff images and bands in ' + path.relative(ROOT, outDir) + '/report.md against the strip-list regions (offer bar, consent card, header reflow) before signing off.'}`);
  if (!v.ok) process.exit(1);
}

/** report.json (machine) + report.md (the human-review artifact). */
function writeReport(outDir, report, pages, logFor) {
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
    const motion = logFor(s.page)?.motion;
    if (motion && Object.keys(motion).length > 0) {
      lines.push(
        'Motion pass normalizations logged for this page — each is an expected',
        'delta source (captured from-state → served end-state):',
        ...Object.entries(motion).map(([k, n]) => `- ${k}: ${n}`),
        '',
      );
    }
    lines.push(`${s.px.toLocaleString('en-US')} px (${s.pct}%)${s.diff ? ` · diff image: ${s.diff}` : ''}`, '');
    for (const b of s.bands ?? []) {
      lines.push(`- band ${fmtBand(b)}`);
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
