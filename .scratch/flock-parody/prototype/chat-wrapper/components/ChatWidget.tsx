"use client";

// PROTOTYPE (ticket 04) — throwaway UI shell over lib/chat-engine's API.
// Visual contract: ticket 02 + 06 research, rendered values as ground truth,
// cross-checked against the user's screenshot of the live widget (2026-09-09):
// launcher 92×92 → pounce card 412×296 → panel 538×N, flush bottom-right;
// header band #ecefeb (HEADER_BACKGROUND_COLOR) with bare dark ✕
// (HEADER_ICON_BUTTON_COLOR #183129); bot bubble #F1F4F7/text #101010/radius
// 3px/padding 12px 16px with small avatar outside at top; own bubble
// #ECEFEF/text #183129/radius 3px; timestamp + footer text #6E7879; composer
// box with placeholder #6E7879 and paper-plane send icon #888F91
// (MESSENGER_COMPOSER_SEND_BUTTON_ICON_COLOR); Inter var 13px.
//
// UI direction from the user (2026-09-09): every choice is a Yarn option
// (`->`) authored in the script, rendered as user-style chips INSIDE the
// composer box — which stays visually present with its send icon, but is
// INERT: the icon does nothing, there is no free text. Clicking a chip sends
// it. The original replies in ~4s via auto_respond, no typing indicator —
// this prototype replies instantly (delay not under test). Sounds and the
// real avatar PNG (URL captured in evidence) intentionally stubbed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponse } from "@/lib/chat-engine";

type Msg = { id: number; from: "bot" | "me"; text: string };
type Mode = "launcher" | "card" | "panel";

let nextId = 1;

function BirdMark({ size = 40 }: { size?: number }) {
  // Stub for the captured avatar asset (BOT_AVATAR_BACKGROUND_IMAGE in the
  // theme evidence — the real PNG URL is recorded for the Recreation).
  return (
    <span className="qw-mark" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="#ecefeb">
        <path d="M12 2c2 3 5 4 5 8a5 5 0 0 1-10 0c0-4 3-5 5-8zM7 21c1.5-3 3-4 5-4s3.5 1 5 4H7z" />
      </svg>
    </span>
  );
}

export default function ChatWidget() {
  const [mode, setMode] = useState<Mode>("launcher");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [options, setOptions] = useState<{ index: number; text: string }[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [debug, setDebug] = useState<{ node: string | null; complete: boolean; vars: object } | null>(null);
  const pounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const absorb = useCallback((res: ChatResponse) => {
    setSessionId(res.sessionId);
    if (typeof window !== "undefined") window.sessionStorage.setItem("flock-proto-session", res.sessionId);
    setMessages((m) => [...m, ...res.turn.lines.map((l) => ({ id: nextId++, from: "bot" as const, text: l.text }))]);
    setOptions(res.turn.options?.map((o) => ({ index: o.index, text: o.text })) ?? null);
    setComplete(res.turn.complete);
    setDebug({ node: res.state.node, complete: res.state.complete, vars: res.state.vars });
    if (res.replay) {
      setMessages(res.replay.map((r) => ({ id: nextId++, from: r.from, text: r.text })));
    }
  }, []);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      absorb(await res.json());
    },
    [absorb],
  );

  // Reload persistence: resume the server-side session, replay its log.
  useEffect(() => {
    const saved = window.sessionStorage.getItem("flock-proto-session");
    if (saved) post({ type: "resume", sessionId: saved }).catch(() => {});
  }, [post]);

  // Pounce: scroll-triggered, like the original (scrollPercentage → pounce).
  const firePounce = useCallback(() => {
    if (sessionId || pounceTimer.current) return;
    pounceTimer.current = setTimeout(() => {
      post({ type: "start" }).then(() => setMode("card")).catch(() => {});
    }, 1500);
  }, [sessionId, post]);
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 120) firePounce();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [firePounce]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, options]);

  const clickOption = (o: { index: number; text: string }) => {
    if (!sessionId) return;
    setMessages((m) => [...m, { id: nextId++, from: "me", text: o.text }]);
    setOptions(null);
    post({ type: "option", sessionId, optionIndex: o.index });
  };

  const expanded = messages.length > 0;

  return (
    <>
      {debug && (
        <div className="proto-debug" title="PROTOTYPE state panel — server session view">
          <strong>PROTOTYPE · server session state</strong>
          <div>session: {sessionId?.slice(0, 8)}</div>
          <div>node: {debug.node ?? "—"}{debug.complete ? " (complete)" : ""}</div>
          <pre>{JSON.stringify(debug.vars, null, 1)}</pre>
        </div>
      )}

      {mode !== "launcher" && (
        <div className={`qw qw-${mode}`}>
          <div className="qw-header">
            <BirdMark />
            <div className="qw-header-text">
              <div className="qw-name">Flock</div>
              <div className="qw-role">AI Sales Assistant</div>
            </div>
            {mode === "panel" ? (
              <button className="qw-close" aria-label="Close messenger" onClick={() => setMode("launcher")}>
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="#183129" strokeWidth="3" fill="none">
                  <path d="M4 4l16 16M20 4L4 20" />
                </svg>
              </button>
            ) : (
              <button className="qw-close qw-close-card" aria-label="Close" onClick={() => setMode("launcher")}>✕</button>
            )}
          </div>
          {mode === "panel" && <div className="qw-divider">Today, {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>}
          <div className="qw-log" ref={logRef}>
            {messages.map((m) =>
              m.from === "bot" ? (
                <div className="qw-row" key={m.id}>
                  <BirdMark size={20} />
                  <div className="qw-bubble-bot">{m.text}</div>
                </div>
              ) : (
                <div className="qw-row qw-row-me" key={m.id}>
                  <div className="qw-bubble-me">{m.text}</div>
                </div>
              ),
            )}
          </div>
          {/* Composer box: visually the original's input (placeholder +
              send icon), but INERT — the only interactive things are the
              yarn-option chips inside it. */}
          <div className="qw-composer">
            <div className="qw-chips">
              {options?.map((o) => (
                <button key={o.index} className="qw-choice" onClick={() => clickOption(o)}>{o.text}</button>
              ))}
              {!options && <span className="qw-placeholder">{complete ? "" : mode === "card" ? "Ask a question" : "Enter a message"}</span>}
            </div>
            <span className="qw-send" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888F91" strokeWidth="1.8">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <div className="qw-footer">
            Flock&apos;s <a href="https://www.flocksafety.com/privacy-policy" target="_blank">Privacy Policy</a>
          </div>
        </div>
      )}

      {mode === "launcher" && (
        <button
          className="qw-launcher"
          aria-label={expanded ? "Re-open conversation" : "Open chat"}
          onClick={() => {
            setMode("panel");
            if (!sessionId) post({ type: "start" }).catch(() => {});
          }}
        >
          <BirdMark size={44} />
        </button>
      )}
    </>
  );
}
