// The turn plan, pinned without a timer or a DOM.
//
// `lib/turn-plan.ts` turns one engine turn into a schedule: land the viewer's
// echo now, then release the reply one message at a time behind its own beat.
// These assert the schedule as data — offsets and holds — so the hook that
// executes it needs no JSDOM play-back to be trusted.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { composingChars, planTurn, revealDelay, composingDelay, revealRuns, revealWordsPerMinuteFor } from '../lib/turn-plan';
import { FRAME_MS, MIN_COMPOSING_BEAT_MS, msPerChar, revealMsPerChar, revealWordsForPreset, type Pacing } from '../lib/pacing';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const cam = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text });
const cut = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text, newMessage: true });
const flock = (text: string): ChatBlock => ({ who: 'bot', speaker: 'flock', type: 'text', text });
const me = (text: string): ChatBlock => ({ who: 'me', type: 'text', text });

const LONG = 'A reply long enough that its weight clears the composing floor and would be held.';
const SHORT = 'Ok.';

describe('the beat clock', () => {
  it('weighs a sequence by the characters its types contribute', () => {
    expect(composingChars([cam(LONG), me('ignored here')])).toBe(LONG.length + 'ignored here'.length);
  });

  it('floors even the shortest message so it reads as a turn', () => {
    expect(composingDelay([cam(SHORT)])).toBe(MIN_COMPOSING_BEAT_MS);
  });

  it('grows past the floor with the content', () => {
    expect(composingDelay([cam(LONG)])).toBeGreaterThan(MIN_COMPOSING_BEAT_MS);
  });
});

describe('planning a turn', () => {
  it('holds a lone reply behind its own weight, with no echo step', () => {
    const plan = planTurn(0, [cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 1, beatMs: composingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) }]);
  });

  it('lands the echo first and holds only the reply', () => {
    // The log already holds the greeting; the turn is the viewer's choice plus
    // the reply it produced.
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBe(2);
    expect(plan.steps).toEqual([{ through: 3, beatMs: composingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) }]);
  });

  it('releases a multi-message reply one message at a time, each offset absolute', () => {
    const plan = planTurn(0, [me('Get a Demo'), cam(LONG), cut('And a sign-off.')], { hold: true });
    expect(plan.echoEnd).toBe(1);
    expect(plan.steps).toEqual([
      { through: 2, beatMs: composingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) },
      {
        through: 3,
        beatMs: composingDelay([cut('And a sign-off.')]),
        revealMs: revealDelay([cut('And a sign-off.')]),
      },
    ]);
  });

  it('gives each step its own beat and reveal, so the next dots follow the line above', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG), cut(SHORT)], { hold: true });
    expect(plan.steps).toEqual([
      { through: 3, beatMs: composingDelay([cam(LONG)]), revealMs: revealDelay([cam(LONG)]) },
      { through: 4, beatMs: composingDelay([cut(SHORT)]), revealMs: revealDelay([cut(SHORT)]) },
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

  it('reads the pacing it is handed, and the speaker’s own reveal pace', () => {
    const slower: Pacing = { composingWordsPerMinute: 100, minimumBeatMs: 0, revealWordsPerMinute: 100 };
    expect(composingDelay([cam(LONG)], slower)).toBe(Math.round(LONG.length * msPerChar(100)));
    // The reveal pace belongs to the character, not the settings: Flock rests
    // slower than Cam (fewer words per minute), so the same line types for longer
    // and the next message waits longer. A character that declares no pace
    // inherits `DEFAULT_PACING`.
    expect(revealWordsPerMinuteFor(flock(LONG))).toBeLessThan(revealWordsPerMinuteFor(cam(LONG)));
    expect(revealDelay([flock(LONG)])).toBeGreaterThan(revealDelay([cam(LONG)]));
    const plan = planTurn(0, [cam(LONG)], { hold: true, pacing: slower });
    expect(plan.steps[0].revealMs).toBe(revealDelay([cam(LONG)], slower));
  });
});

describe('the paced reveal', () => {
  const paced = (segments: { text: string; pace?: string }[]): ChatBlock => ({
    who: 'bot',
    speaker: 'cam',
    type: 'text',
    text: segments.map((segment) => segment.text).join(''),
    segments,
  });

  it('types an authored line in preset stretches, and the schedule sums them', () => {
    const block = paced([{ text: 'aa', pace: 'slowest' }, { text: 'bb', pace: 'fastest' }]);
    const slow = revealMsPerChar(revealWordsForPreset(400, 'slowest'));
    const fast = revealMsPerChar(revealWordsForPreset(400, 'fastest'));
    expect(revealDelay([block])).toBe(Math.ceil(2 * slow + 2 * fast) + FRAME_MS);
    // The slow stretch makes the whole line hold longer than the same characters
    // read at one pace — the override is real, not decorative.
    expect(revealDelay([block])).toBeGreaterThan(revealDelay([cam('aabb')]));
  });

  it('leaves a line without a segment at the speaker’s resting pace', () => {
    const runs = revealRuns(cam('plain'));
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('plain');
    expect(runs[0].delayMs).toBe(revealMsPerChar(revealWordsPerMinuteFor(cam('plain'))));
  });
});
