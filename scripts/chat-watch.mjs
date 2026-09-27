// Watch the chat's sources and rebuild the runtime on every save.
//
// The page loads one generated file, `scripts/chat-runtime.js`, and the asset
// route reads it from disk on every request — so the dev server needs no
// restart, only a recompile. This is that recompile, on a loop: the same
// builder `npm run chat:build` runs, once at start and again whenever a source
// it reads changes.
//
// The watched set is exactly what a rebuild consumes: the Yarn sources (the
// program) and the modules the bundle inlines (the engine and the inventory).
// The generated files are deliberately outside it — writing them must never
// schedule another build. A source that fails to compile is reported and
// skipped, with the last good bytes left in place; the loop keeps watching so
// the next save can fix it.
//
// It polls mtimes rather than `fs.watch`: a handful of files, a stat every
// third of a second, and no descriptor or platform-recursion problems to
// explain when a watch silently stops delivering events.
//
// The other half of the loop is the browser: reload, then `?` → "Start over".
// The session is persisted in `localStorage`, so a reload resumes the
// conversation already on screen and would otherwise keep showing old copy;
// "Start over" (dev-only) drops it and replays the greeting from the program
// just compiled.
//
// SPDX-License-Identifier: CC0-1.0
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeChatRuntime } from './build-chat-runtime.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The Yarn sources: the directory the project's `sourceFiles` glob reads. */
const DIALOGUE_DIR = path.join(ROOT, 'assets', 'dialogue');

/** The modules the runtime bundle inlines, listed so a change to one rebuilds. */
const MODULES = [
  path.join(ROOT, 'scripts', 'chat-engine.mjs'),
  path.join(ROOT, 'lib', 'chat-blocks.mjs'),
  path.join(ROOT, 'lib', 'chat-turn.mjs'),
];

/** A dialogue file a rebuild reads. */
const SOURCE = /\.(yarn|yarnproject)$/;

/** How often the sources' mtimes are checked. Cheap; the set is a handful. */
const POLL_MS = 300;

/**
 * Every source file a rebuild reads, with the mtime and size that stand in for
 * its contents. A file that vanishes mid-walk (an editor's write-then-rename)
 * is simply left out of this pass and re-seen on the next one.
 * @returns {string}
 */
function fingerprint() {
  /** @type {string[]} */
  const files = [...MODULES];
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE.test(entry.name)) files.push(full);
    }
  };
  walk(DIALOGUE_DIR);
  files.sort();
  return files
    .map((file) => {
      try {
        const stat = statSync(file);
        return `${file}:${stat.mtimeMs}:${stat.size}`;
      } catch {
        return `${file}:gone`;
      }
    })
    .join('\n');
}

let building = false;
let queued = false;

/** Rebuild once, reporting either the sizes or the compile failure. @param {string} reason */
async function rebuild(reason) {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  const started = Date.now();
  try {
    const { program, runtime } = await writeChatRuntime();
    console.log(
      `chat rebuilt (${reason}) — program ${program.length} B, runtime ${runtime.length} B in ${Date.now() - started}ms`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`chat build failed (${reason}) — ${message}`);
    console.error('the last good runtime is still in place; save to retry');
  } finally {
    building = false;
    if (queued) {
      queued = false;
      await rebuild('queued change');
    }
  }
}

console.log('watching the chat sources — save to recompile; Ctrl-C to stop');
console.log('browser loop: reload, then `?` → "Start over"');
await rebuild('startup');

let last = fingerprint();
setInterval(() => {
  const next = fingerprint();
  if (next === last) return;
  last = next;
  void rebuild('source change');
}, POLL_MS);
