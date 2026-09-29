// The turn plan, pinned without a timer or a DOM.
//
// `lib/turn-plan.ts` turns one engine turn into a schedule: land the viewer's
// echo now, then release the reply one message at a time behind its own beat.
// These assert the schedule as data — offsets and holds — so the hook that
// executes it needs no JSDOM play-back to be trusted.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { composingChars, planTurn, composingDelay } from '../lib/turn-plan';
import { COMPOSING_EXIT_MS, COMPOSING_LEAD_MS, DEFAULT_PACING, FRAME_MS, MIN_COMPOSING_BEAT_MS, msPerChar, type Pacing } from '../lib/pacing';
import { muteRevealHoldMs } from '../lib/reveal';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const cam = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text });
const cut = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text, newMessage: true });
const link = (label: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'link', href: 'https://example.test/', label });
const me = (text: string): ChatBlock => ({ who: 'me', type: 'text', text });

const LONG = 'A reply long enough that its weight clears the composing floor and would be held.';
const SHORT = 'Ok.';

/** Every step that raises the dots waits their exit out before its message lands:
 * the exit animation's own length, plus a frame of slack for the commit that
 * starts it. */
const EXIT = COMPOSING_EXIT_MS + FRAME_MS;

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
    expect(plan.steps).toEqual([
      {
        through: 1,
        beatMs: composingDelay([cam(LONG)]),
        holdMs: 0,
        leadMs: 0,
        exitMs: EXIT,
      },
    ]);
  });

  it('lands the echo first and holds only the reply, whose dots wait behind it', () => {
    // The log already holds the greeting; the turn is the viewer's choice plus
    // the reply it produced.
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: true });
    expect(plan.echoEnd).toBe(2);
    expect(plan.steps).toEqual([
      {
        through: 3,
        beatMs: composingDelay([cam(LONG)]),
        holdMs: 0,
        leadMs: COMPOSING_LEAD_MS,
        exitMs: EXIT,
      },
    ]);
  });

  it('releases a multi-message reply one message at a time, each offset absolute', () => {
    const plan = planTurn(0, [me('Get a Demo'), cam(LONG), cut('And a sign-off.')], { hold: true });
    expect(plan.echoEnd).toBe(1);
    expect(plan.steps).toEqual([
      {
        through: 2,
        beatMs: composingDelay([cam(LONG)]),
        holdMs: 0,
        leadMs: COMPOSING_LEAD_MS,
        exitMs: EXIT,
      },
      {
        through: 3,
        beatMs: composingDelay([cut('And a sign-off.')]),
        holdMs: 0,
        leadMs: 0,
        exitMs: EXIT,
      },
    ]);
  });

  it('gives each step its own beat, so the next dots follow the line above', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG), cut(SHORT)], { hold: true });
    expect(plan.steps).toEqual([
      {
        through: 3,
        beatMs: composingDelay([cam(LONG)]),
        holdMs: 0,
        leadMs: COMPOSING_LEAD_MS,
        exitMs: EXIT,
      },
      {
        through: 4,
        beatMs: composingDelay([cut(SHORT)]),
        holdMs: 0,
        leadMs: 0,
        exitMs: EXIT,
      },
    ]);
  });

  it('waits a mute land out for its content weight, since it has no typewriter', () => {
    // A link, an image, or a frame never types, so its step cannot be awaited by
    // a reveal end. It carries a hold read from its own declared weight instead,
    // so it does not land instantly.
    const plan = planTurn(0, [link('Open the docs')], { hold: true });
    expect(plan.steps[0].holdMs).toBe(muteRevealHoldMs([link('Open the docs')]));
    expect(plan.steps[0].holdMs).toBeGreaterThan(0);
  });

  it('gives a typecapable land a zero hold, because it is awaited by event', () => {
    // A step whose blocks include a bot text block types itself out, so the hook
    // awaits the reveal's end rather than a hold. A link beside the text rides
    // the same land and does not add one.
    const plan = planTurn(0, [link('Open the docs'), cam(LONG)], { hold: true });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].holdMs).toBe(0);
  });

  it('charges the dot lead only to the step behind an echo that actually landed', () => {
    // A reply with no viewer line before it has nothing to wait behind, so the
    // dots go up at once rather than after a beat for a message that never came.
    const noEcho = planTurn(0, [cam(LONG)], { hold: true });
    expect(noEcho.steps.every((step) => step.leadMs === 0)).toBe(true);
    // And it is the schedule's input, not a constant: a caller that dials the
    // pacing dials the lead too.
    const brisk = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], {
      hold: true,
      pacing: { ...DEFAULT_PACING, composingLeadMs: 40 },
    });
    expect(brisk.steps[0].leadMs).toBe(40);
  });

  it('waits the dots’ exit out before landing, on every step that raised them', () => {
    // The reply must not pop in under a placeholder that is still leaving, so
    // each step carries the exit wait; the immediate lands raise no dots and so
    // carry none.
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG), cut(SHORT)], { hold: true });
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((step) => step.exitMs === EXIT)).toBe(true);
    const immediate = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: false });
    expect(immediate.steps[0].exitMs).toBe(0);
    // And, being the indicator's own animation length, it is not a pacing lever:
    // a substituted `Pacing` cannot move the wait out from under the transition.
    const quick = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], {
      hold: true,
      pacing: { ...DEFAULT_PACING, minimumBeatMs: 0, composingWordsPerMinute: 10_000 },
    });
    expect(quick.steps[0].exitMs).toBe(EXIT);
  });

  it('lands everything in one step when the reply is not held', () => {
    const plan = planTurn(1, [cam('greeting'), me('Support'), cam(LONG)], { hold: false });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 3, beatMs: 0, holdMs: 0, leadMs: 0, exitMs: 0 }]);
  });

  it('lands everything at once when the turn appends no reply', () => {
    // The viewer's own line with nothing behind it: there is nothing to compose.
    const plan = planTurn(1, [cam('greeting'), me('Support')], { hold: true });
    expect(plan.echoEnd).toBeNull();
    expect(plan.steps).toEqual([{ through: 2, beatMs: 0, holdMs: 0, leadMs: 0, exitMs: 0 }]);
  });

  it('reads the composing pacing it is handed', () => {
    const slower: Pacing = {
      composingWordsPerMinute: 100,
      minimumBeatMs: 0,
      composingLeadMs: 0,
      revealWordsPerMinute: 100,
    };
    expect(composingDelay([cam(LONG)], slower)).toBe(Math.round(LONG.length * msPerChar(100)));
    const plan = planTurn(0, [cam(LONG)], { hold: true, pacing: slower });
    expect(plan.steps[0].beatMs).toBe(composingDelay([cam(LONG)], slower));
  });
});
