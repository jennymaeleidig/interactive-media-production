// The reveal's pure half: the step queue and the exactly-once end event, pinned
// without a DOM or a typewriter.
//
// `lib/reveal.ts` derives a line's runs from its parse-time segments and its
// speaker's resting pace, and owns the end event the turn schedule and the voice
// attach to. These assert the queue as data — text, requested delay, characters
// per step — and the event's once-only rule, so the adapter that wires them can
// be thin.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it, vi } from 'vitest';
import { createReveal, hasTypewriter, muteRevealHoldMs, revealRuns, revealWordsPerMinuteFor } from '../lib/reveal';
import { revealCharsPerStep, revealDelayMs, revealMsPerChar, revealWordsForPreset } from '../lib/pacing';
import { characterFor } from '../lib/chat-characters.mjs';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const cam = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text });
const flock = (text: string): ChatBlock => ({ who: 'bot', speaker: 'flock', type: 'text', text });
const link = (label: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'link', href: 'https://example.test/', label });

const paced = (segments: { text: string; pace?: string }[]): ChatBlock => ({
  who: 'bot',
  speaker: 'cam',
  type: 'text',
  text: segments.map((segment) => segment.text).join(''),
  segments,
});

describe('the reveal pace', () => {
  it('belongs to the character, not the settings', () => {
    // Flock rests slower than Cam (fewer words per minute), so the same line
    // types for longer. A character that declares no pace inherits the piece
    // default.
    expect(revealWordsPerMinuteFor(flock('x'))).toBeLessThan(revealWordsPerMinuteFor(cam('x')));
    expect(revealWordsPerMinuteFor(cam('x'))).toBe(characterFor('cam').paceWordsPerMinute);
  });
});

describe('the reveal queue', () => {
  it('types an authored line in preset stretches, each at its own pace', () => {
    const runs = revealRuns(paced([{ text: 'wait ', pace: 'slow' }, { text: 'now', pace: 'fast' }]));
    expect(runs.map((run) => run.text)).toEqual(['wait ', 'now']);
    // The requested delay is what the typewriter is handed; a `fast` stretch
    // still keeps `normal`'s delay and rides two characters per step instead.
    expect(runs[0].delayMs).toBe(revealDelayMs(revealWordsForPreset(400, 'slow')));
    expect(runs[0].charsPerStep).toBe(revealCharsPerStep('slow'));
    expect(runs[1].delayMs).toBe(revealDelayMs(revealWordsForPreset(400, 'normal')));
    expect(runs[1].charsPerStep).toBe(2);
  });

  it('rides a fast stretch two characters per step, so each step is half the pace', () => {
    const [run] = revealRuns(paced([{ text: 'abcd', pace: 'fast' }]));
    expect(run.charsPerStep).toBe(2);
    expect(run.delayMs).toBe(revealDelayMs(revealWordsForPreset(400, 'normal')));
    const normalStep = revealMsPerChar(revealWordsForPreset(400, 'normal'));
    const fast = revealMsPerChar(revealWordsForPreset(400, 'fast'), run.charsPerStep);
    expect(fast).toBe(normalStep / 2);
  });

  it('leaves a line without a segment at the speaker’s resting pace', () => {
    const runs = revealRuns(cam('plain'));
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('plain');
    // The requested delay is what the typewriter is handed; an unmarked line
    // rides one character per step.
    expect(runs[0].delayMs).toBe(revealDelayMs(revealWordsPerMinuteFor(cam('plain'))));
    expect(runs[0].charsPerStep).toBe(1);
  });

  it('gives a non-text block no runs, because it does not type', () => {
    expect(revealRuns(link('Open the docs'))).toEqual([]);
  });
});

describe('whether a land types', () => {
  it('is true only for a bot’s own text', () => {
    expect(hasTypewriter([cam('x')])).toBe(true);
    expect(hasTypewriter([link('x')])).toBe(false);
    expect(hasTypewriter([{ who: 'me', type: 'text', text: 'hi' }])).toBe(false);
    expect(hasTypewriter([link('x'), cam('y')])).toBe(true);
  });

  it('waits a mute land for its content weight, at the speaker’s pace', () => {
    const hold = muteRevealHoldMs([link('Open the docs')]);
    expect(hold).toBeGreaterThan(0);
    // The weight is read at the speaker's reveal pace, so Flock's link holds
    // longer than Cam's.
    const flockLink: ChatBlock = { who: 'bot', speaker: 'flock', type: 'link', href: 'https://example.test/', label: 'Open the docs' };
    expect(muteRevealHoldMs([flockLink])).toBeGreaterThan(hold);
  });
});

describe('the reveal’s end', () => {
  it('fires exactly once, however many paths reach it', () => {
    const onEnd = vi.fn();
    const reveal = createReveal(cam('hello'), { onEnd });
    reveal.end();
    reveal.end();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('starts once, and not at all after it has ended', () => {
    const onStart = vi.fn();
    const reveal = createReveal(cam('hello'), { onStart });
    reveal.start();
    reveal.start();
    expect(onStart).toHaveBeenCalledTimes(1);

    const late = createReveal(cam('hello'), { onStart: vi.fn() });
    const start = late.start;
    late.end();
    start();
    expect(late.runs).toHaveLength(1);
  });

  it('carries the same queue the block derives', () => {
    const block = paced([{ text: 'ab', pace: 'fast' }]);
    expect(createReveal(block).runs).toEqual(revealRuns(block));
  });
});
