import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultConfig } from '../packages/analysis/src/config.js';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import * as journal from '../packages/analysis/src/journal.js';
import { appendEvidenceOrder, loadEvidenceOrder } from '../packages/analysis/src/order.js';
import { loadChangeEvidence, type BatchCheckpointPayload, type ChangeFingerprints } from '../packages/analysis/src/change-evidence.js';
import { appendBatchCheckpoint, recordChangePhaseFromWorkspace, recoverBatchCheckpoints, workspaceChangeFingerprints } from '../packages/analysis/src/tdd.js';
import { projectStatus, runGate } from '../packages/analysis/src/gate.js';

const roots: string[] = [];
const req = 'REQ-M5-LIFECYCLE-006';
const other = 'REQ-M5-TDD-003';
const changeId = 'CHANGE-0017';
const emptyFingerprints: ChangeFingerprints = {
  impact: '0'.repeat(64), requirements: '0'.repeat(64), design: '0'.repeat(64),
  implementation: '0'.repeat(64), tests: '0'.repeat(64), tdd: '0'.repeat(64),
};
function write(root: string, path: string, value: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
async function fixture(): Promise<string> {
  mkdirSync(resolve('.musubix/cache'), { recursive: true });
  const root = mkdtempSync(resolve('.musubix/cache/workspace-checkpoint-'));
  roots.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  write(root, '.musubix/config.json', JSON.stringify({
    ...defaultConfig, commands: [], requiredChecks: [],
    approval: { mode: 'compatible', domains: [] },
  }));
  write(root, '.musubix/constitution.md', readFileSync(resolve('.musubix/constitution.md'), 'utf8'));
  write(root, '.musubix/features/fixture/requirements.md', [req, other].map((id) =>
    `## ${id}: Checkpoints\nPriority: must\nType: functional\nPattern: event-driven\nStatement: When a writer retries ${id}, the system shall recover its checkpoint.\nAcceptance: Exactly one journal record is projected.\n`).join('\n'));
  write(root, '.musubix/features/fixture/design.md', `## DES-FIXTURE-001: Checkpoints\nResponsibilities: Recover persisted checkpoints.\nInterfaces: record().\nConstraints: Serialize writers.\nRequirements: ${req} ${other}\nADRs: ADR-0001\n`);
  write(root, '.musubix/decisions/ADR-0001.md', '# ADR-0001\nFixture decision.\n');
  write(root, `.musubix/changes/${changeId}.md`, `# ${changeId}\nRequirements: ${req} ${other}\n`);
  write(root, 'source.ts', ['/** @id CODE-FIXTURE-001', ` * @implements ${req}`, ' */', 'export const value = 1;\n'].join('\n'));
  write(root, 'source.test.ts', ['/** @id TEST-FIXTURE-001', ` * @verifies ${req}`, ' */', 'export const testValue = 1;\n'].join('\n'));
  write(root, '.musubix/evidence/changes.json', JSON.stringify({
    schemaVersion: 1, changes: [{
      changeId, generation: 5, activeGeneration: 5, requirementIds: [req, other], tddBatches: [],
      phases: { design: { phase: 'design', order: 1, recordedAt: '2026-09-27T00:00:00.000Z', fingerprints: emptyFingerprints } },
    }]
  }));
  await appendEvidenceOrder(root, { kind: 'change', entityId: changeId, phase: 'g5:design' });
  return root;
}
async function payload(root: string): Promise<BatchCheckpointPayload> {
  return {
    schemaVersion: 1, changeId, generation: 5, phase: 'red', scopeId: req,
    repositoryId: `repository:${'a'.repeat(64)}`,
    workspaceHead: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    requirementIds: [req], fingerprints: await workspaceChangeFingerprints(root, root, changeId, [req]),
    workspaceStateSha256: 'b'.repeat(64), tddEvidenceSha256: 'c'.repeat(64),
    semanticPhaseKey: `g5:red:${req}`, orderPhaseKey: `g5:red:${req}`,
    recordedAt: '2026-09-27T00:00:00.000Z', changeFencingToken: 1, projectionFencingToken: 1,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** @id TEST-M5-CHECKPOINT-RECOVERY-ORDER-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-007 DES-M5-022
 */
it('TEST-M5-CHECKPOINT-RECOVERY-ORDER-001 rejects missing predecessor order and malformed order scopes before finalization recovery writes', async () => {
  for (const invalid of ['predecessor', 'scope']) {
    const root = await fixture();
    await appendBatchCheckpoint(root, await payload(root));
    if (invalid === 'predecessor') {
      const evidence = (await loadChangeEvidence(root))!;
      evidence.changes[0]!.phases.design!.order = 99;
      write(root, '.musubix/evidence/changes.json', JSON.stringify(evidence));
    } else {
      await appendEvidenceOrder(root, { kind: 'change', entityId: changeId, phase: `g05:red:${req}#02` });
    }
    const before = readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8');
    const orders = readFileSync(join(root, '.musubix/evidence/order.json'), 'utf8');
    await expect(journal.withChangeProjectionLeases(root, [changeId], async (leases) =>
      journal.withOrderLease(root, (appendSession) =>
        recoverBatchCheckpoints(root, changeId, { ...leases, appendSession }), leases)))
      .rejects.toThrow(invalid === 'predecessor' ? 'CHANGE_CHECKPOINT_JOURNAL_INVALID' : 'EVIDENCE_ORDER_SCHEMA');
    expect(readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8')).toBe(before);
    expect(readFileSync(join(root, '.musubix/evidence/order.json'), 'utf8')).toBe(orders);
  }
});

/** @id TEST-M5-CHECKPOINT-RELEVANT-PATHS-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
it('TEST-M5-CHECKPOINT-RELEVANT-PATHS-001 ignores unannotated unrelated edits but detects changes in unannotated implementation dependencies', async () => {
  for (const linked of [false, true]) {
    const root = await fixture();
    write(root, 'dependency.ts', 'export const dependency = 1;\n');
    if (linked) write(root, 'source.ts',
      readFileSync(join(root, 'source.ts'), 'utf8') + "import { dependency } from './dependency.js';\nexport const linked = dependency;\n");
    const original = journal.withChangeProjectionLeases;
    const spy = vi.spyOn(journal, 'withChangeProjectionLeases').mockImplementation(async (path, ids, operation) => {
      write(root, 'dependency.ts', 'export const dependency = 2;\n');
      return original(path, ids, operation);
    });
    const recording = recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req]);
    if (linked) await expect(recording).rejects.toThrow('CHANGE_WORKSPACE_DRIFT');
    else await expect(recording).resolves.toBeDefined();
    spy.mockRestore();
  }
});

/** @id TEST-M5-CHECKPOINT-PREFLIGHT-READONLY-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004
 */
it('TEST-M5-CHECKPOINT-PREFLIGHT-READONLY-001 does not publish shared trace artifacts during concurrent lifecycle preparation', async () => {
  const root = await fixture();
  const trace = await import('../packages/analysis/src/trace.js');
  const build = vi.spyOn(trace, 'buildTrace');
  const { recordChangePhase } = await import('../packages/analysis/src/change.js');
  await recordChangePhase(root, changeId, 'impact', [req, other]);
  expect(build.mock.calls.length).toBeGreaterThan(0);
  expect(build.mock.calls.every((call) => call[1] === false)).toBe(true);
});

/** @id TEST-M5-CHECKPOINT-PHASE-BEFORE-DRIFT-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-022
 */
it('TEST-M5-CHECKPOINT-PHASE-BEFORE-DRIFT-001 preserves unrelated phase recovery while rejecting a drifted requested batch', async () => {
  const root = await fixture();
  await journal.appendJournalRecord(root, {
    stream: 'normal', changeId, kind: 'change-phase-checkpoint',
    idempotencyKey: `change-phase-checkpoint:${changeId}:g5:design:recover-design`,
    payload: {
      schemaVersion: 1, changeId, generation: 5, phase: 'design', operationId: 'recover-design',
      ordinal: 2, approvalManifestSha256: 'a'.repeat(64), requirementIds: [req, other],
      fingerprints: emptyFingerprints, semanticPhaseKey: `change:${changeId}:g5:design`,
      orderPhaseKey: 'design:2', recordedAt: '2026-09-27T00:00:00.000Z', fencingToken: 1,
    },
  });
  const original = journal.withChangeProjectionLeases;
  vi.spyOn(journal, 'withChangeProjectionLeases').mockImplementation(async (path, ids, operation) => {
    write(root, 'source.ts', '// concurrent change\n');
    return original(path, ids, operation);
  });
  await expect(recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req])).rejects.toThrow('CHANGE_WORKSPACE_DRIFT');
  const change = (await loadChangeEvidence(root))!.changes[0]!;
  expect(change.phases.design?.operationId).toBe('recover-design');
  expect(change.tddBatches).toEqual([]);
  expect((await loadEvidenceOrder(root))!.records.map((record) => record.phase)).toEqual(['g5:design', 'g5:design:2']);
  expect((await journal.loadJournalRecords(root)).map((record) => record.kind)).toEqual(['change-phase-checkpoint']);
});

/** @id TEST-M5-CHECKPOINT-WORKSPACE-CONCURRENCY-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-022
 */
it('TEST-M5-CHECKPOINT-WORKSPACE-CONCURRENCY-001 completes exactly four same-CHANGE writers and two different-CHANGE writers within ten seconds', async () => {
  const root = await fixture();
  const requirements = [req, other, 'REQ-FIXTURE-003', 'REQ-FIXTURE-004'];
  const evidence = (await loadChangeEvidence(root))!;
  evidence.changes[0]!.requirementIds = requirements;
  write(root, `.musubix/changes/${changeId}.md`, `# ${changeId}\nRequirements: ${requirements.join(' ')}\n`);
  write(root, '.musubix/evidence/changes.json', JSON.stringify(evidence));
  const original = journal.writeChangeProjection;
  vi.spyOn(journal, 'writeChangeProjection').mockImplementation(async (...args) => {
    await new Promise((done) => setTimeout(done, 50));
    return original(...args);
  });
  const started = performance.now();
  await Promise.all(requirements.map((id) => recordChangePhaseFromWorkspace(root, root, changeId, 'red', [id])));
  expect(performance.now() - started).toBeLessThan(10_000);
  expect((await loadChangeEvidence(root))!.changes[0]!.tddBatches).toHaveLength(4);
  const before = (await loadChangeEvidence(root))!;
  before.changes.push({
    changeId: 'CHANGE-0018', generation: 5, activeGeneration: 5, requirementIds: [req], phases: {
      design: { phase: 'design', order: 6, fingerprints: emptyFingerprints, recordedAt: '2026-09-27T00:00:00.000Z' },
    },
  });
  write(root, '.musubix/changes/CHANGE-0018.md', `# CHANGE-0018\nRequirements: ${req}\n`);
  write(root, '.musubix/evidence/changes.json', JSON.stringify(before));
  await appendEvidenceOrder(root, { kind: 'change', entityId: 'CHANGE-0018', phase: 'g5:design' });
  write(root, 'source.ts', readFileSync(join(root, 'source.ts'), 'utf8').replace('= 1', '= 2'));
  const secondStart = performance.now();
  await Promise.all([
    recordChangePhaseFromWorkspace(root, root, changeId, 'implementation', [req]),
    recordChangePhaseFromWorkspace(root, root, 'CHANGE-0018', 'red', [req]),
  ]);
  expect(performance.now() - secondStart).toBeLessThan(10_000);
  expect((await loadChangeEvidence(root))!.changes[0]!.tddBatches).toHaveLength(4);
  expect((await loadChangeEvidence(root))!.changes[0]!.tddBatches!.find((batch) => batch.scopeId === req)!.implementation).toBeDefined();
  expect((await loadChangeEvidence(root))!.changes[1]!.phases.red).toBeDefined();
}, 30_000);

/** @id TEST-M5-CHECKPOINT-REPLAY-PREPARATION-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
it('TEST-M5-CHECKPOINT-REPLAY-PREPARATION-001 prefers a persisted checkpoint even when current inputs drift during preparation', async () => {
  const root = await fixture();
  const persisted = await payload(root);
  await appendBatchCheckpoint(root, persisted);
  const result = await recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req], {
    verifyRepository: async () => undefined,
    loadChangeEvidence,
    currentFingerprints: async (...args) => {
      const fingerprints = await workspaceChangeFingerprints(...args);
      write(root, 'source.test.ts', '// current invocation changes during preparation\n');
      return fingerprints;
    },
  });
  expect(result.changes[0]!.tddBatches![0]!.red!.fingerprints).toEqual(persisted.fingerprints);
  expect(result.changes[0]!.tddBatches![0]!.red!.recordedAt).toBe(persisted.recordedAt);
  expect(await journal.loadJournalRecords(root)).toHaveLength(1);
});

/** @id TEST-M5-CHECKPOINT-CLI-DIAGNOSTICS-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-015 DES-M5-022
 */
it('TEST-M5-CHECKPOINT-CLI-DIAGNOSTICS-001 maps projection timeout and workspace drift to exit one with stable JSON codes', async () => {
  const root = await fixture();
  const cli = (...args: string[]) => spawnSync(process.execPath, [
    resolve('dist/packages/cli/src/main.js'), ...args, '--root', root, '--json',
  ], { encoding: 'utf8', timeout: 20_000 });
  await journal.withChangeProjectionLease(root, async () => {
    const result = cli('change-record', changeId, 'impact', '--requirement', req, other);
    expect(result.status, result.stderr || result.stdout).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: 'CHANGE_PROJECTION_LEASE_BUSY' } });
  });
  execFileSync('git', ['-C', root, 'symbolic-ref', 'HEAD', 'refs/heads/unborn-fixture']);
  const drift = cli('change-record', changeId, 'red', '--workspace', root, '--requirement', req);
  expect(drift.status, drift.stderr || drift.stdout).toBe(1);
  expect(JSON.parse(drift.stdout)).toMatchObject({ error: { code: 'CHANGE_WORKSPACE_DRIFT' } });
}, 30_000);

