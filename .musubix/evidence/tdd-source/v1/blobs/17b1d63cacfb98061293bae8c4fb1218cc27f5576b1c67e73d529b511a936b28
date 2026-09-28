import { execFileSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
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

function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args], {
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2025-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2025-01-01T00:00:00Z',
    },
  });
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-binding-'));
  temporaryDirectories.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
  write(root, 'src/index.ts', 'export const value = 1;\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'candidate']);
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate snapshot repository binding', () => {
  /**
   * @id TEST-M5-CANDIDATE-SNAPSHOT-REPOSITORY-001
   * @verifies REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-WORKTREE-001
   */
  it('TEST-M5-CANDIDATE-SNAPSHOT-REPOSITORY-001 rejects a snapshot journal copied from another repository', async () => {
    const source = repository();
    const target = repository();
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    await persistCandidateSnapshot(source, 'CHANGE-0002');
    cpSync(join(source, '.musubix/journal'), join(target, '.musubix/journal'), {
      recursive: true,
    });

    await expect(approvalManifest(target, 'release'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
  });
});
