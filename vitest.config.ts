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
    ],
  },
});
