import { describe, expect, it, vi } from 'vitest';
import type {
  IntegrationAttempt,
  IntegrationCandidate,
} from '../packages/analysis/src/candidate-integration.js';

const candidateId = (value: string) => `candidate:${value.repeat(64)}`;
const commit = (value: string) => value.repeat(40);
const repositoryId = `repository:${'f'.repeat(64)}`;

describe('candidate integration review regressions', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-005
   * @verifies REQ-M5-MULTI-CHANGE-005
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-005 hashes only identity tuples and checks ready dependency commit bindings', async () => {
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const baseCandidate = {
      candidateId: candidateId('a'),
      changeId: 'CHANGE-0014',
      generation: 1,
      candidateCommit: commit('a'),
    };
    const first = module.deriveIntegrationIdentity({
      repositoryId,
      startingDefaultCommit: commit('0'),
      candidates: [baseCandidate],
    });
    const second = module.deriveIntegrationIdentity({
      repositoryId,
      startingDefaultCommit: commit('0'),
      candidates: [{
        ...baseCandidate,
        state: 'ready',
        branch: 'candidate-a',
        worktreePath: 'ignored/by/identity',
        dependencyIds: [],
      }],
    });
    expect(second.integrationId).toBe(first.integrationId);

    const dependency: IntegrationCandidate = {
      candidateId: candidateId('b'),
      changeId: 'CHANGE-0015',
      generation: 1,
      repositoryId,
      baseCommit: commit('0'),
      candidateCommit: commit('b'),
      recordedCandidateCommit: commit('b'),
      state: 'ready',
      reachable: true,
      changedPaths: ['b.ts'],
      dependencies: [],
    };
    expect(() => module.validateReadyDependencyBindings({
      ...dependency,
      dependencies: [{ candidateId: baseCandidate.candidateId, candidateCommit: commit('9') }],
    }, [baseCandidate])).toThrow('CANDIDATE_BASE_STALE');
  });

  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-006
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-006 fences transitions and fails closed for CAS, markers, and incomplete verification sets', async () => {
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const events: string[] = [];
    const transaction = {
      run: vi.fn(async (changeIds: readonly string[], operation: () => Promise<string>) => {
        events.push(`lease:${changeIds.join(',')}`);
        return operation();
      }),
    };
    await expect(module.withIntegrationTransition(
      ['CHANGE-0015', 'CHANGE-0014'],
      transaction,
      async () => {
        events.push('append-and-project');
        return 'ok';
      },
    )).resolves.toBe('ok');
    expect(events).toEqual([
      'lease:CHANGE-0014,CHANGE-0015',
      'append-and-project',
    ]);

    const attempt: IntegrationAttempt = {
      schemaVersion: 1,
      integrationId: `integration:${'c'.repeat(64)}`,
      repositoryId,
      startingDefaultCommit: commit('0'),
      integrationCommit: commit('d'),
      candidateIds: [candidateId('a'), candidateId('b')],
      inputCommits: [commit('a'), commit('b')],
      state: 'verified',
    };
    expect(() => module.validateFinalizationMarker({
      attempt,
      marker: {
        schemaVersion: 1,
        kind: 'candidate-finalization-v1',
        integrationId: attempt.integrationId,
        integrationCommit: attempt.integrationCommit!,
        startingDefaultCommit: attempt.startingDefaultCommit,
        fencingToken: 7,
      },
      liveFencingToken: 8,
      integrationCommitReachable: true,
    })).toThrow('CANDIDATE_INTEGRATION_CONFLICT');
    expect(module.planCompareAndSwapFailure(
      attempt.candidateIds,
      'reference changed',
    )).toEqual({
      code: 'CANDIDATE_BASE_STALE',
      staleCandidateIds: attempt.candidateIds,
      retainMarker: false,
    });
    expect(module.planPostCompareAndSwapFailure(attempt.integrationCommit!)).toEqual({
      code: 'CANDIDATE_INTEGRATION_CONFLICT',
      recoveryCommit: attempt.integrationCommit,
      retainMarker: true,
    });
    expect(() => module.validateClosedIntegrationVerification({
      requiredCommandNames: ['build', 'test'],
      requiredCheckNames: ['approval', 'trace'],
      requiredCommands: [{ name: 'test', status: 'passed' }],
      requiredChecks: [
        { name: 'approval', status: 'passed', diagnostics: [] },
        { name: 'trace', status: 'passed', diagnostics: [] },
      ],
      status: { exitCode: 0, ready: false },
    })).toThrow('CANDIDATE_INTEGRATION_VERIFICATION_FAILED');
  });

  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-007
   * @verifies REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-REVIEW-007 derives resume identity and inspects cleanup and retry state without recursion', async () => {
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const attempt = {
      schemaVersion: 1 as const,
      integrationId: `integration:${'c'.repeat(64)}`,
      repositoryId,
      startingDefaultCommit: commit('0'),
      integrationCommit: commit('d'),
      candidateIds: [candidateId('a')],
      inputCommits: [commit('a')],
      state: 'verified' as const,
    };
    expect(module.deriveResumeIdentity({
      repositoryId,
      startingDefaultCommit: attempt.startingDefaultCommit,
      candidates: [{
        candidateId: candidateId('a'),
        changeId: 'CHANGE-0014',
        generation: 1,
        candidateCommit: commit('a'),
      }],
    }, attempt)).toBe(attempt.integrationId);
    expect(module.planTerminalAttemptResolution('failed')).toEqual({
      action: 'reject',
      code: 'CANDIDATE_INTEGRATION_CONFLICT',
    });
    expect(module.recoverCandidateFinalization({
      attempt,
      marker: {
        schemaVersion: 1,
        kind: 'candidate-finalization-v1',
        integrationId: attempt.integrationId,
        integrationCommit: attempt.integrationCommit!,
        startingDefaultCommit: attempt.startingDefaultCommit,
        fencingToken: 7,
      },
      currentFencingToken: 7,
      currentDefaultCommit: attempt.startingDefaultCommit,
      integrationCommitReachable: true,
      controlWorktreeRefreshed: false,
    })).toEqual({
      action: 'retry-before-fast-forward',
      removeMarker: true,
      resetToCommit: attempt.integrationCommit,
    });
    await expect(module.inspectCandidateCleanupSafety({
      worktreePath: '/candidate',
      candidateCommit: commit('a'),
      baseCommit: commit('0'),
      state: 'active',
      inspect: async () => ({
        porcelainZ: '?? untracked.txt\0',
        unresolvedEntries: '',
        candidateReachableFromBase: false,
        liveLease: false,
      }),
    })).rejects.toThrow('CANDIDATE_CLEANUP_UNSAFE');
  });
});
