'use client';

// The floating capsule header: wordmark, the "scripted preview" line, and the
// `?`. It is always visible — the live site fades its header in on scroll, and
// that is deliberately not mirrored, because here the transcript scrolls rather
// than the page (ticket 06).
//
// SPDX-License-Identifier: CC0-1.0
import { Wordmark } from '@/components/brand/wordmark';
import { Disclosure } from './disclosure';

export function Header() {
  return (
    <header className="fixed inset-x-5 top-3 z-10" data-testid="capsule-header">
      <div className="flex items-center justify-between rounded-capsule border border-edge bg-chrome px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Wordmark className="text-capsule-content" />
          <span className="hidden text-sm text-capsule-content sm:block">
            Flock Safety
            <span className="ml-2 text-muted-foreground">scripted preview</span>
          </span>
        </div>
        <Disclosure />
      </div>
    </header>
  );
}
