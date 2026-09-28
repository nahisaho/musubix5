import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('lifecycle invocation resume', () => {
  /**
   * @id TEST-M5-LIFECYCLE-003
   * @verifies REQ-M5-LIFECYCLE-003
   */
  it('TEST-M5-LIFECYCLE-003 reuses a committed invocation without consuming another order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-lifecycle-resume-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { lifecycleStatus, transitionLifecycle } =
      await import('../packages/analysis/src/lifecycle.js');
    const input = {
      changeId: 'CHANGE-0002',
      event: 'requirements-validated' as const,
      evidenceHeads: ['requirements:v1'],
      idempotencyKey: 'invocation-requirements-validation',
    };

    const first = await transitionLifecycle(root, input);
    const resumed = await transitionLifecycle(root, input);
    const status = await lifecycleStatus(root, input.changeId);

    expect(resumed).toEqual(first);
    expect(status.transitions).toHaveLength(1);
    expect(status.transitions[0]?.order).toBe(1);
  });
});
