import { describe, expect, it, vi } from 'vitest';
import {
  assertCandidateTransition,
  withCandidateLeases,
  type CandidateLeaseAdapter,
} from '../packages/analysis/src/candidate-state.js';

describe('candidate lifecycle and concurrency', () => {
  /** @id TEST-M5-CANDIDATE-STATE-LIFECYCLE-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-WORKTREE-007
   */
  it('TEST-M5-CANDIDATE-STATE-LIFECYCLE-001 permits only declared lifecycle transitions', () => {
    expect(() => assertCandidateTransition('prepared', 'active')).not.toThrow();
    expect(() => assertCandidateTransition('ready', 'active')).not.toThrow();
    expect(() => assertCandidateTransition('stale', 'active', { refreshed: true })).not.toThrow();
    expect(() => assertCandidateTransition('stale', 'active')).toThrow(
      'CANDIDATE_LIFECYCLE_INVALID',
    );
    expect(() => assertCandidateTransition('integrated', 'active')).toThrow(
      'CANDIDATE_LIFECYCLE_INVALID',
    );
  });

  /** @id TEST-M5-CANDIDATE-STATE-LEASES-001
   * @verifies REQ-M5-LIFECYCLE-005
   */
  it('TEST-M5-CANDIDATE-STATE-LEASES-001 acquires sorted unique CHANGE leases and releases in reverse', async () => {
    const events: string[] = [];
    const adapter: CandidateLeaseAdapter<string> = {
      acquire: vi.fn(async (changeId) => {
        events.push(`acquire:${changeId}`);
        return changeId;
      }),
      assertCurrent: vi.fn(async (lease) => {
        events.push(`assert:${lease}`);
      }),
      release: vi.fn(async (lease) => {
        events.push(`release:${lease}`);
      }),
    };

    const result = await withCandidateLeases(
      ['CHANGE-0015', 'CHANGE-0014', 'CHANGE-0015'],
      adapter,
      async (leases) => {
        events.push(`operation:${leases.join(',')}`);
        return 'complete';
      },
    );

    expect(result).toBe('complete');
    expect(events).toEqual([
      'acquire:CHANGE-0014',
      'acquire:CHANGE-0015',
      'assert:CHANGE-0014',
      'assert:CHANGE-0015',
      'operation:CHANGE-0014,CHANGE-0015',
      'assert:CHANGE-0014',
      'assert:CHANGE-0015',
      'release:CHANGE-0015',
      'release:CHANGE-0014',
    ]);
  });
});
