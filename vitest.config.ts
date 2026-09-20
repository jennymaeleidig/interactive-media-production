// SPDX-License-Identifier: CC0-1.0
import { defineConfig } from 'vitest/config';

/**
 * One vitest project: a name, its test files, and any per-project options. The
 * list below is explicit — a new seam needs its row — but each row is one line
 * instead of a four-line object literal.
 */
const project = (name: string, include: string[], extra: Record<string, unknown> = {}) => ({
  test: { name, include, ...extra },
});

export default defineConfig({
  test: {
    projects: [
      // The shipped engine keeps its one session in `localStorage`, so the
      // engine seam runs in jsdom — the same DOM the widget seam mounts.
      project('chat-engine-seam', ['test/chat.seam.test.ts'], { environment: 'jsdom' }),
      // The widget seam builds its own JSDOM window per test and carries its own
      // `@vitest-environment jsdom` for the source-engine oracle, so the project
      // needs no environment of its own and no JSX transform.
      project('chat-widget-seam', ['test/chat-widget.seam.test.ts']),
      project('chat-source', ['test/chat-source.test.ts']),
      project('chat-assets', ['test/chat-assets.test.ts']),
      // The artifact check is an npm script — it needs a built export and a
      // server — so this project tests its verdicts, not the artifact.
      project('artifact', ['test/artifact.test.ts']),
      // The reconstruction's names must not come back: this project reads every
      // tracked file and fails on the vocabulary the deletion retired.
      project('vocabulary', ['test/vocabulary.test.ts']),
    ],
  },
});
