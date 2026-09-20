// The cleared vocabulary, as a guard.
//
// The reconstruction this repo used to carry is gone from the tree, and its
// names are the cheapest way for it to come back: a stale import, a path in a
// document, a comment pointing at a module that no longer exists. The tokens
// below are that vocabulary, and no tracked file outside this one may use them.
//
// The check is deliberately blunt: it reads whole files, so it catches the token
// in prose as readily as in an import. A false positive costs a reviewer a
// minute; a false negative is a reconstruction creeping back in.
//
// SPDX-License-Identifier: CC0-1.0
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** This file, which has to name what it forbids. */
const SELF = 'test/vocabulary.test.ts';

/** The captured tree, its roster of injected files, and the checks that watched them. */
const RETIRED = ['served/', 'injected-layers', 'injected-source', 'capture-list', 'upstream-', 'safe-browsing', 'lottie'];

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file !== '' && file !== SELF);

describe('the retired vocabulary', () => {
  it('names nothing the reconstruction owned', () => {
    const offenders = tracked.flatMap((file) => {
      // a tracked file deleted in the working tree carries no content yet, and
      // its deletion is what the next commit is about
      if (!existsSync(file)) return [];
      const bytes = readFileSync(file, 'utf8');
      return RETIRED.filter((token) => bytes.includes(token)).map((token) => `${file}: ${token}`);
    });
    // An empty list is the point: every entry here is a file that still says
    // "the reconstruction" out loud.
    expect(offenders).toEqual([]);
  });

  it('reads the whole tracked set, so the guard cannot pass by finding nothing', () => {
    expect(tracked.length).toBeGreaterThan(20);
    expect(tracked).toContain('package.json');
    expect(tracked).toContain('CODING_STANDARDS.md');
  });
});
