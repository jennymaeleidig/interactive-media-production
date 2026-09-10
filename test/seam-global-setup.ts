// Vitest globalSetup for the serving-seam project:
// 1. runs the pipeline over the fixture capture run into .tmp/seam/served
// 2. builds the Next app (next build) unless a fresh build exists
// 3. starts `next start` on a free port with SERVED_DIR pointed at the fixture tree
// 4. writes .tmp/seam/runtime.json — tests read the base URL from it
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEAM_TMP = path.join(ROOT, '.tmp/seam');
const SERVED_DIR = path.join(SEAM_TMP, 'served');
const RUNTIME = path.join(SEAM_TMP, 'runtime.json');
const FIXTURES = path.join(HERE, 'fixtures/capture-run');

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
  for (const p of ['app', 'next.config.ts', 'package.json']) {
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
  // 1. fixture served tree — the same transformation the real build runs
  rmSync(SEAM_TMP, { recursive: true, force: true });
  mkdirSync(SERVED_DIR, { recursive: true });
  const { runPipeline } = await import('../pipeline/build.mjs');
  const { log } = await runPipeline({
    runDir: FIXTURES,
    pages: ['/', '/products/gun-detection', '/book-a-demo', '/thank-you'],
    outDir: SERVED_DIR,
  });
  if (log.some((e) => e.error)) throw new Error('fixture pipeline failed: ' + JSON.stringify(log));

  // 2. app build (reused when newer than every app source)
  if (!nextBuildFresh()) {
    const res = spawnSync('npx', ['next', 'build'], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`next build failed:\n${res.stdout?.slice(-2000)}\n${res.stderr?.slice(-2000)}`);
    }
  }

  // 3. production server on a free port, serving the fixture tree
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
