'use client';

// The transcript: the viewer's scroll surface, pinned to the bottom as blocks
// arrive (the template's `use-stick-to-bottom` mechanics, which the shell keeps).
// A run of bubbles from one speaker groups like a message thread: tightened
// spacing and squared corners where two bubbles meet, so the run reads as one
// turn and a speaker change reads as a break. Adapted from vercel/chatbot
// (Apache-2.0); see ../NOTICE.md.
//
// The layout rule — grouping, the day/lull dividers, the corner flags — lives in
// `lib/transcript.ts`; this component is the map from its rows to JSX.
//
// SPDX-License-Identifier: CC0-1.0
import { AnimatePresence } from 'framer-motion';
import { StickToBottom } from 'use-stick-to-bottom';
import { transcriptRows, type ChatMessage } from '@/lib/transcript';
import { cn } from '@/lib/utils';
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
  typingSpeaker,
  onRevealEnd,
}: {
  messages: ChatMessage[];
  isTyping?: boolean;
  isLoading?: boolean;
  /** The character composing the reply the dots wait on (`use-dialogue`). */
  typingSpeaker?: string;
  /** A fresh land's reveal has ended, identified by message id. Threaded from
   * the dialogue hook down to the reveal adapter (`lib/reveal.ts`). */
  onRevealEnd?: (id: string) => void;
}) {
  const rows = transcriptRows(messages);

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
          // Presence is what lets a bubble and the composing wait animate on the
          // way out as well as in. Each row is a direct child, so the transcript
          // keeps a leaving row mounted until its exit has run.
          <AnimatePresence initial={false}>
            {rows.flatMap(({ message, divider, continues, continued }, index) => [
              ...(divider
                ? [
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
                      key={`${message.id}:divider`}
                      role="separator"
                    >
                      <hr className="h-px flex-1 border-0 bg-edge" />
                      <span className="font-chrome text-sm whitespace-nowrap text-muted-foreground">
                        {divider}
                      </span>
                      <hr className="h-px flex-1 border-0 bg-edge" />
                    </div>,
                  ]
                : []),
              <Message
                className={cn(index === 0 ? null : continues ? SAME_SPEAKER : BETWEEN_SPEAKERS)}
                continued={continued}
                continues={continues}
                key={message.id}
                message={message}
                onRevealEnd={onRevealEnd}
              />,
            ])}
          </AnimatePresence>
        )}
        {/* The dots leave the transcript when their exit finishes, and the reply
            does not land until then (`use-dialogue` waits `TurnStep.exitMs`), so
            the two are never in the flow at once and nothing is pushed around
            while the placeholder leaves. */}
        <AnimatePresence>
          {isTyping ? <TypingIndicator key="typing" speaker={typingSpeaker} /> : null}
        </AnimatePresence>
      </StickToBottom.Content>
    </StickToBottom>
  );
}
