// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The assistant-above-the-take-over layering is a standing decision (map
// ticket 02): the AI Sales Assistant is ALWAYS on top. The z-order lives as
// tokens in app.css @theme and components consume them via z-(--z-index-*).
// jsdom can't compute stacking, so this test pins the source contract:
// strict token ordering + token consumption in the fixed components.

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const nav = readFileSync(new URL('./Nav.svelte', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('./AssistantWidget.svelte', import.meta.url), 'utf8');

function tokenValue(name: string): number {
	const match = appCss.match(new RegExp(`--z-index-${name}:\\s*(\\d+)`));
	if (!match) throw new Error(`missing --z-index-${name} token in app.css @theme`);
	return Number(match[1]);
}

describe('systemic z-index layering (map ticket 02)', () => {
	it('orders the layers strictly: take-over < nav < assistant', () => {
		const takeOver = tokenValue('take-over');
		const navLayer = tokenValue('nav');
		const assistantLayer = tokenValue('assistant');
		expect(takeOver).toBeLessThan(navLayer);
		expect(navLayer).toBeLessThan(assistantLayer);
	});

	it('the assistant widget rides on the top layer token, not a bare number', () => {
		expect(assistant).toContain('z-(--z-index-assistant)');
		expect(assistant).not.toMatch(/z-\d+/);
	});

	it('the header and take-over consume their layer tokens, not bare numbers', () => {
		expect(nav).toContain('z-(--z-index-nav)');
		expect(nav).toContain('z-(--z-index-take-over)');
		expect(nav).not.toMatch(/z-\d+/);
	});
});
