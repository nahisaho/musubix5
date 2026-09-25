import { describe, expect, it } from 'vitest';

const candidate = {
  repositoryId: 'repository:test',
  candidateId: `candidate:${'a'.repeat(64)}`,
  changeId: 'CHANGE-0014',
  generation: 1,
  baseCommit: 'b'.repeat(40),
  candidateCommit: 'c'.repeat(40),
};

describe('candidate and integration evidence binding', () => {
  /**
   * @id TEST-M5-CANDIDATE-EVIDENCE-BINDING-001
   * @verifies REQ-M5-MULTI-CHANGE-003
   */
  it('TEST-M5-CANDIDATE-EVIDENCE-BINDING-001 rejects cross-candidate evidence before granting credit', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const binding = approval.candidateEvidenceBinding(candidate, candidate.candidateCommit);
    expect(binding).toEqual({ schemaVersion: 1, kind: 'candidate', ...candidate });
    expect(approval.validateCandidateBinding({ binding }, candidate)).toEqual({
      valid: true,
      diagnostics: [],
    });
    const foreign = { ...candidate, changeId: 'CHANGE-0015' };
    const validation = approval.validateCandidateBinding({ binding }, foreign);
    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toMatchObject([{
      code: 'CANDIDATE_EVIDENCE_MISMATCH',
      severity: 'error',
      changeId: 'CHANGE-0015',
    }]);
  });

  /**
   * @id TEST-M5-CANDIDATE-EVIDENCE-ISOLATION-001
   * @verifies REQ-M5-MULTI-CHANGE-008
   */
  it('TEST-M5-CANDIDATE-EVIDENCE-ISOLATION-001 isolates candidate projections while preserving repository compatibility paths', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    expect(approval.candidateEvidencePath(candidate, 'evidence/quality.json'))
      .toBe(`.musubix/candidates/${candidate.candidateId}/evidence/quality.json`);
    expect(approval.candidateEvidencePath(null, 'evidence/quality.json'))
      .toBe('.musubix/evidence/quality.json');
    expect(() => approval.candidateEvidencePath(candidate, '../foreign.json'))
      .toThrow('CANDIDATE_STATE_OWNERSHIP');
  });

  /**
   * @id TEST-M5-CANDIDATE-SINGLE-COMPAT-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-CANDIDATE-SINGLE-COMPAT-001 keeps unscoped single-CHANGE evidence valid and detects scoped input drift', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    expect(approval.validateCandidateBinding({}, null)).toEqual({ valid: true, diagnostics: [] });
    const binding = approval.candidateEvidenceBinding(candidate, candidate.candidateCommit);
    const first = approval.candidateEvidenceInputs(binding, { config: 'one', report: 'two' });
    const same = approval.candidateEvidenceInputs(binding, { report: 'two', config: 'one' });
    const drifted = approval.candidateEvidenceInputs(binding, { config: 'changed', report: 'two' });
    expect(same).toEqual(first);
    expect(drifted.sha256).not.toBe(first.sha256);
  });

  /**
   * @id TEST-M5-INTEGRATION-DIAGNOSTICS-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-INTEGRATION-DIAGNOSTICS-001 assigns registered integration details without rewriting diagnostics', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const gate = await import('../packages/analysis/src/candidate-gate.js');
    expect(approval.classifyIntegrationApprovalDiagnostic({
      code: 'APPROVAL_CANDIDATE_MISSING',
      severity: 'error',
      message: 'missing',
      path: '.musubix/evidence/approvals/release.json',
    })).toEqual({
      code: 'APPROVAL_CANDIDATE_MISSING',
      severity: 'error',
      message: 'missing',
      path: '.musubix/evidence/approvals/release.json',
      detail: 'integration-candidate-snapshot-missing',
    });
    expect(gate.classifyIntegrationCandidateGateDiagnostic({
      code: 'RELEASE_GATE_EVIDENCE_STALE',
      severity: 'warning',
      message: 'stale',
      detail: 'original-detail',
    })).toMatchObject({
      code: 'RELEASE_GATE_EVIDENCE_STALE',
      severity: 'warning',
      message: 'stale',
      detail: 'original-detail',
    });
  });

  /**
   * @id TEST-M5-INTEGRATION-EVIDENCE-BINDING-001
   * @verifies REQ-M5-PARALLEL-010
   */
  it('TEST-M5-INTEGRATION-EVIDENCE-BINDING-001 binds deterministic integration identity and preserves raw gate diagnostics', async () => {
    const approval = await import('../packages/analysis/src/approval.js');
    const integration = approval.integrationEvidenceBinding({
      repositoryId: candidate.repositoryId,
      integrationId: `integration:${'d'.repeat(64)}`,
      startingDefaultCommit: 'e'.repeat(40),
      candidates: [
        { ...candidate, candidateId: `candidate:${'f'.repeat(64)}`, changeId: 'CHANGE-0015' },
        candidate,
      ],
      applyOrder: [candidate.candidateId, `candidate:${'f'.repeat(64)}`],
      sourceManifestSha256: '1'.repeat(64),
      integrationCommit: '2'.repeat(40),
    });
    expect(integration.candidates.map((entry) => entry.candidateId)).toEqual([
      candidate.candidateId,
      `candidate:${'f'.repeat(64)}`,
    ]);
    expect(integration.applyOrder).toEqual([
      candidate.candidateId,
      `candidate:${'f'.repeat(64)}`,
    ]);
    const diagnostic = {
      code: 'FORMAL_OPTIONAL',
      severity: 'warning' as const,
      message: 'unchanged',
      detail: 'raw-detail',
    };
    expect(approval.preserveEvidenceDiagnostics([diagnostic])).toEqual([diagnostic]);
    expect(approval.preserveEvidenceDiagnostics([diagnostic])[0]).not.toBe(diagnostic);
  });
});
