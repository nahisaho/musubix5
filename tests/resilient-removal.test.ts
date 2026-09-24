import { describe, expect, it } from 'vitest';
import { resilientRemovalOptions } from '../packages/analysis/src/files.js';

describe('resilient fixture removal', () => {
  /**
   * @id TEST-M5-RELEASE-WINDOWS-CLEANUP-001
   * @verifies REQ-M5-RELEASE-002
   */
  it('TEST-M5-RELEASE-WINDOWS-CLEANUP-001 bounds retries for transient Windows locks', () => {
    expect(resilientRemovalOptions).toEqual({
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
});
