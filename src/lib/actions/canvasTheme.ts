// SPDX-License-Identifier: CC0-1.0
import type { Action } from 'svelte/action';

/** The value behind body[data-theme] — see app.css's theme flip. */
export type CanvasTone = 'light' | 'dark';

// Ownership token: the last action to run owns the attribute, so one
// route's cleanup can't wipe the tone the next route just stamped —
// Svelte branch swaps don't guarantee destroy-before-create ordering.
let owner: object | null = null;

/**
 * Canvas tone: stamps body[data-theme] so the document canvas (overscroll
 * bounce area) matches the route's edges, and cleans up on leave. The
 * attribute means "canvas tone", not "page mode" — a page's bookends
 * decide the value (see each route's comment).
 */
export const canvasTheme: Action<HTMLElement, CanvasTone> = (_node, tone) => {
	const mine = {};
	owner = mine;
	document.body.dataset.theme = tone;
	return {
		destroy() {
			if (owner === mine) {
				delete document.body.dataset.theme;
				owner = null;
			}
		}
	};
};
