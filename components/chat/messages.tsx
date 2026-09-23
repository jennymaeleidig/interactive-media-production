'use client';

// The transcript: the viewer's scroll surface, pinned to the bottom as blocks
// arrive (the template's `use-stick-to-bottom` mechanics, which ticket 02 keeps).
// A run of bubbles from one speaker groups like a message thread: tightened
// spacing and squared corners where two bubbles meet, so the run reads as one
// turn and a speaker change reads as a break. Adapted from vercel/chatbot
// (Apache-2.0); see ../NOTICE.md.
//
// The day divider opens it, as the reference widget's does. Like iMessage, a
// divider also re-enters mid-log when the conversation resumes after a lull:
// any gap between consecutive bubbles past `TIME_GAP_MS` gets a time stamp, and
// a calendar-day change gets the full day stamp again.
//
// SPDX-License-Identifier: CC0-1.0
import { Fragment } from 'react';
import { StickToBottom } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { dayLabel, timeLabel } from '@/lib/time';
import type { ChatMessage } from '@/lib/types';
import { Message } from './message';
import { Loading } from './loading';
import { TypingIndicator } from './typing-indicator';

/** The lull that puts a time stamp back in the log — iMessage's observed
 * threshold, roughly fifteen minutes. Tune this to retune the separators. */
export const TIME_GAP_MS = 15 * 60 * 1000;

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
  /** One bubble, plus the divider (if any) that goes above it. The first
   * bubble always opens under the day stamp; later bubbles get one when the
   * lull past them crosses `TIME_GAP_MS` or the calendar day turns. */
  const rows = (() => {
    const out: { message: ChatMessage; divider: string | null }[] = [];
    let previous: ChatMessage | undefined;
    for (const message of messages) {
      let divider: string | null = null;
      if (previous === undefined) {
        divider = dayLabel(message.at);
      } else {
        const gap = message.at.getTime() - previous.at.getTime();
        const newDay =
          message.at.getMonth() !== previous.at.getMonth() || message.at.getDate() !== previous.at.getDate();
        if (newDay) divider = dayLabel(message.at);
        else if (gap >= TIME_GAP_MS) divider = timeLabel(message.at);
      }
      out.push({ message, divider });
      previous = message;
    }
    return out;
  })();

  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-hidden"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-28 pb-8">
        {isLoading && messages.length === 0 ? (
          <Loading />
        ) : (
          rows.map(({ message, divider }, index) => {
            const next = rows[index + 1]?.message;
            const continued = next !== undefined && next.role === message.role;
            const continues = index > 0 && rows[index - 1].message.role === message.role && divider === null;
            return (
              <Fragment key={message.id}>
                {divider ? (
                  // The Flowbite "HR with text" separator: a full-width rule
                  // with the stamp set in the gap it opens
                  // (github.com/themesberg/flowbite, content/typography/hr.md;
                  // MIT). Drawn as line–text–line rather than Flowbite's
                  // absolutely-positioned span, so no page-background color
                  // has to be faked over the transcript's frost.
                  <div
                    aria-label={divider}
                    className="mb-5 flex items-center gap-3"
                    data-testid="day-divider"
                    role="separator"
                  >
                    <hr className="h-px flex-1 border-0 bg-edge" />
                    <span className="font-chrome text-sm whitespace-nowrap text-muted-foreground">
                      {divider}
                    </span>
                    <hr className="h-px flex-1 border-0 bg-edge" />
                  </div>
                ) : null}
                <Message
                  className={cn(index === 0 ? null : continues ? SAME_SPEAKER : BETWEEN_SPEAKERS)}
                  continued={continued}
                  continues={continues}
                  message={message}
                />
              </Fragment>
            );
          })
        )}
        {isTyping ? <TypingIndicator /> : null}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
