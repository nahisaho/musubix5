import { describe, expect, it } from 'vitest';

const context = {
  repositoryId: 'repository:test',
  integrationId: `integration:${'d'.repeat(64)}`,
  startingDefaultCommit: 'a'.repeat(40),
  candidates: [
    {
      repositoryId: 'repository:test',
      candidateId: `candidate:${'2'.repeat(64)}`,
      changeId: 'CHANGE-0015',
      generation: 2,
      baseCommit: 'b'.repeat(40),
      candidateCommit: 'c'.repeat(40),
    },
    {
      repositoryId: 'repository:test',
      candidateId: `candidate:${'1'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 1,
      baseCommit: 'e'.repeat(40),
      candidateCommit: 'f'.repeat(40),
    },
  ],
  applyOrder: [`candidate:${'2'.repeat(64)}`, `candidate:${'1'.repeat(64)}`],
  sourceManifestSha256: '3'.repeat(64),
  integrationCommit: '4'.repeat(40),
};

describe('integration-context candidate evidence', () => {
  /**
   * @id TEST-M5-INTEGRATION-CONTEXT-GATE-001
   * @verifies REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-INTEGRATION-CONTEXT-GATE-001 binds gate evidence to only the explicit integration set', async () => {
    const gate = await import('../packages/analysis/src/gate.js');
    const binding = gate.gateEvidenceBinding(context);
    expect(binding.kind).toBe('integration');
    expect(binding.integrationId).toBe(context.integrationId);
    expect(binding.sourceManifestSha256).toBe(context.sourceManifestSha256);
    expect(binding.integrationCommit).toBe(context.integrationCommit);
    expect(binding.candidates.map((candidate) => candidate.candidateCommit)).toEqual([
      'f'.repeat(40),
      'c'.repeat(40),
    ]);
    expect(gate.gateEvidenceChangeIds(context)).toEqual(['CHANGE-0014', 'CHANGE-0015']);
  });

  /**
   * @id TEST-M5-INTEGRATION-DIAGNOSTIC-PROJECTION-001
   * @verifies REQ-M5-COMPAT-013 REQ-M5-RELEASE-002 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-INTEGRATION-DIAGNOSTIC-PROJECTION-001 preserves diagnostic provenance through gate projection', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const candidateGate = await import('../packages/analysis/src/candidate-gate.js');
    const diagnostic = {
      code: 'RELEASE_GATE_EVIDENCE_STALE',
      severity: 'warning' as const,
      message: 'candidate context changed',
      detail: 'registered-detail',
      sourceStage: 'release',
      domain: 'shipping',
    };
    expect(approval.preserveEvidenceDiagnostics([diagnostic])).toEqual([diagnostic]);
    expect(candidateGate.classifyIntegrationCandidateGateDiagnostic(diagnostic)).toEqual(diagnostic);
    expect(approval.integrationApprovalContext(context)).toEqual({
      changeId: 'CHANGE-0014',
      generation: 1,
    });
  });
});
