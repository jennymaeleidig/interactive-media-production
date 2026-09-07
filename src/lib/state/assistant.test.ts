// SPDX-License-Identifier: CC0-1.0
import { compileSource, type Program } from 'yarnspinner-typescript';
import program from '$lib/assistant/dialogue.yarn';
import { createAssistantSession, type Clock } from './assistant.svelte';
import { describe, expect, it } from 'vitest';

/** A scripted two-node program: two assistant lines, two choices, replies. */
const SCRIPT = `
title: Start
---
Assistant: Hello there.
Assistant: One more line.
-> Go on
	Assistant: You chose Go on.
	-> That's all
		<<jump Wrapup>>
-> Stop here
	Assistant: Stopping.
	<<jump Wrapup>>
===

title: Wrapup
---
Assistant: Done.
===
`;

function scriptedProgram(): Program {
	const result = compileSource(SCRIPT);
	if (!result.program) {
		throw new Error('scripted dialogue failed to compile: ' + JSON.stringify(result.diagnostics));
	}
	return result.program;
}

/** A program with none of the chip contract's node titles. */
function chiplessProgram(): Program {
	const result = compileSource('title: Other\n---\nAssistant: x\n===\n');
	if (!result.program) throw new Error('chipless dialogue failed to compile');
	return result.program;
}

/** Manual clock: reveals fire only when the test flushes — no timers. */
function manualClock(): Clock & { flush(): void } {
	const queued: Array<() => void> = [];
	return {
		after: (_ms, fn) => {
			queued.push(fn);
			return () => {
				const at = queued.indexOf(fn);
				if (at >= 0) queued.splice(at, 1);
			};
		},
		flush() {
			while (queued.length > 0) {
				const fn = queued.shift();
				fn?.();
			}
		}
	};
}

function session(clock: Clock & { flush(): void }) {
	// Scripted chip set: the default CHIPS target the real dialogue's nodes;
	// the scripted program carries its own titles.
	return createAssistantSession({
		program: scriptedProgram(),
		clock,
		chips: [{ label: 'Go on', node: 'Wrapup' }]
	});
}

describe('assistant session (headless, manual clock)', () => {
	it('holds the turn while typing, then delivers lines and choices', () => {
		const clock = manualClock();
		const s = session(clock);
		s.show();
		expect(s.open).toBe(true);
		expect(s.typing).toBe(true);
		expect(s.messages).toHaveLength(0);
		clock.flush();
		expect(s.typing).toBe(false);
		expect(s.messages.map((m) => m.text)).toEqual(['Hello there.', 'One more line.']);
		expect(s.choices.map((c) => c.text)).toEqual(['Go on', 'Stop here']);
	});

	it('choose(index) turns the option into the user bubble; stale indexes are no-ops', () => {
		const clock = manualClock();
		const s = session(clock);
		s.show();
		clock.flush();
		const { index, text } = s.choices[0];
		s.choose(999); // not in the current option set — ignored
		expect(s.messages).toHaveLength(2);
		s.choose(index);
		expect(s.messages.at(-1)).toEqual({ role: 'user', text });
		expect(s.typing).toBe(true);
		clock.flush();
		expect(s.messages.at(-1)?.text).toBe('You chose Go on.');
	});

	it('chips jump to their node and the click lands as the user bubble', () => {
		const clock = manualClock();
		const s = createAssistantSession({ program, clock }); // the real dialogue
		s.show();
		clock.flush();
		s.jumpToChip({ label: 'Support', node: 'Support' });
		expect(s.messages.at(-1)?.text).toBe('Support');
		clock.flush();
		const texts = s.messages.map((m) => m.text);
		expect(texts).toContain(
			'Support. The Plume care team is reachable through the following channels:'
		);
	});

	it('a chip pointing at a missing node fails when the session is built', () => {
		const clock = manualClock();
		expect(() => createAssistantSession({ program: chiplessProgram(), clock })).toThrow(/GetADemo/);
	});
});
