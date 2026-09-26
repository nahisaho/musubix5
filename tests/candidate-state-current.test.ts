import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('candidate state router', () => {
  /** @id TEST-M5-CANDIDATE-STATE-CURRENT-001
   * @verifies REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-002 REQ-M5-MULTI-CHANGE-004
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007
   */
  it('TEST-M5-CANDIDATE-STATE-CURRENT-001 preserves source and shared-state ownership', async () => {
    const {
      candidateFilesystemKey,
      routeCandidateState,
    } = await import('../packages/analysis/src/candidate-state.js');
    const controlRoot = resolve('control');
    const sourceRoot = resolve('source');
    const candidate = {
      schemaVersion: 1 as const,
      candidateId: `candidate:${'1'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 1,
      repositoryId: `repository:${'2'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit: '3'.repeat(40),
      candidateCommit: '4'.repeat(40),
      branch: 'musubix5/CHANGE-0014/candidate',
      worktreePath: 'workspaces/CHANGE-0014/candidate',
      state: 'active' as const,
      preparedOrder: 1,
      activeOrder: 2,
      dependencyIds: [],
    };

    expect(routeCandidateState(controlRoot, sourceRoot, candidate)).toEqual({
      kind: 'candidate',
      sourceRoot,
      controlRoot,
      projectionRoot: resolve(
        controlRoot,
        '.musubix',
        'candidates',
        candidateFilesystemKey(candidate.candidateId),
      ),
      binding: {
        candidateId: candidate.candidateId,
        changeId: 'CHANGE-0014',
        generation: 1,
        repositoryId: candidate.repositoryId,
        baseCommit: candidate.baseCommit,
        candidateCommit: candidate.candidateCommit,
      },
    });
  });
});
