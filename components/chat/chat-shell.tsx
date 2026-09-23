'use client';

// The piece: one full-viewport column, permanently expanded. No launcher, no
// panel, no surrounding page. The capsule header floats over the transcript and
// the composer tray sits at the foot; nothing below the fold is the page's, so
// the chips stay reachable without scrolling the transcript to the bottom.
//
// The React here is the vendored vercel/chatbot shell (see `NOTICE.md`); its
// structural chrome survives and Flock's identity overwrites the look. The only
// caller of the engine is `useDialogue`.
//
// SPDX-License-Identifier: CC0-1.0
import { useDialogue } from '@/hooks/use-dialogue';
import { Composer } from './composer';
import { Header } from './header';
import { Messages } from './messages';

export function ChatShell() {
  const { messages, options, sendOption, isTyping, isLoading, reset } = useDialogue();

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-ground">
      <Header onReset={reset} />
      <Messages isLoading={isLoading} isTyping={isTyping} messages={messages} />
      <Composer onSelect={sendOption} options={options} />
    </div>
  );
}
