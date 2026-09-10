// The small CLI seam every Node-ESM entry point in this repo shares: parse the
// `--flag value` pairs, and tell whether this module is the process entry point
// (as opposed to an import from a test or another module). Both were copied
// into each CLI; single-sourcing them keeps the entry-point guard identical.
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
