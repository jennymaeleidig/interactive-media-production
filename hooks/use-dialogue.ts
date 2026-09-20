'use client';

// The one CC0 hook replacing the template's `useChat` (ticket 02, ticket 11).
//
// It keeps the `useChat`-shaped surface the vendored components expect
// (`messages`, `sendMessage`-shaped `sendOption`, `status`) but its only caller
// is the client-side engine at `window.__flockChatEngine`, which
// `/chat/runtime.js` installs. It maps `bot`/`me` to `assistant`/`user` and
// groups a turn's blocks into one message per speaker-run, so the renderer never
// sees a `who`.
//
// There is no loading, typing or delivery indicator anywhere: `status` exists to
// guard a double send, and no component renders it.
//
// SPDX-License-Identifier: CC0-1.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { groupBlocks, type ChatBlock, type ChatMessage, type ChatOption } from '@/lib/types';

/** Where the conversation's id lives, so a reload resumes rather than restarts. */
const SESSION_KEY = 'flock-chat-session';
/** The host page's one runtime script; the hook waits for it on a cold load. */
const RUNTIME_SRC = '/chat/runtime.js';

export type DialogueStatus = 'ready' | 'submitted' | 'complete' | 'error';

export interface Dialogue {
  messages: ChatMessage[];
  options: ChatOption[];
  status: DialogueStatus;
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

/** The stored session id, or undefined when storage refuses to be read. */
function storedSession(): string | undefined {
  try {
    return window.localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The engine's answer applied as the shell's next state. */
function opening(
  messages: ChatMessage[],
  blocks: readonly ChatBlock[],
  options: ChatOption[] | null,
): { messages: ChatMessage[]; options: ChatOption[] } {
  // Re-group the whole sequence, not just the new blocks: ids are positions in
  // one growing list, so a turn cannot mint a key an earlier turn already used,
  // and a speaker-run split across turns still merges into one bubble.
  const grouped = groupBlocks([...messages.flatMap((message) => message.parts), ...blocks]);
  return { messages: grouped, options: options ?? [] };
}

export function useDialogue(): Dialogue {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [options, setOptions] = useState<ChatOption[]>([]);
  const [status, setStatus] = useState<DialogueStatus>('ready');
  // The live session id lives here, not only in localStorage: a browser that
  // refuses storage must still be able to advance the conversation in-page.
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('submitted');
    engineReady()
      .then((api) => {
        if (cancelled) return;
        if (!api) {
          setStatus('error');
          return;
        }
        const stored = storedSession();
        return api.turn(stored ? { type: 'start', sessionId: stored } : { type: 'start' }).then((res) => {
          if (cancelled) return;
          sessionId.current = res.sessionId;
          try {
            window.localStorage.setItem(SESSION_KEY, res.sessionId);
          } catch {
            // private mode or a full quota — the ref carries the session in-page
          }
          // A live session answers with `replay` (the whole transcript) and no
          // new blocks; a fresh one answers with the opening blocks.
          const seen = res.replay ?? [];
          const next = opening([], seen.length > 0 ? seen : res.turn.blocks, res.turn.options);
          setMessages(next.messages);
          setOptions(next.options);
          setStatus(res.turn.complete ? 'complete' : 'ready');
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendOption = useCallback((option: ChatOption) => {
    const api = engine();
    const id = sessionId.current;
    if (!api || id === null) return;
    setStatus('submitted');
    api
      .turn({ type: 'option', sessionId: id, optionIndex: option.index })
      .then((res) => {
        setMessages((prev) => opening(prev, res.turn.blocks, null).messages);
        setOptions(res.turn.options ?? []);
        setStatus(res.turn.complete ? 'complete' : 'ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  return { messages, options, status, sendOption };
}
