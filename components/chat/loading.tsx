'use client';

// The page's loading state: a classic circular spinner, centered where the
// transcript will be. It covers only the opening `start` turn — the session
// resuming or beginning — because that wait is the page loading, not the
// character typing. Once the opening turn has landed, replies announce
// themselves with the typing bubble instead (`typing-indicator.tsx`).
//
// SPDX-License-Identifier: CC0-1.0

export function Loading() {
  return (
    <div className="flex w-full flex-1 items-center justify-center py-40" data-testid="chat-loading" role="status" aria-label="Loading the conversation">
      <div className="border-edge border-t-content size-8 animate-spin rounded-full border-[3px] motion-reduce:animate-none" />
    </div>
  );
}
