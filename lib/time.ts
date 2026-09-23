// The transcript's day divider.
//
// The reference widget stamps the transcript "Today, 12:15 am": the day, then
// the hour on a 12-hour clock. The format is the piece's, not the viewer's
// locale's — the piece reproduces one widget's copy, so letting `Intl` follow
// the browser would render it differently for most of the world.
//
// SPDX-License-Identifier: CC0-1.0

/** The stamp above the first bubble: the day the piece was opened, then the
 * hour, as the reference widget writes it. There is no other day to name,
 * because the transcript always opens with the visit that reads it. */
export function dayLabel(at: Date): string {
  const hours = at.getHours();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `Today, ${hour}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** The stamp on a gap divider inside the transcript (iMessage's re-entry
 * separator): the clock time alone — the day was already named above, and is
 * named again below only if the calendar actually turns. */
export function timeLabel(at: Date): string {
  const hours = at.getHours();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `${hour}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}
