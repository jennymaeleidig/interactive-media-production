// The shape of one turn of the message API, declared once.
//
// Three readers need it and none of them can see the others: the engine that
// builds it (`pipeline/chat-engine.mjs`), the vendored React shell that renders
// it (`hooks/use-dialogue.ts` — the one reader whose drift ships to a browser),
// and the seams that assert it. It is declared here, in JSDoc, because this is
// the only language both sides read: TypeScript imports the types, and `checkJs`
// (`tsconfig.checkjs.json`) resolves them for the engine where it lies. There is
// no build step and no runtime code — this module exports types and nothing else.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * One typed piece of a reply. A block is `{ who, type, ...payload }`, optionally
 * carrying `newMessage` to start a fresh bubble even when the previous block has
 * the same `who`. The transcript walks the sequence, dispatches each block to
 * one adapter keyed by `type`, and groups blocks into bubbles by speaker-run,
 * cut at every `newMessage` (ticket 01, `CONTEXT.md` "Block"). The locked
 * vocabulary is `text | image | frame | link | me`, plus the designed `unknown`
 * fallback a block renders when it cannot resolve.
 *
 * @typedef {{ newMessage?: boolean }} BlockBoundary
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'text', text: string }} TextBlock
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'image', src: string, alt: string, caption?: string }} ImageBlock
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'frame', src: string, sandbox: string, title: string, caption?: string }} FrameBlock
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'link', href: string, label: string }} LinkBlock
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'me' }} MeBlock
 * @typedef {BlockBoundary & { who: 'bot' | 'me', type: 'unknown', id?: string, reason: string }} UnknownBlock
 * @typedef {TextBlock | ImageBlock | FrameBlock | LinkBlock | MeBlock | UnknownBlock} ChatBlock
 */

/** Every block type in the locked vocabulary, plus the designed fallback. @type {readonly ChatBlock['type'][]} */
export const CHAT_BLOCK_TYPES = ['text', 'image', 'frame', 'link', 'me', 'unknown'];

/**
 * One pending choice. `index` is the dialogue engine's own option index and the
 * only part the next request sends back; `text` is what the chip renders.
 * @typedef {{ index: number, text: string }} ChatOption
 */

/**
 * One turn: the blocks it added, the live choice set, and whether the
 * conversation is over. A resting session still gets a turn — no new blocks, the
 * same choice set — so a reload can re-offer it.
 * @typedef {{ blocks: ChatBlock[], options: ChatOption[] | null, complete: boolean }} ChatTurn
 */

/**
 * One request: the conversation step the shell sends and the engine answers.
 * `start` mints or resumes, `resume` replays a saved thread, `option` selects a
 * pending choice by its engine index. The shell sends one per turn; the client
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
 * @typedef {{ sessionId: string, turn: ChatTurn, state: ChatState, replay?: ChatBlock[] }} ChatResponse
 */

export {};
