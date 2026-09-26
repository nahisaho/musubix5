import { describe, expect, it } from 'vitest';
import {
  analyzeCandidateIntegration,
  type IntegrationCandidate,
} from '../packages/analysis/src/candidate-integration.js';

const commit = (value: string) => value.repeat(40);
const candidateId = (value: string) => `candidate:${value.repeat(64)}`;

function candidate(
  value: string,
  changeId: string,
  paths: string[],
  dependencies: IntegrationCandidate['dependencies'] = [],
): IntegrationCandidate {
  return {
    candidateId: candidateId(value),
    changeId,
    generation: 1,
    repositoryId: `repository:${'f'.repeat(64)}`,
    baseCommit: commit('0'),
    candidateCommit: commit(value),
    recordedCandidateCommit: commit(value),
    state: 'ready',
    reachable: true,
    changedPaths: paths,
    dependencies,
  };
}

describe('candidate integration dependency analysis', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-DEPENDENCIES-001
   * @verifies REQ-M5-MULTI-CHANGE-005
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-DEPENDENCIES-001 diagnoses invalid inputs and returns a stable topological order', () => {
    const first = candidate('a', 'CHANGE-0014', ['src/first.ts']);
    const second = candidate('b', 'CHANGE-0015', ['src/second.ts'], [{
      candidateId: first.candidateId,
      candidateCommit: first.candidateCommit,
    }]);
    const independent = candidate('c', 'CHANGE-0016', ['src/third.ts']);

    expect(analyzeCandidateIntegration([independent, second, first], {
      repositoryId: first.repositoryId,
      baseCommit: first.baseCommit,
    }).applyOrder).toEqual([first.candidateId, second.candidateId, independent.candidateId]);

    expect(() => analyzeCandidateIntegration([
      first,
      candidate('b', 'CHANGE-0015', ['src/first.ts']),
    ], { repositoryId: first.repositoryId, baseCommit: first.baseCommit }))
      .toThrow('CANDIDATE_OWNERSHIP_CONFLICT');

    expect(() => analyzeCandidateIntegration([
      first,
      candidate('b', 'CHANGE-0015', ['src/first.ts/nested.ts']),
    ], { repositoryId: first.repositoryId, baseCommit: first.baseCommit }))
      .toThrow('CANDIDATE_OWNERSHIP_CONFLICT');

    const missing = candidate('d', 'CHANGE-0017', ['src/fourth.ts'], [{
      candidateId: candidateId('e'),
      candidateCommit: commit('e'),
    }]);
    expect(() => analyzeCandidateIntegration([missing], {
      repositoryId: missing.repositoryId,
      baseCommit: missing.baseCommit,
    })).toThrow('CANDIDATE_DEPENDENCY_UNSATISFIED');

    const cycleA = candidate('a', 'CHANGE-0014', ['a.ts'], [{
      candidateId: candidateId('b'),
      candidateCommit: commit('b'),
    }]);
    const cycleB = candidate('b', 'CHANGE-0015', ['b.ts'], [{
      candidateId: candidateId('a'),
      candidateCommit: commit('a'),
    }]);
    expect(() => analyzeCandidateIntegration([cycleA, cycleB], {
      repositoryId: cycleA.repositoryId,
      baseCommit: cycleA.baseCommit,
    })).toThrow('CANDIDATE_DEPENDENCY_CYCLE');

    expect(() => analyzeCandidateIntegration(
      [{ ...first, baseCommit: commit('9') }],
      { repositoryId: first.repositoryId, baseCommit: first.baseCommit },
    )).toThrow('CANDIDATE_BASE_STALE');
    expect(() => analyzeCandidateIntegration(
      [{ ...first, recordedCandidateCommit: commit('9') }],
      { repositoryId: first.repositoryId, baseCommit: first.baseCommit },
    )).toThrow('CANDIDATE_BASE_STALE');
    expect(() => analyzeCandidateIntegration(
      [{ ...first, reachable: false }],
      { repositoryId: first.repositoryId, baseCommit: first.baseCommit },
    )).toThrow('CANDIDATE_COMMIT_UNREACHABLE');
    expect(() => analyzeCandidateIntegration(
      [{ ...first, state: 'integrated' }],
      { repositoryId: first.repositoryId, baseCommit: first.baseCommit },
    )).toThrow('CANDIDATE_ALREADY_INTEGRATED');
  });
});
