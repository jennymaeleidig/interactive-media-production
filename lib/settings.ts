// SPDX-License-Identifier: CC0-1.0
//
// The viewer's settings: the one lever a viewer tunes, its default, and where a
// change is kept.
//
// The piece declares two characters, and the typing pace is theirs — how fast a
// line types itself out belongs to the character speaking it, scaled by the
// author's `[pace=...]` marker (`lib/chat-characters.mjs`, `lib/pacing.ts`). The
// composing clock and the voice's pitch are the piece's own tuning, not a
// viewer's. What is left for a viewer to tune is the one thing only they can
// decide: how loud the voice speaks, an accessibility lever. `SETTING_CONTROLS`
// is the whole of it, and the Settings page
// (`components/chat/disclosure.tsx`) renders from it, so a control with nothing
// behind it cannot reappear. The store is a plain module with a subscribe seam:
// `lib/voice.ts` reads it outside React for live volume, and React binds through
// `hooks/use-settings.ts`.
//
// Persistence is `localStorage['flock-chat-settings-v2']`, its own key beside the
// session (ADR 0006): a preference survives a reload, and the `start over` control
// clears the conversation without touching it. The version bump is the wipe: the
// stored shape changed from a page of pacing levers to one volume, and reading a
// `v1` copy — which the settings no longer declare — would be dead preference the
// new shape would have to ignore field by field. The old key is simply not read.
// Writes go through `resilientStore`, so a browser that refuses storage still
// tunes the piece for the visit.
import { ANIMALESE_VOLUME } from '@/lib/pacing';
import { localStorageStore, resilientStore, type SessionStore } from '@/lib/session-store.mjs';

/**
 * Everything a viewer can tune. One field, because it is the only lever that
 * belongs to a viewer rather than to the piece.
 */
export interface Settings {
  /** 0 silent to 1 full. */
  volume: number;
}

/** The settings a first visit carries: the piece's own tuning (`lib/pacing`). */
export const DEFAULT_SETTINGS: Settings = {
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
 * The Settings page's whole content: the accessibility lever, and nothing else.
 * A control here is a promise the piece keeps — `SETTING_CONTROLS` is what the
 * page renders, so a lever that moves nothing cannot be listed.
 */
export const SETTING_CONTROLS: readonly SettingControl[] = [
  {
    key: 'volume',
    label: 'Volume',
    hint: 'How loud the voice speaks; live, so it is heard at once.',
    min: 0,
    max: 1,
    step: 0.05,
    unit: '',
  },
];

/** The key a preference lives under, beside the session's own. The `-v2` suffix
 * marks the shape change: a stale `v1` copy is left unread rather than coerced. */
export const SETTINGS_KEY = 'flock-chat-settings-v2';

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

/** Put the lever back to the piece's own tuning and drop the stored copy. The
 * conversation is untouched — settings and session are separate keys. */
export function resetSettings(): void {
  current = defaults();
  storage().clear();
  for (const listener of listeners) listener();
}
