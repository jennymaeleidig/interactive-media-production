// SPDX-License-Identifier: CC0-1.0
import { defineConfig } from 'vitest/config';

/**
 * One vitest project: a name, its test files, and any per-project options. The
 * list below is still explicit — a new module needs its seam added here — but
 * each row is one line instead of a four-line object literal.
 */
const project = (name: string, include: string[], extra: Record<string, unknown> = {}) => ({
  test: { name, include, ...extra },
});

export default defineConfig({
  test: {
    projects: [
      project('pipeline', ['test/pipeline.test.ts']),
      project('serving-seam', ['test/serving.seam.test.ts'], {
        globalSetup: ['test/seam-global-setup.ts'],
        testTimeout: 30_000,
        hookTimeout: 120_000,
      }),
      project('story-hook-seam', ['test/story-hook.seam.test.ts']),
      project('motion-seam', ['test/motion.seam.test.ts']),
      project('interactions-seam', ['test/interactions.seam.test.ts']),
      project('scroll-seam', ['test/scroll.seam.test.ts']),
      project('nav-seam', ['test/nav.seam.test.ts']),
      project('chat-seam', ['test/chat.seam.test.ts']),
      // the runtime is evaluated into a fresh JSDOM window per test (as the
      // motion/interactions seams do), so the project needs no jsdom
      // environment of its own and no JSX transform
      project('chat-widget-seam', ['test/chat-widget.seam.test.ts']),
      project('served-tree', ['test/served-tree.test.ts']),
      project('routes', ['test/routes.test.ts']),
      project('cli', ['test/cli.test.ts']),
      project('assets', ['test/assets.test.ts']),
      project('embeds', ['test/embeds.test.ts']),
      project('audit', ['test/audit.test.ts']),
      project('csp', ['test/csp.test.ts']),
      project('html', ['test/html.test.ts']),
      project('layers', ['test/layers.test.ts']),
      project('passes', ['test/passes.test.ts']),
      project('summary', ['test/summary.test.ts']),
      project('dedupe', ['test/dedupe.test.ts']),
      project('video-inventory', ['test/video-inventory.test.ts']),
    ],
  },
});
