// Regression-gate tests at its one CI-testable seam: the pixel-compare +
// verdict layer as a pure transformation — PNG pair in → diff stats (px count,
// pct, human-reviewable bands) out; report in → pass/fail out. The full
// harness (Docker chromium + server + real captures) is the gate run itself —
// environmental by design, verified against the real capture, never in `npm
// test` (CODING_STANDARDS: green on a fresh clone).
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { diffPixels, verdict, type GateReport } from '../regression/compare.mjs';

function img(w: number, h: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

/** Recolor an inclusive rect [x0..x1] × [y0..y1]. */
function setRect(png: PNG, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]): PNG {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
    }
  }
  return png;
}

describe('diffPixels', () => {
  it('identical renders are 0 px apart with no bands', () => {
    const a = img(10, 8, [255, 255, 255]);
    const r = diffPixels(a, PNG.sync.read(PNG.sync.write(a)));
    expect(r).toMatchObject({ px: 0, pct: 0, bands: [] });
  });

  it('a differing block lands in one band with its exact extent and count', () => {
    const a = img(8, 8, [255, 255, 255]);
    const b = setRect(img(8, 8, [255, 255, 255]), 1, 2, 3, 4, [255, 0, 0]);
    const r = diffPixels(a, b);
    expect(r.px).toBe(9);
    expect(r.pct).toBe(14.0625);
    expect(r.bands).toEqual([{ x0: 1, x1: 3, y0: 2, y1: 4, px: 9 }]);
  });

  it('separated regions stay separate bands; a clean row between them breaks the band', () => {
    const a = img(8, 8, [0, 0, 0]);
    const b = setRect(setRect(img(8, 8, [0, 0, 0]), 0, 0, 7, 1, [0, 255, 0]), 2, 5, 6, 6, [0, 0, 255]);
    const r = diffPixels(a, b);
    expect(r.px).toBe(16 + 10);
    expect(r.bands).toEqual([
      { x0: 0, x1: 7, y0: 0, y1: 1, px: 16 },
      { x0: 2, x1: 6, y0: 5, y1: 6, px: 10 },
    ]);
  });

  it('real render drift counts — zero-tolerance on counted pixels', () => {
    // pixelmatch's 0.1 threshold (the prototype's proven calibration) leaves
    // antialiasing headroom below ~10%/channel; a ~12% shift is real drift
    // and must count. The gate itself is byte-identity rendered twice, so its
    // 0-px bar sits on the fast path, nowhere near this floor.
    const a = img(4, 4, [225, 225, 225]);
    const b = img(4, 4, [255, 255, 255]);
    const r = diffPixels(a, b);
    expect(r.px).toBe(16);
  });

  it('a size mismatch is an error, not a comparison', () => {
    const r = diffPixels(img(4, 4, [0, 0, 0]), img(5, 4, [0, 0, 0]));
    expect(r.error).toMatch(/size mismatch/);
    expect(r.bands).toBeUndefined();
  });
});

describe('verdict', () => {
  const okEntry = { page: '/', viewport: '1440x900', px: 0, pct: 0 };

  it('a clean report passes', () => {
    const report: GateReport = {
      control: [okEntry],
      gate: [{ ...okEntry }, { ...okEntry, viewport: '390x844' }],
      strip: [{ ...okEntry, px: 490166, pct: 37.8215, bands: [{ x0: 0, x1: 1439, y0: 0, y1: 51, px: 490166 }] }],
    };
    expect(verdict(report)).toEqual({ ok: true, failures: [] });
  });

  it('strip deltas never fail the run — they are informational, human-reviewed', () => {
    const report: GateReport = {
      control: [okEntry],
      gate: [okEntry],
      strip: [{ ...okEntry, px: 999999, pct: 77, bands: [] }],
    };
    expect(verdict(report).ok).toBe(true);
  });

  it('a nonzero gate comparison fails with the offending page and viewport', () => {
    const report: GateReport = {
      control: [okEntry],
      gate: [okEntry, { page: '/book-a-demo', viewport: '768x1024', px: 3, pct: 0.0004 }],
      strip: [],
    };
    const v = verdict(report);
    expect(v.ok).toBe(false);
    expect(v.failures.join(' ')).toContain('/book-a-demo');
    expect(v.failures.join(' ')).toContain('768x1024');
  });

  it('a failed control fails the run even when every gate comparison is 0 px', () => {
    const report: GateReport = {
      control: [{ ...okEntry, px: 12, pct: 0.001 }],
      gate: [okEntry],
      strip: [],
    };
    const v = verdict(report);
    expect(v.ok).toBe(false);
    expect(v.failures.join(' ')).toContain('control');
  });

  it('an errored comparison (size mismatch) fails', () => {
    const report: GateReport = {
      control: [okEntry],
      gate: [{ page: '/', viewport: '1440x900', error: 'size mismatch 1440x900 vs 1438x900' }],
      strip: [],
    };
    expect(verdict(report).ok).toBe(false);
  });

  it('a report without control renders fails — 0 px means nothing without the determinism proof', () => {
    const noControl: GateReport = { control: [], gate: [okEntry], strip: [] };
    expect(verdict(noControl).ok).toBe(false);
    const noGate: GateReport = { control: [okEntry], gate: [], strip: [] };
    expect(verdict(noGate).ok).toBe(false);
  });
});
