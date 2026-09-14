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

/**
 * Scanning the committed tree — reading and parsing every served page, twice —
 * takes ~20 s on a developer machine and ~48 s on a two-core Actions runner.
 * The two tree-scanning projects carry this instead of the default: the 30 s
 * they used to hold was below the runner's real time, so the publish gate
 * failed on the clock rather than on a finding.
 */
const TREE_SCAN_TIMEOUT = 120_000;

export default defineConfig({
  test: {
    projects: [
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
      project('composition-seam', ['test/composition.seam.test.ts']),
      project('chat-seam', ['test/chat.seam.test.ts']),
      // the runtime is evaluated into a fresh JSDOM window per test (as the
      // motion/interactions seams do), so the project needs no jsdom
      // environment of its own and no JSX transform
      project('chat-widget-seam', ['test/chat-widget.seam.test.ts']),
      project('injected-layers', ['test/injected-layers.test.ts']),
      project('injected-source', ['test/injected-source.test.ts']),
      project('served-tree', ['test/served-tree.test.ts']),
      project('publish-artifact', ['test/publish-artifact.test.ts']),
      project('routes', ['test/routes.test.ts']),
      project('upstream-watch', ['test/upstream-watch.test.ts']),
      project('upstream-baseline', ['test/upstream-baseline.test.ts']),
      project('upstream-accept', ['test/upstream-accept.test.ts']),
      project('upstream-copy', ['test/upstream-copy.test.ts'], { testTimeout: TREE_SCAN_TIMEOUT }),
      project('upstream-chrome', ['test/upstream-chrome.test.ts'], { testTimeout: TREE_SCAN_TIMEOUT }),
      project('upstream-assets', ['test/upstream-assets.test.ts']),
      project('upstream-media', ['test/upstream-media.test.ts']),
      project('cli', ['test/cli.test.ts']),
      project('audit', ['test/audit.test.ts']),
      project('html', ['test/html.test.ts']),
    ],
  },
});
