// The Chat mimic's driver page (ticket 09). Not a Recreation route: the
// captured pages are served by the build's catch-all route, and ticket 10
// mounts the widget site-wide. This page exists so the widget can be driven
// by hand, including the captured scroll-triggered pounce — hence the filler
// column that gives the page something to scroll.
//
// SPDX-License-Identifier: CC0-1.0
import ChatWidget from '@/components/ChatWidget';

export default function ChatDemoPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 120px', fontFamily: 'system-ui, sans-serif', color: '#183129' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 8px' }}>Chat mimic — widget driver</h1>
      <p style={{ color: '#6e7879', fontSize: 14, margin: '0 0 32px' }}>
        Scroll to fire the captured pounce, choose the option chips inside the composer, and reload to confirm the
        server-side session resumes.
      </p>
      {Array.from({ length: 24 }, (_, i) => (
        <p key={i} style={{ color: '#6e7879', fontSize: 14, lineHeight: 1.7 }}>
          Scroll filler {i + 1}. The pounce card appears once the page is scrolled past the fold.
        </p>
      ))}
      <ChatWidget />
    </main>
  );
}
