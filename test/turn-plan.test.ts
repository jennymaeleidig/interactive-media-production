// The turn plan, pinned without a timer or a DOM.
//
// `lib/turn-plan.ts` turns one engine turn into a schedule: land the viewer's
// echo now, then release the reply one message at a time behind its own beat.
// These assert the schedule as data — offsets and holds — so the hook that
// executes it needs no JSDOM play-back to be trusted.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { composingChars, planTurn, revealDelay, typingDelay } from '../lib/turn-plan';
import { MIN_TYPING_BEAT_MS, msPerChar, type Pacing } from '../lib/pacing';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const cam = (text: string): ChatBlock => ({ who: 'bot', type: 'text', text });
const cut = (text: string): ChatBlock => ({ who: 'bot', type: 'text', text, newMessage: true });
const me = (text: string): ChatBlock => ({ who: 'me', type: 'text', text });

const LONG = 'A reply long enough that its weight clears the composing floor and would be held.';
const SHORT = 'Ok.';

describe('the beat clock', () => {
  it('weighs a sequence by the characters its types contribute', () => {
    expect(composingChars([cam(LONG), me('ignored here')])).toBe(LONG.length + 'ignored here'.length);
  });

  it('floors even the shortest message so it reads as a turn', () => {
    expect(typingDelay([cam(SHORT)])).toBe(MIN_TYPING_BEAT_MS);
  });

  it('grows past the floor with the content', () => {
    expect(typingDelay([cam(LONG)])).toBeGreaterThan(MIN_TYPING_BEAT_MS);
  });
});

describe('planning a turn', () => {
  it('holds a lone reply behind its own weight, with no echo step', () => {
    const plan = planTurn(0, [cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 1, beatMs: typingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) }]);
  });

  it('lands the echo first and holds only the reply', () => {
    // The log already holds the greeting; the turn is the viewer's choice plus
    // the reply it produced.
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBe(2);
    expect(plan.steps).toEqual([{ through: 3, beatMs: typingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) }]);
  });

  it('releases a multi-message reply one message at a time, each offset absolute', () => {
    const plan = planTurn(0, [me('Get a Demo'), cam(LONG), cut('And a sign-off.')], { hold: true });
    expect(plan.echoEnd).toBe(1);
    expect(plan.steps).toEqual([
      { through: 2, beatMs: typingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) },
      {
        through: 3,
        beatMs: typingDelay([cut('And a sign-off.')]),
        revealMs: revealDelay([cut('And a sign-off.')]),
      },
    ]);
  });

  it('gives each step its own beat and reveal, so the next dots follow the line above', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG), cut(SHORT)], { hold: true });
    expect(plan.steps).toEqual([
      { through: 3, beatMs: typingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) },
      { through: 4, beatMs: typingDelay([cut(SHORT)]), revealMs: revealDelay([cut(SHORT)]) },
    ]);
  });

  it('lands everything in one step when the reply is not held', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: false });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 3, beatMs: 0, revealMs: 0 }]);
  });

  it('lands everything at once when the turn appends no reply', () => {
    // The viewer's own line with nothing behind it: there is nothing to compose.
    const plan = planTurn(1, [cam('greeting'), me('Support')], { hold: true });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 2, beatMs: 0, revealMs: 0 }]);
  });

  it('reads the pacing it is handed, not the module constants', () => {
    const slower: Pacing = { composingWordsPerMinute: 100, minimumBeatMs: 0, revealWordsPerMinute: 100 };
    expect(typingDelay([cam(LONG)], slower)).toBe(Math.round(LONG.length * msPerChar(100)));
    expect(revealDelay([cam(LONG)], slower)).toBeGreaterThan(revealDelay([cam(LONG)]));
    // A slower reveal types the same line for longer, so the next message waits longer.
    const plan = planTurn(0, [cam(LONG)], { hold: true, pacing: slower });
    expect(plan.steps[0].revealMs).toBe(revealDelay([cam(LONG)], slower));
  });
});
