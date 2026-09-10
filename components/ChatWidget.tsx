'use client';

// The Chat mimic's captured-fidelity widget (ticket 09).
//
// Three surfaces, matching the Capture (research/06, evidence under
// evidence/06-qualified-conversation-ux/): the 54px launcher circle, the
// 332x252 pounce card, and the 343px-wide content-height expanded panel —
// each inset 17px from the bottom-right corner. Styling is
// components/chat-widget.css: the Capture's own 94-property --THEME_* token
// set lifted verbatim, with layout rules transcribed from the Capture's
// rendered values (see that file's provenance header — its rules are the
// transcript of captured pixels; no runtime layout CSS existed to lift).
//
// Contract, exactly as the message API (ticket 08) defines it:
//  - one POST per turn (start / resume / option); replies render as COMPLETE
//    bubbles — no typing indicator, no sounds (deliberately unshipped, spec);
//  - the composer box and send icon are visually present but INERT — no free
//    text, the send button does nothing;
//  - the pending Yarn choice set renders as user-style chips INSIDE the
//    composer slot; selecting one reads as the visitor's own sent message;
//  - the placeholder ("Ask a question" on the card, "Enter a message" on the
//    panel) shows whenever no chips are pending;
//  - the pounce fires on the captured trigger: a scroll past the fold, after
//    the captured short beat; the launcher is the collapsed surface.
//
// SPDX-License-Identifier: CC0-1.0

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatLine, ChatResponse } from '@/lib/chat-engine';
import './chat-widget.css';

type Mode = 'launcher' | 'card' | 'panel';

/** A pending Yarn choice as the composer slot renders it. */
interface Option {
  index: number;
  text: string;
}

const STORAGE_KEY = 'flock-chat-session';
/**
 * The pounce is SCROLL-ARMED in the Capture, but the Capture never recorded its
 * thresholds: the live widget's pounce is rule-gated server-side and fired
 * ~36s after load in the observed sessions, with no client-visible constant.
 * These two values are therefore the mimic's documented stand-ins for the
 * captured trigger SHAPE (scroll past the fold, then a short beat), not values
 * transcribed from evidence — the only such values in this file.
 */
const POUNCE_SCROLL_PX = 120;
const POUNCE_DELAY_MS = 1500;

// Captured icon paths: the widget's own raw SVGs (messenger DOM dumps).
const TIMES_ICON =
  'M23 20.168l-8.185-8.187 8.185-8.174-2.832-2.807-8.182 8.179-8.176-8.179-2.81 2.81 8.186 8.196-8.186 8.184 2.81 2.81 8.203-8.192 8.18 8.192z';
const SEND_ICON =
  'M20.5306 2.46969C20.7315 2.67057 20.8016 2.9677 20.7118 3.2372L14.7115 21.2372C14.6156 21.525 14.3558 21.7266 14.0532 21.7481C13.7506 21.7696 13.4648 21.6068 13.3292 21.3354L9.79459 14.2662L14.0305 10.0303C14.3234 9.73744 14.3234 9.26256 14.0305 8.96967C13.7376 8.67678 13.2627 8.67678 12.9698 8.96967L8.73398 13.2055L1.6646 9.67084C1.39328 9.53518 1.23039 9.24944 1.2519 8.94685C1.2734 8.64427 1.47506 8.38443 1.76284 8.28851L19.7631 2.28851C20.0326 2.19867 20.3297 2.26882 20.5306 2.46969Z';

