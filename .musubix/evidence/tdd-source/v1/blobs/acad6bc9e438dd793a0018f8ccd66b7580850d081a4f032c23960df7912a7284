import { describe, expect, it } from 'vitest';
import type { ChangeRecord } from '../packages/analysis/src/change.js';

describe('CHANGE generation lifecycle', () => {
  /**
   * @id TEST-M5-LIFECYCLE-005
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-LIFECYCLE-005 reopens and abandons versioned CHANGE generations', async () => {
    const changeModule = await import('../packages/analysis/src/change.js') as Record<string, unknown>;
    const activeGeneration = changeModule.activeChangeGeneration as
      ((change: unknown) => number | null) | undefined;
    const reopenGeneration = changeModule.reopenChangeGeneration as
      ((change: unknown, requirementIds: string[]) => { generation: number; resumed: boolean }) | undefined;
    const abandonGeneration = changeModule.abandonChangeGeneration as
      ((change: unknown, authority: { reason: string; approver: string; confirm: boolean }) => void) | undefined;
    const generationOrderPhase = changeModule.generationOrderPhase as
      ((generation: number, phase: string, scopeId?: string) => string) | undefined;

    expect(activeGeneration).toBeTypeOf('function');
    expect(reopenGeneration).toBeTypeOf('function');
    expect(abandonGeneration).toBeTypeOf('function');
    expect(generationOrderPhase).toBeTypeOf('function');

    const requirementIds = ['REQ-M5-LIFECYCLE-005'];
    const fingerprints = {
      impact: 'impact',
      requirements: 'requirements',
      design: 'design',
      implementation: 'implementation',
      tests: 'tests',
      tdd: 'tdd',
    };
    const legacy: ChangeRecord = {
      changeId: 'CHANGE-0002',
      requirementIds,
      phases: {
        quality: {
          phase: 'quality',
          order: 7,
          recordedAt: '2026-09-21T00:00:00.000Z',
          fingerprints,
        },
      },
    };

    expect(activeGeneration!(legacy)).toBe(1);
    expect(generationOrderPhase!(1, 'impact')).toBe('g1:impact');
    expect(generationOrderPhase!(2, 'red', 'REQ-M5-LIFECYCLE-005'))
      .toBe('g2:red:REQ-M5-LIFECYCLE-005');

    expect(reopenGeneration!(legacy, requirementIds)).toEqual({
      generation: 2,
      resumed: false,
    });
    expect(activeGeneration!(legacy)).toBe(2);
    expect(legacy).toMatchObject({
      generation: 2,
      requirementIds,
      phases: {},
      generationHistory: [{
        generation: 1,
        status: 'superseded',
        requirementIds,
      }],
    });

    legacy.phases = {
      impact: {
        phase: 'impact',
        order: 8,
        recordedAt: '2026-09-21T00:01:00.000Z',
        fingerprints,
      },
    };
    expect(reopenGeneration!(legacy, requirementIds)).toEqual({
      generation: 2,
      resumed: true,
    });
    expect(legacy.generationHistory).toHaveLength(1);
    legacy.phases.requirements = {
      phase: 'requirements',
      order: 9,
      recordedAt: '2026-09-21T00:02:00.000Z',
      fingerprints,
    };
    expect(() => reopenGeneration!(legacy, requirementIds))
      .toThrow('CHANGE_GENERATION_PHASE');
    abandonGeneration!(legacy, {
      reason: 'Restart the incomplete generation',
      approver: '@nahisaho',
      confirm: true,
    });
    expect(activeGeneration!(legacy)).toBeNull();
    expect(reopenGeneration!(legacy, requirementIds)).toEqual({
      generation: 3,
      resumed: false,
    });
    expect(activeGeneration!(legacy)).toBe(3);
    expect(legacy).toMatchObject({
      generationHistory: [
        { generation: 1, status: 'superseded' },
        {
          generation: 2,
          status: 'abandoned',
          abandonment: {
            reason: 'Restart the incomplete generation',
            approver: '@nahisaho',
          },
        },
      ],
    });

    expect(() => reopenGeneration!(legacy, ['REQ-M5-COMPAT-001']))
      .toThrow('CHANGE_GENERATION_REQUIREMENTS');
    expect(() => generationOrderPhase!(1, ''))
      .toThrow('CHANGE_GENERATION_PHASE');
  });
});
