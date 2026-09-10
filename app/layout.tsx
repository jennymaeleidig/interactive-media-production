// Root layout for the app router's React pages. The Recreation itself does
// NOT render React pages — captured HTML is served verbatim by the catch-all
// route handler, which layouts never touch. This exists only so the chat
// driver page (ticket 08) has a document to render into; it will stay minimal.
//
// SPDX-License-Identifier: CC0-1.0
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat mimic — conversation core driver',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
