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
// The composing character is named without a position jump: the mark rides at
// the very offset the landed bubble's own mark uses, on the same disc, with only
// the glyph inside it minified — so when the message lands the disc does not move
// at all and only the glyph changes scale. The `role="status"` label reads the
// character's display name to assistive tech.
//
// SPDX-License-Identifier: CC0-1.0
import { motion } from 'framer-motion';
import { COMPOSING_EXIT_MS } from '@/lib/pacing';
import { characterFor, DEFAULT_CHARACTER_ID } from '@/lib/chat-characters.mjs';
import { CharacterMark } from './message';

/** The composing bubble and the mark of whoever is composing: the wait is
 * attributed to the character whose line is coming, so the mark and the label
 * name the right speaker rather than the piece's title. */
export function TypingIndicator({ speaker = DEFAULT_CHARACTER_ID }: { speaker?: string }) {
  const character = characterFor(speaker);
  // The wait slides up from the foot of the transcript and back down as the
  // reply lands, so the composing bubble reads as a placeholder that makes way
  // for the message rather than a thing that blinks on and off. It animates on
  // the transcript's own axis — the same direction the next line will arrive.
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-label={`${character.name} is typing`}
      className="mt-5 flex w-full justify-start gap-2"
      data-testid="typing-indicator"
      exit={{
        opacity: 0,
        y: 12,
        // The departure is a fixed tween, not the arrival's spring: the schedule
        // holds the reply back for exactly `COMPOSING_EXIT_MS`, so the exit has
        // to be over by then rather than still settling.
        transition: { duration: COMPOSING_EXIT_MS / 1000, ease: 'easeIn' },
      }}
      initial={{ opacity: 0, y: 16 }}
      role="status"
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
        mass: 0.9,
        opacity: { duration: 0.2, ease: 'easeOut' },
      }}
    >
      {/* The mark's column is reserved but empty: the composing character sits
          just off the bubble's corner instead, and the dots still start where
          every landed bubble does. */}
      <div aria-hidden="true" className="w-7 shrink-0" />
      <div className="bg-bubble-bot text-bubble-content relative flex max-w-[85%] items-center gap-1.5 rounded-card rounded-bl-none px-4 py-3.5">
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            className="bg-content size-2 rounded-full"
            key={dot}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, delay: dot * 0.22 }}
          />
        ))}
        {/* The landed bubble's own disc, at the landed bubble's own offset, with
            the glyph inside it minified: the mark does not move when the message
            lands, only the glyph changes scale. Set clear of the corner rather
            than over it, so the bubble's squared bottom-left corner stays
            visible. */}
        <span aria-hidden="true" className="absolute -bottom-2 -left-9">
          <CharacterMark character={character} minifiedIcon />
        </span>
      </div>
    </motion.div>
  );
}
