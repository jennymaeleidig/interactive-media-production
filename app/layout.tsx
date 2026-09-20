// The host document: one shell for one page.
//
// `<title>` stays in costume; the unfurl tags go honest (`lib/share.ts`), because
// the preview is the only out-of-frame carrier that survives a browser warning.
// The chat runtime is declared once, by the path `scripts/chat-assets.mjs`
// publishes; the React shell itself ships in this page's own bundle.
//
// SPDX-License-Identifier: CC0-1.0
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { HONEST_DESCRIPTION, HONEST_FIRST_SENTENCE } from '@/lib/share';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flock Safety',
  description: HONEST_DESCRIPTION,
  // The unfurl is out of frame, so it drops the mask even though the tab does not.
  openGraph: {
    title: HONEST_FIRST_SENTENCE,
    description: HONEST_DESCRIPTION,
    type: 'website',
  },
  icons: {
    icon: '/favicon-32.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes writes `class` and `color-scheme` onto <html> before React
    // hydrates; the mismatch is expected, so it is suppressed here (the
    // provider is pinned to light, and it never changes).
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Self-hosted faces, leaned on before first paint. */}
        <link as="font" crossOrigin="anonymous" href="/fonts/Sohne-Regular.woff2" rel="preload" type="font/woff2" />
        <link as="font" crossOrigin="anonymous" href="/fonts/Sohne-Book.woff2" rel="preload" type="font/woff2" />
        <link as="font" crossOrigin="anonymous" href="/fonts/Denim-Bold.woff2" rel="preload" type="font/woff2" />
        {/* The engine, and the only file /chat/ publishes. */}
        <script defer src="/chat/runtime.js" />
      </body>
    </html>
  );
}
