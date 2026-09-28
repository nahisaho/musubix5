import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('workspace isolation', () => {
  /**
   * @id TEST-M5-WORKTREE-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-WORKTREE-002 REQ-M5-WORKTREE-004 REQ-M5-MULTI-CHANGE-001
   */
  it('TEST-M5-WORKTREE-001 separates baseline, candidate, and QA without changing dirty paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workspace-'));
    temporaryDirectories.push(root);
    git(root, ['init', '--quiet']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test User']);
    const {
      captureBaseline,
      captureDirtyState,
      createCandidateWorkspace,
      createQaWorkspace,
    } = await import('../packages/analysis/src/workspace-manager.js');
    await expect(captureBaseline(root, 'CHANGE-0002'))
      .rejects.toThrow('WORKSPACE_BASELINE_COMMIT_REQUIRED');

    writeFileSync(join(root, 'tracked.txt'), 'baseline\n');
    writeFileSync(join(root, 'deleted.txt'), 'delete me\n');
    git(root, ['add', 'tracked.txt', 'deleted.txt']);
    git(root, ['commit', '--quiet', '-m', 'baseline']);
    const baselineCommit = git(root, ['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'tracked.txt'), 'dirty worktree\n');
    writeFileSync(join(root, 'staged.txt'), 'staged\n');
    git(root, ['add', 'staged.txt']);
    unlinkSync(join(root, 'deleted.txt'));
    writeFileSync(join(root, 'untracked.txt'), 'untracked\n');
    const before = await captureDirtyState(root);

    const baseline = await captureBaseline(root, 'CHANGE-0002');
    expect(baseline.commitSha).toBe(baselineCommit);
    const candidate = await createCandidateWorkspace(root, baseline);
    expect(candidate.branch).toBe('musubix5/CHANGE-0002/candidate');
    expect(git(candidate.path, ['status', '--porcelain'])).toBe('');
    expect(git(candidate.path, ['rev-parse', 'HEAD'])).toBe(baselineCommit);
    expect(await captureDirtyState(root)).toMatchObject(before);

    writeFileSync(join(candidate.path, 'candidate.txt'), 'candidate\n');
    git(candidate.path, ['add', 'candidate.txt']);
    git(candidate.path, ['commit', '--quiet', '-m', 'candidate']);
    const candidateCommit = git(candidate.path, ['rev-parse', 'HEAD']);
    const qa = await createQaWorkspace(root, {
      ...candidate,
      candidateCommit,
    });
    expect(git(qa.path, ['rev-parse', 'HEAD'])).toBe(candidateCommit);
    expect(git(qa.path, ['status', '--porcelain'])).toBe('');
    expect(await captureDirtyState(root)).toMatchObject(before);
  });
});
