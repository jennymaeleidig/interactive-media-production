// SPDX-License-Identifier: CC0-1.0

import { Dialogue, InMemoryVariableStorage, type Program } from 'yarnspinner-typescript';
import program from '$lib/assistant/dialogue.yarn';

/**
 * Client state for the Plume AI Sales Assistant widget (shared across
 * routes, so the conversation survives navigation and close/reopen).
 *
 * Built through `createAssistantSession`, so its dependencies arrive at
 * the interface: the compiled Yarn program and the reveal clock. A test
 * passes a scripted program and a manual clock and runs full
 * conversations headlessly; the exported `assistant` singleton is the
 * one adapter over the real program and real timers.
 *
 * The widget is choices-only: the `Dialogue` runtime's option set is the
 * one reply mechanism.
 */

export interface AssistantMessage {
	role: 'assistant' | 'user';
	text: string;
}

export interface AssistantChoice {
	/** Position in the runtime's full option set — what `selectOption` takes. */
	index: number;
	text: string;
}

/** Schedules the turn reveal; the returned function cancels it. */
export interface Clock {
	after: (ms: number, fn: () => void) => () => void;
}

const realClock: Clock = {
	after: (ms, fn) => {
		const id = setTimeout(fn, ms);
		return () => clearTimeout(id);
	}
};

export interface AssistantSessionOptions {
	/** Compiled Yarn program driving the conversation. */
	program: Program;
	/** Schedules the typing reveal; defaults to real timers. */
	clock?: Clock;
}

/** Turn-reveal delay: the typing indicator runs before a batch lands.
 *  Kept above the dots' 1.4s animation cycle so the wave completes. */
const TYPING_DELAY_MS = 1800;

class AssistantSession {
	/** Panel visibility. Closing keeps the dialogue mid-flight; reopening resumes. */
	open = $state(false);
	/** Delivered bubbles, oldest last. */
	messages = $state<AssistantMessage[]>([]);
	/** The current option set — the only reply mechanism (no free text). */
	choices = $state<AssistantChoice[]>([]);
	/** True while the next batch is "being typed". Choices disable during it. */
	typing = $state(false);

	#program: Program;
	#clock: Clock;
	#dialogue: Dialogue | null = null;
	// One storage instance across reconstructions: visit counts, once-state,
	// and variables survive session rebuilds.
	#storage: InMemoryVariableStorage | null = null;
	#cancelReveal: (() => void) | null = null;
	#complete = false;
	#pendingChoices: AssistantChoice[] | null = null;

	constructor({ program, clock = realClock }: AssistantSessionOptions) {
		this.#program = program;
		this.#clock = clock;
	}

	toggle(): void {
		if (this.open) {
			this.hide();
		} else {
			this.show();
		}
	}

	show(): void {
		if (!this.#dialogue) {
			this.#begin();
		}
		this.open = true;
	}

	hide(): void {
		this.open = false;
	}

	/** Select a contextual option by position: it becomes the user's
	 *  bubble (with the option's own text, which only the module holds),
	 *  and the runtime resumes. */
	choose(index: number): void {
		if (!this.#dialogue || this.typing) return;
		const choice = this.choices.find((c) => c.index === index);
		if (!choice) return;
		this.messages.push({ role: 'user', text: choice.text });
		this.choices = [];
		this.#dialogue.selectOption(index);
		this.#runTurn();
	}

	/** Fresh dialogue; storage reuse keeps history. */
	#begin(): void {
		this.#storage ??= new InMemoryVariableStorage();
		this.#dialogue = new Dialogue(this.#program, { variableStorage: this.#storage });
		this.#complete = false;
		this.#runTurn();
	}

	/** Pull events up to the next stopping point and stage the turn's reveal.
	 *  The runtime stops after every delivered line, so keep pulling until an
	 *  option set or completion — consecutive lines batch into one reveal. */
	#runTurn(): void {
		const dialogue = this.#dialogue;
		if (!dialogue) return;
		this.#cancelReveal?.();
		this.#cancelReveal = null;

		const lines: string[] = [];
		let choices: AssistantChoice[] | null = null;
		for (let batch = dialogue.continue(); batch.length > 0; batch = dialogue.continue()) {
			for (const event of batch) {
				if (event.type === 'line') {
					lines.push(event.text);
				} else if (event.type === 'options') {
					// Unavailable options (condition failed) are hidden, not
					// disabled — a sales assistant never shows the dead ends.
					choices = event.options
						.filter((option) => option.isAvailable)
						.map((option) => ({ index: option.index, text: option.text }));
				} else if (event.type === 'dialogueComplete') {
					this.#complete = true;
				}
				// CommandEvent only surfaces host commands; none are registered.
			}
			if (choices !== null || this.#complete) break;
		}

		if (lines.length === 0) {
			// Nothing to type out — choices (or completion) land immediately.
			this.choices = choices ?? [];
			return;
		}
		this.#pendingChoices = choices;
		this.typing = true;
		this.#cancelReveal = this.#clock.after(TYPING_DELAY_MS, () => {
			this.typing = false;
			this.#cancelReveal = null;
			this.messages.push(
				...lines.map((text) => ({ role: 'assistant', text }) satisfies AssistantMessage)
			);
			this.choices = this.#pendingChoices ?? [];
			this.#pendingChoices = null;
		});
	}
}

/** Build a session over explicit dependencies — the seam tests cross. */
export function createAssistantSession(options: AssistantSessionOptions): AssistantSession {
	return new AssistantSession(options);
}

/** The site-wide singleton: one adapter over the real program and real timers. */
export const assistant = createAssistantSession({ program });
