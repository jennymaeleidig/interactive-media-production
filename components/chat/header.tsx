'use client';

// The floating capsule header: wordmark and the `?`. It is always visible —
// the live site fades its header in on scroll, and that is deliberately not
// mirrored, because here the transcript scrolls rather than the page (ticket
// 06).
//
// SPDX-License-Identifier: CC0-1.0
import { Wordmark } from '@/components/brand/wordmark';
import { Disclosure } from './disclosure';

export function Header() {
  return (
    <header className="fixed inset-x-5 top-3 z-10" data-testid="capsule-header">
      {/* Frosted laminate, not solid chrome: the transcript scrolls beneath and
          the capsule lets it smear behind the blur. The blur lives on an
          underlay and not on the capsule itself because an ancestor with
          `backdrop-filter` is a backdrop root — the tooltip's own frost would
          then only see the wordmark, never the transcript, and render
          unfrosted. As a painted layer it sits behind the (positioned) content
          row and stays under the tooltip, whose blur takes both in. */}
      <div className="relative rounded-capsule border border-edge px-4 py-2.5">
        <div aria-hidden="true" className="frost absolute inset-0 rounded-capsule" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wordmark className="text-capsule-content" />
          </div>
          <Disclosure />
        </div>
      </div>
    </header>
  );
}
