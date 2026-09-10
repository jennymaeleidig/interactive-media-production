'use client';

// The Chat mimic's MINIMAL driver widget (ticket 08). Throwaway glue, not the
// piece: it exists so the conversation core can be driven by hand end to end.
// Ticket 09 replaces it with the captured-fidelity widget (geometry, styling,
// pounce, the real composer surface); ticket 10 mounts that site-wide.
//
// Contract it exercises, exactly as the message API defines it: one POST per
// turn (start / resume / option), replies rendered as complete bubbles, the
// pending choice set rendered as user-style chips in the composer slot,
// selections echoed as the visitor's own message, and the session id kept in
// localStorage so a reload resumes rather than resets.
//
// SPDX-License-Identifier: CC0-1.0

import { useEffect, useRef, useState } from 'react';

interface Line {
  from: 'bot' | 'me';
  text: string;
}
interface Option {
  index: number;
  text: string;
}
interface ChatResponse {
  sessionId: string;
  turn: { lines: Line[]; options: Option[] | null; complete: boolean };
  replay?: Line[];
}

const STORAGE_KEY = 'flock-chat-session';

export default function ChatWidget() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-mount guard
    started.current = true;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    void turn(saved ? { type: 'resume', sessionId: saved } : { type: 'start' });
  }, []);

  async function turn(request: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const data = (await res.json()) as ChatResponse;
      setSessionId(data.sessionId);
      localStorage.setItem(STORAGE_KEY, data.sessionId);
      if (data.replay) {
        setLines(data.replay); // a reload restores the whole thread
      } else if (data.turn.lines.length > 0) {
        setLines((prev) => [...prev, ...data.turn.lines]);
      }
      setOptions(data.turn.options);
      setComplete(data.turn.complete);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  function select(option: Option): void {
    if (!sessionId) return;
    void turn({ type: 'option', sessionId, optionIndex: option.index });
  }

  return (
    <section style={{ width: 360, border: '1px solid #333', borderRadius: 4, font: '13px/1.5 system-ui, sans-serif' }}>
      <header style={{ padding: '8px 12px', background: '#ecefeb', color: '#183129', fontWeight: 600 }}>Flock</header>
      <div style={{ height: 280, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map((line, i) => (
          <p
            key={i}
            style={{
              margin: 0,
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 3,
              alignSelf: line.from === 'me' ? 'flex-end' : 'flex-start',
              background: line.from === 'me' ? '#ecefeb' : '#f1f4f7',
              color: line.from === 'me' ? '#183129' : '#101010',
            }}
          >
            {line.text}
          </p>
        ))}
        {complete && <p style={{ margin: 0, color: '#6e7879' }}>Conversation complete.</p>}
        {error && <p style={{ margin: 0, color: '#a11' }}>{error}</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderTop: '1px solid #ddd' }}>
        {options?.map((option) => (
          <button key={option.index} type="button" onClick={() => select(option)} style={{ padding: '6px 10px', borderRadius: 3, border: '1px solid #ecefeb', background: '#ecefeb', color: '#183129', cursor: 'pointer' }}>
            {option.text}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #ddd', color: '#6e7879' }}>
        <input
          readOnly
          placeholder="Ask a question"
          aria-label="Message (inert — choose an option instead)"
          style={{ flex: 1, border: 'none', outline: 'none', color: 'inherit' }}
        />
        <span aria-hidden>➤</span>
      </div>
    </section>
  );
}
