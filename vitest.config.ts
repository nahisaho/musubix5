import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    maxWorkers: 2,
  },
});
