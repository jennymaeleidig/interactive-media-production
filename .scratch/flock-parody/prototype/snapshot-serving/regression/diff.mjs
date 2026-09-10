// PROTOTYPE (wayfinder ticket 05) — pixel diffs between the three screenshot sets.
//   SERVING GATE: srvhttp vs srvfile → must be ~0 (serving layer pixel-invisible)
//   STRIP REPORT: raw vs srvhttp    → expected non-zero; deltas must be strip-list
//     regions only (homepage: Qualified offer bar, OneTrust consent card, 52px
//     header-offset reflow). Human-reviewable via diff PNGs; the phase-gate
//     side-by-side covers this side at build time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
const VIEWPORTS = ['1440x900', '768x1024', '390x844'];

function load(name) {
  return PNG.sync.read(fs.readFileSync(path.join(SHOTS, name)));
}

function compare(fileA, fileB, tag) {
  if (!fs.existsSync(path.join(SHOTS, fileA)) || !fs.existsSync(path.join(SHOTS, fileB))) return null;
  const a = load(fileA);
  const b = load(fileB);
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`✗ ${tag}: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    return null;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const pct = +((100 * n) / (a.width * a.height)).toFixed(4);
  fs.writeFileSync(path.join(SHOTS, `diff_${tag}.png`), PNG.sync.write(diff));
  return { n, pct };
}

const report = { gate: [], strip: [] };
for (const vp of VIEWPORTS) {
  const gate = compare(`srvhttp_${vp}.png`, `srvfile_${vp}.png`, `gate_${vp}`);
  const strip = compare(`raw_${vp}.png`, `srvhttp_${vp}.png`, `strip_${vp}`);
  if (gate) {
    const ok = gate.n === 0 ? '✓' : gate.pct < 0.01 ? '✓' : '✗';
    console.log(`${ok} GATE   ${vp}: ${gate.n} px (${gate.pct}%) — serving layer vs disk render`);
    report.gate.push({ viewport: vp, ...gate });
  }
  if (strip) {
    console.log(`• STRIP  ${vp}: ${strip.n} px (${strip.pct}%) — raw vs served; deltas must be strip-list regions → diff_strip_${vp}.png`);
    report.strip.push({ viewport: vp, ...strip });
  }
}
fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nGate fails if any GATE line is ✗. STRIP lines are informational (review diff PNGs).');
