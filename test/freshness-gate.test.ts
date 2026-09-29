// The character/pace gate, as a build failure.
//
// The freshness gate (`npm run chat:check`) is the build path; its compile step
// ends in `validateDialogue`, which parses every compiled `runLine` with the
// runtime's own `LineParser` and throws on a speaker the cast does not declare
// or a `[pace=...]` value outside the closed preset vocabulary. This suite pins
// that throw directly, over hand-built programs, so the loud failure is proven
// without writing bad Yarn into the tree. `npm run chat:check` proves the same
// function over the real script in CI.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import type { Program } from 'yarnspinner-typescript';
import { validateDialogue } from '../scripts/build-chat-runtime.mjs';

/** A minimal compiled program holding one `runLine` instruction. */
const program = (...lines: string[]): Program =>
  ({
    nodes: {
      Start: { instructions: lines.map((text) => ({ op: 'runLine', text })) },
    },
  }) as unknown as Program;

describe('the freshness gate', () => {
  it('passes a line spoken by a declared character, with a declared preset', () => {
    expect(() => validateDialogue(program('Cam: hello', 'Flock: hi there', 'Cam: [pace=slow]wait[/pace] now'))).not.toThrow();
    expect(() => validateDialogue(program('Cam: [pace=fast]go[/pace]'))).not.toThrow();
  });

  it('passes a line with no speaker prefix, which falls back to the default', () => {
    expect(() => validateDialogue(program('a stage-direction line with no prefix'))).not.toThrow();
  });

  it('fails an undeclared speaker, naming the node and the offender', () => {
    expect(() => validateDialogue(program('Nova: hi'))).toThrow(/Nova.*is not a declared character/);
  });

  it('fails an undeclared pace preset, naming the value', () => {
    expect(() => validateDialogue(program('Cam: slow [pace=nonsense]down[/pace]'))).toThrow(/nonsense.*is not a declared preset/);
  });

  it('fails a retired preset name, so a dropped label cannot creep back in', () => {
    // `fastest` is not in the vocabulary: there is no faster *step* than `fast`
    // (`lib/pace-presets.mjs`). A script that still writes one is a build failure,
    // not a silent normal.
    expect(() => validateDialogue(program('Cam: [pace=fastest]go[/pace]'))).toThrow(/fastest.*is not a declared preset/);
  });
});
