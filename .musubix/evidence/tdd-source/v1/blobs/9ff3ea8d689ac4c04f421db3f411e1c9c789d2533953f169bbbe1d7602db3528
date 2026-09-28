import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCandidateBinding,
  candidateFilesystemKey,
  candidateStateRoot,
  isOperationalStatePath,
  operationalStatePaths,
} from '../packages/analysis/src/candidate-state.js';

describe('candidate state ownership', () => {
  /** @id TEST-M5-MULTI-CHANGE-STATE-OWNERSHIP-001
   * @verifies REQ-M5-MULTI-CHANGE-004
   */
  it('TEST-M5-MULTI-CHANGE-STATE-OWNERSHIP-001 routes state to one candidate partition', () => {
    const candidateId = `candidate:${'a'.repeat(64)}`;
    const root = candidateStateRoot('/repo', candidateId);

    expect(root).toBe(resolve('/repo', '.musubix', 'candidates', candidateFilesystemKey(candidateId)));
    expect(operationalStatePaths).toEqual([
      '.musubix/candidates',
      '.musubix/evidence',
      '.musubix/journal',
    ]);
    expect(isOperationalStatePath('.musubix/candidates/registry.json')).toBe(true);
    expect(isOperationalStatePath('.musubix/evidence/tdd.json')).toBe(true);
    expect(isOperationalStatePath('.musubix/journal/normal/000000000001.json')).toBe(true);
    expect(isOperationalStatePath('packages/analysis/src/index.ts')).toBe(false);
    expect(() => candidateStateRoot('/repo', '../candidate:escape')).toThrow(
      'CANDIDATE_STATE_OWNERSHIP',
    );

    const binding = {
      candidateId,
      changeId: 'CHANGE-0014',
      generation: 1,
      repositoryId: `repository:${'b'.repeat(64)}`,
      baseCommit: 'c'.repeat(40),
      candidateCommit: 'd'.repeat(40),
    };
    expect(() => assertCandidateBinding(binding, { ...binding })).not.toThrow();
    expect(() => assertCandidateBinding(binding, {
      ...binding,
      candidateId: `candidate:${'e'.repeat(64)}`,
    })).toThrow('CANDIDATE_STATE_OWNERSHIP');
  });
});
