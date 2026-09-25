import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadCandidate,
  readCandidateRegistry,
  replaceCandidateRegistry,
  type CandidateRegistry,
} from '../packages/analysis/src/candidate-state.js';

const fixtureRoots: string[] = [];

function fixtureRoot(name: string): string {
  const root = join(process.cwd(), `.candidate-state-test-${name}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  fixtureRoots.push(root);
  return root;
}

function registry(): CandidateRegistry {
  return {
    schemaVersion: 1,
    repositoryId: `repository:${'1'.repeat(64)}`,
    candidates: [{
      schemaVersion: 1,
      candidateId: `candidate:${'2'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 1,
      repositoryId: `repository:${'1'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit: '3'.repeat(40),
      candidateCommit: '4'.repeat(40),
      branch: 'musubix5/CHANGE-0014/candidate',
      worktreePath: 'workspaces/CHANGE-0014/candidate',
      state: 'active',
      preparedOrder: 10,
      activeOrder: 11,
      dependencyIds: [],
    }],
    integrations: [],
  };
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('candidate registry', () => {
  /** @id TEST-M5-CANDIDATE-STATE-REGISTRY-001
   * @verifies REQ-M5-MULTI-CHANGE-001 REQ-M5-WORKTREE-006
   */
  it('TEST-M5-CANDIDATE-STATE-REGISTRY-001 replaces and reads a deterministic registry', async () => {
    const root = fixtureRoot('registry');
    const value = registry();

    await replaceCandidateRegistry(root, value);

    await expect(readCandidateRegistry(root)).resolves.toEqual(value);
    await expect(loadCandidate(root, 'CHANGE-0014')).resolves.toEqual(value.candidates[0]);
    await expect(loadCandidate(root, value.candidates[0]!.candidateId)).resolves.toEqual(
      value.candidates[0],
    );
  });

  /** @id TEST-M5-CANDIDATE-STATE-REGISTRY-INVALID-001
   * @verifies REQ-M5-WORKTREE-007
   */
  it('TEST-M5-CANDIDATE-STATE-REGISTRY-INVALID-001 rejects absolute and aliased worktree paths', async () => {
    const root = fixtureRoot('invalid');
    const value = registry();
    value.candidates.push({
      ...value.candidates[0]!,
      candidateId: `candidate:${'5'.repeat(64)}`,
      changeId: 'CHANGE-0015',
      worktreePath: value.candidates[0]!.worktreePath,
    });

    await expect(replaceCandidateRegistry(root, value)).rejects.toThrow(
      'CANDIDATE_STATE_OWNERSHIP',
    );

    value.candidates.pop();
    value.candidates[0] = { ...value.candidates[0]!, worktreePath: '/absolute/worktree' };
    await expect(replaceCandidateRegistry(root, value)).rejects.toThrow(
      'CANDIDATE_STATE_OWNERSHIP',
    );
  });
});
