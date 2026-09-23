// The shapes the vendored React shell reads.
//
// The turn vocabulary itself lives in `lib/chat-turn.mjs` (the engine's own
// declaration), and the shell imports `ChatBlock`/`ChatOption` from there
// directly. This module only narrows the sequence for the renderer: a
// `ChatMessage` is a speaker-run — consecutive blocks with the same `who`
// grouped into one bubble (ticket 08) — and its part switch is the adapter
// table, keyed by `ChatBlock['type']`.
//
// SPDX-License-Identifier: CC0-1.0
import type { ChatBlock } from '@/lib/chat-turn.mjs';

type ChatRole = 'assistant' | 'user';

/** One speaker-run: a role, the blocks it renders, in order, the moment it
 * landed in the transcript (stamped at grouping time, so the shell can draw
 * iMessage-style time separators between turns that arrive far apart), and —
 * for the dev-only load timer — the beat it was held behind (`beatMs`) and
 * the time it actually took to arrive (`loadMs`). The id is the log position
 * of the run's first block (`groupBlocks`), so identity survives turns,
 * resumes, and grouping rework. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: ChatBlock[];
  at: Date;
  beatMs?: number;
  loadMs?: number;
}

/** Group a flat, ordered block sequence into one message per speaker-run. A
 * block that sets `newMessage` cuts the run, so one speaker can send several
 * bubbles in a turn (ticket 08's grouping, with an authored boundary).
 *
 * A message's id is the position in the conversation log of the run's first
 * block. The sequence is the log — append-only and persisted in the session —
 * so ids survive turns, a reload-resume, and any rework of this grouping:
 * runs that survive keep their identity, and only genuinely new runs take new
 * ids. Render order names nothing here. */
export function groupBlocks(blocks: readonly ChatBlock[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const role: ChatRole = block.who === 'me' ? 'user' : 'assistant';
    const last = messages.at(-1);
    if (last && last.role === role && !block.newMessage) {
      last.parts.push(block);
    } else {
      messages.push({ id: `run-${index}`, role, parts: [block], at: new Date() });
    }
  }
  return messages;
}
