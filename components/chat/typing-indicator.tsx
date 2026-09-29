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
// The composing character is named without a position jump, and without a second
// mark to keep in step: the indicator borrows the landed mark outright and hangs
// it at the landed mark's own offset, so nothing about the mark changes as the
// message arrives. The `role="status"` label reads the character's display name
// to assistive tech.
//
// SPDX-License-Identifier: CC0-1.0
import { motion } from 'framer-motion';
import { COMPOSING_EXIT_MS } from '@/lib/pacing';
import { characterFor, DEFAULT_CHARACTER_ID } from '@/lib/chat-characters.mjs';
import { BubbleFrame } from './bubble-frame';
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
      {/* The frame both bubbles share: the reserved mark column, the bubble box
          with the shape the landed bubble will have, and the mark anchored to
          the bubble's own corner. There is no separate composing mark — it is
          the landed mark outright, at the landed mark's own offset — and the
          bubble's squared bottom-left corner matches the landed bubble's, so
          the mark does not move when the message lands. */}
      <BubbleFrame
        className="flex items-center gap-1.5 px-4 py-3.5"
        continued
        mark={<CharacterMark character={character} />}
        markAriaHidden
        role="assistant"
      >
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            className="bg-content size-2 rounded-full"
            key={dot}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, delay: dot * 0.22 }}
          />
        ))}
      </BubbleFrame>
    </motion.div>
  );
}
