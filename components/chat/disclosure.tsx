'use client';

// The disclosure: the one place the piece drops the mask.
//
// A non-modal popover anchored to the `?` in the capsule header. First view is
// one plain, out-of-character sentence; a second tap ("More") adds the artist
// credit, the marks' provenance, and the pointer to the real Flock. It is
// non-modal on purpose — the piece is inert, so there is no conversation state
// to protect — lights-dismisses on an outside pointer, closes on Esc, and traps
// no focus. The bypass path is deliberately absent: it lives in the share kit,
// because a viewer who meets the interstitial never reaches this page (ticket
// 09). The wording is declared once in `lib/share.ts`; `test/copy.test.ts` locks
// it.
//
// SPDX-License-Identifier: CC0-1.0
import { useEffect, useRef, useState } from 'react';
import { DISCLOSURE_SENTENCE } from '@/lib/share';

export { DISCLOSURE_SENTENCE };

export function Disclosure() {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setMore(false);
  };

  return (
    <div className="relative" ref={root}>
      <button
        aria-expanded={open}
        aria-label="What is this?"
        className="font-chrome flex h-7 w-7 items-center justify-center rounded-pill border border-edge text-sm text-capsule-content"
        data-testid="disclosure-toggle"
        onClick={() => (open ? close() : setOpen(true))}
        type="button"
      >
        ?
      </button>
      {open ? (
        <div
          className="font-chrome absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-card border border-edge bg-chrome p-4 text-base text-capsule-content shadow-none"
          data-testid="disclosure-popover"
          role="dialog"
        >
          <p>{DISCLOSURE_SENTENCE}</p>
          {more ? (
            <div className="mt-3 flex flex-col gap-2">
              <p>
                An artwork by Jenny Leidig. The Flock wordmark, typefaces and palette reproduce Flock
                Safety&rsquo;s own, which are Flock Group Inc&rsquo;s marks and licensed typefaces; no rights
                are claimed by this project.
              </p>
              <p>
                The real company is at{' '}
                <a className="underline" href="https://www.flocksafety.com/" rel="noreferrer noopener" target="_blank">
                  flocksafety.com
                </a>
                .
              </p>
              <p>
                <a className="underline" href="/legal/privacy-policy">
                  Privacy
                </a>
              </p>
            </div>
          ) : (
            <button className="mt-3 underline" onClick={() => setMore(true)} type="button">
              More
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
