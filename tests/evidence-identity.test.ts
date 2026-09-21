import { describe, expect, it } from 'vitest';

describe('evidence identity classification', () => {
  /**
   * @id TEST-M5-EVIDENCE-002
   * @verifies REQ-M5-EVIDENCE-002
   */
  it('TEST-M5-EVIDENCE-002 rejects every foreign or unknown bound identity', async () => {
    const { classifyEvidence } = await import('../packages/analysis/src/evidence-registry.js');
    const context = {
      producerId: 'musubix5@0.1.0',
      repositoryId: 'repo:musubix5',
      candidateId: 'candidate:abc',
      changeId: 'CHANGE-0002',
      inputDigest: 'a'.repeat(64),
      dependencyHeads: { requirements: 'b'.repeat(64) },
      supersedingOrder: 4,
    };
    const current = {
      schemaVersion: 1,
      kind: 'quality',
      producerId: context.producerId,
      repositoryId: context.repositoryId,
      candidateId: context.candidateId,
      changeId: context.changeId,
      inputDigest: context.inputDigest,
      dependencyHeads: context.dependencyHeads,
      status: 'pass',
      order: 4,
      payload: {},
    };

    expect(classifyEvidence(current, context)).toMatchObject({
      classification: 'pass',
      current: true,
      diagnostics: [],
    });

    for (const foreign of [
      { ...current, producerId: 'musubix4@0.1.3' },
      { ...current, repositoryId: 'repo:other' },
      { ...current, candidateId: 'candidate:other' },
      { ...current, changeId: 'CHANGE-9999' },
      { ...current, producerId: undefined },
    ]) {
      expect(classifyEvidence(foreign, context)).toMatchObject({
        classification: 'foreign',
        current: false,
        diagnostics: [{ code: 'INCOMPATIBLE_EVIDENCE' }],
      });
    }
  });
});
