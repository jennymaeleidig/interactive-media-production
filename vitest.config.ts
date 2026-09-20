// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      // The shipped engine keeps its one session in `localStorage`, so the
      // engine seam runs in jsdom — the same DOM the shell seam mounts.
      {
        test: {
          name: 'chat-engine-seam',
          include: ['test/chat.seam.test.ts'],
          environment: 'jsdom',
          setupFiles: ['test/setup-jsdom.ts'],
        },
      },
      // The shell seam mounts the vendored React shell in jsdom against the
      // published runtime bytes. JSX is transformed by esbuild with the
      // automatic runtime, so the components need no `React` import in scope.
      {
        esbuild: { jsx: 'automatic' },
        resolve: { alias: { '@': root } },
        test: {
          name: 'chat-shell-seam',
          include: ['test/chat-shell.seam.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['test/setup-jsdom.ts'],
        },
      },
      {
        test: { name: 'chat-blocks', include: ['test/chat-blocks.test.ts'] },
      },
      // The drift guard ticket 11 asked for: the published runtime's one surface
      // matches what the shell calls.
      {
        test: {
          name: 'chat-interface',
          include: ['test/chat-interface.test.ts'],
          environment: 'jsdom',
          setupFiles: ['test/setup-jsdom.ts'],
        },
      },
      {
        test: { name: 'chat-assets', include: ['test/chat-assets.test.ts', 'test/copy.test.ts'] },
      },
      // The day divider's format is the piece's own, not the viewer's locale's,
      // so it is pinned without a DOM.
      {
        resolve: { alias: { '@': root } },
        test: { name: 'time', include: ['test/time.test.ts'] },
      },
      // The artifact check is an npm script — it needs a built export and a
      // server — so this project tests its verdicts, not the artifact.
      {
        test: { name: 'artifact', include: ['test/artifact.test.ts'] },
      },
      // The reconstruction's names must not come back: this project reads every
      // tracked file and fails on the vocabulary the deletion retired.
      {
        test: { name: 'vocabulary', include: ['test/vocabulary.test.ts'] },
      },
    ],
  },
});
