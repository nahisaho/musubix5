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

function initializeRepository(branch = 'main'): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-approval-diagnostic-'));
  temporaryDirectories.push(root);
  execFileSync('git', ['init', '--quiet', '--initial-branch', branch, root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
  return root;
}

function commit(root: string): void {
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('approval contract diagnostics', () => {
  /**
   * @id TEST-M5-APPROVAL-RELEASE-DOMAIN-001
   * @verifies REQ-M5-APPROVAL-007
   */
  it('TEST-M5-APPROVAL-RELEASE-DOMAIN-001 rejects a release domain option', async () => {
    const root = initializeRepository();
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    commit(root);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    await expect(approvalManifest(root, 'release', {
      name: 'sample',
      features: ['sample'],
    })).rejects.toThrow('APPROVAL_DOMAIN_MISMATCH');
  });

  /**
   * @id TEST-M5-COMPAT-NORMATIVE-SYMLINK-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-COMPAT-NORMATIVE-SYMLINK-001 classifies a normative symlink', async () => {
    const root = initializeRepository();
    write(root, '.musubix/config.json', JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    }));
    write(root, 'outside.md', '# Constitution\n');
    mkdirSync(join(root, '.musubix'), { recursive: true });
    symlinkSync('../outside.md', join(root, '.musubix/constitution.md'));
    write(root, '.musubix/features/sample/requirements.md', '# Requirements\n');
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');

    await expect(prepareStageApproval(root, {
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    })).rejects.toThrow('APPROVAL_NORMATIVE_SYMLINK');
  });

  /**
   * @id TEST-M5-WORKTREE-CANDIDATE-BRANCH-001
   * @verifies REQ-M5-WORKTREE-001
   */
  it('TEST-M5-WORKTREE-CANDIDATE-BRANCH-001 rejects a branch owned by another CHANGE', async () => {
    const root = initializeRepository('change/CHANGE-9999');
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    commit(root);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');

    await expect(persistCandidateSnapshot(root, 'CHANGE-0002'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
  });
});
