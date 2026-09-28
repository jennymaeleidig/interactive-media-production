// SPDX-License-Identifier: CC0-1.0
//
// The viewer's settings: the levers a viewer tunes, their defaults, and where a
// change is kept.
//
// `lib/pacing.ts` declares the piece's own tuning; this module turns those
// defaults into a live, viewer-owned preference. One declaration —
// `SETTING_CONTROLS` — carries each lever's label, range, and step, and the
// Settings page (`components/chat/disclosure.tsx`) renders from it, so adding a
// lever is one entry here and one consumer there. The store is a plain module
// with a subscribe seam: `lib/voice.ts` reads it outside React for live volume,
// the turn schedule is handed the pacing it needs (`hooks/use-dialogue.ts`), and
// React binds through `hooks/use-settings.ts`.
//
// Persistence is `localStorage['flock-chat-settings']`, its own key beside the
// session (ADR 0006): a preference survives a reload, and the `start over`
// control clears the conversation without touching it. Writes go through
// `resilientStore`, so a browser that refuses storage still tunes the piece for
// the visit.
import {
  ANIMALESE_BASE_PITCH,
  ANIMALESE_PITCH_RANGE,
  ANIMALESE_VOLUME,
  ANIMALESE_WORDS_PER_MINUTE,
  DEFAULT_PACING,
  type Pacing,
  TYPEWRITER_WORDS_PER_MINUTE,
} from '@/lib/pacing';
import { localStorageStore, resilientStore, type SessionStore } from '@/lib/session-store.mjs';

/**
 * Everything a viewer can tune. The pacing fields are the schedule's own
 * (`Pacing`); the rest are the voice's. A value here is always within its
 * control's range — the store clamps on the way in.
 */
export interface Settings extends Pacing {
  /** 0 silent to 1 full. */
  volume: number;
  /** The sample-pitch multiplier; 1.0 is the library's own. */
  basePitch: number;
  /** How far each letter's pitch jitters, ±half this. */
  pitchRange: number;
  /** The voice's pace, in words per minute — its own clock, stopped with the typing. */
  voiceWordsPerMinute: number;
}

/** The settings a first visit carries: the piece's own tuning (`lib/pacing`). */
export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_PACING,
  basePitch: ANIMALESE_BASE_PITCH,
  pitchRange: ANIMALESE_PITCH_RANGE,
  voiceWordsPerMinute: ANIMALESE_WORDS_PER_MINUTE,
  volume: ANIMALESE_VOLUME,
};

/** One lever's control: what it is, how it reads, and the range it is held to. */
export interface SettingControl {
  key: keyof Settings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

/**
 * The Settings page's whole content, in order. Voice first — it is the part a
 * viewer hears and the accessibility lever (volume) — then the paces that
 * decide how fast the piece moves. `FRAME_MS` is deliberately absent: it is a
 * consequence of these, not an independent knob.
 */
export const SETTING_CONTROLS: readonly SettingControl[] = [
  { key: 'volume', label: 'Volume', hint: 'How loud the voice speaks; live, so it is heard at once.', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'basePitch', label: 'Pitch', hint: 'How high the next line speaks.', min: 0.2, max: 2, step: 0.05, unit: '×' },
  {
    key: 'pitchRange',
    label: 'Pitch spread',
    hint: 'How much the next line’s letters wander in pitch.',
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: '',
  },
  {
    key: 'voiceWordsPerMinute',
    label: 'Voice speed',
    hint: 'How fast the next line speaks; its own pace is 160.',
    min: 60,
    max: 400,
    step: 10,
    unit: 'wpm',
  },
  {
    key: 'revealWordsPerMinute',
    label: 'Typing speed',
    hint: 'How fast a line types itself out, up to one character per animation frame.',
    min: 100,
    max: TYPEWRITER_WORDS_PER_MINUTE,
    step: 10,
    unit: 'wpm',
  },
  {
    key: 'composingWordsPerMinute',
    label: 'Thinking speed',
    hint: 'How long the dots hold before a reply lands.',
    min: 100,
    max: 1200,
    step: 10,
    unit: 'wpm',
  },
  {
    key: 'minimumBeatMs',
    label: 'Shortest pause',
    hint: 'The least a reply pauses before it lands.',
    min: 0,
    max: 2000,
    step: 50,
    unit: 'ms',
  },
];

/** The key a preference lives under, beside the session's own. */
export const SETTINGS_KEY = 'flock-chat-settings';

let backing: SessionStore | null = null;

/** The storage behind the settings, built on first use. It is guarded rather
 * than unreachable: `resilientStore` turns a server's missing `window` into “no
 * stored copy”, so the module-scope `readSettings()` below is safe outside a
 * browser and the defaults are what a server render sees. */
function storage(): SessionStore {
  if (!backing) backing = resilientStore(localStorageStore(SETTINGS_KEY));
  return backing;
}

/** One value, held inside its control's range. */
function clamp(value: number, control: SettingControl): number {
  return Math.min(control.max, Math.max(control.min, value));
}

/** A copy of the piece's own tuning, so a caller can never mutate the default. */
function defaults(): Settings {
  return { ...DEFAULT_SETTINGS };
}

/** A candidate read back from storage, made safe: every known field that is a
 * finite number is clamped to its range, and anything missing or malformed falls
 * back to the default. Unknown keys are dropped, so a stale snapshot cannot
 * smuggle a field the controls do not declare. */
function coerce(candidate: unknown): Settings {
  const source = (typeof candidate === 'object' && candidate !== null ? candidate : {}) as Record<string, unknown>;
  const merged: Settings = defaults();
  for (const control of SETTING_CONTROLS) {
    const value = source[control.key];
    if (typeof value === 'number' && Number.isFinite(value)) merged[control.key] = clamp(value, control);
  }
  return merged;
}

/** The settings as persisted, or the defaults when nothing valid is stored. */
export function readSettings(): Settings {
  const raw = storage().read();
  if (raw === null) return defaults();
  try {
    return coerce(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

let current: Settings = readSettings();
const listeners = new Set<() => void>();

/** The current settings. The reference changes only when a value does, which is
 * what `useSyncExternalStore` needs to tell a re-render from a no-op. */
export function getSettings(): Settings {
  return current;
}

/** Listen for a change; returns the unsubscribe. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply a partial change: coerce, keep, and notify. */
export function updateSettings(patch: Partial<Settings>): void {
  current = coerce({ ...current, ...patch });
  storage().write(JSON.stringify(current));
  for (const listener of listeners) listener();
}

/** Put every lever back to the piece's own tuning and drop the stored copy. The
 * conversation is untouched — settings and session are separate keys. */
export function resetSettings(): void {
  current = defaults();
  storage().clear();
  for (const listener of listeners) listener();
}
