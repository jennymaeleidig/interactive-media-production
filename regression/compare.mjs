// The regression gate's pure core: PNG pair in → diff stats out, gate report
// in → pass/fail out (ticket 06). Plain Node ESM + JSDoc, like the pipeline —
// a pure transformation, unit-tested at test/gate.test.ts on synthetic PNGs.
//
// The pixel comparison is pixelmatch with a 0.1 YIQ threshold (the prototype's
// proven setting): antialiasing specks are excluded from the count, everything
// else counts. The GATE is zero-tolerance on that count — the control renders
// prove the renderer can hit it (identical content, same browser image, same
// flags → 0 px), which is exactly what makes the gate's 0 px meaningful.
//
// SPDX-License-Identifier: CC0-1.0
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Matching threshold (0..1) — smaller is more sensitive. 0.1 is the prototype's proven value. */
export const MATCH_THRESHOLD = 0.1;

/** One contiguous diff region: inclusive pixel bounds + diff-pixel count. */
// Rows with ≥1 diff pixel cluster into bands separated by clean rows — coarse
// enough to read as page regions (offer bar, consent card, header reflow) in
// the strip report, exact enough to review confinement.
//
/** @typedef {{x0: number, x1: number, y0: number, y1: number, px: number}} Band */

/**
 * @typedef {Object} DiffStats
 * @property {number} [px]  Differing-pixel count.
 * @property {number} [pct]  Share of the image, 4 decimals.
 * @property {Band[]} [bands]  Contiguous diff regions, top to bottom.
 * @property {Buffer} [overlay]  When requested: PNG buffer of image A with diff pixels marked red — the human-reviewable diff image.
 * @property {string} [error]  Set instead of the stats when the images cannot be compared.
 */

/**
 * Compare two equally sized RGBA images (decoded pngjs PNGs or any
 * {width, height, data}).
 *
 * @param {{width: number, height: number, data: Buffer}} a
 * @param {{width: number, height: number, data: Buffer}} b
 * @param {{overlay?: boolean}} [opts]
 * @returns {DiffStats}
 */
export function diffPixels(a, b, opts = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return { error: `size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const { width, height } = a;
  // diffMask: pixelmatch writes ONLY the counted diff pixels (opaque), so the
  // mask's non-transparent pixels are exactly the counted set — the band scan
  // never guesses at blended colors.
  const mask = new PNG({ width, height });
  const px = pixelmatch(a.data, b.data, mask.data, width, height, { threshold: MATCH_THRESHOLD, diffMask: true });
  const pct = +((100 * px) / (width * height)).toFixed(4);
  if (px === 0) {
    return opts.overlay ? { px, pct, bands: [], overlay: PNG.sync.write(a) } : { px, pct, bands: [] };
  }

  /** @type {Band[]} */
  const bands = [];
  /** @type {Band | null} */
  let cur = null;
  for (let y = 0; y < height; y++) {
    let xMin = -1;
    let xMax = -1;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (mask.data[(y * width + x) * 4 + 3] !== 0) {
        if (xMin < 0) xMin = x;
        xMax = x;
        count += 1;
      }
    }
    if (count > 0) {
      if (cur && cur.y1 === y - 1) {
        cur.y1 = y;
        cur.x0 = Math.min(cur.x0, xMin);
        cur.x1 = Math.max(cur.x1, xMax);
        cur.px += count;
      } else {
        cur = { x0: xMin, x1: xMax, y0: y, y1: y, px: count };
        bands.push(cur);
      }
    } else {
      cur = null;
    }
  }

  if (!opts.overlay) return { px, pct, bands };
  // Review image: the raw shot with every diff pixel repainted red — where it
  // landed is visible against the content itself.
  return { px, pct, bands, overlay: overlayBuffer(a, mask) };
}

/** Image A with every masked pixel red. */
function overlayBuffer(a, mask) {
  const out = Buffer.from(a.data);
  for (let i = 0; i < out.length; i += 4) {
    if (mask.data[i + 3] !== 0) {
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 0;
    }
  }
  return PNG.sync.write({ width: a.width, height: a.height, data: out });
}

/**
 * @typedef {Object} GateEntry
 * @property {string} page  Original site path.
 * @property {string} viewport  e.g. "1440x900".
 * @property {number} [px]  Diff-pixel count (absent on error).
 * @property {number} [pct]
 * @property {Band[]} [bands]  Strip entries only.
 * @property {Buffer} [overlay]  Strip entries only, when requested.
 * @property {string} [error]
 */

/**
 * @typedef {Object} GateReport
 * @property {GateEntry[]} control  Identical-content renders twice — must be 0 px (the determinism proof).
 * @property {GateEntry[]} gate  Served over HTTP vs the same bytes from disk — must be 0 px.
 * @property {GateEntry[]} strip  Raw Capture vs served page — informational, human-reviewed.
 */

/**
 * The run's verdict. Strip entries never fail — they are the human-review
 * surface (spec, Verification). A report without control renders fails:
 * without the determinism proof, 0 px would mean nothing.
 *
 * @param {GateReport} report
 * @returns {{ok: boolean, failures: string[]}}
 */
export function verdict(report) {
  /** @type {string[]} */
  const failures = [];
  if (report.control.length === 0) failures.push('no control renders — the determinism proof is missing');
  for (const c of report.control) {
    if (c.error) failures.push(`control ${c.page} @${c.viewport}: ${c.error}`);
    else if ((c.px ?? 0) > 0) failures.push(`control ${c.page} @${c.viewport}: ${c.px} px — renderer not deterministic`);
  }
  if (report.gate.length === 0) failures.push('no gate comparisons');
  for (const g of report.gate) {
    if (g.error) failures.push(`gate ${g.page} @${g.viewport}: ${g.error}`);
    else if ((g.px ?? 0) > 0) failures.push(`gate ${g.page} @${g.viewport}: ${g.px} px (expected 0)`);
  }
  return { ok: failures.length === 0, failures };
}
