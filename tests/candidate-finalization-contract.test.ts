import { expect, it } from 'vitest';
import { validateFinalizationMarker } from '../packages/analysis/src/candidate-integration.js';

/** @id TEST-M5-FINALIZATION-MARKER-001
 * @verifies REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-008
 */
it('TEST-M5-FINALIZATION-MARKER-001 requires exact persisted marker binding and monotonic floors for every lease', () => {
  const stored = {
    leases: [{ changeId: 'CHANGE-0014', fencingToken: 3 }, { changeId: 'CHANGE-0015', fencingToken: 4 }],
    projectionFencingToken: 5, finalizationToken: 6,
  };
  const attempt = {
    integrationId: `integration:${'a'.repeat(64)}`, repositoryId: `repository:${'b'.repeat(64)}`,
    startingDefaultCommit: 'c'.repeat(40), integrationCommit: 'd'.repeat(40),
    candidateIds: [], inputCommits: [], state: 'verified', finalizationLeaseContext: stored,
  };
  const marker = {
    schemaVersion: 1, kind: 'candidate-finalization-v1', integrationId: attempt.integrationId,
    integrationCommit: attempt.integrationCommit, startingDefaultCommit: attempt.startingDefaultCommit,
    fencingToken: stored.finalizationToken, leaseContext: stored,
  };
  const input = { attempt, marker, liveLeaseContext: stored, integrationCommitReachable: true };
  const validate = (value: unknown) => validateFinalizationMarker(JSON.parse(JSON.stringify(value)));
  expect(() => validate(input)).not.toThrow();
  expect(() => validate({
    ...input, liveLeaseContext: {
      leases: stored.leases.map((lease) => ({ ...lease, fencingToken: lease.fencingToken + 1 })),
      projectionFencingToken: 7, finalizationToken: 8,
    }
  })).not.toThrow();
  const invalid = [
    { ...input, marker: { ...marker, extra: true } },
    { ...input, marker: { ...marker, leaseContext: undefined } },
    { ...input, marker: { ...marker, leaseContext: { ...stored, extra: true } } },
    { ...input, marker: { ...marker, leaseContext: { ...stored, projectionFencingToken: 6 } } },
    { ...input, marker: { ...marker, leaseContext: { ...stored, leases: [...stored.leases].reverse() } } },
    { ...input, marker: { ...marker, fencingToken: 7 } },
    { ...input, liveLeaseContext: { ...stored, projectionFencingToken: 4 } },
    { ...input, liveLeaseContext: { ...stored, finalizationToken: 5 } },
    { ...input, liveLeaseContext: { ...stored, leases: [{ ...stored.leases[0]!, extra: true }, stored.leases[1]] } },
    { ...input, integrationCommitReachable: false },
  ];
  for (const value of invalid) expect(() => validate(value)).toThrow('CANDIDATE_INTEGRATION_CONFLICT');
});
