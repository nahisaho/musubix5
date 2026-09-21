import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('cross-change candidate branch binding', () => {
  /**
   * @id TEST-M5-WORKTREE-CROSS-CHANGE-BRANCH-001
   * @verifies REQ-M5-WORKTREE-003
   */
  it('TEST-M5-WORKTREE-CROSS-CHANGE-BRANCH-001 rejects cross-change candidate ownership', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-cross-change-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', '--initial-branch', 'change/CHANGE-9999', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    const change = join(root, '.musubix/changes/CHANGE-0002.md');
    mkdirSync(join(change, '..'), { recursive: true });
    writeFileSync(change, '# CHANGE-0002\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');

    await expect(persistCandidateSnapshot(root, 'CHANGE-0002'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
  });
});
