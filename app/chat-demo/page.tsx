// The Chat mimic's MINIMAL driver page (ticket 08). Not a Recreation route:
// it is developer tooling for driving the conversation core by hand (the
// captured pages are served by the build's catch-all route). Ticket 09
// replaces the widget with the captured-fidelity one and ticket 10 mounts it
// site-wide, at which point this driver can go.
//
// SPDX-License-Identifier: CC0-1.0
import ChatWidget from '@/components/ChatWidget';

export default function ChatDemoPage() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 16, fontWeight: 600 }}>Chat mimic — conversation core driver</h1>
      <p style={{ color: '#6e7879', fontSize: 13 }}>
        Minimal driver for the message API (ticket 08). Reload the page to confirm the conversation resumes.
      </p>
      <ChatWidget />
    </main>
  );
}
