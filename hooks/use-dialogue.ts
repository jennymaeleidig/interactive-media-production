'use client';

// The one CC0 hook replacing the template's `useChat` (ticket 02, ticket 11).
//
// It keeps the `useChat`-shaped surface the vendored components expect
// (`messages`, `options`, `sendMessage`-shaped `sendOption`) but its only caller
// is the client-side engine at `window.__flockChatEngine`, which
// `/chat/runtime.js` installs. It maps `bot`/`me` to `assistant`/`user` and
// groups a turn's blocks into one message per speaker-run, so the renderer never
// sees a `who`.
//
// The engine owns the session and answers every turn with the whole block sequence,
// so this hook keeps no copy of its own: it replaces `messages` with whatever
// came back rather than merging. There is no loading, typing or delivery state
// either — nothing about a turn is shown until its blocks arrive, and the chips
// never disable.
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useState } from 'react';
import type { ChatOption, ChatResponse } from '@/lib/chat-turn.mjs';
import { groupBlocks, type ChatMessage } from '@/lib/types';

/** The host page's one runtime script; the hook waits for it on a cold load. */
const RUNTIME_SRC = '/chat/runtime.js';

export interface Dialogue {
  messages: ChatMessage[];
  options: ChatOption[];
  /** Send the chip's authored choice as the next turn. */
  sendOption: (option: ChatOption) => void;
}

type Engine = NonNullable<Window['__flockChatEngine']>;

/** The engine global, if the runtime has run. */
function engine(): Engine | undefined {
  return typeof window === 'undefined' ? undefined : window.__flockChatEngine;
}

/**
 * The runtime is a deferred script in the host page, so on a cold load the shell
 * can mount before it has run. Wait for that script rather than erroring on a
 * race the visitor cannot see or fix.
 */
function engineReady(): Promise<Engine | undefined> {
  const running = engine();
  if (running || typeof document === 'undefined') return Promise.resolve(running);
  const script = document.querySelector<HTMLScriptElement>(`script[src="${RUNTIME_SRC}"]`);
  if (!script) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const settle = () => resolve(engine());
    script.addEventListener('load', settle, { once: true });
    script.addEventListener('error', settle, { once: true });
    // It may have loaded between the lookup above and the listener attaching.
    if (engine()) settle();
  });
}

export function useDialogue(): Dialogue {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [options, setOptions] = useState<ChatOption[]>([]);

  /** The engine's answer applied as the shell's next state. It returns the whole
   * block sequence, so this replaces rather than merges. */
  const apply = useCallback((res: ChatResponse) => {
    setMessages(groupBlocks(res.turn.blocks));
    setOptions(res.turn.options ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    engineReady()
      .then((api) => {
        if (cancelled || !api) return;
        // `start` opens this page's session: the engine resumes the live one or
        // begins one, and either way answers with the whole block sequence.
        return api.turn({ type: 'start' }).then((res) => {
          if (cancelled) return;
          apply(res);
        });
      })
      .catch(() => {
        // The engine is local; a rejection is a programming error with no
        // viewer-facing surface.
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const sendOption = useCallback((option: ChatOption) => {
    const api = engine();
    if (!api) return;
    api
      .turn({ type: 'option', optionIndex: option.index })
      .then(apply)
      .catch(() => {
        // As above: nothing in-frame can act on it.
      });
  }, [apply]);

  return { messages, options, sendOption };
}
