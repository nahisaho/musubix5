import { describe, expect, it } from 'vitest';

describe('candidate integration verification exit policy', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-VERIFICATION-EXIT-001
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-VERIFICATION-EXIT-001 accepts exit 1 only for the closed approval-only failure', async () => {
    const { validateClosedIntegrationVerification } = await import(
      '../packages/analysis/src/candidate-integration.js'
    );
    const approvalOnly = {
      requiredCommandNames: ['test'],
      requiredCheckNames: ['approval', 'trace'],
      requiredCommands: [{ name: 'test', status: 'passed' as const }],
      requiredChecks: [
        {
          name: 'approval',
          status: 'failed' as const,
          diagnostics: [{
            code: 'APPROVAL_MISSING',
            detail: 'integration-release-approval-missing',
            sourceStage: 'release',
            domain: null,
          }],
        },
        { name: 'trace', status: 'passed' as const, diagnostics: [] },
      ],
      status: { exitCode: 1, ready: false },
    };

    expect(validateClosedIntegrationVerification(approvalOnly)).toEqual({
      accepted: true,
      toleratedApprovalFailure: true,
    });
    expect(() => validateClosedIntegrationVerification({
      ...approvalOnly,
      status: { exitCode: 0, ready: false },
    })).toThrow('CANDIDATE_INTEGRATION_VERIFICATION_FAILED');
    expect(() => validateClosedIntegrationVerification({
      ...approvalOnly,
      status: { exitCode: 2, ready: false },
    })).toThrow('CANDIDATE_INTEGRATION_VERIFICATION_FAILED');
  });
});
