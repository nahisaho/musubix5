import { describe, expect, it } from 'vitest';
import type { ChangeFingerprints, ChangePhaseEvidence, ChangeTddBatch } from '../packages/analysis/src/change-evidence.js';

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

describe('TDD batch recording', () => {
  /**
   * @id TEST-M5-TDD-002
   * @verifies REQ-M5-TDD-002 REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-002 appends a new scope after a complete batch', async () => {
    const complete: ChangeTddBatch = {
      scopeId: 'REQ-M5-TDD-003',
      requirementIds: ['REQ-M5-TDD-003'],
      red: phase('red', 10),
      implementation: phase('implementation', 20),
      green: phase('green', 30),
    };
    const pending: ChangeTddBatch = {
      scopeId: 'REQ-M5-TDD-003#2',
      requirementIds: ['REQ-M5-TDD-003'],
      red: phase('red', 40),
    };
    const { batchForRecording, nextBatchScopeId } =
      await import('../packages/analysis/src/change-evidence.js');

    expect(batchForRecording([complete], ['REQ-M5-TDD-003'], 'red')).toBeUndefined();
    expect(nextBatchScopeId([complete], ['REQ-M5-TDD-003']))
      .toBe('REQ-M5-TDD-003#2');
    expect(batchForRecording([complete, pending], ['REQ-M5-TDD-003'], 'implementation'))
      .toBe(pending);
    expect(batchForRecording([complete, pending], ['REQ-M5-TDD-003'], 'green'))
      .toBeUndefined();
  });
});
