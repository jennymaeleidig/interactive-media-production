// The bubble frame: the geometry a landed message and the composing wait share,
// in one place.
//
// A bubble and the wait that precedes it have to agree about the column the
// character mark hangs in, the corner radius and the one squared corner, where
// the mark is anchored, how wide the bubble may grow, and its background. Those
// are the things a viewer sees move if they drift, so they live here and both
// callers read them. Padding and internal layout stay each caller's own, so the
// two bubbles may differ in height without duplicating the geometry that must
// agree.
//
// This module is pure — classes, strings, no React — so the corner rules are
// pinned by tests without a DOM. `components/chat/bubble-frame.tsx` renders it.
//
// SPDX-License-Identifier: CC0-1.0
import type { ChatRole } from '@/lib/transcript';
import { cn } from '@/lib/utils';

/** The column the mark hangs in, reserved so every bubble starts at the same x.
 * A continuing bubble keeps it open with nothing in it. */
export const MARK_COLUMN_CLASS = 'w-7 shrink-0';

/** The mark's own offset: the reserved column plus the row's 8px gap, so the
 * disc sits in the column with its usual clearance from the bubble's edge. Both
 * the landed mark and the composing mark hang here, so the mark does not move
 * when the message lands. */
export const MARK_ANCHOR_CLASS = 'absolute -bottom-2 -left-9';

/** Both bubbles are held to the same share of the transcript's width. */
export const BUBBLE_WIDTH_CLASS = 'max-w-[85%]';

/** What every bubble is, before its role and corners: positioned for its own
 * anchored mark, and carrying the bubble's text colour. */
export const BUBBLE_BASE_CLASS = 'relative text-bubble-content';

/** The bubble's background: each role's own surface. */
export function bubbleBackgroundClass(role: ChatRole): string {
  return role === 'user' ? 'bg-bubble-me' : 'bg-bubble-bot';
}

/** The corner rules: the shared radius, squared on the corners where two
 * same-speaker bubbles meet so a run reads as one turn. `continues` squares the
 * corner toward the bubble above; `continued` the corner toward the bubble
 * below. The squared side is the mark's side, which flips with the role. */
export function bubbleCornerClass(
  role: ChatRole,
  { continues = false, continued = false }: { continues?: boolean; continued?: boolean } = {},
): string {
  return cn(
    'rounded-card',
    continues && (role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'),
    continued && (role === 'user' ? 'rounded-br-none' : 'rounded-bl-none'),
  );
}

/** The whole bubble's class list: the shared base, the role's background, the
 * corner rules, and the caller's own layout and padding. */
export function bubbleClass(
  role: ChatRole,
  options: { continues?: boolean; continued?: boolean; className?: string } = {},
): string {
  const { continues, continued, className } = options;
  return cn(BUBBLE_BASE_CLASS, bubbleBackgroundClass(role), bubbleCornerClass(role, { continues, continued }), className);
}
