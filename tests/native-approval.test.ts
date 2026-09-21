import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('native exact-hash approval', () => {
  /**
   * @id TEST-M5-APPROVAL-001
   * @verifies REQ-M5-APPROVAL-001
   */
  it('TEST-M5-APPROVAL-001 records only explicitly confirmed current manifests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-native-approval-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    mkdirSync(join(root, '.musubix', 'features', 'sample'), { recursive: true });
    writeFileSync(join(root, '.musubix', 'constitution.md'), '# Constitution\n');
    writeFileSync(
      join(root, '.musubix', 'features', 'sample', 'requirements.md'),
      '# Requirements\n',
    );
    const { prepareNativeApproval, recordNativeApproval } =
      await import('../packages/analysis/src/native-approval.js');
    const identity = {
      producerId: 'musubix5@0.1.0',
      repositoryId: 'repo:musubix5',
      candidateId: 'candidate:abc',
      changeId: 'CHANGE-0002',
    };
    const paths = [
      '.musubix/constitution.md',
      '.musubix/features/sample/requirements.md',
    ];
    const manifest = await prepareNativeApproval(root, {
      stage: 'requirements',
      paths,
      projection: { schemaVersion: 1, approval: { mode: 'required', domains: [] } },
    });
    const approvalPath = join(root, '.musubix', 'evidence', 'approvals', 'native', 'requirements.json');

    await expect(recordNativeApproval(root, {
      ...identity,
      stage: 'requirements',
      paths,
      projection: manifest.projection,
      expectedArtifactSha256: manifest.artifactSha256,
      approver: '@nahisaho',
      confirmed: false,
      idempotencyKey: 'approval-requirements-v1',
    })).rejects.toThrow('APPROVAL_CONFIRMATION_REQUIRED');
    await expect(recordNativeApproval(root, {
      ...identity,
      stage: 'requirements',
      paths,
      projection: manifest.projection,
      expectedArtifactSha256: '0'.repeat(64),
      approver: '@nahisaho',
      confirmed: true,
      idempotencyKey: 'approval-requirements-v1',
    })).rejects.toThrow('APPROVAL_MANIFEST_CHANGED');
    expect(existsSync(approvalPath)).toBe(false);

    const evidence = await recordNativeApproval(root, {
      ...identity,
      stage: 'requirements',
      paths,
      projection: manifest.projection,
      expectedArtifactSha256: manifest.artifactSha256,
      approver: '@nahisaho',
      confirmed: true,
      idempotencyKey: 'approval-requirements-v1',
    });
    expect(evidence).toMatchObject({
      stage: 'requirements',
      approver: '@nahisaho',
      artifactSha256: manifest.artifactSha256,
      order: 1,
    });
    expect(existsSync(approvalPath)).toBe(true);
  });
});
