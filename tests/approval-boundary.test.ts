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

describe('verified-auto approval boundary', () => {
  /**
   * @id TEST-M5-APPROVAL-003
   * @verifies REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006
   */
  it('TEST-M5-APPROVAL-003 repairs deterministically and stops duplicates or exhaustion', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-approval-boundary-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    const { evaluateApprovalBoundary } =
      await import('../packages/analysis/src/approval-boundary.js');
    const reviewer = vi.fn(async () => ({
      disposition: 'repairable' as const,
      findings: [{ code: 'MISSING_FIELD', path: '$.priorities' }],
      actualUsage: 2,
    }));
    const producer = vi.fn(async () => ({ actualUsage: 3 }));
    const common = {
      changeId: 'CHANGE-0002',
      boundaryKey: 'requirements:CHANGE-0002',
      stage: 'requirements' as const,
      reviewerPolicyId: 'reviewer:v1',
      reviewerBudget: 10,
      repairBudget: 10,
      reviewerCost: 2,
      repairCost: 3,
      producerRepairLimit: 1,
      reviewer,
      producer,
    };

    const first = await evaluateApprovalBoundary(root, {
      ...common,
      manifestDigest: 'a'.repeat(64),
      rejectedOutputOrdinal: 1,
    });
    expect(first).toMatchObject({
      status: 'repair-scheduled',
      repairIdentity: expect.stringMatching(/^producer-repair:/),
      attemptsConsumed: 1,
      repairsConsumed: 1,
      noncesConsumed: 1,
    });
    expect(reviewer).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledTimes(1);

    expect(await evaluateApprovalBoundary(root, {
      ...common,
      manifestDigest: 'a'.repeat(64),
      rejectedOutputOrdinal: 1,
    })).toMatchObject({
      status: 'terminal',
      terminalReason: 'duplicate-rejected-manifest',
      attemptsConsumed: 0,
      repairsConsumed: 0,
      noncesConsumed: 0,
    });
    expect(reviewer).toHaveBeenCalledTimes(1);

    expect(await evaluateApprovalBoundary(root, {
      ...common,
      manifestDigest: 'b'.repeat(64),
      rejectedOutputOrdinal: 2,
    })).toMatchObject({
      status: 'terminal',
      terminalReason: 'repair-limit-exceeded',
      repairsConsumed: 0,
    });
    expect(producer).toHaveBeenCalledTimes(1);

    await expect(evaluateApprovalBoundary(root, {
      ...common,
      stage: 'release',
      manifestDigest: 'c'.repeat(64),
      rejectedOutputOrdinal: 3,
    })).rejects.toThrow('APPROVAL_BOUNDARY_MANUAL_ONLY');
  });
});
