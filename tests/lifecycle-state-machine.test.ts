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

describe('protected lifecycle state machine', () => {
  /**
   * @id TEST-M5-LIFECYCLE-001
   * @verifies REQ-M5-LIFECYCLE-001
   */
  it('TEST-M5-LIFECYCLE-001 rejects skipped phases and persists the approved sequence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-lifecycle-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { lifecycleStatus, transitionLifecycle } =
      await import('../packages/analysis/src/lifecycle.js');

    await expect(transitionLifecycle(root, {
      changeId: 'CHANGE-0002',
      event: 'design-validated',
      evidenceHeads: ['design'],
    })).rejects.toThrow('LIFECYCLE_INVALID_TRANSITION');

    const events = [
      'requirements-validated',
      'requirements-reviewed',
      'requirements-approved',
      'design-validated',
      'design-reviewed',
      'design-approved',
      'red-recorded',
      'implementation-recorded',
      'green-recorded',
      'refactor-recorded',
      'integration-completed',
      'trace-formal-evaluated',
      'quality-completed',
      'release-reviewed',
      'release-approved',
    ] as const;
    for (const event of events) {
      await transitionLifecycle(root, {
        changeId: 'CHANGE-0002',
        event,
        evidenceHeads: [`evidence:${event}`],
      });
    }

    const status = await lifecycleStatus(root, 'CHANGE-0002');
    expect(status.state).toBe('release-approved');
    expect(status.transitions).toHaveLength(events.length);
    expect(status.transitions.map((transition) => transition.order))
      .toEqual(events.map((_, index) => index + 1));
  });
});
