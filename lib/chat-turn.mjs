// The shape of one turn, declared once.
//
// Three readers need it and none of them can see the others: the engine that
// builds it (`scripts/chat-engine.mjs`), the vendored React shell that renders
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
 * the same `who`. The chat surface walks the sequence, dispatching each block to
 * one adapter keyed by `type`, and groups blocks into bubbles by speaker-run,
 * cut at every `newMessage` (`CONTEXT.md` "Block"). The locked
 * vocabulary is `text | image | frame | link | me`, plus the designed `unknown`
 * fallback a block renders when it cannot resolve.
 *
 * @typedef {{ newMessage?: boolean }} BlockBoundary
 */

/**
 * One declared character's id: a Yarn speaker's name, lowercased. A string, not
 * a union — adding a character is content, not a protocol change
 * (`lib/chat-characters.mjs`), and the build's freshness gate is what keeps the
 * script's speakers declared.
 * @typedef {string} CharacterId
 */

/**
 * A pace override's preset name (`lib/pace-presets.mjs`). The closed vocabulary
 * is enforced at build time, so this is a plain string on the wire too.
 * @typedef {string} PacePreset
 */

/**
 * One stretch of a line's text read at one pace: the runtime's parsed text split
 * at the boundaries of every `[pace=...]` marker, with `pace` absent where no
 * marker covered the stretch. `text` joined back together is the block's own
 * `text`, so a renderer that does not need the split reads `text` alone.
 * @typedef {{ text: string, pace?: PacePreset }} TextSegment
 */

/**
 * Who a block belongs to: a bot block carries the speaking character's id; the
 * viewer's own block carries nothing — the viewer is not a declared character.
 * @typedef {{ who: 'bot', speaker: CharacterId } | { who: 'me' }} BlockOwner
 */

/** @typedef {BlockBoundary & BlockOwner & { type: 'text', text: string, segments?: TextSegment[] }} TextBlock */
/** @typedef {BlockBoundary & BlockOwner & { type: 'image', src: string, alt: string, caption?: string }} ImageBlock */
/** @typedef {BlockBoundary & BlockOwner & { type: 'frame', src: string, sandbox: string, title: string, caption?: string }} FrameBlock */
/** @typedef {BlockBoundary & BlockOwner & { type: 'link', href: string, label: string }} LinkBlock */
/** @typedef {BlockBoundary & BlockOwner & { type: 'me' }} MeBlock */
/** @typedef {BlockBoundary & BlockOwner & { type: 'unknown', id?: string, reason: string }} UnknownBlock */
/** @typedef {TextBlock | ImageBlock | FrameBlock | LinkBlock | MeBlock | UnknownBlock} ChatBlock */

/** Every block type in the locked vocabulary, plus the designed fallback. @type {readonly ChatBlock['type'][]} */
export const CHAT_BLOCK_TYPES = ['text', 'image', 'frame', 'link', 'me', 'unknown'];

/**
 * One pending choice. `index` is the dialogue engine's own option index and the
 * only part the next request sends back; `text` is what the chip renders.
 * @typedef {{ index: number, text: string }} ChatOption
 */

/**
 * One turn: the whole block sequence so far and the live choice set. The engine
 * returns the whole block sequence on every request, so the shell replaces its
 * state rather than merging, and there is no separate replay. A resting session
 * still gets a turn — the same blocks and choice set — so a reload can re-offer
 * it. Completion is the session's; it is declared once, on `ChatState`.
 * @typedef {{ blocks: ChatBlock[], options: ChatOption[] | null }} ChatTurn
 */

/**
 * One request: the step the shell sends and the engine answers. `start` opens
 * this page's session — resuming the live one, or beginning one when there is
 * none; `option` selects a pending choice by its engine index. There is no id on
 * it: the engine owns the one conversation.
 * @typedef {{ type: 'start' } | { type: 'option', optionIndex: number }} ChatRequest
 */

/**
 * What a session is, minus its position: the current node, whether it finished,
 * and every Yarn variable. The node is null before a dialogue starts and once it
 * has run out of content. Deliberately not the VM's position — a session is
 * restored by re-entering the current node at its top.
 * @typedef {{ node: string | null, complete: boolean, vars: Record<string, unknown> }} ChatState
 */

/**
 * The whole body of one turn response: the block sequence, and the session's report.
 * @typedef {{ turn: ChatTurn, state: ChatState }} ChatResponse
 */

export {};
