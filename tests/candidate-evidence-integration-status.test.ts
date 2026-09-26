import { describe, expect, it } from 'vitest';

const context = {
  repositoryId: 'repository:test',
  integrationId: `integration:${'a'.repeat(64)}`,
  startingDefaultCommit: 'b'.repeat(40),
  candidates: [{
    repositoryId: 'repository:test',
    candidateId: `candidate:${'c'.repeat(64)}`,
    changeId: 'CHANGE-0014',
    generation: 1,
    baseCommit: 'd'.repeat(40),
    candidateCommit: 'e'.repeat(40),
  }, {
    repositoryId: 'repository:test',
    candidateId: `candidate:${'f'.repeat(64)}`,
    changeId: 'CHANGE-0015',
    generation: 1,
    baseCommit: '1'.repeat(40),
    candidateCommit: '2'.repeat(40),
  }],
  applyOrder: [`candidate:${'c'.repeat(64)}`, `candidate:${'f'.repeat(64)}`],
  sourceManifestSha256: '3'.repeat(64),
  integrationCommit: '4'.repeat(40),
};

describe('integration-context status projection', () => {
  /**
   * @id TEST-M5-INTEGRATION-CONTEXT-STATUS-001
   * @verifies REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-INTEGRATION-CONTEXT-STATUS-001 preserves gate binding and forces pre-release non-readiness', async () => {
    const gate = await import('../packages/analysis/src/gate.js');
    const projection = gate.integrationStatusProjection(context, {
      schemaVersion: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
      status: 'pass',
      checks: [],
      metrics: {},
      mode: 'changed',
      feature: null,
      changed: [],
      impacted: [],
      lastChangeAnalysis: null,
      fingerprints: {},
      binding: gate.gateEvidenceBinding(context),
    });
    expect(projection).toEqual({
      status: 'pass',
      generatedAt: '2026-09-26T00:00:00.000Z',
      ready: false,
      binding: gate.gateEvidenceBinding(context),
      diagnostics: [],
    });

    const mismatch = gate.integrationStatusProjection(context, {
      schemaVersion: 1,
      generatedAt: '2026-09-26T00:00:00.000Z',
      status: 'pass',
      checks: [],
      metrics: {},
      mode: 'changed',
      feature: null,
      changed: [],
      impacted: [],
      lastChangeAnalysis: null,
      fingerprints: {},
    });
    expect(mismatch.ready).toBe(false);
    expect(mismatch.status).toBe('stale');
    expect(mismatch.diagnostics).toMatchObject([{
      code: 'CANDIDATE_EVIDENCE_MISMATCH',
      severity: 'error',
    }]);
  });
});
