// The build's pass sequence (pipeline/passes.mjs): one numbered order with
// named preconditions, replacing the three hand-kept sequences — the file
// header's list, the section banners (scroll's banner sat before the embed
// pass's), and the runPipeline comments — that had already drifted apart.
import { describe, it, expect } from 'vitest';
import { PASSES, PASS_NAMES, passNamed } from '../pipeline/passes.mjs';

describe('pass sequence', () => {
  it('numbers every pass once, in order', () => {
    expect(PASSES.map((pass) => pass.n)).toEqual(PASSES.map((_, i) => i + 1));
    expect(new Set(PASS_NAMES).size).toBe(PASS_NAMES.length);
    for (const pass of PASSES) expect(pass.summary, pass.name).toBeTruthy();
  });

  it('names only real passes as preconditions', () => {
    for (const pass of PASSES) {
      if (pass.after !== null) expect(PASS_NAMES, pass.name).toContain(pass.after);
      for (const constraint of pass.before) {
        expect(PASS_NAMES, pass.name).toContain(constraint.name);
        expect(constraint.why, pass.name).toBeTruthy();
      }
    }
  });

  it('orders every named neighbour the way the constraint requires', () => {
    const position = new Map(PASSES.map((pass) => [pass.name, pass.n]));
    for (const pass of PASSES) {
      if (pass.after !== null) expect(position.get(pass.after)!, pass.name).toBeLessThan(pass.n);
      for (const constraint of pass.before) {
        expect(position.get(constraint.name)!, pass.name).toBeGreaterThan(pass.n);
      }
    }
  });

  it('keeps the load-bearing order: embeds before assets, assets before every injection, dedupe last', () => {
    const at = (name: string) => PASS_NAMES.indexOf(name);
    expect(at('embeds')).toBeLessThan(at('assets'));
    expect(at('assets')).toBeLessThan(at('motion'));
    for (const injected of ['motion', 'interactions', 'nav', 'chat', 'storyHook', 'legibility', 'scroll']) {
      expect(at('assets'), injected).toBeLessThan(at(injected));
    }
    expect(at('scroll')).toBeLessThan(at('write'));
    expect(at('write')).toBeLessThan(at('dedupe'));
    expect(PASSES.at(-1)?.name).toBe('dedupe');
  });

  it('throws for an unknown pass', () => {
    expect(() => passNamed('nope')).toThrow('unknown pass');
  });
});
