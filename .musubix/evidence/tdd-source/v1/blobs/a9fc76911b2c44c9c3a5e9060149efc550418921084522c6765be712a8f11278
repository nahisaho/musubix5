import { describe, expect, it } from 'vitest';

describe('release creation target generation 15', () => {
  /**
   * @id TEST-M5-RELEASE-003-CREATION-TARGET-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-CREATION-TARGET-001 requires complete draft-inclusive absence evidence', async () => {
    const { classifyReleaseCreationTargetLookup } =
      await import('../packages/analysis/src/release-workflow.js');

    expect(classifyReleaseCreationTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
    })).toBe('lookup-failed');
    expect(classifyReleaseCreationTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: { complete: false, releases: [] },
    })).toBe('lookup-failed');
    expect(classifyReleaseCreationTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: { complete: true, releases: [] },
    })).toBe('absent');
    expect(classifyReleaseCreationTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: {
        complete: true,
        releases: [
          { tagName: 'v0.1.1', draft: true, prerelease: false },
        ],
      },
    })).toBe('present-draft-or-prerelease');
  });
});
