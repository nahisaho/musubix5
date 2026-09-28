import { describe, expect, it } from 'vitest';

describe('release generation 5 boundaries', () => {
  /**
   * @id TEST-M5-RELEASE-003-CONTEXT-BINDING-001
   * @verifies REQ-M5-RELEASE-003 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-RELEASE-003-CONTEXT-BINDING-001 verifies direct release attestation identity', async () => {
    const { validateReleaseAttestationIdentity } =
      await import('../packages/analysis/src/release-workflow.js');
    const context = {
      schemaVersion: 'release-context-v1' as const,
      mode: 'dispatch' as const,
      repository: `repository:${'a'.repeat(64)}`,
      candidateCommit: '1'.repeat(40),
      workflow: '.github/workflows/release.yml' as const,
      releaseTag: 'v0.1.1',
      evidenceCommit: '2'.repeat(40),
      verifiedReleaseApprovalSha256: '3'.repeat(64),
    };
    const attestation = {
      release: {
        mode: 'dispatch',
        repository: `repository:${'a'.repeat(64)}`,
        candidateCommit: '1'.repeat(40),
        workflow: '.github/workflows/release.yml',
        releaseTag: 'v0.1.1',
        evidenceCommit: '2'.repeat(40),
        verifiedReleaseApprovalSha256: '3'.repeat(64),
      },
      evidenceHeads: {
        releaseContext: '4'.repeat(64),
        releaseBundle: '5'.repeat(64),
      },
    };
    expect(() => validateReleaseAttestationIdentity(
      context,
      attestation,
      '4'.repeat(64),
      '5'.repeat(64),
    )).not.toThrow();
    expect(() => validateReleaseAttestationIdentity(
      context,
      {
        ...attestation,
        release: { ...attestation.release, releaseTag: 'v9.9.9' },
      },
      '4'.repeat(64),
      '5'.repeat(64),
    )).toThrow(/RELEASE_ATTESTATION_INVALID/);
  });

  /**
   * @id TEST-M5-RELEASE-004-REGISTRY-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REGISTRY-001 classifies only explicit JSON E404 as absent', async () => {
    const { classifyNpmRegistryQuery } =
      await import('../packages/analysis/src/release-workflow.js');
    expect(classifyNpmRegistryQuery(
      1,
      JSON.stringify({ error: { code: 'E404' } }),
    )).toEqual({ status: 'missing' });
    expect(classifyNpmRegistryQuery(0, JSON.stringify('sha512-value'))).toEqual({
      status: 'found',
      value: 'sha512-value',
    });
    expect(() => classifyNpmRegistryQuery(1, '')).toThrow(/RELEASE_REGISTRY_QUERY_FAILED/);
    expect(() => classifyNpmRegistryQuery(
      1,
      JSON.stringify({ error: { code: 'E401' } }),
    )).toThrow(/RELEASE_REGISTRY_QUERY_FAILED/);
  });
});
