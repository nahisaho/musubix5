import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('verified-auto approval boundary resume', () => {
  /**
   * @id TEST-M5-APPROVAL-004
   * @verifies REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-006 REQ-M5-BUDGET-005
   */
  it('TEST-M5-APPROVAL-004 resumes one pending identity and rejects invalid limits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-approval-resume-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { evaluateApprovalBoundary } =
      await import('../packages/analysis/src/approval-boundary.js');
    const reviewer = vi.fn(async () => ({
      disposition: 'repairable' as const,
      findings: [{ code: 'MISSING_FIELD', path: '$.priorities' }],
      actualUsage: 2,
    }));
    const repairIdentities: string[] = [];
    const producer = vi.fn(async (_findings: unknown, repairIdentity: string) => {
      repairIdentities.push(repairIdentity);
      if (repairIdentities.length === 1) throw new Error('simulated interruption');
      return { actualUsage: 3 };
    });
    const input = {
      changeId: 'CHANGE-0002',
      boundaryKey: 'requirements:CHANGE-0002',
      stage: 'requirements' as const,
      reviewerPolicyId: 'reviewer:v1',
      manifestDigest: 'd'.repeat(64),
      rejectedOutputOrdinal: 1,
      reviewerBudget: 10,
      repairBudget: 10,
      reviewerCost: 2,
      repairCost: 3,
      producerRepairLimit: 1,
      reviewer,
      producer,
    };

    await expect(evaluateApprovalBoundary(root, input))
      .rejects.toThrow('simulated interruption');
    expect(await evaluateApprovalBoundary(root, input)).toMatchObject({
      status: 'repair-scheduled',
      attemptsConsumed: 1,
      repairsConsumed: 1,
      noncesConsumed: 1,
    });
    expect(reviewer).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledTimes(2);
    expect(new Set(repairIdentities).size).toBe(1);

    expect(await evaluateApprovalBoundary(root, {
      ...input,
      boundaryKey: 'design:CHANGE-0002',
      manifestDigest: 'e'.repeat(64),
      rejectedOutputOrdinal: 2,
      reviewerBudget: 0,
    })).toMatchObject({
      status: 'terminal',
      terminalReason: 'invalid-budget-configuration',
      attemptsConsumed: 0,
      repairsConsumed: 0,
      noncesConsumed: 0,
      order: null,
    });
    expect(reviewer).toHaveBeenCalledTimes(1);
  });
});
