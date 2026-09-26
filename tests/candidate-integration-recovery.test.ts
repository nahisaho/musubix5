import { describe, expect, it } from 'vitest';
import {
  assertCandidateCleanupSafe,
  planIntegrationResume,
  recoverCandidateFinalization,
  type IntegrationAttempt,
} from '../packages/analysis/src/candidate-integration.js';

const integrationId = `integration:${'a'.repeat(64)}`;
const candidateIds = [
  `candidate:${'b'.repeat(64)}`,
  `candidate:${'c'.repeat(64)}`,
];

const attempt: IntegrationAttempt = {
  schemaVersion: 1,
  integrationId,
  repositoryId: `repository:${'d'.repeat(64)}`,
  startingDefaultCommit: '1'.repeat(40),
  integrationCommit: '2'.repeat(40),
  candidateIds,
  inputCommits: ['3'.repeat(40), '4'.repeat(40)],
  state: 'verified',
};

describe('candidate integration recovery and cleanup', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-RECOVERY-001
   * @verifies REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-RECOVERY-001 resumes exact attempts and fails closed during finalization or cleanup', () => {
    expect(planIntegrationResume(attempt, {
      integrationId,
      candidateIds: [...candidateIds].reverse(),
      inputCommits: [...attempt.inputCommits].reverse(),
    })).toEqual({ action: 'resume-finalization', state: 'verified' });

    expect(() => planIntegrationResume(attempt, {
      integrationId,
      candidateIds: [candidateIds[0]!],
      inputCommits: [attempt.inputCommits[0]!],
    })).toThrow('CANDIDATE_INTEGRATION_CONFLICT');

    const marker = {
      schemaVersion: 1 as const,
      kind: 'candidate-finalization-v1' as const,
      integrationId,
      integrationCommit: attempt.integrationCommit!,
      startingDefaultCommit: attempt.startingDefaultCommit,
      fencingToken: 7,
    };
    expect(recoverCandidateFinalization({
      attempt,
      marker,
      currentFencingToken: 7,
      currentDefaultCommit: attempt.startingDefaultCommit,
      integrationCommitReachable: true,
      controlWorktreeRefreshed: false,
    })).toEqual({ action: 'retry-before-fast-forward', removeMarker: true });
    expect(recoverCandidateFinalization({
      attempt,
      marker,
      currentFencingToken: 7,
      currentDefaultCommit: attempt.integrationCommit!,
      integrationCommitReachable: true,
      controlWorktreeRefreshed: false,
    })).toEqual({ action: 'refresh-and-record-integrated', removeMarker: true });

    expect(() => recoverCandidateFinalization({
      attempt,
      marker,
      currentFencingToken: 8,
      currentDefaultCommit: attempt.integrationCommit!,
      integrationCommitReachable: true,
      controlWorktreeRefreshed: false,
    })).toThrow('CANDIDATE_INTEGRATION_CONFLICT');

    expect(() => assertCandidateCleanupSafe({
      dirty: false,
      untracked: true,
      unintegratedCommits: false,
      leaseActive: false,
      unresolvedConflict: false,
    })).toThrow('CANDIDATE_CLEANUP_UNSAFE');
    expect(assertCandidateCleanupSafe({
      dirty: false,
      untracked: false,
      unintegratedCommits: false,
      leaseActive: false,
      unresolvedConflict: false,
    })).toBeUndefined();
  });
});