/** The captured timestamp divider format ("Today, 6:50 am"). */
function todayLabel(): string {
  return `Today, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
}

export function ChatWidget() {
  const [mode, setMode] = useState<Mode>('launcher');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Lazy init only: the divider is the captured "Today, h:mm am" stamp frozen at
  // mount, so it never ticks over mid-conversation. There is deliberately no setter.
  const [divider] = useState(todayLabel);
  const started = useRef(false);
  const engaged = useRef(false);
  const pounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const absorb = useCallback((res: ChatResponse) => {
    setSessionId(res.sessionId);
    try {
      localStorage.setItem(STORAGE_KEY, res.sessionId);
    } catch {
      // storage unavailable (private mode) — the session still lives server-side
    }
    if (res.replay) {
      setLines(res.replay);
    } else if (res.turn.lines.length > 0) {
      setLines((prev) => [...prev, ...res.turn.lines]);
    }
    setOptions(res.turn.options ? res.turn.options.map((o) => ({ index: o.index, text: o.text })) : null);
  }, []);

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<void> => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        absorb((await res.json()) as ChatResponse);
      } catch {
        // no network is the invariant; a failed turn simply leaves the last state
      }
    },
    [absorb],
  );

  // Restore a live server-side session after a reload — exactly the original's
  // server session. A restored conversation does not re-pounce.
  useEffect(() => {
    if (started.current) return; // StrictMode double-mount guard
    started.current = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved) void post({ type: 'resume', sessionId: saved });
  }, [post]);

  // The captured pounce: the first scroll past the fold arms the greeting card.
  useEffect(() => {
    if (sessionId) return; // a live session resumes instead of re-pouncing
    const onScroll = () => {
      if (engaged.current || pounceTimer.current) return;
      if (window.scrollY <= POUNCE_SCROLL_PX) return;
      pounceTimer.current = setTimeout(() => {
        void post({ type: 'start' }).then(() => setMode('card'));
      }, POUNCE_DELAY_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (pounceTimer.current) {
        clearTimeout(pounceTimer.current);
        pounceTimer.current = null;
      }
    };
  }, [post, sessionId]);

  useEffect(() => {
    // jsdom and older engines may not implement Element.scrollTo; the scroll is
    // cosmetic, so a missing method is a no-op rather than a crash.
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [lines, options, mode]);

  const open = useCallback(
    (next: Mode) => {
      engaged.current = true;
      if (pounceTimer.current) {
        clearTimeout(pounceTimer.current);
        pounceTimer.current = null;
      }
      setMode(next);
      if (!sessionId) void post({ type: 'start' });
    },
    [post, sessionId],
  );

  const close = useCallback(() => setMode('launcher'), []);

  const select = useCallback(
    (option: Option) => {
      if (!sessionId) return;
      // The SERVER owns the echo: `handleChat`'s `option` turn already prepends
      // the visitor's line ({ from: 'me' }), so appending one here as well would
      // render the same message twice. The chips just close and await the turn.
      setOptions(null);
      void post({ type: 'option', sessionId, optionIndex: option.index });
    },
    [post, sessionId],
  );

  const surface = mode === 'launcher' ? null : (
    <section className={`fpc-surface fpc-surface--${mode}`} aria-label="Flock">
      <header className="fpc-header">
        {mode === 'card' ? (
          <button className="fpc-close fpc-close--corner" aria-label="Close" onClick={close}>
            ✕
          </button>
        ) : null}
        <span className="fpc-avatar" aria-hidden />
        <div className="fpc-heading">
          <strong className="fpc-name">Flock</strong>
          <small className="fpc-role">AI Sales Assistant</small>
        </div>
        {mode === 'panel' ? (
          <button className="fpc-close" aria-label="Close messenger" onClick={close}>
            <svg className="fpc-close__icon" viewBox="0 0 24 24" height="12" width="12" fill="currentColor" aria-hidden>
              <path d={TIMES_ICON} />
            </svg>
          </button>
        ) : null}
      </header>

      {mode === 'panel' ? <div className="fpc-divider">{divider}</div> : null}

      <div className="fpc-log" ref={logRef}>
        <div className="fpc-messages">
          {lines.map((line, i) =>
            line.from === 'me' ? (
              <div className="fpc-row fpc-row--me" key={i}>
                <div className="fpc-bubble fpc-bubble--me">{line.text}</div>
              </div>
            ) : (
              <div className="fpc-row" key={i}>
                <span className="fpc-bubble-avatar" aria-hidden />
                {mode === 'card' ? (
                  // captured behavior: clicking the greeting preview opens the panel
                  <button
                    type="button"
                    className="fpc-bubble fpc-bubble--bot fpc-bubble--preview"
                    aria-label="Message preview - click to open the conversation"
                    onClick={() => open('panel')}
                  >
                    {line.text}
                  </button>
                ) : (
                  <div className="fpc-bubble fpc-bubble--bot">{line.text}</div>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      <form className="fpc-form" onSubmit={(e) => e.preventDefault()}>
        {/* The composer is the original's input chrome, inert: the choice
            chips live in its slot and the send icon does nothing. */}
        <div className="fpc-composer">
          <div className="fpc-slot">
            {options?.length ? (
              options.map((option) => (
                <button type="button" className="fpc-chip" key={option.index} onClick={() => select(option)}>
                  {option.text}
                </button>
              ))
            ) : (
              <span className="fpc-placeholder">{mode === 'card' ? 'Ask a question' : 'Enter a message'}</span>
            )}
          </div>
          <button type="button" className="fpc-send" aria-label="Send" aria-disabled="true">
            <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" clipRule="evenodd" d={SEND_ICON} />
            </svg>
          </button>
        </div>
      </form>

      <footer className="fpc-footer" aria-label="Messenger footer">
        Flock&apos;s{' '}
        <a href="https://www.flocksafety.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
      </footer>
    </section>
  );

  return (
    <div className="fpc-root">
      {surface}
      {mode === 'launcher' ? (
        <button className="fpc-launcher" aria-label="Open chat" onClick={() => open('panel')} />
      ) : null}
    </div>
  );
}
