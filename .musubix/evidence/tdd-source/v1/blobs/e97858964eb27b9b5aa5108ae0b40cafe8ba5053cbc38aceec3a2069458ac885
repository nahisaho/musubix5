import { describe, expect, it } from 'vitest';
import type {
  ChangeFingerprints,
  ChangePhaseEvidence,
  ChangeRecord,
  ChangeTddBatch,
} from '../packages/analysis/src/change-evidence.js';
import type { TddCycle, TddEvidence, TddPhaseEvidence } from '../packages/analysis/src/tdd.js';

const fingerprints: ChangeFingerprints = {
  impact: 'impact',
  requirements: 'requirements',
  design: 'design',
  implementation: 'implementation',
  tests: 'tests',
  tdd: 'tdd',
};

function phase(name: 'red' | 'implementation' | 'green', order: number): ChangePhaseEvidence {
  return { phase: name, order, recordedAt: new Date(order).toISOString(), fingerprints };
}

function batch(orders: [number, number, number?]): ChangeTddBatch {
  return {
    requirementIds: ['REQ-M5-TDD-003'],
    red: phase('red', orders[0]),
    implementation: phase('implementation', orders[1]),
    ...(orders[2] === undefined ? {} : { green: phase('green', orders[2]) }),
  };
}

function observed(
  phaseName: 'red' | 'green' | 'refactor',
  order: number,
  status: 'failed' | 'passed' | 'skipped',
  sourceFingerprint: string,
): TddPhaseEvidence {
  return {
    phase: phaseName,
    valid: status !== 'skipped',
    scoped: true,
    resultObserved: true,
    testStatus: status,
    reportSha256: `${phaseName}-${order}`,
    commandSha256: 'command',
    outputSha256: `output-${order}`,
    exitCode: phaseName === 'red' ? 1 : 0,
    durationMs: 1,
    testFingerprint: 'test',
    sourceFingerprint,
    executionId: `execution-${order}`,
    order,
    recordedAt: new Date(order).toISOString(),
    diagnostics: [],
  };
}

function cycle(id: string, redOrder: number, greenOrder: number, greenStatus: 'passed' | 'skipped' = 'passed'): TddCycle {
  return {
    cycleId: id,
    requirementId: 'REQ-M5-TDD-003',
    testId: 'TEST-M5-TDD-001',
    testPath: 'tests/tdd-cycle-resolver.test.ts',
    commandName: 'test',
    red: observed('red', redOrder, 'failed', `before-${id}`),
    green: observed('green', greenOrder, greenStatus, `after-${id}`),
  };
}

describe('TDD cycle resolver', () => {
  /**
   * @id TEST-M5-TDD-001
   * @verifies REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004
   */
  it('TEST-M5-TDD-001 selects the latest complete requirement cycle deterministically', async () => {
    const latest = cycle('latest', 55, 75);
    latest.refactor = observed('refactor', 81, 'passed', 'current-source');
    const change: ChangeRecord = {
      changeId: 'CHANGE-0002',
      requirementIds: ['REQ-M5-TDD-003'],
      phases: {
        requirements: phase('implementation', 1),
        design: phase('implementation', 2),
        red: phase('red', 3),
        implementation: phase('implementation', 4),
        green: phase('green', 90),
      },
      tddBatches: [
        batch([10, 20, 30]),
        batch([40, 50]),
        batch([60, 70, 80]),
      ],
    };
    const evidence: TddEvidence = {
      schemaVersion: 1,
      cycles: [
        cycle('legacy', 2, 89),
        cycle('old', 9, 25),
        cycle('invalid-result', 56, 76, 'skipped'),
        latest,
      ],
    };
    const { selectCurrentTddCycle } =
      await import('../packages/analysis/src/tdd-cycle-resolver.js');

    const first = selectCurrentTddCycle(change, 'REQ-M5-TDD-003', evidence, {
      currentSourceFingerprint: 'current-source',
    });
    const second = selectCurrentTddCycle(change, 'REQ-M5-TDD-003', evidence, {
      currentSourceFingerprint: 'current-source',
    });

    expect(first).toEqual(second);
    expect(first.selected).toMatchObject({
      scope: { kind: 'requirement-batch' },
      batchTerminalOrder: 80,
      cycle: { cycleId: 'latest' },
      refactorCurrent: true,
    });
    expect(first.excluded.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      'legacy-full-set-separated',
      'incomplete-batch',
      'older-complete-batch',
      'green-status-not-passed',
    ]));
  });

  /**
   * @id TEST-M5-TDD-APPROVAL-SUPERSESSION-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-APPROVAL-SUPERSESSION-001 preserves a cycle after a later requirements checkpoint', async () => {
    const initialRequirements = phase('implementation', 1);
    const supersedingRequirements = phase('implementation', 100);
    const change: ChangeRecord = {
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: ['REQ-M5-TDD-003'],
      requirementsHistory: [initialRequirements, supersedingRequirements],
      phases: {
        requirements: supersedingRequirements,
        design: phase('implementation', 101),
      },
      tddBatches: [batch([10, 20, 30])],
    };
    const supersededApprovalCycle = cycle('before-supersession', 5, 25);
    supersededApprovalCycle.changeId = 'CHANGE-0003';
    supersededApprovalCycle.generation = 5;
    const evidence: TddEvidence = {
      schemaVersion: 1,
      cycles: [supersededApprovalCycle],
    };
    const { selectCurrentTddCycle } =
      await import('../packages/analysis/src/tdd-cycle-resolver.js');

    expect(selectCurrentTddCycle(change, 'REQ-M5-TDD-003', evidence).selected)
      .toMatchObject({
        batchTerminalOrder: 30,
        cycle: { cycleId: 'before-supersession' },
      });
  });

  /**
   * @id TEST-M5-TDD-DESIGN-PREDECESSOR-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-DESIGN-PREDECESSOR-001 rejects a cycle that predates its contemporaneous design checkpoint', async () => {
    const change: ChangeRecord = {
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: ['REQ-M5-TDD-003'],
      requirementsHistory: [phase('implementation', 1)],
      designHistory: [phase('implementation', 8), phase('implementation', 100)],
      phases: {
        requirements: phase('implementation', 1),
        design: phase('implementation', 100),
      },
      tddBatches: [batch([10, 20, 30])],
    };
    const preDesignCycle = cycle('pre-design', 5, 25);
    preDesignCycle.changeId = 'CHANGE-0003';
    preDesignCycle.generation = 5;
    const evidence: TddEvidence = {
      schemaVersion: 1,
      cycles: [preDesignCycle],
    };
    const { selectCurrentTddCycle } =
      await import('../packages/analysis/src/tdd-cycle-resolver.js');

    expect(selectCurrentTddCycle(change, 'REQ-M5-TDD-003', evidence).selected).toBeNull();
  });
});
