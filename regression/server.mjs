// Start the production server the serving check measures, on a free port, and
// reap it with the command (regression/routes.mjs) so it measures the same
// serving layer visitors get.
//
// A server started inside a sandboxed command must die with the command
// (CODING_STANDARDS, Environment constraints) — no orphaned port squatters.
// `stop()` is the only supported shutdown; callers must call it in a finally.
//
// SPDX-License-Identifier: CC0-1.0
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** A free localhost port. */
export function freePort() {
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
 * Start `next start` on a free port and resolve once it answers. Throws on
 * every failure — the caller's `finally` reaps the child on any path.
 * @returns {Promise<{base: string, stop: () => Promise<void>}>}
 */
export async function startServer() {
  if (!fs.existsSync(path.join(ROOT, '.next/BUILD_ID'))) {
    throw new Error('.next/BUILD_ID missing — run `npm run build` first (the instruments serve the production build)');
  }
  const port = await freePort();
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  // A server must die with the command (CODING_STANDARDS): if the instrument
  // is interrupted, reap the child on the way out instead of orphaning it.
  // A self-signal is never fenced, unlike a cross-command kill.
  const onSignal = (sig) => {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited early (${child.exitCode})`);
    try {
      await fetch(base + '/');
      break; // any response means it is up — route status is the tests' business
    } catch {
      if (Date.now() > deadline) throw new Error('next start did not become ready in 60s');
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return {
    base,
    async stop() {
      // Unregister before reaping: the run continues after stop() (the gate
      // writes its report), and a later signal must not run a handler for a
      // child that is already gone.
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
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
