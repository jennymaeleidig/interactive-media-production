// The transcript's day divider: the reference widget's own 12-hour clock,
// pinned here so a change to the format is a decision rather than a drift. The
// viewer's locale is deliberately not consulted — the divider is part of what
// the piece reproduces, like the pinned copy.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { dayLabel } from '@/lib/time';

describe('the day divider', () => {
  const at = (hours: number, minutes: number) => new Date(2026, 8, 19, hours, minutes, 0, 0);

  it('reads the day, then the hour on a 12-hour clock', () => {
    expect(dayLabel(at(0, 15))).toBe('Today, 12:15 am');
    expect(dayLabel(at(9, 7))).toBe('Today, 9:07 am');
    expect(dayLabel(at(12, 0))).toBe('Today, 12:00 pm');
    expect(dayLabel(at(13, 5))).toBe('Today, 1:05 pm');
    expect(dayLabel(at(23, 59))).toBe('Today, 11:59 pm');
  });
});