/** @id TEST-M5-CHECKPOINT-PHASE-INVALID-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-007 DES-M5-015
 */
it('TEST-M5-CHECKPOINT-PHASE-INVALID-001 reports malformed phase journals without throwing or dropping batch summaries', async () => {
  const root = await fixture();
  await journal.appendJournalRecord(root, {
    stream: 'normal', changeId, kind: 'change-phase-checkpoint',
    idempotencyKey: `change-phase-checkpoint:${changeId}:g5:requirements:bad`, payload: null,
  });
  const status = await projectStatus(root);
  expect(status.gate?.ready).toBe(false);
  expect(status.changeDiagnostics.some((entry) => entry.code === 'CHANGE_CHECKPOINT_JOURNAL_INVALID')).toBe(true);
  expect(status.change!.generations[0]!.unprojectedBatchCheckpoints).toEqual([]);
  const gate = await runGate(root, { persistenceMode: 'matrix' });
  expect(gate.status).toBe('fail');
  expect(gate.checks.flatMap((check) => check.diagnostics ?? [])
    .some((entry) => entry.code === 'CHANGE_CHECKPOINT_JOURNAL_INVALID')).toBe(true);
});

/** @id TEST-M5-CHECKPOINT-WORKSPACE-REPLAY-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
it('TEST-M5-CHECKPOINT-WORKSPACE-REPLAY-001 completes only persisted input before current-state validation and survives order/projection interruption', async () => {
  const root = await fixture();
  const persisted = await payload(root);
  await appendBatchCheckpoint(root, persisted);
  write(root, 'source.test.ts', readFileSync(join(root, 'source.test.ts'), 'utf8') + '// changed after append\n');
  const replay = await recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req]);
  expect(replay.changes[0]!.tddBatches![0]!.red).toMatchObject({
    recordedAt: persisted.recordedAt, fingerprints: persisted.fingerprints, order: 2,
  });
  expect(await journal.loadJournalRecords(root)).toHaveLength(1);
  expect((await loadEvidenceOrder(root))!.records).toHaveLength(2);

  const fresh = await fixture();
  const failure = vi.spyOn(journal, 'writeChangeProjection').mockRejectedValueOnce(new Error('projection interruption'));
  await expect(recordChangePhaseFromWorkspace(fresh, fresh, changeId, 'red', [req])).rejects.toThrow('projection interruption');
  failure.mockRestore();
  const authoritative = (await journal.loadJournalRecords(fresh))[0]!.payload as BatchCheckpointPayload;
  write(fresh, 'source.test.ts', '// unrelated retry state\n');
  const recovered = await recordChangePhaseFromWorkspace(fresh, fresh, changeId, 'red', [req]);
  expect(recovered.changes[0]!.tddBatches![0]!.red!.fingerprints).toEqual(authoritative.fingerprints);
  expect((await loadEvidenceOrder(fresh))!.records).toHaveLength(2);
});

/** @id TEST-M5-CHECKPOINT-WORKSPACE-SCOPE-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-007 DES-M5-022
 */
