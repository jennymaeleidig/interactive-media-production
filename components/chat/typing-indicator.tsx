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
// SPDX-License-Identifier: CC0-1.0
import { motion, useReducedMotion } from 'framer-motion';
import { AssistantMark } from './message';

export function TypingIndicator() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="mt-5 flex w-full justify-start gap-2" data-testid="typing-indicator" role="status" aria-label="Flock is typing">
      <div aria-hidden="true" className="w-7 shrink-0">
        <AssistantMark />
      </div>
      <div className="bg-bubble-bot text-bubble-content flex max-w-[85%] items-center gap-1.5 rounded-card rounded-tl-none px-4 py-3.5">
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={reduceMotion ? { opacity: 0.4 } : { opacity: [0.4, 1, 0.4] }}
            className="bg-content size-2 rounded-full"
            key={dot}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1.1, ease: 'easeInOut', repeat: Infinity, delay: dot * 0.22 }
            }
          />
        ))}
      </div>
    </div>
  );
}
