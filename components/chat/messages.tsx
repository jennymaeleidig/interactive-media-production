'use client';

// The transcript: the viewer's scroll surface, pinned to the bottom as blocks
// arrive (the template's `use-stick-to-bottom` mechanics, which ticket 02 keeps).
// A run of bubbles from one speaker groups like a message thread: tightened
// spacing and squared corners where two bubbles meet, so the run reads as one
// turn and a speaker change reads as a break. Adapted from vercel/chatbot
// (Apache-2.0); see ../NOTICE.md.
//
// SPDX-License-Identifier: CC0-1.0
import { StickToBottom } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';
import { Message } from './message';

/** The gap between one speaker's bubble and another's. */
const BETWEEN_SPEAKERS = 'mt-5';
/** The tighter gap between two bubbles from the same speaker. */
const SAME_SPEAKER = 'mt-1.5';

export function Messages({ messages }: { messages: ChatMessage[] }) {
  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-hidden"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-28 pb-8">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const continues = previous !== undefined && previous.role === message.role;
          const continued = next !== undefined && next.role === message.role;
          return (
            <Message
              className={cn(
                previous === undefined ? null : continues ? SAME_SPEAKER : BETWEEN_SPEAKERS,
              )}
              grouping={{ continues, continued }}
              key={message.id}
              message={message}
            />
          );
        })}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
