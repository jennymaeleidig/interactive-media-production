// The transcript: the speaker-run rule and the row layout, in one home.
//
// The engine answers every turn with the whole block log (`lib/chat-turn.mjs`),
// and this module turns that flat, ordered sequence into the bubbles the
// transcript draws. A **Message** is one speaker-run — consecutive same-speaker
// blocks between authored cuts — and a **Block** stays the atomic typed piece
// (`CONTEXT.md`). `groupBlocks` does the grouping; `transcriptRows` adds the
// layout: the day/lull divider above a message, and the corner flags that square
// two bubbles of one run together.
//
// The inline `grouping` algorithm and this row layout used to live in
// `lib/types.ts` and `components/chat/messages.tsx`; they are together here so
// the rule is testable without a DOM and the renderer becomes a map.
//
// SPDX-License-Identifier: CC0-1.0
import { dayLabel, timeLabel } from '@/lib/time';
import type { ChatBlock } from '@/lib/chat-turn.mjs';

export type ChatRole = 'assistant' | 'user';

/** The lull that puts a time stamp back in the log — iMessage's observed
 * threshold, roughly fifteen minutes. Tune this to retune the separators. */
export const TIME_GAP_MS = 15 * 60 * 1000;

/** The dev-only load timer for one run: its own composing weight — the hold it
 * would be given — and that weight plus the turn's engine time. The hook's
 * ledger stamps it as a run lands, even when a resume or an opening turn lands
 * without a hold; the grouping never sets it. */
export interface MessageTiming {
  composingMs: number;
  elapsedMs: number;
}

/** One speaker-run: a role, the blocks it renders, in order, the moment it
 * landed in the transcript (stamped at grouping time, so the shell can draw
 * iMessage-style time separators between turns that arrive far apart), and its
 * `timing` — set only by the hook's ledger, for the dev-only load timer. The id
 * is the log position of the run's first block (`groupBlocks`), so identity
 * survives turns, resumes, and grouping rework. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: ChatBlock[];
  at: Date;
  timing?: MessageTiming;
}

/** One laid-out message: the message itself, the divider that goes above it
 * (the day stamp on the first bubble, a day stamp when the calendar turns, a
 * clock stamp after a lull, `null` otherwise), and whether a same-speaker
 * bubble sits directly above or below, so the shared corners square off. */
export interface TranscriptRow {
  message: ChatMessage;
  divider: string | null;
  /** A same-speaker bubble sits directly above, with no divider between. */
  continues: boolean;
  /** A same-speaker bubble sits directly below, with no divider between. */
  continued: boolean;
}

/** Group a flat, ordered block sequence into one message per speaker-run. A
 * block that sets `newMessage` cuts the run, so one speaker can send several
 * bubbles in a turn (grouping, with an authored boundary).
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

/** Lay a message sequence out as rows. The first bubble always opens under the
 * day stamp; a later bubble gets a day stamp when the calendar turns, or a
 * clock stamp when the lull past it crosses `TIME_GAP_MS`. Corner flags pair a
 * run's bubbles: a divider between two same-speaker bubbles breaks the run in
 * both directions — neither bubble points at the other. */
export function transcriptRows(messages: readonly ChatMessage[]): TranscriptRow[] {
  const rows: TranscriptRow[] = messages.map((message, index) => {
    const previous = messages[index - 1];
    let divider: string | null = null;
    if (previous === undefined) {
      divider = dayLabel(message.at);
    } else {
      const gap = message.at.getTime() - previous.at.getTime();
      const newDay = message.at.getMonth() !== previous.at.getMonth() || message.at.getDate() !== previous.at.getDate();
      if (newDay) divider = dayLabel(message.at);
      else if (gap >= TIME_GAP_MS) divider = timeLabel(message.at);
    }
    const continues = previous !== undefined && previous.role === message.role && divider === null;
    return { message, divider, continues, continued: false };
  });
  for (let index = 0; index < rows.length - 1; index += 1) {
    rows[index].continued =
      rows[index + 1].divider === null && rows[index + 1].message.role === rows[index].message.role;
  }
  return rows;
}
