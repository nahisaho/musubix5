import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-COUNTED-SCHEDULER-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-COUNTED-SCHEDULER-001 leases all slots atomically and independently validates composite partition reports', async () => {
  const api = await import('../packages/analysis/src/candidate-execution-plan.js');
  const runtime = await import('../packages/analysis/src/candidate-partitions.js');
  const root = join(process.cwd(), '.musubix/cache/counting-test');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  try {
    const ledger = await api.createCandidateSlotLedger(root, 'nonce-001', 16);
    const owner = { nonce: 'nonce-001', pid: process.pid, partition: 'root' };
    const first = await api.acquireCandidateSlots(ledger, owner, 10);
    expect(first.slots).toHaveLength(10);
    await expect(api.acquireCandidateSlots(ledger, { ...owner, partition: 'too-large' }, 7)).rejects.toThrow(/capacity/);
    const second = await api.acquireCandidateSlots(ledger, { ...owner, partition: 'second' }, 6);
    expect(new Set([...first.slots, ...second.slots]).size).toBe(16);
    await expect(api.releaseCandidateSlots(ledger, { ...first, pid: process.pid + 1 })).rejects.toThrow();
    await api.releaseCandidateSlots(ledger, second);
    await api.releaseCandidateSlots(ledger, first);
    expect((await api.validateCandidateSlotLedger(ledger)).maximum).toBe(16);
    const dispatch = { nonce: 'nonce-001', planDigest: 'a'.repeat(64), command: 'test',
      partitions: [{ id: 'one', ordinal: 0, wave: 0, files: ['tests/one.test.ts'], testIds: ['TEST-ONE-001'] },
        { id: 'two', ordinal: 1, wave: 1, files: ['tests/two.test.ts'], testIds: ['TEST-TWO-001'] }] };
    const acknowledgments = dispatch.partitions.map((p) => ({
      ...p, nonce: dispatch.nonce, planDigest: dispatch.planDigest, command: 'test',
      dispatchDigest: runtime.candidatePartitionDispatchDigest(dispatch),
      executionBinding: { command: 'node', args: ['vitest', p.files[0]] },
      observedVitestArgs: [p.files[0]], workers: [{ workerId: p.id, file: p.files[0] }],
      observedMaximum: 16, status: 'completed', exitCode: 0, signal: null, failureStage: null,
      tests: [{ testId: p.testIds[0], status: 'passed', nativeMessage: '' }],
    }));
    const merged = runtime.validateCandidatePartitionAcknowledgments(dispatch, acknowledgments, { maximum: 16 });
    expect(merged.tests.map((test) => test.testId)).toEqual(['TEST-ONE-001', 'TEST-TWO-001']);
    expect(merged.exitCode).toBe(0);
    expect(() => runtime.validateCandidatePartitionAcknowledgments(dispatch, acknowledgments.slice(1), { maximum: 16 })).toThrow(/one/);
    expect(() => runtime.validateCandidatePartitionAcknowledgments(dispatch, [acknowledgments[0], acknowledgments[0]], { maximum: 16 })).toThrow();
    expect(() => runtime.validateCandidatePartitionAcknowledgments(dispatch, acknowledgments.map((a) => ({ ...a, nonce: 'foreign' })), { maximum: 16 })).toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
