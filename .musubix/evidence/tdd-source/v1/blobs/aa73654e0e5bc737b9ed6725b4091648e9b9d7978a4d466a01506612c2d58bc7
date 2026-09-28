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

describe('approval supersession', () => {
  /**
   * @id TEST-M5-APPROVAL-008
   * @verifies REQ-M5-APPROVAL-008
   */
  it('TEST-M5-APPROVAL-008 stales downstream evidence without deleting history', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-supersession-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { appendEvidence, classifyEvidence } =
      await import('../packages/analysis/src/evidence-registry.js');
    const { supersedeFrom } = await import('../packages/analysis/src/native-approval.js');
    const context = {
      producerId: 'musubix5@0.1.0',
      repositoryId: 'repo:musubix5',
      candidateId: 'candidate:abc',
      changeId: 'CHANGE-0002',
      inputDigest: 'a'.repeat(64),
      dependencyHeads: { requirements: 'b'.repeat(64) },
      supersedingOrder: 1,
    };
    const quality = await appendEvidence(root, {
      ...context,
      kind: 'quality',
      status: 'pass',
      idempotencyKey: 'quality-v1',
      payload: {},
    });

    const supersession = await supersedeFrom(root, {
      changeId: context.changeId,
      stage: 'requirements',
      previousHead: context.dependencyHeads.requirements,
      currentHead: 'c'.repeat(64),
      idempotencyKey: 'requirements-superseded-v2',
    });

    expect(supersession.order).toBe(2);
    expect(supersession.affectedKinds).toContain('quality');
    expect(classifyEvidence(quality, { ...context, supersedingOrder: supersession.order }))
      .toMatchObject({ classification: 'stale', current: false });
  });
});
