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
 * one reply mechanism, and the persistent chips are `<<jump>>`s into the
 * contract node titles (GetADemo / Support) — validated against the
 * program's node table when the session is built.
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

export interface AssistantChip {
	label: string;
	/** Node title in dialogue.yarn — the chip contract. */
	node: string;
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
	/** Persistent chips to validate against the program and expose;
	 *  defaults to the site's chip set. */
	chips?: readonly AssistantChip[];
}

/** Turn-reveal delay: the typing indicator runs before a batch lands.
 *  Kept above the dots' 1.4s animation cycle so the wave completes. */
const TYPING_DELAY_MS = 1800;

/** The persistent chips (source-widget mimicry): always visible, node jumps. */
const CHIPS: readonly AssistantChip[] = [
	{ label: 'Get a Demo', node: 'GetADemo' },
	{ label: 'Support', node: 'Support' }
];

/** Chip nodes must exist in the program's node table — fail when the
 *  session is built, not at click time (`setNode` only logs a missing
 *  title, which would leave the widget silently jumping nowhere). */
function resolveChips(chips: readonly AssistantChip[], program: Program): AssistantChip[] {
	const missing = chips.filter((chip) => !(chip.node in program.nodes));
	if (missing.length > 0) {
		throw new Error(
			`dialogue.yarn is missing chip node(s): ${missing.map((chip) => chip.node).join(', ')}`
		);
	}
	return [...chips];
}

class AssistantSession {
	/** Panel visibility. Closing keeps the dialogue mid-flight; reopening resumes. */
	open = $state(false);
	/** Delivered bubbles, oldest last. */
	messages = $state<AssistantMessage[]>([]);
	/** The current option set — the only reply mechanism (no free text). */
	choices = $state<AssistantChoice[]>([]);
	/** True while the next batch is "being typed". Chips disable during it. */
	typing = $state(false);
	/** Persistent chips, validated against the program's nodes. */
	readonly chips: AssistantChip[];

	#program: Program;
	#clock: Clock;
	#dialogue: Dialogue | null = null;
	// One storage instance across reconstructions: visit counts, once-state,
	// and variables survive chip jumps that rebuild the Dialogue.
	#storage: InMemoryVariableStorage | null = null;
	#cancelReveal: (() => void) | null = null;
	#complete = false;
	#pendingChoices: AssistantChoice[] | null = null;

	constructor({ program, clock = realClock, chips = CHIPS }: AssistantSessionOptions) {
		this.#program = program;
		this.#clock = clock;
		this.chips = resolveChips(chips, program);
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

	/** Persistent chip: jump to its contract node (or rebuild the dialogue there). */
	jumpToChip(chip: AssistantChip): void {
		if (this.typing) return;
		const dialogue = this.#dialogue;
		if (dialogue && !this.#complete && dialogue.currentNode === chip.node) {
			return; // already there — replaying would only repeat itself
		}
		// The chip click is the user's visible choice, like the source widget:
		// it lands as their bubble before the assistant responds.
		this.messages.push({ role: 'user', text: chip.label });
		if (!dialogue || this.#complete) {
			this.#begin(chip.node);
		} else {
			dialogue.setNode(chip.node);
		}
		this.#runTurn();
	}

	/** Fresh (or rebuilt) dialogue at `startAt`; storage reuse keeps history. */
	#begin(startAt?: string): void {
		this.#storage ??= new InMemoryVariableStorage();
		this.#dialogue = new Dialogue(this.#program, { startAt, variableStorage: this.#storage });
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
