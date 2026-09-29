// The bubble frame's geometry, pinned without a DOM.
//
// `lib/bubble-frame.ts` is the one place the landed bubble and the composing
// wait read their shape from: the reserved mark column, the corner radius and
// the squared corner, the mark's anchor, the width, and the background. These
// assert the corner rules directly, so a drift between the two bubbles fails
// here rather than in a screenshot.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_WIDTH_CLASS,
  MARK_ANCHOR_CLASS,
  MARK_COLUMN_CLASS,
  bubbleBackgroundClass,
  bubbleCornerClass,
} from '../lib/bubble-frame';

describe('the bubble corner rules', () => {
  it('carries the shared radius on every bubble', () => {
    expect(bubbleCornerClass('assistant')).toContain('rounded-card');
    expect(bubbleCornerClass('user')).toContain('rounded-card');
  });

  it('squares the mark-side corner toward a same-speaker neighbour', () => {
    // The mark side flips with the role: a bot bubble is on the left, the
    // viewer's on the right.
    expect(bubbleCornerClass('assistant', { continues: true })).toContain('rounded-tl-none');
    expect(bubbleCornerClass('user', { continues: true })).toContain('rounded-tr-none');
    expect(bubbleCornerClass('assistant', { continued: true })).toContain('rounded-bl-none');
    expect(bubbleCornerClass('user', { continued: true })).toContain('rounded-br-none');
  });

  it('squares both corners of a bubble inside a run, and neither on its own', () => {
    const middle = bubbleCornerClass('assistant', { continues: true, continued: true });
    expect(middle).toContain('rounded-tl-none');
    expect(middle).toContain('rounded-bl-none');
    const alone = bubbleCornerClass('assistant');
    expect(alone).not.toContain('none');
  });
});

describe('the bubble frame constants', () => {
  it('names the reserved column, the mark anchor, and the width once', () => {
    // The composing wait and the landed message must read the same values; the
    // characters seam asserts the mark does not move, and these are what it
    // would move with.
    expect(MARK_COLUMN_CLASS).toBe('w-7 shrink-0');
    expect(MARK_ANCHOR_CLASS).toContain('-left-9');
    expect(BUBBLE_WIDTH_CLASS).toBe('max-w-[85%]');
  });

  it('gives each role its own background', () => {
    expect(bubbleBackgroundClass('assistant')).toBe('bg-bubble-bot');
    expect(bubbleBackgroundClass('user')).toBe('bg-bubble-me');
  });
});