it('TEST-M5-CHECKPOINT-WORKSPACE-SCOPE-001 reserves past legacy ordinals and rejects singular full-set legacy evidence', async () => {
  const root = await fixture();
  await appendEvidenceOrder(root, { kind: 'change', entityId: changeId, phase: `g5:green:${req}#7` });
  const recorded = await recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req]);
  expect(recorded.changes[0]!.tddBatches![0]!.scopeId).toBe(`${req}#8`);
  expect((await journal.loadJournalRecords(root))[0]!.idempotencyKey).toBe(`change-batch-checkpoint:${changeId}:g5:red:${req}#8`);
  const full = await fixture();
  await appendEvidenceOrder(full, { kind: 'change', entityId: changeId, phase: 'g5:red' });
  await expect(recordChangePhaseFromWorkspace(full, full, changeId, 'red', [other, req]))
    .rejects.toThrow(/CHANGE_GENERATION_DUPLICATE:.*abandon.*reopen/);
  expect(await journal.loadJournalRecords(full)).toHaveLength(0);
  expect((await loadEvidenceOrder(full))!.records).toHaveLength(2);
});

/** @id TEST-M5-CHECKPOINT-WORKSPACE-DRIFT-001
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
it('TEST-M5-CHECKPOINT-WORKSPACE-DRIFT-001 rejects same-size, added, removed, HEAD and selected-TDD drift before persistence', async () => {
  for (const mutation of ['same-size', 'added', 'removed', 'head', 'selected-tdd']) {
    const root = await fixture();
    const before = readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8');
    const original = journal.withChangeProjectionLeases;
    const held = vi.spyOn(journal, 'withChangeProjectionLeases').mockImplementation(async (path, ids, operation) => {
      if (mutation === 'same-size') write(root, 'source.ts', readFileSync(join(root, 'source.ts'), 'utf8').replace('= 1', '= 2'));
      if (mutation === 'added') write(root, 'added.test.ts', '/** @id TEST-FIXTURE-ADDED-001\n * @verifies REQ-M5-LIFECYCLE-006\n */\nexport const added = true;\n');
      if (mutation === 'removed') rmSync(join(root, 'source.test.ts'));
      if (mutation === 'head') execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'drift']);
      if (mutation === 'selected-tdd') write(root, '.musubix/evidence/tdd.json', JSON.stringify({
        schemaVersion: 1, cycles: [{ cycleId: 'selected', changeId, generation: 5, requirementId: req }], chain: [],
      }));
      return original(path, ids, operation);
    });
    await expect(recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req])).rejects.toThrow('CHANGE_WORKSPACE_DRIFT');
    held.mockRestore();
    expect(await journal.loadJournalRecords(root)).toHaveLength(0);
    expect((await loadEvidenceOrder(root))!.records).toHaveLength(1);
    expect(readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8')).toBe(before);
  }
  const root = await fixture();
  const original = journal.withChangeProjectionLeases;
  vi.spyOn(journal, 'withChangeProjectionLeases').mockImplementation(async (path, ids, operation) => {
    write(root, '.musubix/evidence/tdd.json', JSON.stringify({
      schemaVersion: 1, cycles: [{ cycleId: 'other', changeId: 'CHANGE-9999', generation: 5, requirementId: req }], chain: [],
    }));
    return original(path, ids, operation);
  });
  await expect(recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req])).resolves.toBeDefined();
});

