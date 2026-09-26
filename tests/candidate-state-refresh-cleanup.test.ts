import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readCandidateRegistry,
  replaceCandidateRegistry,
  type CandidateRegistry,
} from '../packages/analysis/src/candidate-state.js';

const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeRepository(): {
  root: string;
  candidateRoot: string;
  managedRoot: string;
  registry: CandidateRegistry;
  defaultTip: string;
} {
  const suffix = `${process.pid}-${randomUUID()}`;
  const root = join(process.cwd(), `.candidate-refresh-${suffix}`);
  const candidateRoot = join(process.cwd(), `.candidate-refresh-worktree-${suffix}`);
  roots.push(root, candidateRoot);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(root, 'base.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'base');
  const baseCommit = git(root, 'rev-parse', 'HEAD');
  git(root, 'worktree', 'add', '--quiet', '-b', 'candidate/CHANGE-0014', candidateRoot, baseCommit);
  writeFileSync(join(candidateRoot, 'candidate.txt'), 'candidate\n');
  git(candidateRoot, 'add', '.');
  git(candidateRoot, 'commit', '--quiet', '-m', 'candidate change');
  const candidateCommit = git(candidateRoot, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'default.txt'), 'default\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'default advances');
  const defaultTip = git(root, 'rev-parse', 'HEAD');
  const registry: CandidateRegistry = {
    schemaVersion: 1,
    repositoryId: `repository:${'1'.repeat(64)}`,
    candidates: [{
      schemaVersion: 1,
      candidateId: `candidate:${'2'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 1,
      repositoryId: `repository:${'1'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit,
      candidateCommit,
      branch: 'candidate/CHANGE-0014',
      worktreePath: basename(candidateRoot),
      state: 'stale',
      preparedOrder: 1,
      activeOrder: 2,
      dependencyIds: [],
    }],
    integrations: [],
  };
  return { root, candidateRoot, managedRoot: dirname(root), registry, defaultTip };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('candidate refresh and cleanup', () => {
  /** @id TEST-M5-CANDIDATE-REFRESH-CLEANUP-001
   * @verifies REQ-M5-MULTI-CHANGE-004
   */
  it('TEST-M5-CANDIDATE-REFRESH-CLEANUP-001 refreshes non-destructively and cleans only a confirmed candidate', async () => {
    const fixture = initializeRepository();
    await replaceCandidateRegistry(fixture.root, fixture.registry);
    const api = await import('../packages/analysis/src/candidate-state.js') as typeof import(
      '../packages/analysis/src/candidate-state.js'
    ) & {
      refreshCandidate(
        root: string,
        selector: string,
        options: {
          managedRoot: string;
          defaultCommit: string;
          hasLiveSnapshot(): Promise<boolean>;
          invalidateEvidence(input: { previousCommit: string; candidateCommit: string }): Promise<void>;
        },
      ): Promise<{ candidate: { state: string; baseCommit: string; candidateCommit: string } }>;
      cleanupCandidate(
        root: string,
        selector: string,
        options: {
          managedRoot: string;
          defaultCommit: string;
          deletedBy: string;
          confirm: boolean;
          hasLiveLease(): Promise<boolean>;
          appendTombstone(): Promise<number>;
        },
      ): Promise<{ candidateId: string; state: 'deleted'; tombstoneOrder: number }>;
    };
    let invalidated = false;

    const refreshed = await api.refreshCandidate(fixture.root, 'CHANGE-0014', {
      managedRoot: fixture.managedRoot,
      defaultCommit: fixture.defaultTip,
      hasLiveSnapshot: async () => false,
      invalidateEvidence: async ({ previousCommit, candidateCommit }) => {
        invalidated = previousCommit !== candidateCommit;
      },
    });
    expect(refreshed.candidate).toMatchObject({
      state: 'active',
      baseCommit: fixture.defaultTip,
      candidateCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
    });
    expect(invalidated).toBe(true);
    expect(readFileSync(join(fixture.candidateRoot, 'candidate.txt'), 'utf8')).toBe('candidate\n');
    expect(readFileSync(join(fixture.candidateRoot, 'default.txt'), 'utf8')).toBe('default\n');
    expect(git(fixture.candidateRoot, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');

    await expect(api.cleanupCandidate(fixture.root, 'CHANGE-0014', {
      managedRoot: fixture.managedRoot,
      defaultCommit: fixture.defaultTip,
      deletedBy: 'tester',
      confirm: true,
      hasLiveLease: async () => false,
      appendTombstone: async () => 99,
    })).rejects.toThrow('CANDIDATE_CLEANUP_UNSAFE');

    git(fixture.root, 'merge', '--quiet', '--no-ff', refreshed.candidate.candidateCommit, '-m', 'integrate');
    const integratedTip = git(fixture.root, 'rev-parse', 'HEAD');
    const cleaned = await api.cleanupCandidate(fixture.root, 'CHANGE-0014', {
      managedRoot: fixture.managedRoot,
      defaultCommit: integratedTip,
      deletedBy: 'tester',
      confirm: true,
      hasLiveLease: async () => false,
      appendTombstone: async () => 99,
    });

    expect(cleaned).toEqual({
      candidateId: fixture.registry.candidates[0]!.candidateId,
      state: 'deleted',
      tombstoneOrder: 99,
    });
    expect(readFileSync(join(fixture.root, 'base.txt'), 'utf8')).toBe('base\n');
    expect((await readCandidateRegistry(fixture.root))?.candidates[0]).toMatchObject({
      state: 'deleted',
      deletedOrder: 99,
    });
  });
});
