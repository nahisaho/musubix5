import { defineConfig, mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import base from '../vitest.config.js';

/** @id CODE-M5-CONCURRENCY-RUNNER-CLOCK-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-004
 */
export default mergeConfig(base, defineConfig({
  test: {
    maxWorkers: 1,
    setupFiles: ['./tests/helpers/concurrency-wall-setup.ts'],
    poolOptions: {
      forks: {
        execArgv: ['--import', fileURLToPath(new URL('./helpers/concurrency-runner-clock.mjs', import.meta.url))],
      },
    },
  },
}));
