import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCandidateCleanupPolicySafe,
  cleanupCandidate,
  readCandidateRegistry,
  replaceCandidateRegistry,
  type CandidateLifecycleState,
  type CandidateRegistry,
} from '../packages/analysis/src/candidate-state.js';

const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeIntegratedCandidate(): {
  root: string;
  candidateRoot: string;
  managedRoot: string;
  registry: CandidateRegistry;
  defaultCommit: string;
} {
  const suffix = `${process.pid}-${randomUUID()}`;
  const root = join(process.cwd(), `.candidate-cleanup-policy-${suffix}`);
  const candidateRoot = join(process.cwd(), `.candidate-cleanup-policy-worktree-${suffix}`);
  roots.push(root, candidateRoot);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  writeFileSync(join(root, 'base.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'base');
  const baseCommit = git(root, 'rev-parse', 'HEAD');
  git(root, 'worktree', 'add', '--quiet', '-b', 'candidate/CHANGE-0015', candidateRoot, baseCommit);
  writeFileSync(join(candidateRoot, 'candidate.txt'), 'candidate\n');
  git(candidateRoot, 'add', '.');
  git(candidateRoot, 'commit', '--quiet', '-m', 'candidate');
  const candidateCommit = git(candidateRoot, 'rev-parse', 'HEAD');
  git(root, 'merge', '--quiet', '--no-ff', candidateCommit, '-m', 'integrate candidate');
  const defaultCommit = git(root, 'rev-parse', 'HEAD');
  const registry: CandidateRegistry = {
    schemaVersion: 1,
    repositoryId: `repository:${'1'.repeat(64)}`,
    candidates: [{
      schemaVersion: 1,
      candidateId: `candidate:${'2'.repeat(64)}`,
      changeId: 'CHANGE-0015',
      generation: 1,
      repositoryId: `repository:${'1'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit,
      candidateCommit,
      branch: 'candidate/CHANGE-0015',
      worktreePath: basename(candidateRoot),
      state: 'active',
      preparedOrder: 1,
      activeOrder: 2,
      dependencyIds: [],
    }],
    integrations: [],
  };
  return { root, candidateRoot, managedRoot: dirname(root), registry, defaultCommit };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('candidate cleanup policy', () => {
  /** @id TEST-M5-CANDIDATE-CLEANUP-ACTIVE-INTEGRATED-001
   * @verifies REQ-M5-MULTI-CHANGE-007 REQ-M5-WAVE1-CLEANUP-001 REQ-M5-WAVE1-CLEANUP-002
   */
  it('TEST-M5-CANDIDATE-CLEANUP-ACTIVE-INTEGRATED-001 permits confirmed active-but-integrated cleanup and fails closed otherwise', async () => {
    const fixture = initializeIntegratedCandidate();
    await replaceCandidateRegistry(fixture.root, fixture.registry);

    expect(() => assertCandidateCleanupPolicySafe('active', false)).toThrow(
      'CANDIDATE_CLEANUP_UNSAFE',
    );
    expect(() => assertCandidateCleanupPolicySafe(
      'unknown' as CandidateLifecycleState,
      false,
    )).toThrow('CANDIDATE_CLEANUP_UNSAFE');
    for (const state of ['failed', 'abandoned', 'stale'] as const) {
      expect(() => assertCandidateCleanupPolicySafe(state, false)).not.toThrow();
    }

    const cleaned = await cleanupCandidate(fixture.root, 'CHANGE-0015', {
      managedRoot: fixture.managedRoot,
      defaultCommit: fixture.defaultCommit,
      deletedBy: 'tester',
      confirm: true,
      hasLiveLease: async () => false,
      appendTombstone: async () => 17,
    });

    expect(cleaned).toEqual({
      candidateId: fixture.registry.candidates[0]!.candidateId,
      state: 'deleted',
      tombstoneOrder: 17,
    });
    expect((await readCandidateRegistry(fixture.root))?.candidates[0]).toMatchObject({
      state: 'deleted',
      deletedOrder: 17,
    });
  });
});
