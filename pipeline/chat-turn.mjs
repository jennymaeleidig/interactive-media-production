// The shape of one turn of the message API, declared once.
//
// Three readers need it and none of them can see the others: the engine that
// builds it (`pipeline/chat-engine.mjs`), the widget that parses it
// (`pipeline/chat-widget.js` — the one reader whose drift ships to a browser),
// and the seams that assert it. It is declared here, in JSDoc, because this is
// the only language both sides read: TypeScript imports the types, and `checkJs`
// (`tsconfig.checkjs.json`) resolves them for the widget where it lies. There is
// no build step and no runtime code — this module exports types and nothing else.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * One conversation message, as the widget renders it: `me` is the visitor, `bot`
 * is the mimic.
 * @typedef {{ from: 'bot' | 'me', text: string }} ChatLine
 */

/**
 * One pending choice. `index` is the dialogue engine's own option index and the
 * only part the next request sends back; `text` is what the chip renders.
 * @typedef {{ index: number, text: string }} ChatOption
 */

/**
 * One turn: the messages it added, the live choice set, and whether the
 * conversation is over. A resting session still gets a turn — no new lines, the
 * same choice set — so a reload can re-offer it.
 * @typedef {{ lines: ChatLine[], options: ChatOption[] | null, complete: boolean }} ChatTurn
 */

/**
 * One request: the conversation step the widget sends and the engine answers.
 * `start` mints or resumes, `resume` replays a saved thread, `option` selects a
 * pending choice by its engine index. The widget sends one per turn; the client
 * engine reads the same shape.
 * @typedef {{ type: 'start', sessionId?: string }
 *   | { type: 'resume', sessionId: string }
 *   | { type: 'option', sessionId: string, optionIndex: number }} ChatRequest
 */

/**
 * What a session is, minus its position: the current node, whether it finished,
 * and every Yarn variable. The node is null before a dialogue starts and once it
 * has run out of content. Deliberately not the VM's position — a session is
 * restored by re-entering the current node at its top.
 * @typedef {{ node: string | null, complete: boolean, vars: Record<string, unknown> }} ChatState
 */

/**
 * The whole body of one message-API response.
 * @typedef {{ sessionId: string, turn: ChatTurn, state: ChatState, replay?: ChatLine[] }} ChatResponse
 */

export {};
