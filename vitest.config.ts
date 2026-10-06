import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./scripts/test-runtime/vitest-setup.mjs'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 90_000,
    maxWorkers: 8,
  },
});
