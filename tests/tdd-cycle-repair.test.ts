import { describe, expect, it } from 'vitest';
import {
  repairAwareCycles,
  tddRepairOperationIdentity,
  type TddCycle,
  type TddEvidence,
  type TddRepairRecord,
} from '../packages/analysis/src/index.js';

function cycle(cycleId: string): TddCycle {
  return {
    cycleId,
    changeId: 'CHANGE-0015',
    generation: 3,
    requirementId: 'REQ-M5-WAVE1-TDD-001',
    testId: 'TEST-M5-WAVE1-TDD-REPAIR-A4-001',
    testPath: 'tests/tdd-cycle-repair.test.ts',
    commandName: 'test',
    parallel: {
      planId: `parallel-plan:${'a'.repeat(64)}`,
      assignmentId: 'issue-35-tdd-repair',
      attempt: 3,
      worktree: '/workspace',
      startCommit: 'cfc155601833d643c0e386a75075064e9814c491',
    },
    red: {
      phase: 'red',
      valid: true,
      commandSha256: 'red-command',
      outputSha256: 'red-output',
      exitCode: 1,
      durationMs: 1,
      testFingerprint: 'test-fingerprint',
      recordedAt: '2026-09-26T00:00:00.000Z',
      diagnostics: [],
    },
  };
}

describe('scoped TDD repair', () => {
  /**
   * @id TEST-M5-WAVE1-TDD-REPAIR-A4-001
   * @verifies REQ-M5-WAVE1-TDD-001
   */
  it('TEST-M5-WAVE1-TDD-REPAIR-A4-001 derives stable identity and applies append-only replacement', () => {
    const target = cycle('cycle-target');
    const replacement = {
      ...cycle('cycle-replacement'),
      green: {
        ...target.red,
        phase: 'green' as const,
        exitCode: 0,
      },
    };
    const evidence: TddEvidence = {
      schemaVersion: 1,
      cycles: [target, replacement],
      chain: [],
    };
    const identity = tddRepairOperationIdentity({
      testId: target.testId,
      targetCycleId: target.cycleId!,
      disposition: 'replacement',
      replacementCycleId: replacement.cycleId!,
      approver: ' reviewer ',
      reason: ' stale assignment ',
    });
    expect(identity.operationId).toMatch(/^tdd-repair:[a-f0-9]{64}$/);
    expect(identity.request.approver).toBe('reviewer');
    expect(identity.request.reason).toBe('stale assignment');

    const repair: TddRepairRecord = {
      operationId: identity.operationId,
      requestSha256: identity.requestSha256,
      targetCycleId: target.cycleId!,
      testId: target.testId,
      requirementId: target.requirementId,
      changeId: target.changeId!,
      generation: target.generation!,
      parallel: target.parallel!,
      replacementCycleId: replacement.cycleId!,
      approver: identity.request.approver,
      reason: identity.request.reason,
      order: 1,
      recordedAt: '2026-09-26T00:00:00.000Z',
    };
    const before = JSON.stringify(evidence.cycles);
    expect(repairAwareCycles({ ...evidence, repairs: [repair] }).map((entry) => entry.cycleId))
      .toEqual(['cycle-replacement']);
    expect(JSON.stringify(evidence.cycles)).toBe(before);
  });
});
