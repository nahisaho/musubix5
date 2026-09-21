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

describe('release operation guard', () => {
  /**
   * @id TEST-M5-RELEASE-001
   * @verifies REQ-M5-RELEASE-001 REQ-M5-BOOTSTRAP-004
   */
  it('TEST-M5-RELEASE-001 requires separate candidate-bound authorization', async () => {
    const {
      authorizeReleaseOperation,
      executeReleaseOperation,
      releaseOperationStatus,
    } = await import('../packages/analysis/src/release-operation-guard.js');
    const root = mkdtempSync(join(tmpdir(), 'musubix5-release-guard-'));
    temporaryDirectories.push(root);
    const candidateSha256 = 'a'.repeat(64);
    const approvalSha256 = 'b'.repeat(64);

    await expect(authorizeReleaseOperation(root, {
      operationId: 'publish-001',
      scope: 'publish',
      candidateSha256,
      releaseApprovalSha256: approvalSha256,
      authorizer: '@nahisaho',
      confirm: false,
    })).rejects.toThrow('RELEASE_OPERATION_CONFIRMATION_REQUIRED');

    const authorization = await authorizeReleaseOperation(root, {
      operationId: 'publish-001',
      scope: 'publish',
      candidateSha256,
      releaseApprovalSha256: approvalSha256,
      authorizer: '@nahisaho',
      confirm: true,
    });
    expect(authorization).toMatchObject({
      status: 'authorized',
      scope: 'publish',
      candidateSha256,
      releaseApprovalSha256: approvalSha256,
      authorizer: '@nahisaho',
    });

    const executor = vi.fn(async () => ({ outputSha256: 'c'.repeat(64) }));
    await expect(executeReleaseOperation(
      root,
      'publish-001',
      { scope: 'tag', candidateSha256 },
      executor,
    )).rejects.toThrow('RELEASE_OPERATION_SCOPE_MISMATCH');
    expect(executor).not.toHaveBeenCalled();

    const completed = await executeReleaseOperation(
      root,
      'publish-001',
      { scope: 'publish', candidateSha256 },
      executor,
    );
    expect(completed).toMatchObject({
      status: 'completed',
      outputSha256: 'c'.repeat(64),
    });
    expect(await releaseOperationStatus(root, 'publish-001')).toEqual(completed);
    await expect(executeReleaseOperation(
      root,
      'publish-001',
      { scope: 'publish', candidateSha256 },
      executor,
    )).rejects.toThrow('RELEASE_OPERATION_ALREADY_USED');
  });
});
