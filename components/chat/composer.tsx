'use client';

// The composer slot: a wrapping chip row and an inert send glyph.
//
// There is no text input anywhere in the piece (the no-ask rule). The composer
// is chrome — cream, divided from the transcript by a hairline — and the send
// glyph is present and does nothing: a `<span>`, `aria-disabled`, never a
// control. While a reply is being composed (the typing beat), the chips grey
// out and stop taking presses: a turn is one chip, not a queue.
//
// Gutted from vercel/chatbot's `multimodal-input.tsx` (Apache-2.0); see
// ../NOTICE.md.
//
// SPDX-License-Identifier: CC0-1.0
import type { ChatOption } from '@/lib/chat-turn.mjs';
import { cn } from '@/lib/utils';
import { SendIcon } from './icons';

export function Composer({
  options,
  onSelect,
  disabled = false,
}: {
  options: ChatOption[];
  onSelect: (option: ChatOption) => void;
  /** True while the assistant's reply is still being composed; the chips
   * grey out and ignore presses until it lands. */
  disabled?: boolean;
}) {
  return (
    <div className="frost border-t border-edge px-5 pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-3">
        <div className="flex flex-1 flex-wrap gap-2" data-testid="chip-row">
          {/* The chips speak in the serif — the same voice as the bubbles they
              answer, not the chrome's Book. The press is a quiet scale on the
              minimal curve; the motion-reduce viewer gets a colour shift only. */}
          {options.map((option) => (
            <button
              aria-disabled={disabled || undefined}
              className={cn(
                'font-serif rounded-chip bg-chip px-4 py-2 text-left text-base text-chip-content transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-chip-hover active:scale-[0.98] motion-reduce:transition-none',
                // Greyed out while a reply composes: no hover lift, no press,
                // and the cursor admits it.
                disabled && 'cursor-not-allowed bg-chip-hover opacity-50 hover:bg-chip-hover active:scale-100',
              )}
              data-chip={option.index}
              disabled={disabled}
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
