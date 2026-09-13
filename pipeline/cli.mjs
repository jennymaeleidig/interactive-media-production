// The small CLI seam every Node-ESM entry point in this repo shares: parse the
// `--flag value` pairs, tell whether this module is the process entry point (as
// opposed to an import from a test or another module), and fan out over URLs
// with bounded concurrency. All three were copied into each entry point;
// single-sourcing them keeps the entry-point guard and the fan-out identical.
//
// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Build an `arg(name)` reader over a raw argv list. Returns the value after
 * the named flag, or null when the flag is absent.
 * @param {string[]} argv
 * @returns {(name: string) => string | null}
 */
export function makeArg(argv) {
  return (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
}

/**
 * True when the module identified by `metaUrl` is the process entry point —
 * the guard that keeps a CLI's `main()` from running on import.
 * @param {string} metaUrl  pass `import.meta.url`
 * @returns {boolean}
 */
export function invokedDirectly(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

/**
 * Run `fn` over `items` with bounded concurrency, preserving input order. The
 * serving check and the upstream watch both fan out over URLs, so the limiter
 * lives here beside the other shared CLI glue rather than duplicated in each
 * driver.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
