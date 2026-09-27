// The turn plan, pinned without a timer or a DOM.
//
// `lib/turn-plan.ts` turns one engine turn into a schedule: land the viewer's
// echo now, then release the reply one message at a time behind its own beat.
// These assert the schedule as data — offsets and holds — so the hook that
// executes it needs no JSDOM play-back to be trusted.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { composingChars, planTurn, typingDelay } from '../lib/turn-plan';
import { MIN_TYPING_BEAT_MS } from '../lib/pacing';
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
    expect(plan.steps).toEqual([{ through: 1, beatMs: typingDelay([cam(LONG)]) }]);
  });

  it('lands the echo first and holds only the reply', () => {
    // The log already holds the greeting; the turn is the viewer's choice plus
    // the reply it produced.
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBe(2);
    expect(plan.steps).toEqual([{ through: 3, beatMs: typingDelay([cam(LONG)]) }]);
  });

  it('releases a multi-message reply one message at a time, each offset absolute', () => {
    const plan = planTurn(0, [me('Get a Demo'), cam(LONG), cut('And a sign-off.')], { hold: true });
    expect(plan.echoEnd).toBe(1);
    expect(plan.steps).toEqual([
      { through: 2, beatMs: typingDelay([cam(LONG)]) },
      { through: 3, beatMs: typingDelay([cut('And a sign-off.')]) },
    ]);
  });

  it('lands everything in one step when the reply is not held', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: false });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 3, beatMs: 0 }]);
  });

  it('lands everything at once when the turn appends no reply', () => {
    // The viewer's own line with nothing behind it: there is nothing to compose.
    const plan = planTurn(1, [cam('greeting'), me('Support')], { hold: true });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 2, beatMs: 0 }]);
  });
});
