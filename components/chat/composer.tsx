'use client';

// The composer slot: a wrapping chip row and an inert send glyph.
//
// There is no text input anywhere in the piece (the no-ask rule). The composer
// is chrome — cream, divided from the transcript by a hairline — and the send
// glyph is present and does nothing: a `<span>`, `aria-disabled`, never a
// control. Chips never disable or grey out (the piece has no loading state).
//
// Gutted from vercel/chatbot's `multimodal-input.tsx` (Apache-2.0); see
// ../NOTICE.md.
//
// SPDX-License-Identifier: CC0-1.0
import type { ChatOption } from '@/pipeline/chat-turn.mjs';
import { SendIcon } from './icons';

export function Composer({
  options,
  onSelect,
}: {
  options: ChatOption[];
  onSelect: (option: ChatOption) => void;
}) {
  return (
    <div className="border-t border-edge bg-chrome px-5 pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-3">
        <div className="flex flex-1 flex-wrap gap-2" data-testid="chip-row">
          {options.map((option) => (
            <button
              className="rounded-chip bg-chip px-4 py-2 text-left text-base text-chip-content transition-colors hover:opacity-90"
              data-chip={option.index}
              key={`${option.index}-${option.text}`}
              onClick={() => onSelect(option)}
              type="button"
            >
              {option.text}
            </button>
          ))}
        </div>
        {/* The box matches a chip's own height (`text-base` line-height plus `py-2`), so the
            glyph centres on the chip row instead of hanging below it, and stays bottom-aligned
            with the last chip row when the chips wrap. */}
        <span
          aria-disabled="true"
          aria-hidden="true"
          className="flex h-10 shrink-0 items-center text-inert-glyph"
          data-testid="inert-send"
        >
          <SendIcon />
        </span>
      </div>
    </div>
  );
}
