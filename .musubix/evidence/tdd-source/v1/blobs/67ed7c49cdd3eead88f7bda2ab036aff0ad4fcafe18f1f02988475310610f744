import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-approval-normative-'));
  temporaryDirectories.push(root);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  return root;
}

function config(root: string, value: object = {
  schemaVersion: 1,
  approval: { mode: 'required', domains: [] },
}): void {
  write(root, '.musubix/config.json', `${JSON.stringify(value)}\n`);
}

function requirements(root: string): void {
  write(root, '.musubix/constitution.md', '# Constitution\n');
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-SAMPLE-001: Sample',
    'Priority: must',
    'Type: functional',
    'Statement: The system shall respond.',
    'Acceptance: The response is observed.',
    '',
  ].join('\n'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('approval normative contract', () => {
  /**
   * @id TEST-M5-APPROVAL-STATUS-CANDIDATE-001
   * @verifies REQ-M5-APPROVAL-002
   */
  it('TEST-M5-APPROVAL-STATUS-CANDIDATE-001 diagnoses corrupt release evidence without a candidate', async () => {
    const root = repository();
    write(root, '.musubix/evidence/approvals/release.json', '{invalid\n');
    const { validateApprovalStage } = await import('../packages/analysis/src/approval.js');

    await expect(validateApprovalStage(root, 'release', {
      mode: 'required',
      domains: [],
    })).resolves.toMatchObject({
      status: 'stale',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'APPROVAL_SCHEMA' }),
        expect.objectContaining({ code: 'APPROVAL_CANDIDATE_UNAVAILABLE' }),
      ]),
    });
  });

  /**
   * @id TEST-M5-APPROVAL-NORMATIVE-PATH-001
   * @verifies REQ-M5-APPROVAL-007
   */
  it('TEST-M5-APPROVAL-NORMATIVE-PATH-001 rejects a symlinked feature requirement', async () => {
    const root = repository();
    config(root);
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, 'outside.md', '# Requirements\n');
    mkdirSync(join(root, '.musubix/features/sample'), { recursive: true });
    symlinkSync('../../../outside.md', join(root, '.musubix/features/sample/requirements.md'));
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    await expect(prepareStageApproval(root, {
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    })).rejects.toThrow('APPROVAL_NORMATIVE_SYMLINK');
  });

  /**
   * @id TEST-M5-COMPAT-EFFECTIVE-PROJECTION-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-COMPAT-EFFECTIVE-PROJECTION-001 keeps implicit and explicit defaults producer-identical', async () => {
    const root = repository();
    config(root);
    requirements(root);
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    const compatibility = await approvalManifest(root, 'requirements');
    const native = await prepareStageApproval(root, {
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(native.projection).toEqual(compatibility.projection);
    expect(native.artifactSha256).toBe(compatibility.artifactSha256);
  });

  /**
   * @id TEST-M5-COMPAT-ADR-SCOPE-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-COMPAT-ADR-SCOPE-001 rejects a missing referenced ADR', async () => {
    const root = repository();
    config(root);
    requirements(root);
    write(root, '.musubix/features/sample/design.md', [
      '## DES-SAMPLE-001: Sample',
      'Responsibilities: Respond.',
      'Interfaces: `respond()`.',
      'Constraints: Deterministic.',
      'Requirements: REQ-SAMPLE-001',
      'ADRs: ADR-0001',
      '',
    ].join('\n'));
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    await expect(prepareStageApproval(root, {
      stage: 'design',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    })).rejects.toThrow('APPROVAL_NORMATIVE_MISSING');
  });

  /**
   * @id TEST-M5-WORKTREE-ACTIVE-CHANGE-001
   * @verifies REQ-M5-WORKTREE-003
   */
  it('TEST-M5-WORKTREE-ACTIVE-CHANGE-001 refuses an ambiguous latest snapshot', async () => {
    const root = repository();
    write(root, '.musubix/changes/CHANGE-0001.md', '# CHANGE-0001\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'one');
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    await persistCandidateSnapshot(root, 'CHANGE-0001');
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'two');
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(approvalManifest(root, 'release'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
  });

  /**
   * @id TEST-M5-APPROVAL-RECORD-CANDIDATE-001
   * @verifies REQ-M5-APPROVAL-009
   */
  it('TEST-M5-APPROVAL-RECORD-CANDIDATE-001 re-derives release approval from the candidate tree', async () => {
    const root = repository();
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    write(root, 'src/index.ts', 'export const value = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'candidate');
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const {
      prepareStageApproval, recordNativeApproval,
    } = await import('../packages/analysis/src/native-approval.js');
    await persistCandidateSnapshot(root, 'CHANGE-0002');
    const manifest = await prepareStageApproval(root, {
      stage: 'release',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    write(root, 'src/index.ts', 'export const value = 999;\n');

    await expect(recordNativeApproval(root, {
      stage: 'release',
      paths: ['src/index.ts'],
      projection: null,
      producerId: 'native',
      repositoryId: 'repository:test',
      candidateId: 'candidate:test',
      changeId: 'CHANGE-0002',
      expectedArtifactSha256: manifest.artifactSha256,
      approver: '@tester',
      confirmed: true,
      idempotencyKey: 'release-candidate-record',
    })).resolves.toMatchObject({
      artifactSha256: manifest.artifactSha256,
      artifacts: manifest.artifacts,
    });
  });
});
