import { describe, expect, it } from 'vitest';

describe('mandatory release evidence policy', () => {
  /**
   * @id TEST-M5-EVIDENCE-004
   * @verifies REQ-M5-EVIDENCE-004
   */
  it('TEST-M5-EVIDENCE-004 cannot remove mandatory evidence through configuration', async () => {
    const { requiredReleaseEvidence } =
      await import('../packages/analysis/src/evidence-registry.js');
    const base = requiredReleaseEvidence({
      configuredKinds: [],
      usedBootstrap: false,
      usedBudget: false,
    });

    expect(base).toEqual([
      'requirements-approval',
      'design-approval',
      'tdd',
      'integration',
      'trace',
      'graph',
      'formal-classification',
      'workflow',
      'quality',
      'release-review',
      'release-approval',
      'package',
    ]);
    expect(requiredReleaseEvidence({
      configuredKinds: ['trace'],
      usedBootstrap: true,
      usedBudget: true,
    })).toEqual([...base, 'budget', 'bootstrap']);
  });
});
