import { describe, expect, it } from 'vitest';

describe('evidence kind separation', () => {
  /**
   * @id TEST-M5-EVIDENCE-001
   * @verifies REQ-M5-EVIDENCE-001
   */
  it('TEST-M5-EVIDENCE-001 assigns independent storage and freshness policies', async () => {
    const { evidenceKinds, evidencePolicy } =
      await import('../packages/analysis/src/evidence-registry.js');
    const policies = evidenceKinds.map((kind) => evidencePolicy(kind));

    expect(evidenceKinds).toEqual([
      'trace',
      'graph',
      'tdd',
      'workflow',
      'approval',
      'release',
      'benchmark',
      'waiver',
      'budget',
      'bootstrap',
      'integration',
      'quality',
      'package',
    ]);
    expect(new Set(policies.map((policy) => policy.storagePath)).size).toBe(evidenceKinds.length);
    expect(policies.every((policy, index) => policy.kind === evidenceKinds[index])).toBe(true);
    expect(() => evidencePolicy('normative' as never)).toThrow('EVIDENCE_KIND_UNKNOWN');
  });
});
