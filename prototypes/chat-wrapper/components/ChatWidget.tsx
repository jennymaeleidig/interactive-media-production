"use client";

// PROTOTYPE (ticket 04) — throwaway UI shell over lib/chat-engine's API.
// Visual contract: ticket 02 + 06 research (rendered values are ground truth):
// launcher 92×92 → pounce card 412×296 → panel 538×N, all flush bottom-right;
// bot bubble #F1F4F7/text #101010 radius 3px; own bubble #ECEFEF/#183129;
// card ✕ top-left half-outside, panel ✕ inside top-right.
//
// UI direction from the user (2026-09-09): NO composer, NO persistent chips.
// The only choices are the yarn script's pending options, rendered as
// user-style bubbles sitting IN the composer slot — clicking one looks like
// sending what you typed. The original replies in ~4s via auto_respond with
// no typing indicator — this prototype replies instantly (delay not under
// test). Sounds (sent/received hooks) intentionally omitted.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponse } from "@/lib/chat-engine";

type Msg = { id: number; from: "bot" | "me"; text: string };
type Mode = "launcher" | "card" | "panel";

let nextId = 1;

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
          {mode === "card" ? (
            <button className="qw-close-card" aria-label="Close" onClick={() => setMode("launcher")}>✕</button>
          ) : (
            <button className="qw-close-panel" aria-label="Close messenger" onClick={() => setMode("launcher")}>✕</button>
          )}
          <div className="qw-header">
            <div className="qw-avatar" />
            <div>
              <div className="qw-name">Flock</div>
              <div className="qw-role">AI Sales Assistant</div>
            </div>
          </div>
          {mode === "panel" && <div className="qw-divider">Today, {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>}
          <div className="qw-log" ref={logRef}>
            {messages.map((m) =>
              m.from === "bot" ? (
                <div className="qw-row" key={m.id}>
                  <div className="qw-avatar qw-avatar-sm" />
                  <div className="qw-bubble-bot">{m.text}</div>
                </div>
              ) : (
                <div className="qw-row qw-row-me" key={m.id}>
                  <div className="qw-bubble-me">{m.text}</div>
                </div>
              ),
            )}
          </div>
          {/* The composer slot: pending yarn options as user-style bubbles —
              clicking one reads as sending your own typed message. */}
          <div className="qw-slot">
            {options?.map((o) => (
              <button key={o.index} className="qw-choice" onClick={() => clickOption(o)}>{o.text}</button>
            ))}
          </div>
          {mode === "card" && (
            <div className="qw-footer">
              <a href="https://www.flocksafety.com/privacy-policy" target="_blank">Flock&apos;s Privacy Policy</a>
            </div>
          )}
        </div>
      )}

      {mode === "launcher" && (
        <button
          className="qw-launcher"
          aria-label={messages.length > 0 ? "Re-open conversation" : "Open chat"}
          onClick={() => {
            setMode("panel");
            if (!sessionId) post({ type: "start" }).catch(() => {});
          }}
        >
          <span className="qw-bird">F</span>
        </button>
      )}
    </>
  );
}
