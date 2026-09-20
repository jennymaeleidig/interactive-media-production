// The host document: one shell for one page.
//
// The chat's own stylesheet and runtime are declared here once, by the paths
// `pipeline/chat-assets.mjs` publishes, so the widget's bytes arrive with the
// page — surfaces, typeface and engine together — and nothing else does. The
// widget boots itself, so neither tag needs a hook.
//
// SPDX-License-Identifier: CC0-1.0
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flock',
  description: 'A chat assistant.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <link rel="stylesheet" href="/chat/widget.css" />
        <script src="/chat/runtime.js" defer />
      </body>
    </html>
  );
}
