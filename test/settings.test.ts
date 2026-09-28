// @vitest-environment jsdom
//
// The settings store (`lib/settings`): the levers, their defaults, their ranges,
// and the preference that survives a reload. Persistent, so it runs against a
// real `localStorage`; the store's own key is asserted, since that key is the
// ADR 0006 decision.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMALESE_BASE_PITCH,
  ANIMALESE_PITCH_RANGE,
  ANIMALESE_VOLUME,
  ANIMALESE_WORDS_PER_MINUTE,
  FRAME_MS,
  MIN_TYPING_BEAT_MS,
  msPerChar,
  TYPING_WORDS_PER_MINUTE,
  TYPEWRITER_WORDS_PER_MINUTE,
} from '@/lib/pacing';
import {
  DEFAULT_SETTINGS,
  getSettings,
  readSettings,
  resetSettings,
  SETTING_CONTROLS,
  SETTINGS_KEY,
  subscribeSettings,
  updateSettings,
} from '@/lib/settings';

describe('the settings store', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettings();
  });

  it("starts at the piece's own tuning", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      basePitch: ANIMALESE_BASE_PITCH,
      composingWordsPerMinute: TYPING_WORDS_PER_MINUTE,
      minimumBeatMs: MIN_TYPING_BEAT_MS,
      pitchRange: ANIMALESE_PITCH_RANGE,
      revealWordsPerMinute: TYPEWRITER_WORDS_PER_MINUTE,
      voiceWordsPerMinute: ANIMALESE_WORDS_PER_MINUTE,
      volume: ANIMALESE_VOLUME,
    });
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps a value to its control range, so no lever can leave it', () => {
    updateSettings({ basePitch: 0.01, volume: 4 });
    expect(getSettings().basePitch).toBe(0.2);
    expect(getSettings().volume).toBe(1);
  });

  it('persists under its own key and reads back', () => {
    updateSettings({ revealWordsPerMinute: 400, volume: 0.5 });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) as string).volume).toBe(0.5);
    expect(readSettings().revealWordsPerMinute).toBe(400);
  });

  it('drops a malformed snapshot, an unknown field, and a non-number', () => {
    localStorage.setItem(SETTINGS_KEY, 'not json');
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ basePitch: 'loud', rogue: 9, volume: 0.25 }));
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS, volume: 0.25 });
  });

  it('notifies subscribers, and stops once unsubscribed', () => {
    const listener = vi.fn();
    const off = subscribeSettings(listener);
    updateSettings({ volume: 0.2 });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    updateSettings({ volume: 0.3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('resets to defaults and clears the stored copy', () => {
    updateSettings({ volume: 0.2 });
    resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('caps the reveal lever at the fastest safe pace, never in a dead zone', () => {
    const control = SETTING_CONTROLS.find((entry) => entry.key === 'revealWordsPerMinute');
    expect(control?.max).toBe(TYPEWRITER_WORDS_PER_MINUTE);
    // The ceiling sits just under a frame, so the typewriter reliably advances
    // one character per frame; a value at the frame itself would tip into the
    // two-frame cliff and type at half speed.
    expect(msPerChar(control?.max ?? 0)).toBeLessThan(FRAME_MS);
    updateSettings({ revealWordsPerMinute: control?.max ?? 0 });
    expect(getSettings().revealWordsPerMinute).toBe(control?.max);
  });
});
