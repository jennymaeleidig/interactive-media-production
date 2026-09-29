'use client';

// The typing indicator: the bot's bubble with three pulsing dots, shown in the
// transcript while the engine composes its reply. The idea is the template's
// `ThinkingMessage`, which renders the same three-dot bubble while `isLoading`
// (Apache-2.0); the dots here breathe rather than bounce, after iMessage. See
// ../NOTICE.md.
//
// The wait before the reply arrives is sized by `use-dialogue` from the reply's
// own length, so longer authored turns read as "still typing" rather than
// popping in after a fixed beat.
//
// The composing character is named twice without a position jump: the mark
// rides the bubble's bottom-right corner, minified, so the moment the message
// lands the full-size mark appears in the run's usual left column, and the
// `role="status"` label reads the character's display name to assistive tech.
//
// SPDX-License-Identifier: CC0-1.0
import { motion } from 'framer-motion';
import { characterFor, DEFAULT_CHARACTER_ID } from '@/lib/chat-characters.mjs';
import { CharacterMark } from './message';

/** The composing bubble and the mark of whoever is composing: the wait is
 * attributed to the character whose line is coming, so the mark and the label
 * name the right speaker rather than the piece's title. */
export function TypingIndicator({ speaker = DEFAULT_CHARACTER_ID }: { speaker?: string }) {
  const character = characterFor(speaker);
  return (
    <div
      className="mt-5 flex w-full justify-start gap-2"
      data-testid="typing-indicator"
      role="status"
      aria-label={`${character.name} is typing`}
    >
      {/* The mark's column is reserved but empty: the composing character rides
          the bubble's corner instead, and the dots still start where every
          landed bubble does. */}
      <div aria-hidden="true" className="w-7 shrink-0" />
      <div className="bg-bubble-bot text-bubble-content relative flex max-w-[85%] items-center gap-1.5 rounded-card rounded-tl-none px-4 py-3.5">
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            className="bg-content size-2 rounded-full"
            key={dot}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, delay: dot * 0.22 }}
          />
        ))}
        <span aria-hidden="true" className="absolute -right-1 -bottom-1">
          <CharacterMark character={character} compact />
        </span>
      </div>
    </div>
  );
}
