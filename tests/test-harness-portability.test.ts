import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('test harness portability', () => {
  /**
   * @id TEST-M5-RELEASE-BUILD-ISOLATION-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-BUILD-ISOLATION-001 builds dist once before parallel test workers', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const config = readFileSync(`${root}/vitest.config.ts`, 'utf8');
    const cliContract = readFileSync(`${root}/tests/cli-json-error-contract.test.ts`, 'utf8');
    const journalOrder = readFileSync(`${root}/tests/journal-order.test.ts`, 'utf8');

    expect(config).toContain("globalSetup: ['./tests/global-setup.ts']");
    expect(cliContract).not.toContain("resolveNpmInvocationForEnvironment(['run', 'build'])");
    expect(journalOrder).not.toContain("resolvePortableNpmInvocation(['run', 'build'])");
  });
});
