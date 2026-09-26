import { describe, expect, it } from 'vitest';
import {
  deriveIntegrationIdentity,
  integrationSourceManifest,
  validateClosedIntegrationVerification,
} from '../packages/analysis/src/candidate-integration.js';

const candidate = (value: string, changeId: string) => ({
  candidateId: `candidate:${value.repeat(64)}`,
  changeId,
  generation: 1,
  candidateCommit: value.repeat(40),
});

describe('deterministic candidate integration', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-DETERMINISM-001
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-DETERMINISM-001 derives canonical identity, source manifest, and closed verification', () => {
    const first = candidate('a', 'CHANGE-0014');
    const second = candidate('b', 'CHANGE-0015');
    const identity = deriveIntegrationIdentity({
      repositoryId: `repository:${'f'.repeat(64)}`,
      startingDefaultCommit: '0'.repeat(40),
      candidates: [second, first],
    });
    const replay = deriveIntegrationIdentity({
      repositoryId: `repository:${'f'.repeat(64)}`,
      startingDefaultCommit: '0'.repeat(40),
      candidates: [first, second],
    });
    expect(replay).toEqual(identity);
    expect(identity.integrationId).toMatch(/^integration:[a-f0-9]{64}$/);
    expect(identity.candidates.map((entry) => entry.candidateId))
      .toEqual([first.candidateId, second.candidateId]);

    const manifest = integrationSourceManifest([
      { path: '.musubix/evidence/quality.json', gitMode: '100644', objectType: 'blob', objectId: '9'.repeat(40) },
      { path: 'src/e\u0301.ts', gitMode: '100644', objectType: 'blob', objectId: '2'.repeat(40) },
      { path: 'src/a.ts', gitMode: '100755', objectType: 'blob', objectId: '1'.repeat(40) },
    ]);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.kind).toBe('integration-source-manifest-v1');
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['src/a.ts', 'src/é.ts']);
    expect(integrationSourceManifest([...manifest.entries].reverse())).toEqual(manifest);

    expect(validateClosedIntegrationVerification({
      requiredCommands: [{ name: 'test', status: 'passed' }],
      requiredChecks: [
        {
          name: 'approval',
          status: 'failed',
          diagnostics: [{
            code: 'APPROVAL_MISSING',
            detail: 'integration-release-approval-missing',
            sourceStage: 'release',
            domain: null,
          }],
        },
        { name: 'trace', status: 'passed', diagnostics: [] },
      ],
      status: { exitCode: 0, ready: false },
    })).toEqual({ accepted: true, toleratedApprovalFailure: true });

    expect(() => validateClosedIntegrationVerification({
      requiredCommands: [{ name: 'test', status: 'passed' }],
      requiredChecks: [{
        name: 'approval',
        status: 'failed',
        diagnostics: [{ code: 'APPROVAL_MISSING', detail: 'integration-release-approval-missing' }],
      }],
      status: { exitCode: 0, ready: false },
    })).toThrow('CANDIDATE_INTEGRATION_VERIFICATION_FAILED');
    expect(() => validateClosedIntegrationVerification({
      requiredCommands: [{ name: 'test', status: 'skipped' }],
      requiredChecks: [{ name: 'approval', status: 'passed', diagnostics: [] }],
      status: { exitCode: 0, ready: true },
    })).toThrow('CANDIDATE_INTEGRATION_VERIFICATION_FAILED');
  });
});
