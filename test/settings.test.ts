// @vitest-environment jsdom
//
// The settings store (`lib/settings`): the one lever, its default, its range,
// and the preference that survives a reload. Persistent, so it runs against a
// real `localStorage`; the store's own key — and its version bump away from the
// pacing levers the piece no longer exposes — is asserted, since that key is the
// ADR 0006 decision.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANIMALESE_VOLUME } from '@/lib/pacing';
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
    expect(DEFAULT_SETTINGS).toEqual({ volume: ANIMALESE_VOLUME });
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('is volume alone, so no control promises something the piece does not do', () => {
    expect(SETTING_CONTROLS.map((control) => control.key)).toEqual(['volume']);
  });

  it('clamps a value to its control range, so no lever can leave it', () => {
    updateSettings({ volume: 4 });
    expect(getSettings().volume).toBe(1);
    updateSettings({ volume: -1 });
    expect(getSettings().volume).toBe(0);
  });

  it('persists under its versioned key and reads back', () => {
    updateSettings({ volume: 0.5 });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) as string).volume).toBe(0.5);
    expect(readSettings()).toEqual({ volume: 0.5 });
  });

  it('leaves a stale v1 copy unread, so no dead preference survives the bump', () => {
    localStorage.setItem('flock-chat-settings', JSON.stringify({ volume: 0.1, revealWordsPerMinute: 200 }));
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('drops a malformed snapshot, an unknown field, and a non-number', () => {
    localStorage.setItem(SETTINGS_KEY, 'not json');
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rogue: 9, volume: 0.25 }));
    expect(readSettings()).toEqual({ volume: 0.25 });
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
});
