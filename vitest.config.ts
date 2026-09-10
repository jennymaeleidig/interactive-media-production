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
          name: 'chat-seam',
          include: ['test/chat.seam.test.ts'],
        },
      },
      {
        // tsconfig keeps `jsx: preserve` for Next; vitest's esbuild needs the
        // automatic runtime to transform the React component under test. The
        // option must sit on the project entry — a top-level one does not
        // reach the projects.
        esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
        test: {
          name: 'chat-widget-seam',
          include: ['test/chat-widget.seam.test.tsx'],
          environment: 'jsdom',
          environmentOptions: { jsdom: { url: 'http://localhost/' } },
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
    ],
  },
});