/** @id TEST-M5-CHECKPOINT-STATUS-BATCH-002
 * @verifies REQ-M5-LIFECYCLE-006
 * @design DES-M5-007 DES-M5-015
 */
it('TEST-M5-CHECKPOINT-STATUS-BATCH-002 diagnoses duplicate batch orders before projection subtraction in both gate and status', async () => {
  const root = await fixture();
  await recordChangePhaseFromWorkspace(root, root, changeId, 'red', [req]);
  const order = (await loadEvidenceOrder(root))!;
  const prior = order.records.at(-1)!;
  const duplicate = { ...prior, sequence: prior.sequence + 1, previousSha256: prior.recordSha256 };
  const { recordSha256: ignored, ...unsigned } = duplicate;
  duplicate.recordSha256 = (await import('../packages/analysis/src/files.js')).digest(JSON.stringify(unsigned));
  order.records.push(duplicate);
  write(root, '.musubix/evidence/order.json', JSON.stringify(order));
  const status = await projectStatus(root);
  expect(status.changeDiagnostics.some((entry) => entry.code === 'CHANGE_CHECKPOINT_JOURNAL_INVALID')).toBe(true);
  expect(status.changeDiagnostics.some((entry) => entry.code.startsWith('APPROVAL_NORMATIVE_'))).toBe(false);
  expect(status.change!.generations[0]!.unprojectedBatchCheckpoints.map((entry) => entry.recovery)).toEqual(['invalid', 'invalid']);
  const before = readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8');
  const gate = await runGate(root, { persistenceMode: 'matrix' });
  expect(gate.status).toBe('fail');
  expect(gate.checks.flatMap((check) => check.diagnostics ?? []).some((entry) => entry.code === 'CHANGE_CHECKPOINT_JOURNAL_INVALID')).toBe(true);
  expect(gate).toMatchObject({
    change: {
      generations: [{
        unprojectedBatchCheckpoints: [
          { recovery: 'invalid' }, { recovery: 'invalid' },
        ]
      }]
    }
  });
  expect(readFileSync(join(root, '.musubix/evidence/changes.json'), 'utf8')).toBe(before);
});
