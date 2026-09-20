// The shell's glyphs.
//
// SPDX-License-Identifier: CC0-1.0
import { ExternalLink, SendHorizontal } from 'lucide-react';

export function SendIcon() {
  return <SendHorizontal aria-hidden="true" size={22} />;
}

/** Marks a link that leaves the piece, sized to the text it follows. */
export function ExternalLinkIcon() {
  return <ExternalLink aria-hidden="true" className="size-[0.9em]" strokeWidth={2.25} />;
}
