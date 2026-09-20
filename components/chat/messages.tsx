'use client';

// The transcript: the viewer's scroll surface, pinned to the bottom as blocks
// arrive (the template's `use-stick-to-bottom` mechanics, which ticket 02 keeps).
// Adapted from vercel/chatbot (Apache-2.0); see ../NOTICE.md.
//
// SPDX-License-Identifier: CC0-1.0
import { StickToBottom } from 'use-stick-to-bottom';
import type { ChatMessage } from '@/lib/types';
import { Message } from './message';

export function Messages({ messages }: { messages: ChatMessage[] }) {
  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-hidden"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pt-28 pb-8">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
