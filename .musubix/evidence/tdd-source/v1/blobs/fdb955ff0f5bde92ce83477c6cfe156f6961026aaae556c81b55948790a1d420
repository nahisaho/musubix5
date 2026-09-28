import { describe, expect, it } from 'vitest';
import type { ChangeRecord } from '../packages/analysis/src/change-evidence.js';

describe('quality evidence supersession', () => {
  /**
   * @id TEST-M5-QUALITY-SUPERSESSION-001
   * @verifies REQ-M5-LIFECYCLE-003 REQ-M5-EVIDENCE-005 REQ-M5-QUALITY-001 REQ-M5-QUALITY-003
   */
  it('TEST-M5-QUALITY-SUPERSESSION-001 preserves prior quality and advances its ordinal', async () => {
    const {
      nextQualityOrdinal,
      qualityFingerprintPreviouslyRecorded,
      qualityFingerprintsEqual,
      supersedeQualityPhase,
    } =
      await import('../packages/analysis/src/change-evidence.js');
    const fingerprints = {
      impact: 'a',
      requirements: 'b',
      design: 'c',
      implementation: 'd',
      tests: 'e',
      tdd: 'f',
    };
    const first = {
      phase: 'quality' as const,
      order: 10,
      recordedAt: '2026-09-21T00:00:00.000Z',
      fingerprints,
      qualityOrdinal: 1,
    };
    const change: ChangeRecord = {
      changeId: 'CHANGE-0002',
      requirementIds: ['REQ-M5-QUALITY-001'],
      phases: { quality: first },
    };
    const second = {
      phase: 'quality' as const,
      recordedAt: '2026-09-21T01:00:00.000Z',
      fingerprints: { ...fingerprints, implementation: 'changed' },
    };

    expect(supersedeQualityPhase(change, second)).toEqual({
      phaseKey: 'quality:2',
      qualityOrdinal: 2,
    });
    expect(change.qualityHistory).toEqual([first]);
    expect(change.phases.quality).toMatchObject({
      qualityOrdinal: 2,
      fingerprints: { implementation: 'changed' },
    });

    const legacyChange: ChangeRecord = {
      changeId: 'CHANGE-0001',
      requirementIds: ['REQ-M5-QUALITY-001'],
      phases: {
        quality: {
          phase: 'quality',
          order: 5,
          recordedAt: '2026-09-20T00:00:00.000Z',
          fingerprints,
        },
      },
    };
    expect(nextQualityOrdinal(legacyChange)).toBe(2);
    supersedeQualityPhase(legacyChange, {
      phase: 'quality',
      order: 11,
      recordedAt: '2026-09-20T01:00:00.000Z',
      fingerprints,
    });
    expect(legacyChange.qualityHistory?.[0]?.qualityOrdinal).toBe(1);
    expect(qualityFingerprintsEqual(
      legacyChange.phases.quality!.fingerprints,
      {
        tdd: 'f',
        tests: 'e',
        implementation: 'd',
        design: 'c',
        requirements: 'b',
        impact: 'a',
      },
    )).toBe(true);
    expect(qualityFingerprintPreviouslyRecorded(legacyChange, fingerprints)).toBe(true);
  });
});
