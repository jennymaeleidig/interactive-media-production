// Vitest globalSetup for the serving-seam project:
// 1. builds the Next app (next build) unless a fresh build exists
// 2. starts `next start` on a free port with SERVED_DIR pointed at the committed
//    served/ tree — the artifact itself, so the seam asserts what ships
// 3. writes .tmp/seam/runtime.json — tests read the base URL from it
//
// There is no fixture tree and no build step for one: `served/` is committed, so
// the seam runs against the same bytes `npm run routes` checks.
//
// SPDX-License-Identifier: CC0-1.0
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEAM_TMP = path.join(ROOT, '.tmp/seam');
const SERVED_DIR = path.join(ROOT, 'served');
const RUNTIME = path.join(SEAM_TMP, 'runtime.json');

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

function nextBuildFresh() {
  const buildId = path.join(ROOT, '.next/BUILD_ID');
  if (!existsSync(buildId)) return false;
  const buildTime = statSync(buildId).mtimeMs;
  const sources: string[] = [];
  for (const p of ['app', 'lib', 'next.config.ts', 'package.json']) {
    const full = path.join(ROOT, p);
    if (statSync(full).isDirectory()) {
      sources.push(...readdirSync(full, { recursive: true }).map((f) => path.join(full, f as string)));
    } else {
      sources.push(full);
    }
  }
  return sources.every((f) => {
    try {
      return statSync(f).mtimeMs <= buildTime;
    } catch {
      return true; // vanished since — rebuild decision doesn't hinge on it
    }
  });
}

export async function setup() {
  // 1. the tree under test must be there — it is committed, not built
  if (!existsSync(path.join(SERVED_DIR, 'build-summary.json'))) {
    throw new Error(`served/ tree missing at ${SERVED_DIR} — the serving seam asserts the committed artifact`);
  }
  mkdirSync(SEAM_TMP, { recursive: true });

  // 2. app build (reused when newer than every app source)
  if (!nextBuildFresh()) {
    const res = spawnSync('npx', ['next', 'build'], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`next build failed:\n${res.stdout?.slice(-2000)}\n${res.stderr?.slice(-2000)}`);
    }
  }

  // 3. production server on a free port, serving the committed tree
  const port = await freePort();
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: ROOT,
    env: { ...process.env, SERVED_DIR },
    stdio: 'ignore',
    detached: false,
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited early (${child.exitCode})`);
    try {
      await fetch(base + '/');
      break; // any response means the server is up — status is the tests' business
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('next start did not become ready in 60s');
    await new Promise((r) => setTimeout(r, 300));
  }

  writeFileSync(RUNTIME, JSON.stringify({ base }, null, 2));

  return async () => {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      child.once('exit', resolve);
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        resolve();
      }, 3000);
    });
  };
}
