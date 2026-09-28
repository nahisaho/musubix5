import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';

/** @id TEST-M5-CONCURRENCY-RUNNER-CLOCK-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004
 */
it('TEST-M5-CONCURRENCY-RUNNER-CLOCK-001 bootstraps the steady deadline clock inside actual stress workers', () => {
  mkdirSync(resolve('.musubix/cache'), { recursive: true });
  const root = mkdtempSync(resolve('.musubix/cache/runner-clock-'));
  try {
    const fixture = join(root, 'worker.test.ts');
    writeFileSync(fixture, `import { expect, it } from 'vitest';
it('worker clock was installed before runner import', () => {
  expect(Date.now.toString()).toContain('performance.now()');
});
`);
    const config = join(root, 'vitest.config.mts');
    const source = resolve('tests/concurrency-load.config.ts');
    writeFileSync(config, `import base from ${JSON.stringify(source)};
export default { ...base, test: { ...base.test, globalSetup: [], setupFiles: [],
  include: [${JSON.stringify(fixture)}] } };
`);
    let output: string;
    try {
      output = execFileSync(process.execPath, [
        '--import', resolve('tests/helpers/concurrency-runner-clock.mjs'),
        resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', config, '--reporter=default',
      ], { encoding: 'utf8', timeout: 20_000, stdio: 'pipe' });
    } catch (cause) {
      if (cause instanceof Error && 'stdout' in cause && 'stderr' in cause) {
        throw new Error(`${String(cause.stdout)}\n${String(cause.stderr)}`, { cause });
      }
      throw cause;
    }
    expect(output).toContain('1 passed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
