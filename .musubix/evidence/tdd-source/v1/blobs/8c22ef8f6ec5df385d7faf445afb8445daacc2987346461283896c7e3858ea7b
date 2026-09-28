import { expect, it } from 'vitest';
import type { SourceReview } from '../packages/analysis/src/tdd-source-types.js';
import { canonicalBytes, canonicalRepositoryIdentity, sha256 } from '../packages/analysis/src/canonical.js';
import type { TddEvidence, TddPhaseEvidence } from '../packages/analysis/src/tdd-types.js';
import type { EvidenceOrderLog } from '../packages/analysis/src/order.js';
import type { JournalRecord } from '../packages/analysis/src/journal.js';
import type { SourceJournalPayload, SourceProjection } from '../packages/analysis/src/tdd-source-types.js';
import { mkdir, mkdtemp as createTemporaryDirectory, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function mkdtemp(prefix: string): Promise<string> {
  const root = await createTemporaryDirectory(prefix);
  execFileSync('git', ['init', '--quiet', root]);
  await mkdir(join(root, '.musubix/features/fixture'), { recursive: true });
  await writeFile(join(root, '.musubix/constitution.md'), '# Constitution\n');
  await writeFile(join(root, '.musubix/features/fixture/requirements.md'), '# Requirements\n');
  await writeFile(join(root, '.musubix/features/fixture/design.md'), '# Design\n');
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Source fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--allow-empty', '--quiet', '-m', 'source evidence fixture']);
  return root;
}

const digest = (character: string): string => character.repeat(64);
function reviewFixture(): SourceReview {
  return {
    schemaVersion: 1, kind: 'tdd-source-review', changeId: 'CHANGE-0017', operationId: 'schema-fixture',
    scope: {
      repositoryId: 'repository-fixture', changeId: 'CHANGE-0017', generation: 5,
      requirementId: 'REQ-M5-LIFECYCLE-006', testId: 'TEST-SOURCE-FIXTURE-001',
      path: 'tests/fixture.test.ts', command: 'test', domain: null, parallel: null,
      candidate: {
        schemaVersion: 1, kind: 'candidate', repositoryId: 'repository-fixture',
        changeId: 'CHANGE-0017', generation: 5, candidateId: `candidate:${digest('a')}`,
        baseCommit: 'b'.repeat(40), candidateCommit: 'c'.repeat(40),
      },
    },
    target: { cycleId: 'original', kind: 'refactor', order: 3,
      payloadSha256: digest('d'), oldFingerprint: digest('e') },
    source: {
      nodeId: 'TEST-SOURCE-FIXTURE-001', annotationStart: 0, statementEnd: 100,
      currentFileSha256: digest('a'), newBlockSha256: digest('b'), oldBlockSha256: null,
      oldFingerprint: digest('e'), newFingerprint: digest('f'),
      oldSourceDigest: digest('e'), newSourceDigest: digest('f'),
    },
    snapshot: {
      manifestSha256: digest('a'), environmentSha256: digest('b'), runnerSha256: digest('c'),
      configSha256: digest('d'), productionSha256: digest('e'), head: 'a'.repeat(40), stateSha256: digest('f'),
    },
    mode: 'behavior-change', reason: 'Review exact replacement evidence', hunks: [], pair: null,
    replacement: { cycleId: 'replacement', redOrder: 4, greenOrder: 6,
      redPayloadSha256: digest('a'), greenPayloadSha256: digest('b'), testFingerprint: digest('f') },
    preparedAt: '2026-09-27T00:00:00.000Z', preparationInvocationId: 'preparation-fixture',
    approvalContext: { requirementsSha256: digest('a'), designSha256: digest('b'), domain: null },
  };
}

function ledgerFixture(): { evidence: TddEvidence; orders: EvidenceOrderLog; journals: JournalRecord[];
  projection: SourceProjection; review: SourceReview } {
  const review = reviewFixture();
  review.scope.candidate = null;
  const evidence: TddEvidence = { schemaVersion: 1, cycles: [], chain: [] };
  const orders: EvidenceOrderLog = { schemaVersion: 1, records: [] };
  const rawHash = (value: unknown): string => sha256(Buffer.from(JSON.stringify(value)));
  for (const [cycleId, firstOrder, fingerprint] of [
    ['original', 1, review.target.oldFingerprint], ['replacement', 4, review.source.newFingerprint],
  ] as const) {
    const phase = (kind: 'red' | 'green' | 'refactor', order: number): TddPhaseEvidence => ({
      phase: kind, valid: true, scoped: true, resultObserved: true, testStatus: kind === 'red' ? 'failed' : 'passed',
      reportSha256: digest('a'), commandSha256: digest('b'), outputSha256: digest('c'),
      exitCode: kind === 'red' ? 1 : 0, durationMs: 1, testFingerprint: fingerprint,
      sourceFingerprint: digest(kind === 'red' ? 'd' : 'e'), executionId: `${cycleId}-${kind}`,
      order, recordedAt: '2026-09-27T00:00:00.000Z', diagnostics: [],
    });
    const cycle = {
      cycleId, changeId: review.changeId, generation: review.scope.generation,
      requirementId: review.scope.requirementId, testId: review.scope.testId, testPath: review.scope.path,
      commandName: review.scope.command, red: phase('red', firstOrder), green: phase('green', firstOrder + 1),
      refactor: phase('refactor', firstOrder + 2),
    };
    evidence.cycles.push(cycle);
    for (const kind of ['red', 'green', 'refactor'] as const) {
      const order = { sequence: orders.records.length + 1, kind: 'tdd' as const, entityId: cycleId, phase: kind,
        previousSha256: orders.records.at(-1)?.recordSha256 ?? null };
      orders.records.push({ ...order, recordSha256: rawHash(order) });
      const chain = {
        sequence: evidence.chain!.length + 1, cycleId, changeId: cycle.changeId, generation: cycle.generation,
        requirementId: cycle.requirementId, testId: cycle.testId, testPath: cycle.testPath, commandName: cycle.commandName,
        phase: kind, phaseEvidenceSha256: rawHash(cycle[kind]), previousSha256: evidence.chain!.at(-1)?.recordSha256 ?? null,
      };
      evidence.chain!.push({ ...chain, recordSha256: rawHash(chain) });
    }
  }
  review.target.payloadSha256 = evidence.chain![2]!.phaseEvidenceSha256;
  if (review.mode === 'behavior-change') {
    review.replacement.greenOrder = 5;
    review.replacement.redPayloadSha256 = evidence.chain![3]!.phaseEvidenceSha256;
    review.replacement.greenPayloadSha256 = evidence.chain![4]!.phaseEvidenceSha256;
  }
  const reviewSha256 = sha256(canonicalBytes(review));
  const requestSha256 = sha256(canonicalBytes({ schemaVersion: 1, operationId: review.operationId,
    scope: review.scope, mode: review.mode, target: review.target, artifactSha256: reviewSha256, approvalSha256: digest('b') }));
  const payload: SourceJournalPayload = {
    schemaVersion: 1, operationId: review.operationId, requestSha256, mode: review.mode, scope: review.scope,
    target: review.target, newFingerprint: review.source.newFingerprint, reviewSha256, approvalSha256: digest('b'),
    source: review.source, snapshot: review.snapshot, pair: review.pair, replacement: review.replacement,
    reason: review.reason, approver: 'fixture-reviewer',
    execution: {
      invocationId: 'record-run', testId: review.scope.testId, command: review.scope.command,
      startedAt: review.preparedAt, completedAt: review.preparedAt, exitCode: 0,
      runnerSha256: review.snapshot.runnerSha256, configSha256: review.snapshot.configSha256,
      environmentSha256: review.snapshot.environmentSha256, reportSha256: digest('a'),
      preSourceSha256: review.source.newFingerprint, postSourceSha256: review.source.newFingerprint,
      preProductionSha256: review.snapshot.productionSha256, postProductionSha256: review.snapshot.productionSha256,
      preInputManifestSha256: digest('a'), postInputManifestSha256: digest('a'),
      outputs: { beforeSha256: digest('b'), afterBuildSha256: digest('c'), afterSha256: digest('d') },
    },
    recordedAt: review.preparedAt, fencing: { change: 1, projection: 1, append: 1 },
  };
  const operationKey = `tdd-source-supersession:${review.changeId}:g${review.scope.generation}:${review.operationId}`;
  const journal = { schemaVersion: 1 as const, order: 1, stream: 'normal' as const, changeId: review.changeId,
    kind: 'tdd-source-supersession', idempotencyKey: operationKey, payload, previousSha256: null };
  const journals = [{ ...journal, recordSha256: sha256(canonicalBytes(journal)) }];
  const projection: SourceProjection = {
    schemaVersion: 1, operationId: review.operationId, operationKey, requestSha256,
    journalSha256: journals[0]!.recordSha256, journalOrder: 1, order: 7, cycleId: 'replacement',
    scope: review.scope, mode: review.mode, target: review.target, newFingerprint: review.source.newFingerprint,
    recordedAt: review.preparedAt, reviewSha256, approvalSha256: payload.approvalSha256, state: 'completed',
  };
  return { evidence, orders, journals, projection, review };
}

async function archivedFixture(root: string): Promise<ReturnType<typeof ledgerFixture>> {
  const { storeSourceBlob, publishSourceFile } = await import('../packages/analysis/src/tdd-source-storage.js');
  const { sourceArtifactPath, inspectSourceEvidence } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { sourceProjection, deriveSourceRequestDigest } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const { sourceOutputs, sourceSnapshotExclusions, sourceEnvironment, sourceEnvironmentFiles } =
    await import('../packages/analysis/src/tdd-source-snapshot.js');
  const { parseConfig, defaultConfig } = await import('../packages/analysis/src/config.js');
  const fixture = ledgerFixture();
  const { review, evidence } = fixture;
  review.scope.repositoryId = canonicalRepositoryIdentity(undefined, root);
  const store = (value: unknown) => storeSourceBlob(root, canonicalBytes(value));
  const current = `/** @id ${review.scope.testId}\n * @verifies ${review.scope.requirementId}\n */\n`
    + `it('${review.scope.testId}', () => { expect(true).toBe(true); });`;
  const oldFingerprint = sha256(Buffer.from(current.replace('expect(true)', 'expect(false)')));
  const newFingerprint = sha256(Buffer.from(current));
  for (const cycle of evidence.cycles) for (const phase of ['red', 'green', 'refactor'] as const) {
    cycle[phase]!.testFingerprint = cycle.cycleId === 'original' ? oldFingerprint : newFingerprint;
  }
  evidence.chain = evidence.chain!.map((record, index, records) => {
    const cycle = evidence.cycles.find((entry) => entry.cycleId === record.cycleId)!;
    const phase = record.phase as 'red' | 'green' | 'refactor';
    const { recordSha256: _old, ...payload } = record;
    payload.phaseEvidenceSha256 = sha256(Buffer.from(JSON.stringify(cycle[phase])));
    payload.previousSha256 = index ? records[index - 1]!.recordSha256 : null;
    const updated = { ...payload, recordSha256: sha256(Buffer.from(JSON.stringify(payload))) };
    records[index] = updated;
    return updated;
  });
  review.target = { ...review.target, oldFingerprint, payloadSha256: evidence.chain[2]!.phaseEvidenceSha256 };
  review.source = { ...review.source, annotationStart: 0, statementEnd: Buffer.byteLength(current),
    currentFileSha256: await storeSourceBlob(root, Buffer.from(current)), newBlockSha256: newFingerprint,
    oldFingerprint, newFingerprint, oldSourceDigest: oldFingerprint, newSourceDigest: newFingerprint };
  if (review.mode !== 'behavior-change') throw new Error('Expected behavior-change fixture.');
  review.replacement = { ...review.replacement, testFingerprint: newFingerprint,
    redPayloadSha256: evidence.chain[3]!.phaseEvidenceSha256,
    greenPayloadSha256: evidence.chain[4]!.phaseEvidenceSha256 };
  const executable = { name: 'node', path: '.musubix-runtime/bin/node',
    sha256: await storeSourceBlob(root, Buffer.from('archived fixture executable')) };
  const emptyEnvironment = await storeSourceBlob(root, Buffer.alloc(0));
  const entries = [
    { path: executable.path, mode: '100755', sha256: executable.sha256, role: 'runner' },
    ...sourceEnvironmentFiles.map((path) => ({ path, mode: '100644', sha256: emptyEnvironment, role: 'environment' })),
    { path: review.scope.path, mode: '100644', sha256: newFingerprint, role: 'test' },
  ].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const environment = { ...sourceEnvironment };
  const runtime = { node: 'fixture-node', versions: {}, platform: 'fixture', architecture: 'fixture',
    executables: [executable], npmVersion: 'fixture-npm', gitVersion: 'fixture-git' };
  const command = parseConfig({ ...defaultConfig, commands: [{
    name: 'test', command: 'node', args: [], timeoutMs: 10_000, required: false,
    tddArgs: ['{testId}', '{reportPath}'],
    tddReport: { format: 'musubix-json', path: '.musubix/cache/{testId}.json' },
  }] }).commands[0]!;
  const binding = {
    manifestSha256: await store({ schemaVersion: 1, kind: 'tdd-source-snapshot', entries,
      excludedPaths: sourceSnapshotExclusions, outputs: sourceOutputs, packages: [], runtime, environment }),
    environmentSha256: await store(environment), runnerSha256: await store({ executable, command, runtime }),
    configSha256: await store({ command, entries: [] }), productionSha256: await store([]),
    head: review.snapshot.head,
  };
  review.snapshot = { ...binding, stateSha256: sha256(canonicalBytes({ schemaVersion: 1, ...binding })) };
  const scope = { changeId: review.changeId, generation: review.scope.generation, operationId: review.operationId };
  const artifactSha256 = sha256(canonicalBytes(review));
  await publishSourceFile(root, sourceArtifactPath(scope), canonicalBytes(review));
  const approval = { schemaVersion: 1, kind: 'tdd-source-approval', ...scope, scope: review.scope,
    mode: review.mode, target: review.target, artifactSha256, approver: 'fixture-reviewer',
    confirmed: true, approvedAt: review.preparedAt };
  const { generation: _generation, ...approvalRecord } = approval;
  const approvalSha256 = sha256(canonicalBytes(approvalRecord));
  await publishSourceFile(root, sourceArtifactPath(scope, 'approval'), canonicalBytes(approvalRecord));
  const oldJournal = fixture.journals[0]!;
  const prior = oldJournal.payload as SourceJournalPayload;
  const build = await store([{ path: 'dist/packages/cli/src/main.js', mode: '100644', sha256: digest('c') }]);
  const payload: SourceJournalPayload = { ...prior, target: review.target, source: review.source,
    snapshot: review.snapshot, replacement: review.replacement, newFingerprint,
    reviewSha256: artifactSha256, approvalSha256,
    requestSha256: deriveSourceRequestDigest({ operationId: review.operationId, scope: review.scope,
      mode: review.mode, target: review.target, artifactSha256, approvalSha256 }),
    execution: { ...prior.execution!, runnerSha256: binding.runnerSha256, configSha256: binding.configSha256,
      environmentSha256: binding.environmentSha256,
      reportSha256: await store({ schemaVersion: 1, tests: [{ id: review.scope.testId, status: 'passed' }] }),
      preSourceSha256: newFingerprint, postSourceSha256: newFingerprint,
      preProductionSha256: binding.productionSha256, postProductionSha256: binding.productionSha256,
      preInputManifestSha256: sha256(canonicalBytes(entries)), postInputManifestSha256: sha256(canonicalBytes(entries)),
      outputs: { beforeSha256: await store([]), afterBuildSha256: build, afterSha256: build } },
  };
  const { recordSha256: _journalHash, ...journal } = { ...oldJournal, payload };
  const sealed = { ...journal, recordSha256: sha256(canonicalBytes(journal)) };
  fixture.journals = [sealed];
  fixture.projection = sourceProjection(sealed, 7);
  await mkdir(join(root, '.musubix/journal/normal'), { recursive: true });
  await writeFile(join(root, '.musubix/journal/normal/000000000001.json'), canonicalBytes(sealed));
  await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify(evidence));
  await writeFile(join(root, '.musubix/evidence/order.json'), JSON.stringify(fixture.orders));
  await writeFile(join(root, '.musubix/evidence/changes.json'), JSON.stringify({ schemaVersion: 1, changes: [{
    changeId: review.changeId, generation: 5, activeGeneration: 5, requirementIds: [review.scope.requirementId],
  }] }));
  const inspected = await inspectSourceEvidence(root, evidence);
  if (!inspected.valid) throw new Error(JSON.stringify(inspected.diagnostics));
  return fixture;
}

