// The shapes the vendored React shell reads.
//
// The turn vocabulary itself lives in `pipeline/chat-turn.mjs` (the engine's own
// declaration), and this module only narrows it for the shell: a block keeps its
// `who`, and a `ChatMessage` is a speaker-run — consecutive blocks with the same
// `who` grouped into one bubble (ticket 08). The renderer's part switch is the
// adapter table, keyed by `ChatBlock['type']`.
//
// SPDX-License-Identifier: CC0-1.0
import type { ChatBlock as EngineBlock, ChatOption as EngineOption } from '@/pipeline/chat-turn.mjs';

export type ChatBlock = EngineBlock;
export type ChatOption = EngineOption;
export type ChatRole = 'assistant' | 'user';

/** One speaker-run: a role and the blocks it renders, in order. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: ChatBlock[];
}

/** Group a flat, ordered block sequence into one message per speaker-run. A
 * block that sets `newMessage` cuts the run, so one speaker can send several
 * bubbles in a turn (ticket 08's grouping, with an authored boundary). */
export function groupBlocks(blocks: readonly ChatBlock[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const block of blocks) {
    const role: ChatRole = block.who === 'me' ? 'user' : 'assistant';
    const last = messages.at(-1);
    if (last && last.role === role && !block.newMessage) {
      last.parts.push(block);
    } else {
      messages.push({ id: `${role}-${messages.length}`, role, parts: [block] });
    }
  }
  return messages;
}
