// SPDX-License-Identifier: CC0-1.0
import { compileSource, type Program } from 'yarnspinner-typescript';
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
	return createAssistantSession({
		program: scriptedProgram(),
		clock
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
});