/** @id TEST-M5-SOURCE-SCHEMA-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-SCHEMA-001 rejects unknown source versions, unsafe paths and mismatched top-level ownership', async () => {
  const { validateSourceReview } = await import('../packages/analysis/src/tdd-source-ledger.js');
  for (const value of [
    null,
    {},
    { schemaVersion: 2, kind: 'tdd-source-review' },
    { schemaVersion: 1, kind: 'tdd-source-review', changeId: 'CHANGE-0017',
      scope: { changeId: 'CHANGE-0018', path: '../test.ts' } },
  ]) {
    expect(validateSourceReview(value).valid).toBe(false);
    expect(validateSourceReview(value).diagnostics[0]?.code).toBe('TDD_SOURCE_APPROVAL_INVALID');
  }
});

/** @id TEST-M5-SOURCE-BINDING-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-BINDING-001 accepts canonical candidate bindings and rejects cross-scope or disconnected review evidence', async () => {
  const { validateSourceReview, validateSourceApproval } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const review = reviewFixture();
  expect(validateSourceReview(review)).toMatchObject({ valid: true, diagnostics: [] });
  for (const candidate of [
    { ...review.scope.candidate, generation: 4 },
    { ...review.scope.candidate, repositoryId: 'another-repository' },
    { ...review.scope.candidate, changeId: 'CHANGE-0018' },
    { ...review.scope.candidate, gateInputFingerprint: digest('a') },
    { ...review.scope.candidate, baseCommit: 'invalid' },
  ]) expect(validateSourceReview({ ...review, scope: { ...review.scope, candidate } }).valid).toBe(false);
  expect(validateSourceReview({ ...review, replacement: { ...review.replacement, redOrder: 7 } }).valid).toBe(false);
  expect(validateSourceReview({ ...review, replacement: { ...review.replacement, redOrder: 2 } }).valid).toBe(false);
  expect(validateSourceReview({ ...review, replacement: { ...review.replacement, testFingerprint: digest('a') } }).valid).toBe(false);
  expect(validateSourceReview({ ...review, replacement: { ...review.replacement, cycleId: review.target.cycleId } }).valid).toBe(false);
  const approval = {
    schemaVersion: 1, kind: 'tdd-source-approval', changeId: review.changeId, operationId: review.operationId,
    scope: review.scope, mode: review.mode, target: review.target, artifactSha256: digest('a'),
    approver: 'fixture-reviewer', confirmed: true, approvedAt: '2026-09-27T01:00:00.000Z',
  };
  expect(validateSourceApproval(approval, review, digest('a'))).toBe(true);
  expect(validateSourceApproval({ ...approval, changeId: 'CHANGE-0018' }, review, digest('a'))).toBe(false);
  expect(validateSourceApproval({ ...approval, artifactSha256: digest('b') }, review, digest('a'))).toBe(false);
});

/** @id TEST-M5-SOURCE-LEDGER-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-LEDGER-001 recognizes only journal-first recoverable prefixes and a single linked atomic terminal', async () => {
  const { classifySourceLedger, sourceTerminalChainRecord } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const { evidence, orders, journals, projection } = ledgerFixture();
  const inspect = () => classifySourceLedger(evidence, journals, orders);
  expect(inspect()).toMatchObject({ valid: true, operations: [{ state: 'pending', order: null }] });
  const original = JSON.stringify(evidence);
  const order = { sequence: 7, kind: 'tdd' as const, entityId: projection.operationId,
    phase: `g5:source-supersession:${projection.scope.changeId}`, testId: projection.scope.testId,
    previousSha256: orders.records.at(-1)!.recordSha256 };
  orders.records.push({ ...order, recordSha256: sha256(Buffer.from(JSON.stringify(order))) });
  expect(inspect()).toMatchObject({ valid: true, operations: [{ state: 'pending', order: 7 }] });
  expect(JSON.stringify(evidence)).toBe(original);
  const chain = sourceTerminalChainRecord(evidence, projection);
  evidence.chain!.push(chain);
  expect(inspect()).toMatchObject({ valid: false, diagnostics: [{ code: 'TDD_SOURCE_LEDGER_INVALID' }] });
  evidence.sourceSupersessions = [projection];
  expect(inspect()).toMatchObject({ valid: true, operations: [{ state: 'completed', order: 7 }] });
  expect(chain.phaseEvidenceSha256).toBe(sha256(canonicalBytes(projection)));
  expect(Object.keys(chain)).toEqual([
    'sequence', 'cycleId', 'changeId', 'generation', 'requirementId', 'testId', 'testPath', 'commandName',
    'phase', 'operationKey', 'phaseEvidenceSha256', 'previousSha256', 'recordSha256',
  ]);
  const completed = JSON.stringify(evidence);
  inspect(); inspect();
  expect(JSON.stringify(evidence)).toBe(completed);
  evidence.chain!.pop();
  expect(inspect().valid).toBe(false);
  evidence.chain!.push(chain);
  projection.requestSha256 = digest('0');
  expect(inspect().valid).toBe(false);
  projection.requestSha256 = (journals[0]!.payload as SourceJournalPayload).requestSha256;
  expect(inspect().valid).toBe(true);
  (journals[0]!.payload as SourceJournalPayload).fencing.append = 0;
  expect(inspect().valid).toBe(false);
});

/** @id TEST-M5-SOURCE-SEAL-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-SEAL-001 rejects internally disconnected pair reports, clocks, snapshots and inputs before approval', async () => {
  const { validateSourceReview } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const fixture = ledgerFixture();
  const base = (fixture.journals[0]!.payload as SourceJournalPayload).execution!;
  const review: SourceReview = {
    ...fixture.review, mode: 'test-only', replacement: null,
    source: { ...fixture.review.source, oldBlockSha256: digest('a') },
    pair: {
      manifestSha256: digest('b'), oldReportSha256: base.reportSha256, newReportSha256: base.reportSha256,
      oldRun: { ...base, invocationId: 'old', preSourceSha256: fixture.review.target.oldFingerprint,
        postSourceSha256: fixture.review.target.oldFingerprint },
      newRun: { ...base, invocationId: 'new' },
    },
  };
  expect(validateSourceReview(review).valid).toBe(true);
  for (const newRun of [
    { ...review.pair.newRun, testId: 'TEST-FOREIGN-001' },
    { ...review.pair.newRun, invocationId: 'old' },
    { ...review.pair.newRun, runnerSha256: digest('0') },
    { ...review.pair.newRun, postSourceSha256: digest('0') },
    { ...review.pair.newRun, postInputManifestSha256: digest('0') },
    { ...review.pair.newRun, reportSha256: digest('0') },
    { ...review.pair.newRun, startedAt: '2026-09-28T00:00:00.000Z' },
    { ...review.pair.newRun, outputs: { ...review.pair.newRun.outputs, afterBuildSha256: digest('0') } },
  ]) expect(validateSourceReview({ ...review, pair: { ...review.pair, newRun } }).valid).toBe(false);
});

/** @id TEST-M5-SOURCE-ARTIFACT-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-ARTIFACT-001 binds raw pair splice, exact hunks, selected reports and complete output inventories', async () => {
  const { verifySourcePairBlobs } = await import('../packages/analysis/src/tdd-source-artifacts.js');
  const { storeSourceBlob } = await import('../packages/analysis/src/tdd-source-storage.js');
  const { spliceCanonicalTestBlock, sourceReviewHunks } = await import('../packages/analysis/src/tdd-source-review.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-artifact-'));
  try {
    const store = (value: unknown) => storeSourceBlob(root, canonicalBytes(value));
    const fixture = ledgerFixture();
    const old = '/** @id TEST-SOURCE-FIXTURE-001\n * @verifies REQ-M5-LIFECYCLE-006\n */\n'
      + "it('TEST-SOURCE-FIXTURE-001', () => { const started = Date.now(); expect(Date.now() - started).toBeLessThan(10_000); });";
    const current = old.replaceAll('Date.now()', 'performance.now()');
    const oldFingerprint = sha256(Buffer.from(old));
    const node = { id: fixture.review.scope.testId, path: fixture.review.scope.path, line: 1 };
    const splice = spliceCanonicalTestBlock(node, current, old, oldFingerprint);
    const oldHash = await storeSourceBlob(root, Buffer.from(old));
    const newHash = await storeSourceBlob(root, Buffer.from(current));
    const emptyHash = await storeSourceBlob(root, Buffer.alloc(0));
    const entries = [{ path: node.path, mode: '100644' as const, sha256: newHash, role: 'test' as const }];
    const emptyInventory = await store([]);
    const build = [{ path: 'dist/packages/cli/src/main.js', mode: '100644', sha256: digest('a') }];
    const buildInventory = await store(build);
    const report = await store({ schemaVersion: 1, tests: [{ id: node.id, status: 'passed' }] });
    const source = { ...fixture.review.source, annotationStart: 0, statementEnd: Buffer.byteLength(current),
      currentFileSha256: newHash, newBlockSha256: newHash, oldBlockSha256: oldHash,
      oldFingerprint, newFingerprint: splice.newFingerprint, oldSourceDigest: oldFingerprint, newSourceDigest: splice.newFingerprint };
    const run = (variant: 'old' | 'new') => {
      const fingerprint = variant === 'old' ? oldFingerprint : splice.newFingerprint;
      const inputs = sha256(canonicalBytes([{ ...entries[0], sha256: variant === 'old' ? oldHash : newHash }]));
      return { ...(fixture.journals[0]!.payload as SourceJournalPayload).execution!, invocationId: variant,
        reportSha256: report, preSourceSha256: fingerprint, postSourceSha256: fingerprint,
        preInputManifestSha256: inputs, postInputManifestSha256: inputs,
        outputs: { beforeSha256: emptyInventory, afterBuildSha256: buildInventory, afterSha256: buildInventory } };
    };
    const review: SourceReview = { ...fixture.review, mode: 'test-only', replacement: null, source,
      target: { ...fixture.review.target, oldFingerprint },
      hunks: sourceReviewHunks(old, current).map((coordinates) => ({ ...coordinates,
        requirementIds: [fixture.review.scope.requirementId], assertion: 'elapsed < 10000ms',
        threshold: '10000ms', failureSemantics: 'same duration limit', equivalenceRationale: 'monotonic elapsed',
        supportingBlobSha256s: [] })),
      pair: {
        manifestSha256: await store({ schemaVersion: 1, kind: 'tdd-source-pair', nodeId: node.id, path: node.path,
          annotationStart: 0, oldStatementEnd: Buffer.byteLength(old), newStatementEnd: Buffer.byteLength(current),
          oldBlockSha256: oldHash, newBlockSha256: newHash, oldFingerprint, newFingerprint: splice.newFingerprint,
          prefix: { sha256: emptyHash, length: 0 }, suffix: { sha256: emptyHash, length: 0 } }),
        oldReportSha256: report, newReportSha256: report, oldRun: run('old'), newRun: run('new'),
      },
    };
    await expect(verifySourcePairBlobs(root, review, { entries })).resolves.toBeUndefined();
    await expect(verifySourcePairBlobs(root, { ...review, hunks: [] }, { entries })).rejects.toThrow(/equivalence-unconfirmed/);
    const failed = await store({ schemaVersion: 1, tests: [{ id: node.id, status: 'failed' }] });
    const pair = { ...review.pair, newReportSha256: failed, newRun: { ...review.pair.newRun, reportSha256: failed } };
    await expect(verifySourcePairBlobs(root, { ...review, pair }, { entries })).rejects.toThrow(/report-invalid/);
    await expect(verifySourcePairBlobs(root, review, { entries: [{ ...entries[0]!, sha256: oldHash }] }))
      .rejects.toThrow(/blob-hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-SUFFIX-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-SUFFIX-001 resumes a durable journal into one order and atomic terminal with byte-neutral replay', async () => {
  const { completeSourceSuffix } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { withTddWriteLeaseSet } = await import('../packages/analysis/src/journal.js');
  const { appendEvidenceOrder } = await import('../packages/analysis/src/order.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-suffix-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    const fixture = ledgerFixture();
    await mkdir(join(root, '.musubix/evidence'), { recursive: true });
    await mkdir(join(root, '.musubix/journal/normal'), { recursive: true });
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify(fixture.evidence));
    await writeFile(join(root, '.musubix/evidence/order.json'), JSON.stringify(fixture.orders));
    await writeFile(join(root, '.musubix/journal/normal/000000000001.json'), canonicalBytes(fixture.journals[0]));
    const complete = () => withTddWriteLeaseSet(root, ['CHANGE-0017'], (leases) =>
      completeSourceSuffix(root, fixture.journals[0]!, leases));
    const result = await complete();
    expect(result).toMatchObject({ state: 'completed', order: 7, journalOrder: 1, operationId: fixture.review.operationId });
    const tddPath = join(root, '.musubix/evidence/tdd.json');
    const bytes = await readFile(tddPath);
    const ledger = JSON.parse(bytes.toString()) as TddEvidence;
    expect(ledger.sourceSupersessions).toHaveLength(1);
    expect(ledger.chain).toHaveLength(7);
    expect(ledger.cycles).toEqual(fixture.evidence.cycles);
    await appendEvidenceOrder(root, { kind: 'change', entityId: 'CHANGE-0018', phase: 'g1:impact' });
    const orderPath = join(root, '.musubix/evidence/order.json');
    const orders = await readFile(orderPath);
    expect(await complete()).toEqual(result);
    expect(await complete()).toEqual(result);
    expect(await readFile(tddPath)).toEqual(bytes);
    expect(await readFile(orderPath)).toEqual(orders);
    expect(await readFile(join(root, '.musubix/journal/normal/000000000001.json')))
      .toEqual(canonicalBytes(fixture.journals[0]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-CONFLICT-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-CONFLICT-001 limits pending conflicts to exact test scope or explicit targets and returns resumable identity', async () => {
  const { classifySourceLedger, sourceConflict } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const fixture = ledgerFixture();
  const ledger = classifySourceLedger(fixture.evidence, fixture.journals, fixture.orders);
  const scope = fixture.review.scope;
  const conflict = sourceConflict(ledger, scope);
  expect(conflict?.code).toBe('TDD_SOURCE_PENDING');
  expect(conflict?.details).toMatchObject({
    reason: 'same-test-writer', operationId: fixture.review.operationId, testId: scope.testId,
    targetCycleId: fixture.review.target.cycleId,
    requestSha256: (fixture.journals[0]!.payload as SourceJournalPayload).requestSha256,
    artifactSha256: sha256(canonicalBytes(fixture.review)),
  });
  expect(conflict?.details.resumeArgs).toEqual([
    'tdd', 'source-supersession', 'resume', '--change', scope.changeId, '--generation', '5',
    '--operation-id', fixture.review.operationId, '--request-sha256',
    (fixture.journals[0]!.payload as SourceJournalPayload).requestSha256,
  ]);
  for (const foreign of [
    { ...scope, repositoryId: 'other' }, { ...scope, changeId: 'CHANGE-0018' },
    { ...scope, generation: 6 }, { ...scope, testId: 'TEST-OTHER-001' },
  ]) expect(sourceConflict(ledger, foreign)).toBeNull();
  expect(sourceConflict(ledger, { ...scope, requirementId: 'REQ-OTHER-001' })?.code).toBe('TDD_SOURCE_PENDING');
  expect(sourceConflict(ledger, null, [fixture.review.target.cycleId])?.details.reason).toBe('explicit-target-conflict');
  expect(sourceConflict(ledger, scope, [], fixture.journals[0]!.idempotencyKey)).toBeNull();
});

/** @id TEST-M5-SOURCE-PREREQUISITES-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-PREREQUISITES-001 reads canonical exact-owner reviews and dedicated approvals without accepting missing or foreign human evidence', async () => {
  const { readSourceReview, readSourceApproval } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-prerequisites-'));
  try {
    const review = reviewFixture();
    const scope = { changeId: review.changeId, generation: review.scope.generation, operationId: review.operationId };
    const directory = join(root, '.musubix/evidence/tdd-source/v1', scope.changeId, 'g5', scope.operationId);
    const hash = sha256(canonicalBytes(review));
    await mkdir(directory, { recursive: true });
    await expect(readSourceReview(root, scope, hash)).rejects.toThrow(/review-missing/);
    await writeFile(join(directory, 'artifact.json'), canonicalBytes(review));
    expect(await readSourceReview(root, scope, hash)).toEqual(review);
    await expect(readSourceReview(root, scope, digest('0'))).rejects.toThrow(/review-hash/);
    await expect(readSourceApproval(root, scope, review, hash, digest('0'))).rejects.toThrow(/approval-missing/);
    const approval = { schemaVersion: 1, kind: 'tdd-source-approval', changeId: review.changeId,
      operationId: review.operationId, scope: review.scope, mode: review.mode, target: review.target,
      artifactSha256: hash, approver: 'fixture-human', confirmed: true, approvedAt: review.preparedAt };
    await writeFile(join(directory, 'approval.json'), canonicalBytes(approval));
    expect(await readSourceApproval(root, scope, review, hash, sha256(canonicalBytes(approval)))).toEqual(approval);
    const foreign = { ...approval, changeId: 'CHANGE-0018' };
    await writeFile(join(directory, 'approval.json'), canonicalBytes(foreign));
    await expect(readSourceApproval(root, scope, review, hash, sha256(canonicalBytes(foreign))))
      .rejects.toThrow(/approval-binding/);
    expect(await readFile(join(directory, 'artifact.json'))).toEqual(canonicalBytes(review));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-INTEGRITY-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-INTEGRITY-001 refuses journal authority without its hash-bound dedicated review and approval prerequisites', async () => {
  const { inspectSourceEvidence } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-integrity-'));
  try {
    const fixture = ledgerFixture();
    const inspect = () => inspectSourceEvidence(root, fixture.evidence, fixture.journals, fixture.orders);
    expect(await inspect()).toMatchObject({ valid: false,
      diagnostics: [{ code: 'TDD_SOURCE_APPROVAL_INVALID', details: { reason: 'review-missing' } }] });
    const directory = join(root, '.musubix/evidence/tdd-source/v1/CHANGE-0017/g5', fixture.review.operationId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'artifact.json'), canonicalBytes(fixture.review));
    expect(await inspect()).toMatchObject({ valid: false,
      diagnostics: [{ code: 'TDD_SOURCE_APPROVAL_INVALID', details: { reason: 'approval-missing' } }] });
    const foreign = { ...fixture.review, changeId: 'CHANGE-0018' };
    await writeFile(join(directory, 'artifact.json'), canonicalBytes(foreign));
    expect(await inspect()).toMatchObject({ valid: false,
      diagnostics: [{ code: 'TDD_SOURCE_APPROVAL_INVALID', details: { reason: 'review-hash' } }] });
    expect(fixture.orders.records).toHaveLength(6);
    expect(fixture.evidence.sourceSupersessions).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-CURRENCY-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023 DES-M5-TDD-005
 */
it('TEST-M5-SOURCE-CURRENCY-001 selects verified source terminals by order without falling back within an excluded cycle', async () => {
  const { selectSourceAwareTddCurrency, sourceTerminalSelectors } = await import('../packages/analysis/src/tdd.js');
  const { classifySourceLedger, sourceTerminalChainRecord } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const fixture = ledgerFixture();
  const { evidence, orders, journals, projection } = fixture;
  const order = { sequence: 7, kind: 'tdd' as const, entityId: projection.operationId,
    phase: 'g5:source-supersession:CHANGE-0017', testId: projection.scope.testId,
    previousSha256: orders.records.at(-1)!.recordSha256 };
  orders.records.push({ ...order, recordSha256: sha256(Buffer.from(JSON.stringify(order))) });
  evidence.chain!.push(sourceTerminalChainRecord(evidence, projection));
  evidence.sourceSupersessions = [projection];
  const ledger = classifySourceLedger(evidence, journals, orders);
  const selected = selectSourceAwareTddCurrency(evidence, orders, ledger, projection.scope.testId);
  expect(selected).toMatchObject({ cycle: { cycleId: 'replacement' }, order: 7, fingerprint: projection.newFingerprint });
  expect(selectSourceAwareTddCurrency(evidence, orders, ledger, projection.scope.testId, 7))
    .toMatchObject({ cycle: { cycleId: 'original' }, order: 3 });
  const selectors = sourceTerminalSelectors(evidence, orders, ledger);
  expect(selectors.map((selector) => selector.terminalOrder)).toEqual([2, 3, 5, 6, 7]);
  expect(selectors.at(-1)).toMatchObject({
    terminalKind: 'source-supersession', terminalSha256: sha256(canonicalBytes(projection)),
    oldFingerprint: projection.newFingerprint, requirementId: projection.scope.requirementId,
    command: projection.scope.command, changeId: projection.scope.changeId, generation: 5,
  });
  expect(selectors.at(-1)!.cliArgs).toContain('source-supersession');
  expect(selectors.at(-1)!.cliArgs).toContain(sha256(canonicalBytes(projection)));
  expect(evidence.cycles).toHaveLength(2);
});

/** @id TEST-M5-SOURCE-READ-MODELS-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-023
 */
it('TEST-M5-SOURCE-READ-MODELS-001 exposes scoped pending guidance and always-present gate, status and TDD source arrays', async () => {
  const { tddSourceReadProjection, validateTddEvidence } = await import('../packages/analysis/src/tdd.js');
  const { classifySourceLedger } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const { projectStatus, runGate } = await import('../packages/analysis/src/gate.js');
  const { defaultConfig } = await import('../packages/analysis/src/config.js');
  const fixture = ledgerFixture();
  const source = classifySourceLedger(fixture.evidence, fixture.journals, fixture.orders);
  const active = tddSourceReadProjection(fixture.evidence, fixture.orders, source, () => true);
  expect(active.sourceSupersessions[0]).toMatchObject({
    state: 'pending', selectionReason: 'pending-suffix', terminalSelector: null,
    order: null, requestSha256: (fixture.journals[0]!.payload as SourceJournalPayload).requestSha256,
  });
  expect(active.sourceSupersessions[0]!.resumeArgs).toContain(fixture.review.operationId);
  expect(active.diagnostics[0]).toMatchObject({ code: 'TDD_SOURCE_PENDING', details: { reason: 'completion-required' } });
  const historical = tddSourceReadProjection(fixture.evidence, fixture.orders, source, () => false);
  expect(historical.sourceSupersessions[0]).toMatchObject({ selectionReason: 'outside-scope', resumeArgs: null });
  expect(historical.diagnostics).toEqual([]);
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-read-model-'));
  try {
    for (const report of [await validateTddEvidence(root), await projectStatus(root)]) {
      expect(report.sourceSupersessions).toEqual([]);
      expect(report.sourceTerminalSelectors).toEqual([]);
    }
    await mkdir(join(root, '.musubix'), { recursive: true });
    await writeFile(join(root, '.musubix/config.json'), JSON.stringify(defaultConfig));
    const gate = await runGate(root);
    expect(gate.sourceSupersessions).toEqual([]);
    expect(gate.sourceTerminalSelectors).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-WRITER-GUARD-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-WRITER-GUARD-001 applies source integrity before ordinary TDD mutations and preserves the typed CLI exit', async () => {
  const { runTddPhase, voidTddCycle } = await import('../packages/analysis/src/tdd.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-writer-guard-'));
  try {
    const fixture = ledgerFixture();
    await mkdir(join(root, '.musubix/evidence'), { recursive: true });
    await mkdir(join(root, '.musubix/journal/normal'), { recursive: true });
    const bytes = JSON.stringify(fixture.evidence);
    await writeFile(join(root, '.musubix/evidence/tdd.json'), bytes);
    await writeFile(join(root, '.musubix/evidence/order.json'), JSON.stringify(fixture.orders));
    await writeFile(join(root, '.musubix/journal/normal/000000000001.json'), canonicalBytes(fixture.journals[0]));
    const id = fixture.review.scope.testId;
    await expect(runTddPhase(root, 'red', id, fixture.review.scope.requirementId, 'test'))
      .rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID: review-missing/);
    await expect(voidTddCycle(root, id, 'fixture-reviewer', 'fixture operation'))
      .rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID: review-missing/);
    const result = spawnSync('npx', ['musubix5', 'tdd', 'red', id, '--requirement',
      fixture.review.scope.requirementId, '--command', 'test', '--root', root, '--json'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: {
      code: 'TDD_SOURCE_APPROVAL_INVALID', details: { reason: 'review-missing' },
    } });
    expect(await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8')).toBe(bytes);
    expect(JSON.parse(await readFile(join(root, '.musubix/evidence/order.json'), 'utf8')).records).toHaveLength(6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-WRITER-SCOPE-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-WRITER-SCOPE-001 rejects exact pending test and target mutations without blocking unrelated writers', async () => {
  const { requireSourceWriterAllowed } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { classifySourceLedger } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const fixture = ledgerFixture();
  const ledger = classifySourceLedger(fixture.evidence, fixture.journals, fixture.orders);
  expect(() => requireSourceWriterAllowed(ledger, fixture.review.scope)).toThrow(/TDD_SOURCE_PENDING: same-test-writer/);
  for (const scope of [
    null, { ...fixture.review.scope, testId: 'TEST-UNRELATED-001' },
    { ...fixture.review.scope, generation: 4 }, { ...fixture.review.scope, changeId: 'CHANGE-0018' },
  ]) expect(() => requireSourceWriterAllowed(ledger, scope)).not.toThrow();
  for (const cycleId of ['original', 'replacement']) {
    expect(() => requireSourceWriterAllowed(ledger, null, [cycleId]))
      .toThrow(/TDD_SOURCE_PENDING: explicit-target-conflict/);
  }
  expect(() => requireSourceWriterAllowed({ ...ledger, valid: false, diagnostics: [{
    code: 'TDD_SOURCE_LEDGER_INVALID', severity: 'error', message: 'projection-mismatch',
    details: { operationId: null, scope: null, target: null, reason: 'projection-mismatch' },
  }] }, null)).toThrow(/TDD_SOURCE_LEDGER_INVALID/);
});

/** @id TEST-M5-SOURCE-SCOPED-DIGEST-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-022 DES-M5-023
 */
it('TEST-M5-SOURCE-SCOPED-DIGEST-001 changes only the completed relevant digest while preserving legacy and pending hashes', async () => {
  const { scopedTddEvidenceDigest } = await import('../packages/analysis/src/tdd.js');
  const { classifySourceLedger, sourceTerminalChainRecord } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const fixture = ledgerFixture();
  const { evidence, orders, journals, projection, review } = fixture;
  const legacy = sha256(canonicalBytes({
    cycles: [...evidence.cycles].sort((a, b) => a.cycleId!.localeCompare(b.cycleId!)), chain: evidence.chain,
  }));
  const selected = [review.scope.requirementId];
  const digestFor = (requirements = selected) => scopedTddEvidenceDigest(
    evidence, classifySourceLedger(evidence, journals, orders), review.changeId, review.scope.generation, requirements,
  );
  expect(digestFor()).toBe(legacy);
  const unrelated = digestFor(['REQ-UNRELATED-001']);
  const order = { sequence: 7, kind: 'tdd' as const, entityId: review.operationId,
    phase: 'g5:source-supersession:CHANGE-0017', testId: review.scope.testId,
    previousSha256: orders.records.at(-1)!.recordSha256 };
  orders.records.push({ ...order, recordSha256: sha256(Buffer.from(JSON.stringify(order))) });
  expect(digestFor()).toBe(legacy);
  evidence.chain!.push(sourceTerminalChainRecord(evidence, projection));
  evidence.sourceSupersessions = [projection];
  const completed = digestFor();
  expect(completed).not.toBe(legacy);
  expect(completed).toBe(sha256(canonicalBytes({
    cycles: [...evidence.cycles].sort((a, b) => a.cycleId!.localeCompare(b.cycleId!)),
    chain: evidence.chain, sourceSupersessions: [projection],
  })));
  expect(digestFor(['REQ-UNRELATED-001'])).toBe(unrelated);
  expect(digestFor()).toBe(completed);
  evidence.sourceSupersessions[0] = { ...projection, newFingerprint: digest('0') };
  expect(() => digestFor()).toThrow(/TDD_SOURCE_LEDGER_INVALID/);
});

/** @id TEST-M5-SOURCE-CHAIN-ORDER-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-CHAIN-ORDER-001 rejects reordered and rehashed source-chain keys without changing legacy chain hashing', async () => {
  const { classifySourceLedger, sourceTerminalChainRecord } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const { evidence, orders, journals, projection, review } = ledgerFixture();
  const original = JSON.stringify(evidence.chain);
  const order = { sequence: 7, kind: 'tdd' as const, entityId: review.operationId,
    phase: 'g5:source-supersession:CHANGE-0017', testId: review.scope.testId,
    previousSha256: orders.records.at(-1)!.recordSha256 };
  orders.records.push({ ...order, recordSha256: sha256(Buffer.from(JSON.stringify(order))) });
  const chain = sourceTerminalChainRecord(evidence, projection);
  evidence.sourceSupersessions = [projection];
  evidence.chain!.push(chain);
  expect(classifySourceLedger(evidence, journals, orders).valid).toBe(true);
  const { recordSha256: _hash, sequence, ...rest } = chain;
  const reordered = { ...rest, sequence };
  evidence.chain![6] = { ...reordered, recordSha256: sha256(Buffer.from(JSON.stringify(reordered))) };
  expect(classifySourceLedger(evidence, journals, orders)).toMatchObject({
    valid: false, diagnostics: [{ code: 'TDD_SOURCE_LEDGER_INVALID', details: { reason: 'chain-linkage' } }],
  });
  const { recordSha256, ...payload } = chain;
  evidence.chain![6] = { recordSha256, ...payload };
  expect(classifySourceLedger(evidence, journals, orders)).toMatchObject({
    valid: false, diagnostics: [{ code: 'TDD_SOURCE_LEDGER_INVALID', details: { reason: 'chain-linkage' } }],
  });
  expect(JSON.stringify(evidence.chain!.slice(0, 6))).toBe(original);
});

/** @id TEST-M5-SOURCE-ACTIVE-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-005 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-ACTIVE-001 requires explicit current generation before source replay lookup and performs no writes', async () => {
  const { replaySourceSupersession } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { readdir } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-active-'));
  const scope = { changeId: 'CHANGE-0017', generation: 5, operationId: 'replay-fixture', requestSha256: digest('a') };
  try {
    await mkdir(join(root, '.musubix/evidence'), { recursive: true });
    const path = join(root, '.musubix/evidence/changes.json');
    for (const activeGeneration of [null, 4]) {
      const bytes = JSON.stringify({ schemaVersion: 1, changes: [{
        changeId: scope.changeId, generation: 5, activeGeneration, requirementIds: ['REQ-M5-LIFECYCLE-006'],
      }] });
      await writeFile(path, bytes);
      await expect(replaySourceSupersession(root, scope)).rejects.toThrow(/CHANGE_GENERATION_PHASE/);
      expect(await readFile(path, 'utf8')).toBe(bytes);
      expect(await readdir(join(root, '.musubix/evidence'))).toEqual(['changes.json']);
    }
    await writeFile(path, JSON.stringify({ schemaVersion: 1, changes: [{
      changeId: scope.changeId, generation: 5, activeGeneration: 5, requirementIds: ['REQ-M5-LIFECYCLE-006'],
    }] }));
    await expect(replaySourceSupersession(root, scope)).rejects.toThrow(/TDD_SOURCE_REPLAY_INVALID: unknown-operation/);
    await expect(replaySourceSupersession(root, { ...scope, requestSha256: 'invalid' }))
      .rejects.toThrow(/CLI_ERROR: invalid-selector/);
    expect(await readdir(join(root, '.musubix/evidence'))).toEqual(['changes.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-RESUME-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-005 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-RESUME-001 completes archived admission without current source and replays identical immutable results', async () => {
  const { resumeSourceSupersession, replaySourceSupersession } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-resume-'));
  try {
    const fixture = await archivedFixture(root);
    const request = { changeId: fixture.review.changeId, generation: 5, operationId: fixture.review.operationId,
      requestSha256: (fixture.journals[0]!.payload as SourceJournalPayload).requestSha256 };
    await expect(replaySourceSupersession(root, request)).rejects.toThrow(/TDD_SOURCE_REPLAY_INVALID: not-completed/);
    const result = await resumeSourceSupersession(root, request);
    expect(result).toMatchObject({ state: 'completed', order: 7, journalOrder: 1 });
    const files = ['tdd.json', 'order.json'];
    const before = await Promise.all(files.map((path) => readFile(join(root, '.musubix/evidence', path), 'utf8')));
    expect(await resumeSourceSupersession(root, request)).toEqual(result);
    expect(await replaySourceSupersession(root, request)).toEqual(result);
    expect(await Promise.all(files.map((path) => readFile(join(root, '.musubix/evidence', path), 'utf8')))).toEqual(before);
    await expect(replaySourceSupersession(root, { ...request, requestSha256: digest('0') }))
      .rejects.toThrow(/TDD_SOURCE_REPLAY_INVALID: request-mismatch/);
    await writeFile(join(root, '.musubix/evidence/changes.json'), JSON.stringify({ schemaVersion: 1, changes: [{
      changeId: request.changeId, generation: 5, activeGeneration: null, requirementIds: [fixture.review.scope.requirementId],
    }] }));
    await expect(resumeSourceSupersession(root, request)).rejects.toThrow(/CHANGE_GENERATION_PHASE/);
    await expect(replaySourceSupersession(root, request)).rejects.toThrow(/CHANGE_GENERATION_PHASE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-BOUNDARY-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-BOUNDARY-001 verifies archived behavior-change fingerprints and exact annotation-to-statement boundaries', async () => {
  const { verifySourceReviewBlobs } = await import('../packages/analysis/src/tdd-source-artifacts.js');
  const { readSourceBlob, storeSourceBlob } = await import('../packages/analysis/src/tdd-source-storage.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-boundary-'));
  try {
    const { review } = await archivedFixture(root);
    if (review.mode !== 'behavior-change') throw new Error('Expected behavior-change fixture.');
    await expect(verifySourceReviewBlobs(root, review)).resolves.toBeDefined();
    await expect(verifySourceReviewBlobs(root, { ...review,
      source: { ...review.source, newFingerprint: digest('0'), newSourceDigest: digest('0') },
      replacement: { ...review.replacement, testFingerprint: digest('0') },
    })).rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID: blob-hash/);
    const bytes = await readSourceBlob(root, review.source.currentFileSha256);
    await expect(verifySourceReviewBlobs(root, { ...review, source: { ...review.source,
      annotationStart: 1, newBlockSha256: await storeSourceBlob(root, bytes.subarray(1)),
    } })).rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID: blob-hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-TARGET-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-TARGET-001 admits exact current terminals or independent replacement cycles without granting historical credit', async () => {
  const { selectSourceAdmissionTarget } = await import('../packages/analysis/src/tdd.js');
  const { classifySourceLedger } = await import('../packages/analysis/src/tdd-source-ledger.js');
  const { evidence, orders, review } = ledgerFixture();
  const source = classifySourceLedger(evidence, [], orders);
  const request = {
    changeId: review.changeId, generation: 5, operationId: 'admission-fixture',
    testId: review.scope.testId, requirementId: review.scope.requirementId, command: review.scope.command,
    target: review.target, mode: 'behavior-change' as const, reason: 'Independent replacement',
    replacementCycleId: 'replacement',
  };
  const select = (input = request, scope = review.scope, fingerprint = review.source.newFingerprint) =>
    selectSourceAdmissionTarget(evidence, orders, source, input, scope, fingerprint);
  expect(select()).toMatchObject({ cycle: { cycleId: 'original' }, replacement: { cycleId: 'replacement' } });
  for (const input of [
    { ...request, target: { ...request.target, oldFingerprint: digest('0') } },
    { ...request, target: { ...request.target, payloadSha256: digest('0') } },
    { ...request, replacementCycleId: 'original' },
    { ...request, replacementCycleId: 'missing' },
  ]) expect(() => select(input)).toThrow(/TDD_SOURCE_ADMISSION_INVALID/);
  expect(() => select(request, { ...review.scope, generation: 4 })).toThrow(/foreign-target/);
  expect(() => select(request, review.scope, review.target.oldFingerprint)).toThrow(/unchanged-fingerprint/);
  const target = { cycleId: 'replacement', kind: 'refactor' as const, order: 6,
    payloadSha256: evidence.chain![5]!.phaseEvidenceSha256, oldFingerprint: review.source.newFingerprint };
  const testOnly = { ...request, mode: 'test-only' as const, target, replacementCycleId: undefined };
  expect(selectSourceAdmissionTarget(evidence, orders, source, testOnly, review.scope, digest('a')))
    .toMatchObject({ cycle: { cycleId: 'replacement' }, replacement: null });
  expect(() => selectSourceAdmissionTarget(evidence, orders, source,
    { ...testOnly, target: review.target }, review.scope, digest('a'))).toThrow(/target-not-selected/);
  expect(JSON.stringify(evidence)).not.toContain('sourceSupersessions');
  expect(orders.records).toHaveLength(6);
});

/** @id TEST-M5-SOURCE-PENDING-WRITER-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-PENDING-WRITER-001 blocks the pending test while a runner-free unrelated write and sealed resume remain viable', async () => {
  const { runTddPhase } = await import('../packages/analysis/src/tdd.js');
  const { resumeSourceSupersession } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const { readSourceBlob } = await import('../packages/analysis/src/tdd-source-storage.js');
  const { withTddWriteLeaseSet } = await import('../packages/analysis/src/journal.js');
  const { defaultConfig } = await import('../packages/analysis/src/config.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-pending-writer-'));
  try {
    const fixture = await archivedFixture(root);
    const scope = fixture.review.scope;
    await mkdir(join(root, 'tests'));
    await writeFile(join(root, scope.path), await readSourceBlob(root, fixture.review.source.currentFileSha256));
    const other = 'TEST-SOURCE-UNRELATED-001';
    await writeFile(join(root, 'tests/unrelated.test.ts'),
      `/** @id ${other}\n * @verifies ${scope.requirementId}\n */\nexport const unrelated = true;\n`);
    await writeFile(join(root, '.musubix/config.json'), JSON.stringify({
      ...defaultConfig, approval: { mode: 'compatible', domains: [] },
      commands: [{ name: 'test', command: 'fixture', args: [], required: false, timeoutMs: 30_000,
        tddArgs: ['{testId}', '{reportPath}'],
        tddReport: { format: 'musubix-json', path: '.musubix/cache/{testId}.json' } }],
    }));
    let executions = 0;
    const runner: import('../packages/analysis/src/process.js').Runner = async (_command, args) => {
      executions++;
      await withTddWriteLeaseSet(root, [scope.changeId], async () => {});
      await new Promise((done) => setTimeout(done, 11_000));
      await withTddWriteLeaseSet(root, [scope.changeId], async () => {});
      await mkdir(join(root, '.musubix/cache'), { recursive: true });
      await writeFile(join(root, args[1]!), JSON.stringify({ schemaVersion: 1, tests: [{ id: args[0], status: 'failed' }] }));
      return { status: 'completed', exitCode: 1, stdout: '', stderr: '', durationMs: 11_000 };
    };
    await expect(runTddPhase(root, 'red', scope.testId, scope.requirementId, scope.command, runner))
      .rejects.toThrow(/TDD_SOURCE_PENDING: same-test-writer/);
    expect(executions).toBe(0);
    expect((await runTddPhase(root, 'red', other, scope.requirementId, scope.command, runner)).valid).toBe(true);
    expect(executions).toBe(1);
    const result = await resumeSourceSupersession(root, { changeId: scope.changeId, generation: 5,
      operationId: fixture.review.operationId, requestSha256: fixture.projection.requestSha256 });
    expect(result.order).toBe(8);
    const evidence = JSON.parse(await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8'));
    expect(evidence.cycles.at(-1).testId).toBe(other);
    expect(evidence.sourceSupersessions[0].order).toBe(8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

/** @id TEST-M5-SOURCE-PREFLIGHT-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-PREFLIGHT-001 rejects pending source work before invoking configured Red formatters', async () => {
  const { runTddPhase } = await import('../packages/analysis/src/tdd.js');
  const { defaultConfig } = await import('../packages/analysis/src/config.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-preflight-'));
  try {
    const { review } = await archivedFixture(root);
    await writeFile(join(root, '.musubix/config.json'), JSON.stringify({
      ...defaultConfig, approval: { mode: 'compatible', domains: [] },
      tdd: { ...defaultConfig.tdd, redPreflightCommands: ['format'] },
      commands: [
        { name: 'format', command: 'format', args: [], required: false, timeoutMs: 10_000 },
        { name: 'test', command: 'fixture', args: [], required: false, timeoutMs: 10_000,
          tddArgs: ['{testId}', '{reportPath}'],
          tddReport: { format: 'musubix-json', path: '.musubix/cache/{testId}.json' } },
      ],
    }));
    let executions = 0;
    await expect(runTddPhase(root, 'red', review.scope.testId, review.scope.requirementId, review.scope.command, async () => {
      executions++;
      return { status: 'completed', exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    })).rejects.toThrow(/TDD_SOURCE_PENDING: same-test-writer/);
    expect(executions).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-REPOSITORY-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-003 DES-M5-005 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-REPOSITORY-001 rejects completed source replay in a foreign repository without rebinding archived admission', async () => {
  const { resumeSourceSupersession, replaySourceSupersession } = await import('../packages/analysis/src/tdd-source-supersession.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-repository-'));
  try {
    const { review, projection } = await archivedFixture(root);
    const request = { changeId: review.changeId, generation: 5, operationId: review.operationId,
      requestSha256: projection.requestSha256 };
    await resumeSourceSupersession(root, request);
    const before = await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8');
    execFileSync('git', ['-C', root, 'config', 'remote.origin.url', 'https://example.invalid/another/repository.git']);
    await expect(replaySourceSupersession(root, request)).rejects.toThrow(/TDD_SOURCE_ADMISSION_INVALID: foreign-target/);
    await expect(resumeSourceSupersession(root, request)).rejects.toThrow(/TDD_SOURCE_ADMISSION_INVALID: foreign-target/);
    expect(await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-ENVIRONMENT-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-ENVIRONMENT-001 rejects self-consistently hashed undeclared or incomplete archived environments', async () => {
  const { verifySourceSnapshotBlobs } = await import('../packages/analysis/src/tdd-source-artifacts.js');
  const { storeSourceBlob } = await import('../packages/analysis/src/tdd-source-storage.js');
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-environment-'));
  try {
    const { review } = await archivedFixture(root);
    const manifest = await verifySourceSnapshotBlobs(root, review.snapshot);
    for (const environment of [{ ...manifest.environment, NODE_PATH: '/ambient-dependencies' }, { TZ: 'UTC' }]) {
      const { stateSha256: _previous, ...binding } = review.snapshot;
      binding.manifestSha256 = await storeSourceBlob(root, canonicalBytes({ ...manifest, environment }));
      binding.environmentSha256 = await storeSourceBlob(root, canonicalBytes(environment));
      await expect(verifySourceSnapshotBlobs(root, {
        ...binding, stateSha256: sha256(canonicalBytes({ schemaVersion: 1, ...binding })),
      })).rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID: blob-hash/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-CLI-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-005 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-CLI-001 exposes closed source commands, generation-first admission and immutable completed replay JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-cli-'));
  const invoke = (args: string[]) => spawnSync('npx', ['musubix5', 'tdd', 'source-supersession',
    ...args, '--root', root, '--json'], { encoding: 'utf8' });
  try {
    const { review, projection } = await archivedFixture(root);
    const help = spawnSync('npx', ['musubix5', 'tdd', 'source-supersession', '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    for (const name of ['prepare', 'approve', 'record', 'resume', 'replay']) expect(help.stdout).toContain(name);
    const scope = ['--change', review.changeId, '--generation', '4', '--operation-id', review.operationId];
    const hashes = ['--artifact-sha256', projection.reviewSha256, '--approval-sha256', projection.approvalSha256];
    const target = ['--test', review.scope.testId, '--cycle', review.target.cycleId,
      '--terminal-kind', review.target.kind, '--terminal-order', String(review.target.order),
      '--terminal-sha256', review.target.payloadSha256, '--old-fingerprint', review.target.oldFingerprint,
      '--requirement', review.scope.requirementId, '--command', review.scope.command, '--reason', 'Fixture admission'];
    for (const args of [
      ['prepare', ...target, '--mode', 'behavior-change', '--replacement-cycle', 'replacement'],
      ['prepare', ...target, '--mode', 'test-only', '--old-block', 'old.ts', '--hunk-review', 'hunks.json'],
      ['approve', '--artifact-sha256', projection.reviewSha256, '--approver', 'fixture-reviewer', '--confirm'],
      ['record', ...hashes],
      ['resume', '--request-sha256', projection.requestSha256],
      ['replay', '--request-sha256', projection.requestSha256],
    ]) {
      const result = invoke([...args, ...scope]);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: 'CHANGE_GENERATION_PHASE' } });
    }
    const missing = invoke(['replay']);
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stdout)).toMatchObject({ error: { code: 'CLI_ERROR', details: { reason: 'missing-option' } } });
    const conflict = invoke(['prepare', ...target, ...scope, '--mode', 'behavior-change',
      '--replacement-cycle', 'replacement', '--old-block', 'old.ts']);
    expect(conflict.status).toBe(2);
    expect(JSON.parse(conflict.stdout)).toMatchObject({ error: { code: 'CLI_ERROR', details: { reason: 'mode-option-conflict' } } });
    const current = ['--change', review.changeId, '--generation', '5', '--operation-id', review.operationId];
    const resumed = invoke(['resume', ...current, '--request-sha256', projection.requestSha256]);
    expect(resumed.status).toBe(0);
    const result = JSON.parse(resumed.stdout);
    expect(result).toMatchObject({ schemaVersion: 1, state: 'completed', order: 7, journalOrder: 1 });
    expect(result).not.toHaveProperty('replayed');
    const before = await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8');
    for (const args of [
      ['replay', ...current, '--request-sha256', projection.requestSha256],
      ['resume', ...current, '--request-sha256', projection.requestSha256],
      ['record', ...current, ...hashes],
    ]) {
      const replay = invoke(args);
      expect(replay.status).toBe(0);
      expect(JSON.parse(replay.stdout)).toEqual(result);
    }
    expect(await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

/** @id TEST-M5-SOURCE-QUALITY-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-023
 */
it('TEST-M5-SOURCE-QUALITY-001 binds quality to scoped completed source evidence but not preparation, pending or replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-quality-'));
  try {
    const { readTddSourceQuality, scopedTddEvidenceDigest } = await import('../packages/analysis/src/tdd.js');
    const { resumeSourceSupersession, inspectSourceEvidence, readSourceTddEvidence } =
      await import('../packages/analysis/src/tdd-source-supersession.js');
    const { review, projection } = await archivedFixture(root);
    const selected = { changeId: review.changeId, generation: 5 };
    expect(await readTddSourceQuality(root, selected)).toMatchObject({ valid: true, digest: null });
    const input = { ...selected, operationId: review.operationId, requestSha256: projection.requestSha256 };
    await resumeSourceSupersession(root, input);
    const evidence = await readSourceTddEvidence(root);
    const source = await inspectSourceEvidence(root, evidence);
    const quality = await readTddSourceQuality(root, selected);
    expect(quality).toEqual({ valid: true, diagnostics: [], digest: scopedTddEvidenceDigest(
      evidence, source, selected.changeId, selected.generation, [review.scope.requirementId],
    ) });
    expect(await readTddSourceQuality(root, { ...selected, generation: 4 }))
      .toMatchObject({ valid: true, digest: null });
    await resumeSourceSupersession(root, input);
    expect(await readTddSourceQuality(root, selected)).toEqual(quality);
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify({
      ...evidence, sourceSupersessions: [{ ...evidence.sourceSupersessions![0], newFingerprint: digest('0') }],
    }));
    const invalid = await readTddSourceQuality(root, { ...selected, generation: 4 });
    expect(invalid.valid).toBe(false);
    expect(invalid.digest).toBeNull();
    expect(invalid.diagnostics.some((entry) => entry.severity === 'error')).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-VOID-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023 DES-M5-TDD-005
 */
it('TEST-M5-SOURCE-VOID-001 compares dangling work against completed source terminal order without rewriting history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-void-'));
  try {
    const { voidTddCycle } = await import('../packages/analysis/src/tdd.js');
    const { resumeSourceSupersession } = await import('../packages/analysis/src/tdd-source-supersession.js');
    const { review, projection, evidence, orders } = await archivedFixture(root);
    await expect(voidTddCycle(root, review.scope.testId, 'fixture-reviewer', 'pending admission'))
      .rejects.toThrow(/TDD_SOURCE_PENDING/);
    const reference = evidence.cycles[1]!;
    const { green: _green, refactor: _refactor, ...base } = reference;
    const cycle = { ...base, cycleId: 'dangling', red: { ...reference.red!, order: 7 } };
    evidence.cycles.push(cycle);
    const rawHash = (value: unknown) => sha256(Buffer.from(JSON.stringify(value)));
    const order = { sequence: 7, kind: 'tdd' as const, entityId: cycle.cycleId, phase: 'red',
      previousSha256: orders.records.at(-1)!.recordSha256 };
    orders.records.push({ ...order, recordSha256: rawHash(order) });
    const { recordSha256: _hash, operationKey: _operation, ...previous } = evidence.chain!.at(-1)!;
    const chain = { ...previous, sequence: 7, cycleId: cycle.cycleId, phase: 'red' as const,
      phaseEvidenceSha256: rawHash(cycle.red), previousSha256: evidence.chain!.at(-1)!.recordSha256 };
    evidence.chain!.push({ ...chain, recordSha256: rawHash(chain) });
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify(evidence));
    await writeFile(join(root, '.musubix/evidence/order.json'), JSON.stringify(orders));
    await resumeSourceSupersession(root, { changeId: review.changeId, generation: 5,
      operationId: review.operationId, requestSha256: projection.requestSha256 });
    const before = await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8');
    await expect(voidTddCycle(root, review.scope.testId, 'fixture-reviewer', 'must reject'))
      .rejects.toThrow(/latest cycle has a valid Green/);
    expect(await readFile(join(root, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-MATERIALIZE-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-MATERIALIZE-001 requires prepared immutable source proof before supplied-handle ledger replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-materialize-'));
  const destination = await mkdtemp(join(tmpdir(), 'musubix5-source-destination-'));
  try {
    const { resumeSourceSupersession, inspectSourceEvidence, readSourceTddEvidence } =
      await import('../packages/analysis/src/tdd-source-supersession.js');
    const { withMultiChangeProjectionWrite, materializeOperationalState } =
      await import('../packages/analysis/src/candidate-state.js');
    const { review, projection } = await archivedFixture(root);
    await resumeSourceSupersession(root, { changeId: review.changeId, generation: 5,
      operationId: review.operationId, requestSha256: projection.requestSha256 });
    const evidence = await readSourceTddEvidence(root);
    const prepared = await inspectSourceEvidence(root, evidence);
    const copy = () => withMultiChangeProjectionWrite(root, [review.changeId], (leases) =>
      materializeOperationalState(root, destination, [review.changeId],
        async () => ({ recoveredBatchCheckpoints: 0 }), leases, prepared));
    await copy();
    const before = await readFile(join(destination, '.musubix/evidence/tdd.json'), 'utf8');
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify({
      ...evidence, sourceSupersessions: [{ ...evidence.sourceSupersessions![0], newFingerprint: digest('0') }],
    }));
    await expect(copy()).rejects.toThrow(/TDD_SOURCE_LEDGER_INVALID/);
    expect(await readFile(join(destination, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify(evidence));
    await writeFile(join(root, '.musubix/evidence/tdd-source/v1/blobs', review.snapshot.manifestSha256), 'tampered');
    await expect(copy()).rejects.toThrow(/TDD_SOURCE_APPROVAL_INVALID/);
    expect(await readFile(join(destination, '.musubix/evidence/tdd.json'), 'utf8')).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-STATUS-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-015 DES-M5-023
 */
it('TEST-M5-SOURCE-STATUS-001 retains source errors alongside integration diagnostics and prints safely quoted recovery arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-status-'));
  try {
    const { projectStatus } = await import('../packages/analysis/src/gate.js');
    const { sourceGuidance } = await import('../packages/cli/src/main.js');
    const { evidence, projection } = await archivedFixture(root);
    const pending = await projectStatus(root);
    const guidance = sourceGuidance(pending);
    expect(guidance).toContain('npx musubix5');
    expect(guidance).toContain("'--request-sha256'");
    expect(guidance).toContain(projection.requestSha256);
    const selector = pending.sourceTerminalSelectors[0]!;
    expect(sourceGuidance({ sourceSupersessions: [], sourceTerminalSelectors: [
      { ...selector, cliArgs: ['--command', "test's runner"] },
    ] })).toContain("'test'\\''s runner'");
    await writeFile(join(root, '.musubix/evidence/tdd.json'), JSON.stringify({
      ...evidence, sourceSupersessions: [projection],
    }));
    await writeFile(join(root, '.musubix/evidence/quality.json'), JSON.stringify({
      schemaVersion: 1, status: 'fail', fingerprints: {}, checks: [],
    }));
    const status = await projectStatus(root, {
      repositoryId: projection.scope.repositoryId, integrationId: `integration:${digest('a')}`,
      startingDefaultCommit: 'a'.repeat(40), candidates: [], applyOrder: [], sourceManifestSha256: digest('b'),
    });
    expect(status.gate.ready).toBe(false);
    expect(status.gate.diagnostics?.some((entry) => entry.code === 'TDD_SOURCE_LEDGER_INVALID')).toBe(true);
    expect(status.gate.diagnostics?.some((entry) => !entry.code.startsWith('TDD_SOURCE_'))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** @id TEST-M5-SOURCE-TAIL-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
it('TEST-M5-SOURCE-TAIL-001 admits only verified journal-derived source suffixes during control refresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'musubix5-source-tail-'));
  try {
    const { sourceMaterializationTailValid, resumeSourceSupersession, inspectSourceEvidence, readSourceTddEvidence } =
      await import('../packages/analysis/src/tdd-source-supersession.js');
    const { evidence: baseline, projection, review } = await archivedFixture(root);
    await resumeSourceSupersession(root, { changeId: review.changeId, generation: 5,
      operationId: review.operationId, requestSha256: projection.requestSha256 });
    const current = await readSourceTddEvidence(root);
    const verified = await inspectSourceEvidence(root, current);
    expect(sourceMaterializationTailValid(baseline, current, verified, 0)).toBe(true);
    expect(sourceMaterializationTailValid(baseline, current, verified, 1)).toBe(false);
    expect(sourceMaterializationTailValid(current, current, verified, 1)).toBe(true);
    expect(sourceMaterializationTailValid(baseline, {
      ...current, cycles: current.cycles.map((cycle) => ({ ...cycle, commandName: 'different' })),
    }, verified, 0)).toBe(false);
    expect(sourceMaterializationTailValid(baseline, {
      ...current, chain: current.chain!.slice(1),
    }, verified, 0)).toBe(false);
    expect(sourceMaterializationTailValid(baseline, {
      ...current, sourceSupersessions: [{ ...current.sourceSupersessions![0], newFingerprint: digest('0') }],
    }, verified, 0)).toBe(false);
    expect(sourceMaterializationTailValid(baseline, current, { ...verified, valid: false }, 0)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
