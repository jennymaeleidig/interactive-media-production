// The gate's render half: one screenshot per call, every render through the
// SAME chromium (same container image, same flags, same settle) — pixel diffs
// then measure content, not renderer drift. Headless chromium cannot launch
// under the main agent sandbox, so it runs in Docker (`capsulecode/singlefile`,
// colima — see CODING_STANDARDS, Environment constraints), exactly like the
// captures. The chromium/session mechanics live in cdp-shot.mjs, executed by
// the container's own node; the settle that makes renders deterministic is
// documented there.
//
// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const IMAGE = 'capsulecode/singlefile:latest';
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** True when a docker daemon answers (colima up). */
export function dockerAvailable() {
  const res = spawnSync('docker', ['ps'], { encoding: 'utf8' });
  return res.status === 0;
}

/**
 * Screenshot `url` at `viewport` through the shared chromium. For file://
 * shots pass `mountDir` — the tree the URL is rooted in, mounted read-only
 * at /capsule; http shots need no mount. The PNG lands at
 * `<shotsDir>/<outPath>` via the /shots mount. Docker-relative paths must
 * be absolute — resolve before calling.
 *
 * @param {{shotsDir: string, mountDir?: string, url: string, viewport: {w: number, h: number}, outPath: string}} shot
 */
export function shoot({ shotsDir, mountDir, url, viewport, outPath }) {
  if (!path.isAbsolute(shotsDir) || (mountDir && !path.isAbsolute(mountDir))) {
    throw new Error('docker mount paths must be absolute — resolve before calling');
  }
  const res = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'node',
    ...(mountDir ? ['-v', `${mountDir}:/capsule:ro`] : []),
    '-v', `${shotsDir}:/shots`,
    '-v', `${HERE}:/cdp:ro`,
    IMAGE,
    '/cdp/cdp-shot.mjs', url, `/shots/${outPath}`, String(viewport.w), String(viewport.h),
  ], { encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' });
  if (res.error || res.status !== 0) {
    const detail = [res.stderr, res.stdout].filter(Boolean).join('\n').slice(0, 1200);
    throw new Error(`chromium shot failed (${outPath}): ${detail || res.error?.message}`);
  }
}
