// The host page: the canvas the chat fills, and nothing else.
//
// The chat is the whole page — full viewport, no surrounding content — so this
// route renders the shell and one sentence for a viewer with JavaScript off. The
// greeting itself is authored transcript, not a template: the Yarn program opens
// the piece (ticket 02 dropped the template's `greeting.tsx`).
//
// SPDX-License-Identifier: CC0-1.0
import { ChatShell } from '@/components/chat/chat-shell';

export default function Home() {
  return (
    <main>
      <ChatShell />
      <noscript>
        <p>This page hosts a chat that needs JavaScript. It is an artwork, not Flock Safety.</p>
      </noscript>
    </main>
  );
}
