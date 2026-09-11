'use client';

// The Chat mimic's driver page (ticket 09). Not a Recreation route: the
// captured pages are served by the build's catch-all route, and ticket 10
// mounts the widget site-wide. This page exists so the widget can be driven
// by hand. It documents its own test flow, and the spacer at the bottom gives
// the page something to scroll so the captured scroll-triggered pounce can
// fire (the pounce needs window.scrollY to move, nothing more).
//
// SPDX-License-Identifier: CC0-1.0
import { ChatWidget } from '@/components/ChatWidget';

const GREEN = '#183129';
const MUTED = '#6e7879';

const STEPS: [string, string][] = [
  ['Fresh visit', 'the 54px launcher sits in the bottom-right corner.'],
  ['Scroll down a little', 'the greeting card pounces after about a second and a half.'],
  ['Click the greeting text (or the launcher)', 'the full conversation panel opens.'],
  ['Click a green chip in the composer', 'it echoes as your own bubble; the reply lands as a complete bubble — no typing dots, no sounds.'],
  ['Reload the page', 'the thread resumes from the server session and the pounce does not re-fire.'],
  ['Try the send icon', 'nothing happens: the composer is inert by design — the chips are the only input.'],
];

export default function ChatDemoPage() {
  const reset = () => {
    try {
      localStorage.removeItem('flock-chat-session');
    } catch {
      // storage unavailable — nothing to reset
    }
    window.location.reload();
  };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 0', fontFamily: 'system-ui, sans-serif', color: GREEN }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 8px' }}>Chat mimic — widget driver</h1>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 28px' }}>
        Dev tooling for ticket 09: drive the captured-fidelity widget by hand. The real site gets the widget in
        ticket 10; this page goes away then.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Try it in order</h2>
        <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'grid', gap: 10 }}>
          {STEPS.map(([doThis, expectThat]) => (
            <li key={doThis} style={{ fontSize: 14, lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600 }}>{doThis}</strong>
              <span style={{ color: MUTED }}> — {expectThat}</span>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 16px',
            border: '1px solid transparent',
            borderRadius: 4,
            background: GREEN,
            color: '#fff',
            font: 'inherit',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Reset session
        </button>
        <span style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>
          Clears <code>localStorage[&quot;flock-chat-session&quot;]</code> and reloads — the pounce only fires once per
          session, so this is how you see it again without DevTools.
        </span>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Deliberate, so don&apos;t file it</h2>
        <ul style={{ margin: 0, padding: '0 0 0 20px', display: 'grid', gap: 10, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
          <li>The choice chips are dark Flock green (user direction 2026-09-10); the selected chip echoes as a light user-style bubble, exactly as the original renders echoes.</li>
          <li>The composer never accepts free text and the send icon does nothing — the captured widget&#39;s CTA row is replaced by the chips themselves.</li>
          <li>Replies arrive as complete bubbles: no typing indicator, no sounds (deliberately unshipped).</li>
        </ul>
      </section>

      {/* Scroll room for the pounce: window.scrollY must be able to pass the
          trigger; there is deliberately no filler text to read here. */}
      <div style={{ height: '160vh' }} aria-hidden />
      <p style={{ color: MUTED, fontSize: 13, margin: '0', paddingBottom: 48 }}>
        ↑ scroll room — keep going; the card pounces past the fold.
      </p>

      <ChatWidget />
    </main>
  );
}
