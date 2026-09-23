'use client';

// The transcript: the viewer's scroll surface, pinned to the bottom as blocks
// arrive (the template's `use-stick-to-bottom` mechanics, which ticket 02 keeps).
// A run of bubbles from one speaker groups like a message thread: tightened
// spacing and squared corners where two bubbles meet, so the run reads as one
// turn and a speaker change reads as a break. Adapted from vercel/chatbot
// (Apache-2.0); see ../NOTICE.md.
//
// The day divider opens it, as the reference widget's does.
//
// SPDX-License-Identifier: CC0-1.0
import { useEffect, useState } from 'react';
import { StickToBottom } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { dayLabel } from '@/lib/time';
import type { ChatMessage } from '@/lib/types';
import { Message } from './message';
import { Loading } from './loading';
import { TypingIndicator } from './typing-indicator';

/** The gap between one speaker's bubble and another's. */
const BETWEEN_SPEAKERS = 'mt-5';
/** The tighter gap between two bubbles from the same speaker. */
const SAME_SPEAKER = 'mt-1.5';

export function Messages({
  messages,
  isTyping = false,
  isLoading = false,
}: {
  messages: ChatMessage[];
  isTyping?: boolean;
  isLoading?: boolean;
}) {
  // The stamp is read once, on mount. During the prerender there is no clock to
  // read — a build-time one would be wrong for every visitor — so it stays null
  // until the browser has it, and the divider arrives with the greeting.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  useEffect(() => {
    setOpenedAt(new Date());
  }, []);

  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-hidden"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-28 pb-8">
        {openedAt && messages.length > 0 ? (
          <p className="font-chrome pb-5 text-center text-sm text-muted-foreground" data-testid="day-divider">
            {dayLabel(openedAt)}
          </p>
        ) : null}
        {isLoading && messages.length === 0 ? (
          <Loading />
        ) : (
          messages.map((message, index) => {
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
          })
        )}
        {isTyping ? <TypingIndicator /> : null}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
