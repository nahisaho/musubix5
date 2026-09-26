import { describe, expect, it, vi } from 'vitest';

describe('candidate integration fencing recovery', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-FENCING-RECOVERY-001
   * @verifies REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-FENCING-RECOVERY-001 derives marker tokens from live leases and validates resumed lineage', async () => {
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const first = module.deriveIntegrationLeaseContext([
      { changeId: 'CHANGE-0015', fencingToken: 4 },
      { changeId: 'CHANGE-0014', fencingToken: 7 },
    ]);
    const replay = module.deriveIntegrationLeaseContext([
      { changeId: 'CHANGE-0014', fencingToken: 7 },
      { changeId: 'CHANGE-0015', fencingToken: 4 },
    ]);
    expect(replay).toEqual(first);
    expect(first.finalizationToken).toMatch(/^fencing:[a-f0-9]{64}$/);

    const resumed = module.deriveIntegrationLeaseContext([
      { changeId: 'CHANGE-0014', fencingToken: 8 },
      { changeId: 'CHANGE-0015', fencingToken: 5 },
    ]);
    expect(() => module.assertFinalizationLeaseLineage(first, resumed)).not.toThrow();
    expect(() => module.assertFinalizationLeaseLineage(first, module.deriveIntegrationLeaseContext([
      { changeId: 'CHANGE-0014', fencingToken: 6 },
      { changeId: 'CHANGE-0015', fencingToken: 5 },
    ]))).toThrow('CANDIDATE_INTEGRATION_CONFLICT');

    const operation = vi.fn(async (context?: typeof first) => context?.finalizationToken);
    const adapter = {
      run: vi.fn(async (
        changeIds: readonly string[],
        callback: (context?: typeof first) => Promise<unknown>,
      ) => callback(module.deriveIntegrationLeaseContext(
        changeIds.map((changeId, index) => ({ changeId, fencingToken: index + 10 })),
      ))),
    };
    await expect(module.withIntegrationTransition(
      ['CHANGE-0015', 'CHANGE-0014'],
      adapter,
      operation,
    )).resolves.toMatch(/^fencing:/);
    expect(operation).toHaveBeenCalledWith(expect.objectContaining({
      leases: [
        { changeId: 'CHANGE-0014', fencingToken: 10 },
        { changeId: 'CHANGE-0015', fencingToken: 11 },
      ],
    }));
  });
});
