import { describe, expect, it } from 'vitest';

describe('bootstrap approval transition', () => {
  /**
   * @id TEST-M5-APPROVAL-009
   * @verifies REQ-M5-APPROVAL-009
   */
  it('TEST-M5-APPROVAL-009 authorizes development but never native release readiness', async () => {
    const { validateBootstrapApproval } =
      await import('../packages/analysis/src/native-approval.js');
    const expected = {
      changeId: 'CHANGE-0002',
      repositoryId: 'repo:musubix5',
      producerId: 'musubix3@c0b20f06727bceb04eeec181d95af9047b1981de',
      stage: 'design' as const,
      artifactSha256: 'a'.repeat(64),
      projectionSha256: 'b'.repeat(64),
    };
    const approval = {
      ...expected,
      approver: '@nahisaho',
    };

    expect(validateBootstrapApproval(approval, expected)).toEqual({
      valid: true,
      developmentAuthorized: true,
      releaseCurrent: false,
      diagnostics: [],
    });
    expect(validateBootstrapApproval(
      { ...approval, producerId: 'musubix4@unknown' },
      expected,
    )).toMatchObject({
      valid: false,
      developmentAuthorized: false,
      releaseCurrent: false,
      diagnostics: [{ code: 'BOOTSTRAP_APPROVAL_BINDING_MISMATCH' }],
    });
  });
});
