import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import * as state from '../packages/analysis/src/candidate-state.js';
import * as journal from '../packages/analysis/src/journal.js';
import { appendEvidenceOrder } from '../packages/analysis/src/order.js';
import { appendBatchCheckpoint, recoverBatchCheckpoints } from '../packages/analysis/src/tdd.js';
import { loadChangeEvidence, type ChangeEvidence } from '../packages/analysis/src/change-evidence.js';

type Scope = <T>(root: string, ids: readonly string[],
  operation: (leases: journal.ChangeProjectionAppendLeaseSet) => Promise<T>) => Promise<T>;
type Materialize = (root: string, destination: string, ids: readonly string[],
  recover: typeof recoverBatchCheckpoints, leases: journal.ChangeProjectionAppendLeaseSet) => Promise<unknown>;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-finalization-state-'));
  execFileSync('git', ['init', '--quiet', root]);
  return root;
}

/** @id TEST-M5-FINALIZATION-SCOPE-001
 * @verifies REQ-M5-MULTI-CHANGE-004
 * @design DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-009
 */
it('TEST-M5-FINALIZATION-SCOPE-001 holds sorted CHANGE projection append capabilities and maps timeouts without swallowing fencing', async () => {
  const run = Reflect.get(state, 'withMultiChangeProjectionWrite') as Scope;
  expect(typeof run).toBe('function');
  const root = fixture();
  try {
    await run(root, ['CHANGE-0015', 'CHANGE-0014'], async (leases) => {
      expect(leases.changeLeases.map((lease) => lease.changeId)).toEqual(['CHANGE-0014', 'CHANGE-0015']);
      expect(leases.appendSession).toBeDefined();
      await journal.assertLeaseSetCurrent(leases);
      await journal.appendJournalRecord(root, {
        stream: 'normal', changeId: 'CHANGE-0014', kind: 'fixture', idempotencyKey: 'one', payload: {},
      }, leases.appendSession);
    });
    for (const [kind, diagnostic] of [
      ['change', 'CANDIDATE_LEASE_BUSY'], ['change-projection', 'CHANGE_PROJECTION_LEASE_BUSY'],
      ['repository-append', 'CANDIDATE_JOURNAL_BUSY'],
    ] as const) {
      const spy = vi.spyOn(journal, 'withChangeProjectionLeases').mockRejectedValueOnce(
        new journal.LeaseAcquisitionTimeout(kind, 'fixture'),
      );
      await expect(run(root, ['CHANGE-0014'], async () => undefined)).rejects.toThrow(diagnostic);
      spy.mockRestore();
    }
    vi.spyOn(journal, 'withChangeProjectionLeases').mockRejectedValueOnce(new journal.LeaseFencedError());
    await expect(run(root, ['CHANGE-0014'], async () => undefined)).rejects.toThrow('LEASE_FENCED');
  } finally {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-FINALIZATION-MATERIALIZE-001
 * @verifies REQ-M5-MULTI-CHANGE-004
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003
 */
it('TEST-M5-FINALIZATION-MATERIALIZE-001 recovers only held active CHANGEs before baseline and copies non-selected pending journals verbatim', async () => {
  const run = Reflect.get(state, 'withMultiChangeProjectionWrite') as Scope;
  const materialize = Reflect.get(state, 'materializeOperationalState') as Materialize;
  expect(typeof materialize).toBe('function');
  const root = fixture();
  const destination = join(root, '.git', 'materialized');
  const ids = ['CHANGE-0014', 'CHANGE-0015', 'CHANGE-0016'];
  const requirementIds = ['REQ-FINALIZATION-001', 'REQ-FINALIZATION-002'];
  const hash = 'a'.repeat(64);
  const fingerprints = { impact: hash, requirements: hash, design: hash, implementation: hash, tests: hash, tdd: hash };
  try {
    const evidence: ChangeEvidence = { schemaVersion: 1, changes: [] };
    for (const [index, changeId] of ids.entries()) {
      await appendEvidenceOrder(root, { kind: 'change', entityId: changeId, phase: 'g1:design' });
      evidence.changes.push({
        changeId, generation: 1, activeGeneration: 1, requirementIds, tddBatches: [],
        phases: { design: { phase: 'design', order: index + 1, fingerprints, recordedAt: '2026-09-27T00:00:00.000Z' } }
      });
    }
    mkdirSync(join(root, '.musubix/evidence'), { recursive: true });
    writeFileSync(join(root, '.musubix/evidence/changes.json'), JSON.stringify(evidence));
    for (const changeId of ids) {
      await appendBatchCheckpoint(root, {
        schemaVersion: 1, changeId, generation: 1, phase: 'red', scopeId: requirementIds[0]!,
        repositoryId: `repository:${'b'.repeat(64)}`, workspaceHead: 'c'.repeat(40),
        requirementIds: [requirementIds[0]!], fingerprints, workspaceStateSha256: 'd'.repeat(64),
        tddEvidenceSha256: 'e'.repeat(64), semanticPhaseKey: `g1:red:${requirementIds[0]}`,
        orderPhaseKey: `g1:red:${requirementIds[0]}`, recordedAt: '2026-09-27T00:00:00.000Z',
        changeFencingToken: 1, projectionFencingToken: 1,
      });
    }
    const before = await journal.loadJournalRecords(root);
    const selected: string[] = [];
    await run(root, ids.slice(0, 2), async (leases) => {
      await materialize(root, destination, ids.slice(0, 2), async (path, id, held) => {
        expect(held).toBe(leases);
        selected.push(id);
        return recoverBatchCheckpoints(path, id, held);
      }, leases);
    });
    expect(selected).toEqual(ids.slice(0, 2));
    const result = (await loadChangeEvidence(root))!;
    expect(result.changes.map((change) => change.tddBatches?.length)).toEqual([1, 1, 0]);
    expect(await loadChangeEvidence(destination)).toEqual(result);
    expect(await journal.loadJournalRecords(destination)).toEqual(before);
    expect(readFileSync(join(destination, '.musubix/evidence/order.json'), 'utf8'))
      .toBe(readFileSync(join(root, '.musubix/evidence/order.json'), 'utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
