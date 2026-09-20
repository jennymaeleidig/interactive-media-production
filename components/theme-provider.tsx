// The one attribute of the template's four runtime dependencies the shell needs
// back: a theme provider.
//
// The piece has exactly one light ground and never changes it (ticket 06), so
// the provider is pinned to light rather than following the system — otherwise a
// dark-mode extension could invert a surface Flock's identity fixes.
//
// SPDX-License-Identifier: CC0-1.0
'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" enableSystem={false} forcedTheme="light">
      {children}
    </NextThemesProvider>
  );
}
