import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'pipeline',
          include: ['test/pipeline.test.ts'],
        },
      },
      {
        test: {
          name: 'serving-seam',
          include: ['test/serving.seam.test.ts'],
          globalSetup: ['test/seam-global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'story-hook-seam',
          include: ['test/story-hook.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'motion-seam',
          include: ['test/motion.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'interactions-seam',
          include: ['test/interactions.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'scroll-seam',
          include: ['test/scroll.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'nav-seam',
          include: ['test/nav.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'chat-seam',
          include: ['test/chat.seam.test.ts'],
        },
      },
      {
        // the runtime is evaluated into a fresh JSDOM window per test (as the
        // motion/interactions seams do), so the project needs no jsdom
        // environment of its own and no JSX transform
        test: {
          name: 'chat-widget-seam',
          include: ['test/chat-widget.seam.test.ts'],
        },
      },
      {
        test: {
          name: 'routes',
          include: ['test/routes.test.ts'],
        },
      },
      {
        test: {
          name: 'cli',
          include: ['test/cli.test.ts'],
        },
      },
      {
        test: {
          name: 'assets',
          include: ['test/assets.test.ts'],
        },
      },
      {
        test: {
          name: 'embeds',
          include: ['test/embeds.test.ts'],
        },
      },
      {
        test: {
          name: 'dedupe',
          include: ['test/dedupe.test.ts'],
        },
      },
      {
        test: {
          name: 'video-inventory',
          include: ['test/video-inventory.test.ts'],
        },
      },
    ],
  },
});
