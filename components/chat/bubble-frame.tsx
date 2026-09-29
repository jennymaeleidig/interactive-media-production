'use client';

// The frame both bubbles render through: the reserved mark column, the bubble
// box with its shared geometry (`lib/bubble-frame.ts`), and the character mark
// anchored to the bubble's own corner. A landed message and the composing wait
// call this, so the two cannot drift apart.
//
// Padding, internal layout, and whatever sits under the bubble are the caller's
// own — the landed bubble carries its dev timer below, the composing bubble its
// dots inside — so the frame owns only the geometry that must agree.
//
// SPDX-License-Identifier: CC0-1.0
import type { ReactNode } from 'react';
import {
  BUBBLE_BASE_CLASS,
  BUBBLE_WIDTH_CLASS,
  MARK_ANCHOR_CLASS,
  MARK_COLUMN_CLASS,
  bubbleBackgroundClass,
  bubbleCornerClass,
} from '@/lib/bubble-frame';
import type { ChatRole } from '@/lib/transcript';
import { cn } from '@/lib/utils';

export function BubbleFrame({
  role,
  continues = false,
  continued = false,
  className,
  bubbleAttrs,
  below,
  mark,
  markAriaHidden = false,
  children,
}: {
  role: ChatRole;
  /** Whether a same-speaker bubble sits above or below, so the shared corners
   * square off. */
  continues?: boolean;
  continued?: boolean;
  /** The bubble's own layout, padding, and type. */
  className?: string;
  /** The landed bubble's `data-*` hooks; the composing bubble carries none. */
  bubbleAttrs?: Record<string, string | undefined>;
  /** Rendered in the bubble's column, under the bubble (the dev load timer). */
  below?: ReactNode;
  /** The mark, anchored to the bubble's bottom-left corner. */
  mark?: ReactNode;
  /** Whether the mark is decorative. The composing wait labels itself already,
   * so its mark is hidden; the landed bubble's mark names its speaker. */
  markAriaHidden?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {role === 'assistant' ? (
        // The column is reserved but empty: the mark stands off the bubble's own
        // corner instead, and the bubble still starts where every other does.
        <div aria-hidden="true" className={MARK_COLUMN_CLASS} />
      ) : null}
      <div className={cn('flex min-w-0 flex-col', BUBBLE_WIDTH_CLASS, role === 'user' ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            BUBBLE_BASE_CLASS,
            bubbleBackgroundClass(role),
            bubbleCornerClass(role, { continues, continued }),
            className,
          )}
          {...bubbleAttrs}
        >
          {children}
          {mark ? (
            <span aria-hidden={markAriaHidden || undefined} className={MARK_ANCHOR_CLASS}>
              {mark}
            </span>
          ) : null}
        </div>
        {below}
      </div>
    </>
  );
}
