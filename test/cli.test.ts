// The shared CLI seam (pipeline/cli.mjs): pure, so it is unit-tested here
// rather than exercised only through the CLIs that import it.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { makeArg, invokedDirectly } from '../pipeline/cli.mjs';

describe('makeArg', () => {
  it('reads the value after a flag', () => {
    const arg = makeArg(['--pages', '/a,/b', '--out', 'served']);
    expect(arg('--pages')).toBe('/a,/b');
    expect(arg('--out')).toBe('served');
  });

  it('returns null for an absent flag', () => {
    expect(makeArg(['--out', 'served'])('--pages')).toBeNull();
  });
});

describe('invokedDirectly', () => {
  it('is true for the process entry point', () => {
    const prev = process.argv[1];
    process.argv[1] = '/tmp/entry-cli-test.mjs';
    try {
      expect(invokedDirectly(pathToFileURL('/tmp/entry-cli-test.mjs').href)).toBe(true);
    } finally {
      process.argv[1] = prev;
    }
  });

  it('is false for an imported module', () => {
    expect(invokedDirectly('file:///not/the/entry.mjs')).toBe(false);
  });
});
