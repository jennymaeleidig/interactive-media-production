'use client';

// The React binding to the settings store (`lib/settings`).
//
// `useSyncExternalStore` is the right primitive here because the store is a
// plain module outside React: the voice reads it without a hook, so the
// component tree subscribes to the same source of truth rather than holding a
// copy. The server snapshot is the defaults' own reference, stable across
// renders, so hydration does not thrash.
//
// SPDX-License-Identifier: CC0-1.0
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, getSettings, subscribeSettings, type Settings } from '@/lib/settings';

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS);
}
