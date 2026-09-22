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
    const candidateCommit = 'a'.repeat(40);
    const approvalSha256 = 'b'.repeat(64);
    const releaseTag = 'v0.1.0';

    await expect(authorizeReleaseOperation(root, {
      operationId: 'publish-001',
      scope: 'publish',
      candidateCommit,
      releaseApprovalSha256: approvalSha256,
      releaseTag,
      authorizer: '@nahisaho',
      confirm: false,
    })).rejects.toThrow('RELEASE_OPERATION_CONFIRMATION_REQUIRED');

    const authorization = await authorizeReleaseOperation(root, {
      operationId: 'publish-001',
      scope: 'publish',
      candidateCommit,
      releaseApprovalSha256: approvalSha256,
      releaseTag,
      authorizer: '@nahisaho',
      confirm: true,
    });
    expect(authorization).toMatchObject({
      schemaVersion: 2,
      status: 'authorized',
      scope: 'publish',
      candidateCommit,
      releaseApprovalSha256: approvalSha256,
      releaseTag,
      authorizer: '@nahisaho',
    });

    const executor = vi.fn(async () => ({ outputSha256: 'c'.repeat(64) }));
    await expect(executeReleaseOperation(
      root,
      'publish-001',
      { scope: 'tag', candidateCommit, releaseTag },
      executor,
    )).rejects.toThrow('RELEASE_OPERATION_SCOPE_MISMATCH');
    expect(executor).not.toHaveBeenCalled();

    const completed = await executeReleaseOperation(
      root,
      'publish-001',
      { scope: 'publish', candidateCommit, releaseTag },
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
      { scope: 'publish', candidateCommit, releaseTag },
      executor,
    )).rejects.toThrow('RELEASE_OPERATION_ALREADY_USED');
  });

  /**
   * @id TEST-M5-RELEASE-004
   * @verifies REQ-M5-RELEASE-001
   */
  it('TEST-M5-RELEASE-004 validates release scope against an independently derived approval', async () => {
    const {
      authorizeReleaseOperation,
      validateReleaseOperationAuthorization,
    } = await import('../packages/analysis/src/release-operation-guard.js');
    const root = mkdtempSync(join(tmpdir(), 'musubix5-release-guard-v2-'));
    temporaryDirectories.push(root);
    const candidateCommit = 'a'.repeat(40);
    const releaseApprovalSha256 = 'b'.repeat(64);
    const releaseTag = 'v0.1.0';

    await authorizeReleaseOperation(root, {
      operationId: 'release-001',
      scope: 'release',
      candidateCommit,
      releaseApprovalSha256,
      releaseTag,
      authorizer: '@nahisaho',
      confirm: true,
    });

    const validated = await validateReleaseOperationAuthorization(
      root,
      'release-001',
      { scope: 'release', candidateCommit, releaseTag },
      { readReleaseApprovalDigest: async () => releaseApprovalSha256 },
    );
    expect(validated).toMatchObject({
      schemaVersion: 2,
      operationId: 'release-001',
      status: 'authorized',
      verifiedReleaseApprovalSha256: releaseApprovalSha256,
    });

    await expect(validateReleaseOperationAuthorization(
      root,
      'release-001',
      { scope: 'release', candidateCommit, releaseTag: 'v0.1.1' },
      { readReleaseApprovalDigest: async () => releaseApprovalSha256 },
    )).rejects.toThrow('RELEASE_OPERATION_NOT_AUTHORIZED');
  });
});
