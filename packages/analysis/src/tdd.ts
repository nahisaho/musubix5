import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { error, type Diagnostic } from '../../domain/src/index.js';
import { loadConfig, commandCwd } from './config.js';
import {
  digest, evidenceInputs, exists, files, isArtifact, isSource, readText, safePath,
  sharedImplementationPaths, snapshot, within, writeJson,
} from './files.js';
import { runProcess, type Runner } from './process.js';
import { runTestRuntimeCommand, testRuntimeExecutionContext, validateTestRuntimeOutcome } from './test-runtime.js';
import { buildTrace, hasTraceSourceEntity, traceInputs, type TraceNode } from './trace.js';
import { adapterInvocation, clearAdapterOutput, mergeAdapterArgs, normalizeAdapterReport, readAdapterOutput } from './adapters.js';
import {
  appendEvidenceOrder,
  evidenceOrderRecord,
  inspectEvidenceOrder,
  loadEvidenceOrder,
  validateEvidenceOrderLog, type EvidenceOrderLog,
} from './order.js';
import { requireApproval, resolveRequirementDomain, validateApprovalStage, loadApproval, type ApprovalEvidence } from './approval.js';
import { readCandidateRegistry } from './candidate-state.js';
import { activeChangeContext, resolveChangeContext, type ActiveChangeContext } from './change-generation.js';
import {
  classifyParallelTddEvidence,
  supersededParallelTddCycles,
} from './parallel-tdd-evidence.js';
import {
  appendJournalRecord, loadJournalRecords, loadJournalRecordByIdempotencyKey,
  assertAppendSessionCurrent, assertLeaseSetCurrent, withOrderLease, writeChangeProjection,
  withChangeProjectionLeases, LeaseAcquisitionTimeout,
  withTddWriteLeaseSet, assertTddWriteLeaseSetCurrent, writeAuthorizedJson, LeaseFencedError,
  type TddWriteLeaseSet,
  type AppendLeaseSession, type ChangeProjectionAppendLeaseSet, type JournalRecord,
} from './journal.js';
import { canonicalBytes, canonicalRepositoryIdentity, sha256 } from './canonical.js';
import { reconcilePendingPhaseCheckpoints } from './change-phase-checkpoint.js';
import { parseMusubixTestReport, type MusubixTestReport } from './test-report.js';
import { testFingerprintFromText, sourceLineStartOffset, testStatements } from './tdd-test-source.js';
import {
  inspectSourceEvidence, requireSourceLedger, requireSourceWriterAllowed, requireSourceOperationGeneration,
  sourceRepositoryIdentity, prepareSourceReview, approveSourceReview, recordSourceReview,
  type VerifiedSourceEvidence, type PreparedSourceAdmission,
} from './tdd-source-supersession.js';
import { classifySourceLedger, sourceResumeArgs, sourceOperationKey, type SourceLedgerClassification } from './tdd-source-ledger.js';
import { SourceOperationError, type SourceReason } from './tdd-source-diagnostics.js';
import type {
  SourceProjection, SourceTerminalSelector, SourceSupersessionSummary,
  SourcePreparationRequest, SourceScope, SourceReplacement, SourceOperationScope,
  SourcePreparationResult, SourceApprovalResult, SourceResult,
} from './tdd-source-types.js';
export { sourceLineStartOffset, canonicalTestFingerprintText } from './tdd-test-source.js';
import { indexGraph, prepareGraphAdjacency } from './graph.js';
import {
  activeChangeGeneration,
  batchForRecording,
  batchKey,
  generationOrderPhase,
  loadChangeEvidence,
  nextBatchScopeId,
  validateBatchCheckpointJournal,
  inspectBatchCheckpointGaps,
  parseBatchOrderPhase,
  projectBatchCheckpoint,
  type BatchCheckpointPayload,
  type BatchCheckpointRecord,
  type BatchCheckpointPhase,
  type ChangeRecord,
  type ChangeEvidence,
  type ChangeFingerprints,
  type ChangePhaseEvidence,
} from './change-evidence.js';
import {
  candidateEvidenceBinding,
  validateCandidateBinding,
  type CandidateEvidenceContext,
  type IntegrationEvidenceContext,
} from './approval.js';
import type {
  TddChainPhase,
  TddChainRecord,
  TddCycle,
  TddEvidence,
  TddMigrationEvidence,
  TddPhase,
  TddPhaseEvidence,
  TddRepairAbandonmentRecord,
  TddRepairFailureCause,
  TddRepairJournalPayload,
  TddRepairRecord,
  TddRepairRequest,
  TddVoidEvidence,
} from './tdd-types.js';
export { parseMusubixTestReport, type MusubixTestReport } from './test-report.js';
export type {
  TddChainPhase,
  TddChainRecord,
  TddCycle,
  TddEvidence,
  TddMigrationEvidence,
  TddPhase,
  TddPhaseEvidence,
  TddRepairAbandonmentRecord,
  TddRepairFailureCause,
  TddRepairJournalPayload,
  TddRepairRecord,
  TddRepairRequest,
  TddVoidEvidence,
} from './tdd-types.js';

/** @id CODE-M5-CHECKPOINT-APPEND-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
export function batchCheckpointOperation(
  changeId: string, generation: number, phase: BatchCheckpointPhase, scopeId?: string,
): { idempotencyKey: string; semanticPhaseKey: string; orderPhaseKey: string } {
  const orderPhaseKey = generationOrderPhase(generation, phase, scopeId);
  return {
    idempotencyKey: `change-batch-checkpoint:${changeId}:${orderPhaseKey}`,
    semanticPhaseKey: orderPhaseKey,
    orderPhaseKey,
  };
}

export async function loadBatchCheckpointRecords(root: string): Promise<BatchCheckpointRecord[]> {
  let records: JournalRecord[];
  try {
    records = await loadJournalRecords(root);
  } catch (cause) {
    throw new Error(`CHANGE_CHECKPOINT_JOURNAL_INVALID: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const evidence = await loadChangeEvidence(root);
  const validation = validateBatchCheckpointJournal(records, evidence?.changes);
  if (!validation.valid) {
    throw new Error(`CHANGE_CHECKPOINT_JOURNAL_INVALID: ${validation.diagnostics.map((entry) => entry.message).join(' ')}`);
  }
  return validation.records;
}

export async function appendBatchCheckpoint(
  root: string, payload: BatchCheckpointPayload, session?: AppendLeaseSession,
): Promise<BatchCheckpointRecord> {
  if (!session) return withOrderLease(root, (held) => appendBatchCheckpoint(root, payload, held));
  await assertAppendSessionCurrent(root, session);
  await loadBatchCheckpointRecords(root);
  const operation = batchCheckpointOperation(payload.changeId, payload.generation, payload.phase, payload.scopeId);
  const existing = await loadJournalRecordByIdempotencyKey(root, operation.idempotencyKey);
  const records = await loadJournalRecords(root);
  const envelope = {
    schemaVersion: 1 as const, order: records.length + 1, stream: 'normal' as const,
    changeId: payload.changeId, kind: 'change-batch-checkpoint',
    idempotencyKey: operation.idempotencyKey, payload,
    previousSha256: records.at(-1)?.recordSha256 ?? null,
  };
  const candidate = { ...envelope, recordSha256: sha256(canonicalBytes(envelope)) };
  const evidence = await loadChangeEvidence(root);
  const validation = validateBatchCheckpointJournal(
    existing ? [{ ...candidate, order: 1, previousSha256: null,
      recordSha256: sha256(canonicalBytes({ ...envelope, order: 1, previousSha256: null })) }] : [...records, candidate],
    evidence?.changes,
  );
  if (!validation.valid) {
    throw new Error(`CHANGE_CHECKPOINT_JOURNAL_INVALID: ${validation.diagnostics.map((entry) => entry.message).join(' ')}`);
  }
  if (existing) {
    const callerBindings = (value: BatchCheckpointPayload): unknown => ({
      repositoryId: value.repositoryId, workspaceHead: value.workspaceHead,
      requirementIds: value.requirementIds, fingerprints: value.fingerprints,
      workspaceStateSha256: value.workspaceStateSha256, tddEvidenceSha256: value.tddEvidenceSha256,
    });
    if (existing.kind !== 'change-batch-checkpoint'
      || !canonicalBytes(callerBindings(existing.payload as BatchCheckpointPayload)).equals(canonicalBytes(callerBindings(payload)))) {
      throw new Error('CHANGE_GENERATION_DUPLICATE: batch checkpoint identity is already bound to different inputs.');
    }
    return existing as BatchCheckpointRecord;
  }
  return await appendJournalRecord(root, {
    stream: 'normal', changeId: payload.changeId, kind: 'change-batch-checkpoint',
    idempotencyKey: operation.idempotencyKey, payload,
  }, session) as BatchCheckpointRecord;
}

/** @id CODE-M5-CHECKPOINT-RECOVERY-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
export async function recoverBatchCheckpoints(
  root: string, changeId: string, expectedLeases: ChangeProjectionAppendLeaseSet,
  selectedKey?: string,
): Promise<{ recoveredBatchCheckpoints: number }> {
  await assertLeaseSetCurrent(expectedLeases, changeId);
  const evidence = await loadChangeEvidence(root);
  const change = evidence?.changes.find((entry) => entry.changeId === changeId);
  const generation = change ? activeChangeGeneration(change) : null;
  if (!evidence || !change || generation === null) return { recoveredBatchCheckpoints: 0 };
  const records = (await loadBatchCheckpointRecords(root))
    .filter((record) => record.payload.changeId === changeId && record.payload.generation === generation
      && (selectedKey === undefined || record.idempotencyKey === selectedKey));
  const gaps = inspectBatchCheckpointGaps(change, await loadJournalRecords(root), await loadEvidenceOrder(root));
  if (gaps.diagnostics.length) {
    const diagnostic = gaps.diagnostics[0]!;
    throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
  }
  let recoveredBatchCheckpoints = 0;
  for (const { payload } of records) {
    await assertLeaseSetCurrent(expectedLeases, changeId);
    let batch = payload.scopeId === undefined ? undefined : change.tddBatches?.find((entry) =>
      (entry.scopeId ?? batchKey(entry.requirementIds)) === payload.scopeId);
    const projected = payload.scopeId === undefined ? change.phases[payload.phase] : batch?.[payload.phase];
    const inspected = await inspectEvidenceOrder(root);
    if (!inspected.valid) throw new Error('CHANGE_CHECKPOINT_JOURNAL_INVALID: evidence order is invalid.');
    if (projected) continue;
    const previous = payload.phase === 'red' ? change.phases.design
      : payload.phase === 'implementation'
        ? payload.scopeId === undefined ? change.phases.red : batch?.red
        : payload.scopeId === undefined ? change.phases.implementation : batch?.implementation;
    if (!previous || (batch && batchKey(batch.requirementIds) !== batchKey(payload.requirementIds))) {
      throw new Error('CHANGE_CHECKPOINT_JOURNAL_INVALID: persisted batch predecessor is inconsistent.');
    }
    let order = evidenceOrderRecord(inspected.records, 'change', changeId, payload.orderPhaseKey);
    const predecessorKey = payload.phase === 'red'
      ? generationOrderPhase(generation, (previous.designOrdinal ?? 1) > 1 ? `design:${previous.designOrdinal}` : 'design')
      : generationOrderPhase(generation, previous.phase, payload.scopeId);
    const predecessor = evidenceOrderRecord(inspected.records, 'change', changeId, predecessorKey);
    if (!predecessor || predecessor.sequence !== previous.order
      || (order && predecessor.sequence >= order.sequence)) {
      throw new Error('CHANGE_CHECKPOINT_JOURNAL_INVALID: persisted batch predecessor order is inconsistent.');
    }
    if (!order) {
      await assertLeaseSetCurrent(expectedLeases, changeId);
      const append = async (session: AppendLeaseSession) => appendEvidenceOrder(root, {
        kind: 'change', entityId: changeId, phase: payload.orderPhaseKey,
      }, session);
      order = expectedLeases.appendSession
        ? await append(expectedLeases.appendSession)
        : await withOrderLease(root, append, expectedLeases);
    }
    projectBatchCheckpoint(change, payload, order.sequence);
    await writeChangeProjection(root, expectedLeases, evidence);
    recoveredBatchCheckpoints += 1;
  }
  return { recoveredBatchCheckpoints };
}

export function unprojectedBatchCheckpointSummaries(
  change: ChangeRecord, records: JournalRecord[], order: Awaited<ReturnType<typeof loadEvidenceOrder>>,
): ReturnType<typeof inspectBatchCheckpointGaps> {
  return inspectBatchCheckpointGaps(change, records, order);
}

/** Only preparation reads are injectable; persistence always uses fenced journal/projection helpers. */
export interface WorkspaceChangePhaseDependencies {
  verifyRepository(controlRoot: string, sourceRoot: string): Promise<void>;
  loadChangeEvidence(root: string): Promise<ChangeEvidence | null>;
  currentFingerprints(
    controlRoot: string,
    sourceRoot: string,
    changeId: string,
    requirementIds: string[],
  ): Promise<ChangeFingerprints>;
}

async function fingerprintPaths(root: string, paths: string[]): Promise<string> {
  return digest(JSON.stringify(await snapshot(root, [...new Set(paths)].sort())));
}

async function verifyWorkspaceRepository(controlRoot: string, sourceRoot: string): Promise<void> {
  const commonDirectory = async (root: string): Promise<string> => {
    const result = await runProcess(
      'git',
      ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: root, timeoutMs: 30_000 },
    );
    if (result.status !== 'completed' || result.exitCode !== 0) {
      throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: unable to resolve Git common directory.');
    }
    return resolve(result.stdout.trim());
  };
  if (await commonDirectory(controlRoot) !== await commonDirectory(sourceRoot)) {
    throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: source and control roots belong to different repositories.');
  }
}

/** @id CODE-M5-WORKSPACE-CHANGE-FINGERPRINTS-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
 * @design DES-M5-MULTI-CHANGE-005
 */
export async function workspaceChangeFingerprints(
  controlRoot: string,
  sourceRoot: string,
  changeId: string,
  requirementIds: string[],
): Promise<ChangeFingerprints> {
  const paths = await files(sourceRoot);
  const trace = await buildTrace(sourceRoot, false);
  const sharedPaths = await sharedImplementationPaths(sourceRoot);
  const codePaths = [...new Set([
    ...trace.nodes.filter((node) => node.kind === 'code').map((node) => node.path),
    ...sharedPaths,
  ])].sort();
  const testPaths = new Set(trace.nodes.filter((node) => node.kind === 'test').map((node) => node.path));
  const { graph } = await indexGraph(sourceRoot, { persist: false, refresh: false });
  const adjacency = prepareGraphAdjacency(graph);
  const nodes = new Map(trace.nodes.map((node) => [node.id, node]));
  const requirementImplementations: NonNullable<ChangeFingerprints['requirementImplementations']> = {};
  for (const requirementId of requirementIds) {
    const designs = trace.edges
      .filter((edge) => edge.relation === 'satisfies'
        && edge.to === requirementId
        && nodes.get(edge.from)?.kind === 'design')
      .map((edge) => edge.from);
    const relevant = new Set(trace.edges
      .filter((edge) => edge.relation === 'implements'
        && (edge.to === requirementId || designs.includes(edge.to))
        && nodes.get(edge.from)?.kind === 'code')
      .map((edge) => nodes.get(edge.from)!.path)
      .filter((path) => graph.files.includes(path) && !testPaths.has(path)));
    const queue = [...relevant];
    for (let index = 0; index < queue.length; index += 1) {
      for (const dependency of adjacency.forward.get(queue[index]!) ?? []) {
        if (testPaths.has(dependency) || relevant.has(dependency)) continue;
        relevant.add(dependency);
        queue.push(dependency);
      }
    }
    const implementationPaths = [...new Set([...relevant, ...sharedPaths])].sort();
    requirementImplementations[requirementId] = {
      paths: implementationPaths,
      fingerprints: await snapshot(sourceRoot, implementationPaths),
    };
  }
  const currentChange = (await loadChangeEvidence(controlRoot))?.changes.find((entry) => entry.changeId === changeId);
  if (!currentChange) throw new Error('CHANGE_GENERATION_PHASE: workspace fingerprints require an existing CHANGE.');
  return {
    impact: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      path === `.musubix/changes/${changeId}.md`)),
    requirements: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      /^\.musubix\/features\/[^/]+\/requirements\.md$/.test(path))),
    design: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      /^\.musubix\/features\/[^/]+\/design\.md$/.test(path)
      || /^\.musubix\/decisions\/ADR-\d+\.md$/.test(path))),
    implementation: await fingerprintPaths(sourceRoot, codePaths),
    tests: await fingerprintPaths(sourceRoot, [...testPaths]),
    tdd: await selectedWorkspaceTddDigest(controlRoot, changeId,
      activeChangeGeneration(currentChange),
      requirementIds),
    requirementImplementations,
  };
}

const workspaceChangePhaseDefaults: WorkspaceChangePhaseDependencies = {
  verifyRepository: verifyWorkspaceRepository,
  loadChangeEvidence,
  currentFingerprints: workspaceChangeFingerprints,
};

interface WorkspacePathState {
  mode: string;
  size: string;
  ino: string;
  mtime: string;
  ctime: string;
  sha256: string;
  fingerprintRelevant: boolean;
}
interface WorkspaceInputState {
  head: string;
  digest: string;
  paths: Map<string, WorkspacePathState>;
}

async function workspaceGit(root: string, args: string[]): Promise<string> {
  const result = await runProcess('git', ['-C', root, ...args], { cwd: root, timeoutMs: 30_000 });
  if (result.status !== 'completed' || result.exitCode !== 0) {
    throw new Error('CHANGE_WORKSPACE_DRIFT: unable to resolve immutable workspace Git inputs.');
  }
  return result.stdout.trim();
}

/** @id CODE-M5-CHECKPOINT-WORKSPACE-STATE-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-022
 */
async function captureWorkspaceState(
  root: string, changeId: string, previous?: WorkspaceInputState, dependencies: string[] = [],
): Promise<WorkspaceInputState> {
  const paths = new Set(await traceInputs(root));
  for (const path of [`.musubix/changes/${changeId}.md`, '.musubix/config.json', 'package.json', 'tsconfig.json']) {
    if (await exists(within(root, path))) paths.add(path);
  }
  return captureWorkspacePaths(root, [...paths], previous, dependencies);
}

async function captureWorkspacePaths(
  root: string, paths: string[], previous?: WorkspaceInputState, dependencies?: string[],
): Promise<WorkspaceInputState> {
  const entries = new Map<string, WorkspacePathState>();
  for (const path of [...new Set(paths)].sort()) {
    const absolute = await safePath(root, path);
    const stat = await lstat(absolute, { bigint: true });
    const metadata = {
      mode: String(stat.mode), size: String(stat.size), ino: String(stat.ino),
      mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs),
    };
    const before = previous?.paths.get(path);
    const unchanged = before && Object.entries(metadata).every(([key, value]) =>
      before[key as keyof WorkspacePathState] === value);
    const content = unchanged ? undefined : await readFile(absolute);
    entries.set(path, {
      ...metadata,
      sha256: unchanged ? before.sha256 : sha256(content!),
      fingerprintRelevant: unchanged ? before.fingerprintRelevant
        : isArtifact(path) || ['.musubix/config.json', 'package.json', 'tsconfig.json'].includes(path)
          || /^\.musubix\/changes\/CHANGE-\d+\.md$/.test(path)
          || hasTraceSourceEntity(content!.toString('utf8'), path),
    });
  }
  const head = await workspaceGit(root, ['rev-parse', 'HEAD']);
  return {
    head, paths: entries,
    digest: workspaceInputDigest(head, entries, dependencies),
  };
}

function workspaceInputDigest(
  head: string, entries: Map<string, WorkspacePathState>, dependencies?: string[],
): string {
  const selected = dependencies === undefined ? undefined : new Set(dependencies);
  return sha256(canonicalBytes({
    head, paths: [...entries]
      .filter(([path, entry]) => selected === undefined || entry.fingerprintRelevant || selected.has(path))
      .map(([path, entry]) => [path, entry.mode, entry.size, entry.sha256]),
  }));
}

export async function workspaceStateDigest(root: string, fingerprintPaths: string[]): Promise<string> {
  return (await captureWorkspacePaths(root, fingerprintPaths)).digest;
}

async function workspaceRepositoryIdentity(root: string): Promise<string> {
  const result = await runProcess('git', ['-C', root, 'config', '--get', 'remote.origin.url'],
    { cwd: root, timeoutMs: 30_000 });
  if (result.status !== 'completed' || (result.exitCode !== 0 && result.exitCode !== 1)) {
    throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: unable to resolve repository identity.');
  }
  return canonicalRepositoryIdentity(result.exitCode === 0 ? result.stdout.trim() : undefined, root);
}

async function selectedWorkspaceTddDigest(
  root: string, changeId: string, generation: number | null, requirementIds: string[],
  verified?: VerifiedSourceEvidence,
): Promise<string> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const source = verified ?? await inspectSourceEvidence(root, evidence);
  return scopedTddEvidenceDigest(evidence, source, changeId, generation, requirementIds);
}

/** @id CODE-M5-SOURCE-SCOPED-DIGEST-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-022 DES-M5-023
 */
export function scopedTddEvidenceDigest(
  evidence: TddEvidence, source: SourceLedgerClassification,
  changeId: string, generation: number | null, requirementIds: string[],
): string {
  requireSourceLedger(source);
  const selected = evidence.cycles.filter((cycle) => cycle.changeId === changeId
    && (cycle.generation ?? 1) === generation && requirementIds.includes(cycle.requirementId));
  return selectedTddEvidenceDigest(evidence, source, selected);
}

function selectedTddEvidenceDigest(
  evidence: TddEvidence, source: SourceLedgerClassification, selected: TddCycle[],
): string {
  requireSourceLedger(source);
  const cycleIds = new Set(selected.map((cycle) => cycle.cycleId));
  const projections = source.operations.flatMap((operation) => operation.projection
    && (cycleIds.has(operation.projection.target.cycleId) || cycleIds.has(operation.projection.cycleId))
    ? [operation.projection] : []);
  for (const projection of projections) {
    cycleIds.add(projection.target.cycleId);
    cycleIds.add(projection.cycleId);
  }
  const cycles = evidence.cycles.filter((cycle) => cycleIds.has(cycle.cycleId));
  return sha256(canonicalBytes({
    cycles: [...cycles].sort((a, b) => (a.cycleId ?? '').localeCompare(b.cycleId ?? '')),
    chain: (evidence.chain ?? []).filter((record) => cycleIds.has(record.cycleId)),
    ...(projections.length ? { sourceSupersessions: projections.sort((a, b) =>
      Buffer.compare(Buffer.from(a.operationKey), Buffer.from(b.operationKey))) } : {}),
  }));
}

/** @id CODE-M5-WORKSPACE-CHANGE-CHECKPOINT-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013 REQ-M5-LIFECYCLE-006
 * @design DES-M5-MULTI-CHANGE-005 DES-M5-022
 */
export async function recordChangePhaseFromWorkspace(
  controlRoot: string,
  sourceRoot: string,
  changeId: string,
  phase: 'red' | 'implementation' | 'green',
  requirementIds: string[],
  dependencies: WorkspaceChangePhaseDependencies = workspaceChangePhaseDefaults,
): Promise<ChangeEvidence> {
  if (!/^CHANGE-\d+$/.test(changeId)
    || !requirementIds.length
    || requirementIds.some((requirementId) => !/^REQ-[A-Z0-9][A-Z0-9-]*$/.test(requirementId))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: a valid non-empty requirement batch is required.');
  }
  const control = resolve(controlRoot);
  const source = resolve(sourceRoot);
  await dependencies.verifyRepository(control, source);
  const initialEvidence = await dependencies.loadChangeEvidence(control);
  const initialChange = initialEvidence?.changes.find((entry) => entry.changeId === changeId);
  const initialGeneration = initialChange ? activeChangeGeneration(initialChange) : null;
  if (!initialChange || initialGeneration === null) {
    throw new Error('CHANGE_GENERATION_PHASE: workspace checkpoint requires an active CHANGE generation.');
  }
  const normalizedRequirementIds = [...new Set(requirementIds)].sort();
  if (!normalizedRequirementIds.every((requirementId) =>
    initialChange.requirementIds.includes(requirementId))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: phase requirement IDs must belong to the CHANGE.');
  }
  const state = await captureWorkspaceState(source, changeId);
  const tddDigest = await selectedWorkspaceTddDigest(control, changeId, initialGeneration, normalizedRequirementIds);
  const fingerprints = await dependencies.currentFingerprints(control, source, changeId, normalizedRequirementIds);
  const implementationPaths = Object.values(fingerprints.requirementImplementations ?? {})
    .flatMap((implementation) => implementation.paths);
  state.digest = workspaceInputDigest(state.head, state.paths, implementationPaths);
  const beforeLock = await captureWorkspaceState(source, changeId, state, implementationPaths);
  const preparationDrift = state.digest !== beforeLock.digest
    || tddDigest !== await selectedWorkspaceTddDigest(control, changeId, initialGeneration, normalizedRequirementIds);
  const repositoryId = await workspaceRepositoryIdentity(control);
  const retrySource = Symbol('checkpoint-source-evidence-advanced');
  for (;;) {
  const sourceEvidence = await inspectSourceEvidence(control,
    await loadTddEvidence(control) ?? { schemaVersion: 1, cycles: [] });
  requireSourceLedger(sourceEvidence);
  try {
    return await withChangeProjectionLeases(control, [changeId], async (leases) => {
      const currentSources = classifySourceLedger(
        await loadTddEvidence(control) ?? { schemaVersion: 1, cycles: [] },
        await loadJournalRecords(control), await loadEvidenceOrder(control));
      requireSourceLedger(currentSources);
      if (!canonicalBytes(currentSources.operations).equals(canonicalBytes(sourceEvidence.operations))) throw retrySource;
      await sourceEvidence.recheck();
      await reconcilePendingPhaseCheckpoints(control, changeId, leases);
      const evidence = await dependencies.loadChangeEvidence(control);
      const selected = await resolveChangeContext(control, { changeId });
      const change = evidence?.changes.find((entry) => entry.changeId === changeId);
      const generation = change ? activeChangeGeneration(change) : null;
      if (!evidence || !change || generation === null || selected?.generation !== generation || generation !== initialGeneration
        || !normalizedRequirementIds.every((id) => change.requirementIds.includes(id))) {
        throw new Error('CHANGE_WORKSPACE_DRIFT: selected CHANGE generation or requirement set changed.');
      }
      const records = await loadBatchCheckpointRecords(control);
      const journalRecords = await loadJournalRecords(control);
      const order = await loadEvidenceOrder(control);
      const gaps = inspectBatchCheckpointGaps(change, journalRecords, order);
      if (gaps.diagnostics.length) {
        const diagnostic = gaps.diagnostics[0]!;
        throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
      }
      const replay = records.filter((record) => {
        const payload = record.payload;
        if (payload.changeId !== changeId || payload.generation !== generation
          || payload.phase !== phase || batchKey(payload.requirementIds) !== batchKey(normalizedRequirementIds)) return false;
        return payload.scopeId === undefined ? !change.phases[phase]
          : !change.tddBatches?.find((batch) => (batch.scopeId ?? batchKey(batch.requirementIds)) === payload.scopeId)?.[phase];
      });
      if (replay.length > 1) throw new Error('CHANGE_CHECKPOINT_JOURNAL_INVALID: multiple pending matching checkpoints.');
      if (replay[0]) {
        await recoverBatchCheckpoints(control, changeId, leases, replay[0].idempotencyKey);
        return (await dependencies.loadChangeEvidence(control))!;
      }
      const fullSet = normalizedRequirementIds.length === change.requirementIds.length
        && normalizedRequirementIds.every((requirementId) => change.requirementIds.includes(requirementId));
      if (fullSet && order?.records.some((entry) => entry.kind === 'change' && entry.entityId === changeId
        && entry.phase === generationOrderPhase(generation, phase))) {
        throw new Error('CHANGE_GENERATION_DUPLICATE: full-set phase is singular; abandon and reopen the generation.');
      }
      change.tddBatches ??= [];
      let batch = fullSet
        ? undefined
        : batchForRecording(change.tddBatches, normalizedRequirementIds, phase);
      if (!fullSet && phase === 'red') {
        if (batch?.red) {
          throw new Error(`${changeId}:red is already recorded for the pending requirement batch ${normalizedRequirementIds.join(', ')}.`);
        }
        batch = {
          scopeId: nextBatchScopeId([
            ...change.tddBatches,
            ...records.filter((record) => record.payload.changeId === changeId && record.payload.generation === generation
              && record.payload.scopeId !== undefined)
              .map((record) => ({ scopeId: record.payload.scopeId!, requirementIds: record.payload.requirementIds })),
            ...(order?.records ?? []).flatMap((entry) => {
              const parsed = entry.kind === 'change' && entry.entityId === changeId ? parseBatchOrderPhase(entry.phase) : null;
              return parsed && parsed !== 'invalid' && parsed.generation === generation && parsed.scopeId !== null
                ? [{ scopeId: parsed.scopeId, requirementIds: parsed.scopeId.split('#')[0]!.split(',') }] : [];
            }),
          ], normalizedRequirementIds),
          requirementIds: normalizedRequirementIds,
        };
        change.tddBatches.push(batch);
      }
      const precedingPhase = phase === 'red'
        ? 'design'
        : phase === 'implementation'
          ? 'red'
          : 'implementation';
      const previous = phase === 'red'
        ? change.phases.design
        : phase === 'implementation'
          ? fullSet ? change.phases.red : batch?.red
          : fullSet ? change.phases.implementation : batch?.implementation;
      if (!previous) {
        throw new Error(`${phase} requires the preceding ${precedingPhase} phase for requirement batch ${normalizedRequirementIds.join(', ')}.`);
      }
      if (fullSet ? change.phases[phase] !== undefined : batch?.[phase] !== undefined) {
        throw new Error(`${changeId}:${phase} is already recorded for requirement batch ${normalizedRequirementIds.join(', ')}.`);
      }
      if (phase === 'red' && fingerprints.tests === previous.fingerprints.tests) {
        throw new Error(`CHANGE_TESTS_UNCHANGED_AT_RECORD: ${changeId} did not add or change tests since design.`);
      }
      if (phase === 'implementation') {
        if (fingerprints.implementation === previous.fingerprints.implementation) {
          throw new Error(`CHANGE_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation since red.`);
        }
        const unchanged = normalizedRequirementIds.filter((requirementId) => {
          const before = previous.fingerprints.requirementImplementations?.[requirementId];
          const after = fingerprints.requirementImplementations?.[requirementId];
          return before && after
            && JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints);
        });
        if (unchanged.length) {
          throw new Error(`CHANGE_RELEVANT_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation related to ${unchanged.join(', ')} since red.`);
        }
      }
      const scopeId = fullSet ? undefined : batch?.scopeId ?? batchKey(normalizedRequirementIds);
      const currentState = await captureWorkspaceState(source, changeId, beforeLock, implementationPaths);
      const currentTdd = await selectedWorkspaceTddDigest(control, changeId, generation, normalizedRequirementIds, sourceEvidence);
      await sourceEvidence.recheck();
      await assertLeaseSetCurrent(leases, changeId);
      if (preparationDrift || currentState.head !== state.head || currentState.digest !== state.digest || currentTdd !== tddDigest) {
        throw new Error('CHANGE_WORKSPACE_DRIFT: HEAD, source state, or selected TDD evidence changed before persistence.');
      }
      const operation = batchCheckpointOperation(changeId, generation, phase, scopeId);
      await withOrderLease(control, (session) => appendBatchCheckpoint(control, {
        schemaVersion: 1, changeId, generation, phase, ...(scopeId === undefined ? {} : { scopeId }),
        repositoryId, workspaceHead: state.head, requirementIds: normalizedRequirementIds, fingerprints,
        workspaceStateSha256: state.digest, tddEvidenceSha256: tddDigest,
        semanticPhaseKey: operation.semanticPhaseKey, orderPhaseKey: operation.orderPhaseKey,
        recordedAt: new Date().toISOString(),
        changeFencingToken: leases.changeLeases[0]!.fencingToken,
        projectionFencingToken: leases.projectionLease.fencingToken,
      }, session), leases);
      await recoverBatchCheckpoints(control, changeId, leases, operation.idempotencyKey);
      return (await dependencies.loadChangeEvidence(control))!;
    });
  } catch (cause) {
    if (cause === retrySource) continue;
    if (cause instanceof LeaseAcquisitionTimeout
      && (cause.leaseKind === 'change' || cause.leaseKind === 'change-projection')) {
      throw new Error(`CHANGE_PROJECTION_LEASE_BUSY: ${cause.message}`);
    }
    throw cause;
  }
  }
}

function render(value: string, testId: string, testPath: string, reportPath: string): string {
  return value.replaceAll('{testId}', testId).replaceAll('{testPath}', testPath).replaceAll('{reportPath}', reportPath);
}

function chainRecordSha256(record: Omit<TddChainRecord, 'recordSha256'>): string {
  return digest(JSON.stringify(record));
}

function appendChainRecord(evidence: TddEvidence, cycle: TddCycle, phase: Exclude<TddChainPhase, 'source-supersession'>, phaseEvidence: unknown): void {
  if (!cycle.cycleId) throw new Error('TDD cycle ID is required for append-only evidence.');
  if (!evidence.chain) {
    if (evidence.cycles.some((entry) => entry !== cycle)) {
      throw new Error('Existing TDD evidence lacks an append-only hash chain; regenerate it before recording new phases.');
    }
    evidence.chain = [];
  }
  const previous = evidence.chain.at(-1);
  const payload: Omit<Exclude<TddChainRecord, { phase: 'source-supersession' }>, 'recordSha256'> = {
    sequence: evidence.chain.length + 1,
    cycleId: cycle.cycleId,
    ...(cycle.changeId ? { changeId: cycle.changeId, generation: cycle.generation } : {}),
    ...(cycle.binding ? { binding: cycle.binding } : {}),
    requirementId: cycle.requirementId,
    testId: cycle.testId,
    testPath: cycle.testPath,
    commandName: cycle.commandName,
    ...(cycle.parallel ? { parallel: cycle.parallel } : {}),
    phase,
    phaseEvidenceSha256: digest(JSON.stringify(phaseEvidence)),
    previousSha256: previous?.recordSha256 ?? null,
  };
  evidence.chain.push({ ...payload, recordSha256: chainRecordSha256(payload) });
}

async function sourceFingerprint(root: string, testPath: string, excludedPaths: string[] = []): Promise<string> {
  const excluded = new Set(excludedPaths);
  const paths = (await evidenceInputs(root)).filter((path) =>
    path !== testPath && !excluded.has(path));
  return digest(JSON.stringify(await snapshot(root, paths)));
}

/** @id CODE-M5-TDD-WRITER-INPUT-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-011 DES-M5-023
 */
async function captureTddInputs(
  root: string, excludedPaths: readonly string[] = [], previous?: Map<string, WorkspacePathState>,
): Promise<Map<string, WorkspacePathState>> {
  const paths = new Set((await evidenceInputs(root)).filter((path) => !excludedPaths.includes(path)));
  if (await exists(within(root, '.musubix/config.json'))) paths.add('.musubix/config.json');
  const approvals = '.musubix/evidence/approvals';
  if (await exists(within(root, approvals))) {
    for (const name of await readdir(within(root, approvals), { recursive: true })) {
      if (name.endsWith('.json')) paths.add(`${approvals}/${name.replaceAll('\\', '/')}`);
    }
  }
  const result = new Map<string, WorkspacePathState>();
  for (const path of [...paths].sort()) {
    const absolute = await safePath(root, path);
    const stat = await lstat(absolute, { bigint: true });
    const metadata = {
      mode: String(stat.mode), size: String(stat.size), ino: String(stat.ino),
      mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs),
    };
    const before = previous?.get(path);
    const unchanged = before && Object.entries(metadata).every(([key, value]) =>
      before[key as keyof WorkspacePathState] === value);
    result.set(path, {
      ...metadata, sha256: unchanged ? before.sha256 : sha256(await readFile(absolute)),
      fingerprintRelevant: true,
    });
  }
  return result;
}

function assertTddInputsUnchanged(
  before: Map<string, WorkspacePathState>, after: Map<string, WorkspacePathState>,
): void {
  if (workspaceInputDigest('', before) !== workspaceInputDigest('', after)) {
    throw new Error('CHANGE_WORKSPACE_DRIFT: TDD source, configuration, or approval inputs changed during execution.');
  }
}

async function testFingerprint(root: string, test: TraceNode): Promise<string> {
  return testFingerprintFromText(test, await readText(root, test.path));
}

// The pre-REQ-TDD-FINGERPRINT-SCOPING-001 algorithm (top-level statements
// only). Retained solely so `migrateTddFingerprint` can prove a stored
// fingerprint still matches what this superseded algorithm computes from
// current source text, before moving a cycle onto the corrected algorithm
// above. Must never be used for any other (live) fingerprint computation.
export async function legacyTestFingerprint(root: string, test: TraceNode): Promise<string> {
  const text = await readText(root, test.path);
  const lines = text.split(/\r?\n/);
  const start = lines.slice(0, Math.max(0, test.line - 1)).join('\n').length + (test.line > 1 ? 1 : 0);
  if (isSource(test.path)) {
    const source = ts.createSourceFile(test.path, text, ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find((statement) => statement.getStart(source) >= start);
    if (declaration) return digest(text.slice(start, declaration.end).trim());
  }
  const lineEnd = text.indexOf('\n', start);
  const searchFrom = lineEnd < 0 ? text.length : lineEnd + 1;
  const next = text.slice(searchFrom).search(/^[ \t]*(?:\/\*+|\/\/|#).*?@id\s+TEST-/m);
  return digest(text.slice(start, next < 0 ? text.length : searchFrom + next).trim());
}

export interface TddMigrationResult {
  migrated: boolean;
  testId: string;
  fromFingerprint?: string;
  toFingerprint?: string;
  reason?: string;
}

/** @id CODE-M5-TDD-EFFECTIVE-LATEST-001
 * @implements REQ-M5-TDD-003
 * @design DES-M5-TDD-005
 */
type TddCycleScopePredicate = (cycle: TddCycle) => boolean;

interface EffectiveTddCurrencySelection {
  readonly cycle: TddCycle;
  readonly order: number;
  readonly fingerprint: string;
}

interface TddEventScope {
  terminalScope?: TddCycleScopePredicate;
  voidScope?: TddCycleScopePredicate;
  workScope?: TddCycleScopePredicate;
}

interface TddVerifiedEvent {
  cycle: TddCycle;
  order: number;
  kind: 'terminal' | 'void' | 'work';
}

interface TddCurrencyIndex {
  evidence: TddEvidence;
  order: ReturnType<typeof validateEvidenceOrderLog>;
  validlyVoidedCycles: Set<TddCycle>;
  cyclesByTest: Map<string, TddCycle[]>;
  chainIndex: TddChainIndex;
  sourceProjections: SourceProjection[];
}

interface TddChainIndexEntry {
  record: TddChainRecord;
  position: number;
}

type TddChainIndex = Map<string, TddChainIndexEntry[]>;

const allCycles: TddCycleScopePredicate = () => true;

function tddChainKey(cycleId: string, testId: string, phase: TddChainPhase): string {
  return JSON.stringify([cycleId, testId, phase]);
}

function buildTddChainIndex(chain: TddChainRecord[] | undefined): TddChainIndex {
  const index: TddChainIndex = new Map();
  for (const [position, record] of (chain ?? []).entries()) {
    const key = tddChainKey(record.cycleId, record.testId, record.phase);
    const entries = index.get(key);
    const entry = { record, position };
    if (entries) entries.push(entry);
    else index.set(key, [entry]);
  }
  return index;
}

async function maintenanceChangeContext(root: string): Promise<ActiveChangeContext | null> {
  const selected = await resolveChangeContext(root, { maintenance: true });
  if (!selected || selected.generation === null) return null;
  return {
    changeId: selected.changeId,
    generation: selected.generation,
    requirementIds: selected.requirementIds,
  };
}

function activeScope(activeChange: ActiveChangeContext | null): TddCycleScopePredicate {
  if (!activeChange) return allCycles;
  return (cycle) => (cycle.generation ?? 1) === activeChange.generation
    && (cycle.changeId === undefined || cycle.changeId === activeChange.changeId);
}

function buildTddCurrencyIndex(
  evidence: TddEvidence,
  order: ReturnType<typeof validateEvidenceOrderLog>,
  validlyVoidedCycles: Set<TddCycle>,
  chainIndex: TddChainIndex = buildTddChainIndex(evidence.chain),
  sourceProjections: SourceProjection[] = [],
): TddCurrencyIndex {
  const cyclesByTest = new Map<string, TddCycle[]>();
  for (const cycle of evidence.cycles) {
    const cycles = cyclesByTest.get(cycle.testId);
    if (cycles) cycles.push(cycle);
    else cyclesByTest.set(cycle.testId, [cycle]);
  }
  return {
    evidence,
    order,
    validlyVoidedCycles,
    cyclesByTest,
    chainIndex,
    sourceProjections,
  };
}

function terminalFingerprintEvidence(
  index: TddCurrencyIndex,
  cycle: TddCycle,
): Readonly<EffectiveTddCurrencySelection> | undefined {
  if (!cycle.red?.valid || !cycle.green?.valid || index.validlyVoidedCycles.has(cycle)) return undefined;
  if (!phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'red', cycle.red)
    || !phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'green', cycle.green)) return undefined;
  if (cycle.red.order! >= cycle.green.order!) return undefined;
  const candidates: Array<{ order: number; fingerprint: string }> = [{
    order: cycle.green.order!,
    fingerprint: cycle.green.testFingerprint,
  }];
  if (cycle.refactor?.valid
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'refactor', cycle.refactor)) {
    candidates.push({ order: cycle.refactor.order!, fingerprint: cycle.refactor.testFingerprint });
  }
  if (cycle.migrate?.approver?.trim()
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'migrate', cycle.migrate)) {
    candidates.push({ order: cycle.migrate.order!, fingerprint: cycle.migrate.toFingerprint });
  }
  for (const projection of index.sourceProjections.filter((entry) => entry.cycleId === cycle.cycleId)) {
    candidates.push({ order: projection.order, fingerprint: projection.newFingerprint });
  }
  const latest = candidates.sort((left, right) => right.order - left.order)[0]!;
  return { cycle, order: latest.order, fingerprint: latest.fingerprint };
}

function sourceCurrencyIndex(
  evidence: TddEvidence, orders: EvidenceOrderLog | null, source: SourceLedgerClassification,
): TddCurrencyIndex {
  requireSourceLedger(source);
  const order = validateEvidenceOrderLog(orders);
  const chain = buildTddChainIndex(evidence.chain);
  return buildTddCurrencyIndex({ ...evidence, cycles: repairAwareCycles(evidence) }, order,
    new Set(evidence.cycles.filter((cycle) => voidLinkage(evidence, order, cycle, chain).valid)), chain,
    source.operations.flatMap((operation) => operation.projection ? [operation.projection] : []));
}

/** @id CODE-M5-SOURCE-CURRENCY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013 REQ-M5-TDD-003
 * @design DES-M5-007 DES-M5-023 DES-M5-TDD-005
 */
export function selectSourceAwareTddCurrency(
  evidence: TddEvidence, orders: EvidenceOrderLog | null, source: SourceLedgerClassification,
  testId: string, upperBoundExclusive?: number,
): Readonly<EffectiveTddCurrencySelection> | undefined {
  return effectiveLatestCycle(sourceCurrencyIndex(evidence, orders, source), testId, upperBoundExclusive);
}

export function sourceTerminalSelectors(
  evidence: TddEvidence, orders: EvidenceOrderLog | null, source: SourceLedgerClassification,
  scope: TddCycleScopePredicate = allCycles, fingerprints: ReadonlyMap<string, string> = new Map(),
): SourceTerminalSelector[] {
  const index = sourceCurrencyIndex(evidence, orders, source);
  const selectors: SourceTerminalSelector[] = [];
  for (const cycle of evidence.cycles) {
    if (!cycle.cycleId || !terminalFingerprintEvidence(index, cycle)) continue;
    const add = (kind: SourceTerminalSelector['terminalKind'], order: number, hash: string, fingerprint: string): void => {
      const greatest = effectiveLatestCycle(index, cycle.testId, undefined, scope);
      const selectionReason = !scope(cycle) ? 'outside-scope'
        : greatest?.order !== order ? 'older-terminal'
          : fingerprints.has(cycle.testId) && fingerprints.get(cycle.testId) !== fingerprint ? 'source-drift' : 'greatest-terminal';
      selectors.push({
        testId: cycle.testId, cycleId: cycle.cycleId!, terminalKind: kind, terminalOrder: order,
        terminalSha256: hash, oldFingerprint: fingerprint, requirementId: cycle.requirementId, command: cycle.commandName,
        changeId: cycle.changeId ?? null, generation: cycle.changeId ? cycle.generation ?? 1 : null, selectionReason,
        cliArgs: ['--test', cycle.testId, '--cycle', cycle.cycleId!, '--terminal-kind', kind,
          '--terminal-order', String(order), '--terminal-sha256', hash, '--old-fingerprint', fingerprint,
          '--requirement', cycle.requirementId, '--command', cycle.commandName],
      });
    };
    for (const phase of ['green', 'refactor', 'migrate'] as const) {
      const evidence = cycle[phase];
      if (!evidence || !phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, phase, evidence)
        || (evidence.phase === 'migrate' ? !evidence.approver.trim() : !evidence.valid)) continue;
      add(phase === 'migrate' ? 'migration' : phase, evidence.order!, digest(JSON.stringify(evidence)),
        evidence.phase === 'migrate' ? evidence.toFingerprint : evidence.testFingerprint);
    }
    for (const projection of index.sourceProjections.filter((entry) => entry.cycleId === cycle.cycleId)) {
      add('source-supersession', projection.order, sha256(canonicalBytes(projection)), projection.newFingerprint);
    }
  }
  return selectors.sort((a, b) => Buffer.compare(Buffer.from(a.testId), Buffer.from(b.testId))
    || a.terminalOrder - b.terminalOrder);
}

/** @id CODE-M5-SOURCE-TARGET-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function selectSourceAdmissionTarget(
  evidence: TddEvidence, orders: EvidenceOrderLog | null, source: SourceLedgerClassification,
  input: SourcePreparationRequest, scope: SourceScope, currentFingerprint: string,
): { cycle: TddCycle; replacement: SourceReplacement | null } {
  requireSourceWriterAllowed(source, scope, [input.target.cycleId, ...(input.replacementCycleId ? [input.replacementCycleId] : [])]);
  const fail: (reason: SourceReason<'TDD_SOURCE_ADMISSION_INVALID'>) => never = (reason) => {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', reason,
      { operationId: input.operationId, scope, target: input.target });
  };
  const matches = evidence.cycles.filter((entry) => entry.cycleId === input.target.cycleId);
  if (matches.length !== 1) fail('target-missing');
  const cycle = matches[0]!;
  const selectedScope = (entry: TddCycle): boolean =>
    entry.changeId === scope.changeId && entry.generation === scope.generation
    && entry.testId === scope.testId && entry.requirementId === scope.requirementId
    && entry.commandName === scope.command && entry.testPath === scope.path;
  if (!selectedScope(cycle) || scope.changeId !== input.changeId || scope.generation !== input.generation
    || scope.testId !== input.testId || scope.requirementId !== input.requirementId || scope.command !== input.command) {
    fail('foreign-target');
  }
  if (!canonicalBytes(cycle.binding ?? null).equals(canonicalBytes(scope.candidate))) fail('candidate-mismatch');
  if (!canonicalBytes(cycle.parallel ?? null).equals(canonicalBytes(scope.parallel))) fail('parallel-tuple-mismatch');
  if (currentFingerprint === input.target.oldFingerprint) fail('unchanged-fingerprint');
  const index = sourceCurrencyIndex(evidence, orders, source);
  if (index.validlyVoidedCycles.has(cycle)
    || !index.cyclesByTest.get(cycle.testId)?.some((entry) => entry.cycleId === cycle.cycleId)) fail('target-retired');
  const selector = sourceTerminalSelectors(evidence, orders, source, selectedScope).find((entry) =>
    entry.cycleId === input.target.cycleId && entry.terminalKind === input.target.kind
    && entry.terminalOrder === input.target.order && entry.terminalSha256 === input.target.payloadSha256);
  if (!selector) fail('target-missing');
  if (selector.oldFingerprint !== input.target.oldFingerprint) fail('old-fingerprint-mismatch');
  if (source.operations.some((operation) => canonicalBytes(operation.journal.payload.target).equals(canonicalBytes(input.target)))) {
    fail('successor-exists');
  }
  if (!authoritativeRepairCycle(cycle) || cycle.red.testFingerprint !== cycle.green?.testFingerprint) fail('target-missing');
  const event = greatestVerifiedEvent(index, input.testId, {
    terminalScope: selectedScope, voidScope: selectedScope, workScope: selectedScope,
  });
  if (input.mode === 'test-only') {
    const selected = effectiveLatestCycle(index, input.testId, undefined, selectedScope);
    if (event?.kind !== 'terminal' || !selected || selected.cycle.cycleId !== cycle.cycleId || selected.order !== input.target.order) {
      fail('target-not-selected');
    }
    return { cycle, replacement: null };
  }
  const replacements = evidence.cycles.filter((entry) => entry.cycleId === input.replacementCycleId);
  if (replacements.length !== 1) fail('replacement-invalid');
  const replacement = replacements[0]!;
  const selected = effectiveLatestCycle(index, input.testId, undefined, selectedScope);
  if (replacement.cycleId === cycle.cycleId || !selectedScope(replacement)
    || !canonicalBytes(replacement.binding ?? null).equals(canonicalBytes(scope.candidate))
    || !canonicalBytes(replacement.parallel ?? null).equals(canonicalBytes(scope.parallel))
    || !authoritativeRepairCycle(replacement)
    || replacement.red.order! <= input.target.order
    || replacement.red.testFingerprint !== currentFingerprint || replacement.green?.testFingerprint !== currentFingerprint
    || event?.kind !== 'terminal' || !selected || selected.cycle.cycleId !== replacement.cycleId
    || selected.fingerprint !== currentFingerprint) fail('replacement-invalid');
  const before = effectiveLatestCycle(index, input.testId, replacement.red.order, selectedScope);
  if (!before || before.cycle.cycleId !== cycle.cycleId || before.order !== input.target.order) fail('target-not-selected');
  return { cycle, replacement: {
    cycleId: replacement.cycleId!, redOrder: replacement.red.order!, greenOrder: replacement.green!.order!,
    redPayloadSha256: digest(JSON.stringify(replacement.red)),
    greenPayloadSha256: digest(JSON.stringify(replacement.green)), testFingerprint: currentFingerprint,
  } };
}

/** @id CODE-M5-SOURCE-ADMISSION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-005 DES-M5-006 DES-M5-007 DES-M5-023
 */
async function prepareSourceAdmission(
  root: string, input: SourcePreparationRequest, replayArtifact: boolean,
): Promise<PreparedSourceAdmission> {
  const active = await requireSourceOperationGeneration(root, input);
  let operationScope: SourceScope | null = null;
  const fail: (reason: SourceReason<'TDD_SOURCE_ADMISSION_INVALID'>) => never = (reason) => {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', reason,
      { operationId: input.operationId, scope: operationScope, target: input.target });
  };
  if (!active.requirementIds.includes(input.requirementId)) fail('requirement-outside-scope');
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const sources = await inspectSourceEvidence(root, evidence);
  await requireNoPendingTddRepair(root, evidence, sources);
  const targets = evidence.cycles.filter((entry) => entry.cycleId === input.target.cycleId);
  if (targets.length !== 1) fail('target-missing');
  const target = targets[0]!;
  const scope: SourceScope = {
    repositoryId: await sourceRepositoryIdentity(root), changeId: input.changeId, generation: input.generation,
    requirementId: input.requirementId, testId: input.testId, path: target.testPath, command: input.command,
    candidate: target.binding ?? null, parallel: target.parallel ?? null, domain: null,
  };
  operationScope = scope;
  const evaluated = (source: SourceLedgerClassification): SourceLedgerClassification => replayArtifact
    ? { ...source, operations: source.operations.filter((entry) => entry.journal.idempotencyKey !== sourceOperationKey(input, input.operationId)) }
    : source;
  requireSourceWriterAllowed(evaluated(sources), scope,
    [input.target.cycleId, ...(input.replacementCycleId ? [input.replacementCycleId] : [])]);
  const candidateContext = async (): Promise<CandidateEvidenceContext | undefined> => {
    if (!target.binding) return undefined;
    const registry = await readCandidateRegistry(root);
    const candidate = registry?.candidates.find((entry) => entry.candidateId === target.binding!.candidateId);
    if (!candidate || candidate.repositoryId !== scope.repositoryId
      || ['failed', 'abandoned', 'stale', 'deleted'].includes(candidate.state)) fail('candidate-mismatch');
    const context = { repositoryId: candidate.repositoryId, candidateId: candidate.candidateId,
      changeId: candidate.changeId, generation: candidate.generation, baseCommit: candidate.baseCommit,
      candidateCommit: candidate.candidateCommit };
    if (!validateCandidateBinding(target, context).valid) fail('candidate-mismatch');
    return context;
  };
  const binding = await candidateContext();
  const config = await loadConfig(root);
  let domain: Awaited<ReturnType<typeof resolveRequirementDomain>>;
  try { domain = await resolveRequirementDomain(root, config.approval, input.requirementId); }
  catch (cause) {
    if (cause instanceof Error && /(domain|owner|ambiguous|requirement)/i.test(cause.message)) {
      fail(/ambiguous|multiple/i.test(cause.message) ? 'ownership-ambiguous' : 'domain-mismatch');
    }
    throw cause;
  }
  scope.domain = domain?.name ?? null;
  const stages = await Promise.all((['requirements', 'design'] as const).map((stage) =>
    validateApprovalStage(root, stage, config.approval, domain, binding, { ...active, documentStatus: 'active' })));
  for (const stage of stages) {
    if (stage.status === 'missing' || !stage.evidence) fail('general-approval-missing');
    if (stage.status !== 'approved') fail('general-approval-stale');
  }
  const approvals = stages.map((stage) => stage.evidence!);
  const approvalProof = (approval: ApprovalEvidence) => {
    const { approver: _approver, approvedAt: _approvedAt, ...proof } = approval;
    return proof;
  };
  const parallelCurrent = async (): Promise<void> => {
    if (target.parallel && await classifyParallelTddEvidence(root, {
      changeId: input.changeId, generation: input.generation, requirementId: input.requirementId,
      cycleId: target.cycleId!, planId: target.parallel.planId, assignmentId: target.parallel.assignmentId,
      attempt: target.parallel.attempt, purpose: 'readiness', evidenceRoot: root,
    }) !== 'pass') fail('parallel-unconsumed');
  };
  await parallelCurrent();
  const trace = await buildTrace(root, false);
  const tests = trace.nodes.filter((node) => node.kind === 'test' && node.id === input.testId);
  if (tests.length !== 1 || tests[0]!.path !== target.testPath
    || !trace.edges.some((edge) => edge.from === input.testId && edge.to === input.requirementId && edge.relation === 'verifies')) {
    fail('trace-ambiguous');
  }
  const node = tests[0]!;
  const bytes = await readFile(await safePath(root, node.path));
  const currentFile = bytes.toString('utf8');
  if (!Buffer.from(currentFile).equals(bytes)) fail('boundary-unresolved');
  const start = sourceLineStartOffset(currentFile, node.line);
  const parsed = ts.createSourceFile(node.path, currentFile, ts.ScriptTarget.Latest, true);
  const statement = testStatements(parsed).find((entry) => entry.getStart(parsed) >= start);
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) fail('boundary-unresolved');
  const block = currentFile.slice(start, statement.end);
  if (!canonicalBytes([...block.matchAll(/@id\s+(TEST-[A-Z0-9-]+)/g)].map((match) => match[1]))
    .equals(canonicalBytes([input.testId]))) fail('trace-ambiguous');
  const fingerprint = testFingerprintFromText(node, currentFile);
  const order = await loadEvidenceOrder(root);
  const selected = selectSourceAdmissionTarget(evidence, order, evaluated(sources), input, scope, fingerprint);
  const command = config.commands.find((entry) => entry.name === input.command);
  if (!command) fail('snapshot-unverifiable');
  return {
    scope, node, currentFile, command, replacement: selected.replacement,
    source: { nodeId: node.id, annotationStart: Buffer.byteLength(currentFile.slice(0, start)),
      statementEnd: Buffer.byteLength(currentFile.slice(0, statement.end)), currentFileSha256: sha256(bytes),
      newBlockSha256: sha256(Buffer.from(block)), oldBlockSha256: null, oldFingerprint: input.target.oldFingerprint,
      newFingerprint: fingerprint, oldSourceDigest: input.target.oldFingerprint, newSourceDigest: fingerprint },
    approvalContext: { requirementsSha256: approvals[0]!.artifactSha256, designSha256: approvals[1]!.artifactSha256,
      domain: scope.domain },
    recheck: async (current, currentOrder, currentSources) => {
      const selection = await requireSourceOperationGeneration(root, input);
      if (!canonicalBytes(selection.requirementIds).equals(canonicalBytes(active.requirementIds))) fail('requirement-outside-scope');
      await requireNoPendingTddRepair(root, current, currentSources);
      selectSourceAdmissionTarget(current, currentOrder, evaluated(currentSources), input, scope, fingerprint);
      await candidateContext();
      await parallelCurrent();
      for (const approved of approvals) {
        const latest = await loadApproval(root, approved.stage, domain?.name);
        if (!latest || !canonicalBytes(approvalProof(latest)).equals(canonicalBytes(approvalProof(approved)))) {
          fail('general-approval-stale');
        }
      }
    },
  };
}

export function prepareSourceSupersession(root: string, input: SourcePreparationRequest): Promise<SourcePreparationResult> {
  return prepareSourceReview(root, input, prepareSourceAdmission);
}

export function approveSourceSupersession(
  root: string, input: SourceOperationScope & { artifactSha256: string; approver: string; confirm: boolean },
): Promise<SourceApprovalResult> {
  return approveSourceReview(root, input, prepareSourceAdmission);
}

export function recordSourceSupersession(
  root: string, input: SourceOperationScope & { artifactSha256: string; approvalSha256: string },
): Promise<SourceResult> {
  return recordSourceReview(root, input, prepareSourceAdmission);
}

/** @id CODE-M5-SOURCE-READ-MODELS-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-023
 */
export function tddSourceReadProjection(
  evidence: TddEvidence, order: EvidenceOrderLog | null, source: SourceLedgerClassification,
  scope: TddCycleScopePredicate, fingerprints: ReadonlyMap<string, string> = new Map(),
): { sourceSupersessions: SourceSupersessionSummary[]; sourceTerminalSelectors: SourceTerminalSelector[]; diagnostics: Diagnostic[] } {
  const selectors = source.valid ? sourceTerminalSelectors(evidence, order, source, scope, fingerprints) : [];
  const diagnostics: Diagnostic[] = [...source.diagnostics];
  const summaries = source.operations.map((operation): SourceSupersessionSummary => {
    const p = operation.journal.payload;
    const cycleId = operation.projection?.cycleId ?? p.replacement?.cycleId ?? p.target.cycleId;
    const cycle = evidence.cycles.find((entry) => entry.cycleId === cycleId);
    const evaluated = cycle !== undefined && scope(cycle);
    const state = source.valid ? operation.state : 'invalid';
    const selector = state === 'completed'
      ? selectors.find((entry) => entry.cycleId === cycleId && entry.terminalKind === 'source-supersession'
        && entry.terminalOrder === operation.order) ?? null : null;
    const resumeArgs = state === 'pending' && evaluated ? sourceResumeArgs(operation) : null;
    if (resumeArgs) diagnostics.push(new SourceOperationError('TDD_SOURCE_PENDING', 'completion-required',
      { operationId: p.operationId, scope: p.scope, target: p.target }, {
        blockingOperationId: p.operationId, testId: p.scope.testId, targetCycleId: p.target.cycleId,
        requestSha256: p.requestSha256, artifactSha256: p.reviewSha256, approvalSha256: p.approvalSha256, resumeArgs,
      }).diagnostic);
    return {
      operationId: p.operationId, scope: p.scope, mode: p.mode, target: p.target, cycleId,
      newFingerprint: p.newFingerprint, journalOrder: operation.journal.order, order: operation.order, state,
      selectionReason: state === 'invalid' ? 'invalid-evidence' : !evaluated ? 'outside-scope'
        : state === 'pending' ? 'pending-suffix' : selector?.selectionReason ?? 'older-terminal',
      terminalSelector: selector, requestSha256: state === 'invalid' ? null : p.requestSha256,
      artifactSha256: state === 'invalid' ? null : p.reviewSha256,
      approvalSha256: state === 'invalid' ? null : p.approvalSha256, resumeArgs,
    };
  });
  summaries.sort((a, b) => Buffer.compare(Buffer.from(a.scope.changeId), Buffer.from(b.scope.changeId))
    || a.scope.generation - b.scope.generation || Buffer.compare(Buffer.from(a.scope.testId), Buffer.from(b.scope.testId))
    || a.journalOrder - b.journalOrder);
  return { sourceSupersessions: summaries, sourceTerminalSelectors: selectors, diagnostics };
}

export async function readTddSourceStatus(
  root: string, selected: { changeId: string; generation: number | null } | null,
  context?: CandidateEvidenceContext | IntegrationEvidenceContext,
): Promise<ReturnType<typeof tddSourceReadProjection>> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const order = await loadEvidenceOrder(root);
  const source = await inspectSourceEvidence(root, evidence, undefined, order);
  const scope = sourceEvaluationScope(selected, context);
  const fingerprints = new Map<string, string>();
  if (evidence.cycles.length) {
    const trace = await buildTrace(root, false);
    for (const test of trace.nodes.filter((node) => node.kind === 'test')) {
      fingerprints.set(test.id, await testFingerprint(root, test));
    }
  }
  return tddSourceReadProjection(evidence, order, source, scope, fingerprints);
}

function sourceEvaluationScope(
  selected: { changeId: string; generation: number | null } | null,
  context?: CandidateEvidenceContext | IntegrationEvidenceContext,
): TddCycleScopePredicate {
  const candidates = context ? 'integrationId' in context ? context.candidates : [context] : [];
  return (cycle) => context
    ? candidates.some((candidate) => cycle.changeId === candidate.changeId
      && cycle.generation === candidate.generation && validateCandidateBinding(cycle, candidate).valid)
    : selected !== null && cycle.changeId === selected.changeId && (cycle.generation ?? 1) === selected.generation;
}

/** @id CODE-M5-SOURCE-QUALITY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-015 DES-M5-023
 */
export async function readTddSourceQuality(
  root: string, selected: { changeId: string; generation: number | null } | null,
  context?: CandidateEvidenceContext | IntegrationEvidenceContext,
): Promise<{ valid: boolean; digest: string | null; diagnostics: Diagnostic[] }> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const source = await inspectSourceEvidence(root, evidence);
  if (!source.valid) return { valid: false, digest: null, diagnostics: source.diagnostics };
  const cycles = evidence.cycles.filter(sourceEvaluationScope(selected, context));
  const ids = new Set(cycles.map((cycle) => cycle.cycleId));
  const relevant = source.operations.some(({ projection }) => projection
    && (ids.has(projection.target.cycleId) || ids.has(projection.cycleId)));
  return { valid: true, diagnostics: [],
    digest: relevant ? selectedTddEvidenceDigest(evidence, source, cycles) : null };
}

/** @id CODE-M5-TDD-CURRENCY-REPAIR-001
 * @implements REQ-M5-TDD-CURRENCY-001
 * @design DES-M5-TDD-CURRENCY-001
 */
function effectiveLatestCycle(
  index: TddCurrencyIndex,
  testId: string,
  upperBoundExclusive?: number,
  scopePredicate: TddCycleScopePredicate = allCycles,
): Readonly<EffectiveTddCurrencySelection> | undefined {
  let best: Readonly<EffectiveTddCurrencySelection> | undefined;
  for (const cycle of index.cyclesByTest.get(testId) ?? []) {
    if (!scopePredicate(cycle)) continue;
    const selection = terminalFingerprintEvidence(index, cycle);
    if (!selection || (upperBoundExclusive !== undefined && selection.order >= upperBoundExclusive)) continue;
    if (!best || selection.order > best.order) best = selection;
  }
  return best;
}

function workEventOrder(index: TddCurrencyIndex, cycle: TddCycle): number | undefined {
  if (cycle.green?.valid) return undefined;
  if (cycle.green
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'green', cycle.green)) {
    return cycle.green.order;
  }
  if (cycle.red?.valid
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'red', cycle.red)) {
    return cycle.red.order;
  }
  return undefined;
}

function greatestVerifiedEvent(
  index: TddCurrencyIndex,
  testId: string,
  eventScope: TddEventScope,
): TddVerifiedEvent | undefined {
  const terminalScope = eventScope.terminalScope ?? allCycles;
  const voidScope = eventScope.voidScope ?? allCycles;
  const workScope = eventScope.workScope ?? allCycles;
  let greatest: TddVerifiedEvent | undefined;
  const consider = (event: TddVerifiedEvent): void => {
    if (!greatest || event.order > greatest.order) greatest = event;
  };
  for (const cycle of index.cyclesByTest.get(testId) ?? []) {
    if (terminalScope(cycle)) {
      const terminal = terminalFingerprintEvidence(index, cycle);
      if (terminal) consider({ cycle, order: terminal.order, kind: 'terminal' });
    }
    if (voidScope(cycle) && index.validlyVoidedCycles.has(cycle) && cycle.void?.order !== undefined) {
      consider({ cycle, order: cycle.void.order, kind: 'void' });
    }
    if (workScope(cycle)) {
      const order = workEventOrder(index, cycle);
      if (order !== undefined) consider({ cycle, order, kind: 'work' });
    }
  }
  return greatest;
}

function noActiveWorkScope(
  unbounded: EffectiveTddCurrencySelection,
): TddCycleScopePredicate {
  return (cycle) => cycle.changeId === undefined
    || (cycle.changeId === unbounded.cycle.changeId
      && (cycle.generation ?? 1) === (unbounded.cycle.generation ?? 1));
}

function eventScopeForSelection(
  activeChange: ActiveChangeContext | null,
  operationScope: TddCycleScopePredicate,
  unbounded: EffectiveTddCurrencySelection | undefined,
): TddEventScope | undefined {
  if (activeChange) {
    return {
      terminalScope: operationScope,
      voidScope: operationScope,
      workScope: operationScope,
    };
  }
  if (!unbounded) return undefined;
  return {
    terminalScope: allCycles,
    voidScope: allCycles,
    workScope: noActiveWorkScope(unbounded),
  };
}

export async function migrateTddFingerprint(root: string, testId: string, approver: string): Promise<TddMigrationResult> {
  if (!approver.trim()) throw new Error('An approver is required to migrate TDD fingerprint evidence.');
  const evidence = await loadTddEvidence(root);
  if (!evidence) throw new Error('No TDD evidence found.');
  await requireNoPendingTddRepair(root, evidence);
  if (!evidence.cycles.some((entry) => entry.testId === testId)) {
    throw new Error(`No TDD cycle found for ${testId}.`);
  }
  const order = await inspectEvidenceOrder(root);
  const chainIndex = buildTddChainIndex(evidence.chain);
  const validlyVoided = new Set(evidence.cycles.filter((entry) =>
    voidLinkage(evidence, order, entry, chainIndex).valid));
  const index = buildTddCurrencyIndex(evidence, order, validlyVoided, chainIndex);
  const activeChange = await maintenanceChangeContext(root);
  const operationScope = activeScope(activeChange);
  const unbounded = effectiveLatestCycle(index, testId, undefined, operationScope);
  const eventScope = eventScopeForSelection(activeChange, operationScope, unbounded);
  if (!unbounded || !eventScope) throw new Error(`${testId} has no valid Green phase to migrate.`);
  const event = greatestVerifiedEvent(index, testId, eventScope);
  if (event?.kind === 'work') throw new Error(`${testId} has no valid Green phase to migrate.`);
  const selection = effectiveLatestCycle(
    index,
    testId,
    event?.kind === 'void' ? event.order : undefined,
    operationScope,
  );
  if (!selection) throw new Error(`${testId} has no valid Green phase to migrate.`);
  const cycle = selection.cycle;
  if (cycle.migrate) throw new Error(`${testId} has already been migrated.`);
  const trace = await buildTrace(root);
  const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
  if (!test) throw new Error(`Annotated test ID not found: ${testId}`);
  const storedFingerprint = selection.fingerprint;
  const legacyCurrent = await legacyTestFingerprint(root, test);
  if (legacyCurrent !== storedFingerprint) {
    return {
      migrated: false,
      testId,
      reason: `${testId}'s recorded fingerprint does not match its current source under the superseded algorithm; this is real drift, not an algorithm-only change. Run a genuine Red/Green cycle instead.`,
    };
  }
  const toFingerprint = await testFingerprint(root, test);
  const record: TddMigrationEvidence = {
    phase: 'migrate',
    fromFingerprint: storedFingerprint,
    toFingerprint,
    approver: approver.trim(),
    recordedAt: new Date().toISOString(),
  };
  return commitPreparedTddMutation(root, activeChange, evidence, testId, async (latest, leases, source) => {
    await requireNoPendingTddRepair(root, latest, source);
    if (await testFingerprint(root, test) !== toFingerprint) {
      throw new Error('The test changed during fingerprint migration; run the migration again.');
    }
    const target = latest.cycles.find((entry) => entry.cycleId === cycle.cycleId)!;
    record.order = (await appendEvidenceOrder(root, {
      kind: 'tdd', entityId: target.cycleId!, phase: 'migrate',
    }, leases.appendSession)).sequence;
    target.migrate = record;
    appendChainRecord(latest, target, 'migrate', record);
    await persistTddLedger(root, latest, leases);
    return { migrated: true, testId, fromFingerprint: storedFingerprint, toFingerprint };
  }, !!cycle.binding, [cycle.cycleId!]);
}

export async function loadTddEvidence(root: string): Promise<TddEvidence | null> {
  const path = '.musubix/evidence/tdd.json';
  if (!await exists(within(root, path))) return null;
  const value = JSON.parse(await readText(root, path)) as TddEvidence;
  if (value.schemaVersion !== 1 || !Array.isArray(value.cycles)) throw new Error('Invalid TDD evidence.');
  return value;
}

export interface TddRepairIdentity {
  operationId: string;
  requestSha256: string;
  request: TddRepairRequest;
}

export interface TddRepairResult {
  repaired: true;
  replayed: boolean;
  resumed: boolean;
  operationId: string;
  testId: string;
  targetCycleId: string;
  disposition: 'replacement' | 'retirement';
  replacementCycleId?: string;
  fallbackCycleId?: string;
  approver: string;
  reason: string;
  order: number;
}

export interface TddRepairAbandonmentResult {
  abandoned: true;
  replayed: boolean;
  operationId: string;
  testId: string;
  targetCycleId: string;
  failureCause: TddRepairFailureCause;
  approver: string;
  reason: string;
  order: number;
}

function repairError(code: string, message: string, details?: object): never {
  throw new Error(`${code}: ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

export function tddRepairOperationIdentity(input: {
  testId: string;
  targetCycleId: string;
  disposition: 'replacement' | 'retirement';
  replacementCycleId?: string;
  approver: string;
  reason: string;
}): TddRepairIdentity {
  const request: TddRepairRequest = {
    schemaVersion: 1,
    testId: input.testId,
    targetCycleId: input.targetCycleId,
    disposition: input.disposition,
    replacementCycleId: input.disposition === 'replacement' ? input.replacementCycleId ?? null : null,
    approver: input.approver.trim(),
    reason: input.reason.trim(),
  };
  const requestSha256 = sha256(canonicalBytes(request));
  return { operationId: `tdd-repair:${requestSha256}`, requestSha256, request };
}

function repairRecordResult(
  repair: TddRepairRecord,
  replayed: boolean,
  resumed: boolean,
): TddRepairResult {
  return {
    repaired: true,
    replayed,
    resumed,
    operationId: repair.operationId,
    testId: repair.testId,
    targetCycleId: repair.targetCycleId,
    disposition: repair.retired ? 'retirement' : 'replacement',
    ...(repair.replacementCycleId ? { replacementCycleId: repair.replacementCycleId } : {}),
    ...(repair.fallbackCycleId ? { fallbackCycleId: repair.fallbackCycleId } : {}),
    approver: repair.approver,
    reason: repair.reason,
    order: repair.order,
  };
}

function repairJournalPayload(record: JournalRecord): TddRepairJournalPayload | null {
  if (record.kind !== 'tdd-repair-v1' || !record.payload || typeof record.payload !== 'object') return null;
  return record.payload as TddRepairJournalPayload;
}

export function validateTddRepairLedger(evidence: TddEvidence): {
  valid: boolean;
  repairs: TddRepairRecord[];
} {
  const repairs: TddRepairRecord[] = [];
  const operations = new Set<string>();
  const targets = new Set<string>();
  const replacements = new Set<string>();
  for (const repair of evidence.repairs ?? []) {
    const identity = tddRepairOperationIdentity({
      testId: repair.testId,
      targetCycleId: repair.targetCycleId,
      disposition: repair.retired ? 'retirement' : 'replacement',
      ...(repair.replacementCycleId ? { replacementCycleId: repair.replacementCycleId } : {}),
      approver: repair.approver,
      reason: repair.reason,
    });
    const dispositionValid = repair.retired === true
      ? !repair.replacementCycleId && typeof repair.fallbackCycleId === 'string'
      : typeof repair.replacementCycleId === 'string' && repair.retired === undefined
        && repair.fallbackCycleId === undefined;
    if (!dispositionValid
      || repair.operationId !== identity.operationId
      || repair.requestSha256 !== identity.requestSha256
      || operations.has(repair.operationId)
      || targets.has(repair.targetCycleId)
      || (repair.replacementCycleId !== undefined && replacements.has(repair.replacementCycleId))) {
      return { valid: false, repairs: [] };
    }
    operations.add(repair.operationId);
    targets.add(repair.targetCycleId);
    if (repair.replacementCycleId) replacements.add(repair.replacementCycleId);
    repairs.push(repair);
  }
  return { valid: true, repairs };
}

export function repairAwareCycles(evidence: TddEvidence): TddCycle[] {
  const ledger = validateTddRepairLedger(evidence);
  if (!ledger.valid) return evidence.cycles;
  const suppressed = new Set(ledger.repairs.map((repair) => repair.targetCycleId));
  return evidence.cycles.filter((cycle) => !cycle.cycleId || !suppressed.has(cycle.cycleId));
}

export function pendingTddRepair(
  journal: JournalRecord[],
  evidence: TddEvidence,
): { operationId: string; testId: string; targetCycleId: string } | null {
  const completed = new Set([
    ...(evidence.repairs ?? []).map((repair) => repair.operationId),
    ...(evidence.repairAbandonments ?? []).map((repair) => repair.operationId),
  ]);
  for (const record of journal) {
    const payload = repairJournalPayload(record);
    if (!payload || completed.has(record.idempotencyKey)) continue;
    const testId = payload.record?.testId ?? payload.request?.testId;
    const targetCycleId = payload.record?.targetCycleId ?? payload.request?.targetCycleId;
    if (typeof testId === 'string' && typeof targetCycleId === 'string') {
      return { operationId: record.idempotencyKey, testId, targetCycleId };
    }
  }
  return null;
}

/** @id CODE-M5-SOURCE-WRITER-GUARD-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
async function requireNoPendingTddRepair(
  root: string, evidence?: TddEvidence, source?: SourceLedgerClassification,
): Promise<SourceLedgerClassification> {
  const current = evidence ?? await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const verified = source ?? await inspectSourceEvidence(root, current);
  requireSourceLedger(verified);
  const pending = pendingTddRepair(await loadJournalRecords(root), current);
  if (pending) {
    repairError(
      'TDD_REPAIR_PENDING',
      `pending repair ${pending.operationId} for ${pending.testId}:${pending.targetCycleId} must be resumed or abandoned before TDD evidence can change.`,
      pending,
    );
  }
  return verified;
}

function completeRepairChainValid(evidence: TddEvidence): boolean {
  if (!evidence.chain) return evidence.cycles.length <= 1 && !(evidence.repairs?.length);
  for (const [index, record] of evidence.chain.entries()) {
    const expectedPrevious = index === 0 ? null : evidence.chain[index - 1]!.recordSha256;
    const { recordSha256, ...payload } = record;
    if (record.sequence !== index + 1
      || record.previousSha256 !== expectedPrevious
      || recordSha256 !== chainRecordSha256(payload)) return false;
  }
  return validateTddRepairLedger(evidence).valid;
}

function appendRepairChainRecord(evidence: TddEvidence, target: TddCycle, repair: TddRepairRecord): void {
  if (!target.cycleId) repairError('TDD_REPAIR_BINDING_MISMATCH', 'Target cycle lacks a stable identity.');
  evidence.chain ??= [];
  const previous = evidence.chain.at(-1);
  const payload: Omit<Exclude<TddChainRecord, { phase: 'source-supersession' }>, 'recordSha256'> = {
    sequence: evidence.chain.length + 1,
    cycleId: target.cycleId,
    changeId: repair.changeId,
    generation: repair.generation,
    ...(repair.binding ? { binding: repair.binding } : {}),
    requirementId: repair.requirementId,
    testId: repair.testId,
    testPath: target.testPath,
    commandName: target.commandName,
    parallel: repair.parallel,
    phase: 'repair',
    phaseEvidenceSha256: digest(JSON.stringify(repair)),
    previousSha256: previous?.recordSha256 ?? null,
  };
  evidence.chain.push({ ...payload, recordSha256: chainRecordSha256(payload) });
}

async function requireRepairAuthorization(
  root: string,
  target: TddCycle,
): Promise<void> {
  const config = await loadConfig(root);
  let domain;
  try {
    domain = await resolveRequirementDomain(root, config.approval, target.requirementId);
  } catch {
    repairError(
      'TDD_REPAIR_AUTHORIZATION_INVALID',
      `Design approval is not authorized for ${target.requirementId}.`,
      { requirementId: target.requirementId, domain: null, status: 'domain-mismatch' },
    );
  }
  const validation = await validateApprovalStage(root, 'design', config.approval, domain);
  if (validation.status !== 'approved') {
    repairError(
      'TDD_REPAIR_AUTHORIZATION_INVALID',
      `Design approval is ${validation.status} for ${target.requirementId}.`,
      {
        requirementId: target.requirementId,
        domain: domain?.name ?? null,
        status: validation.status === 'missing' ? 'missing' : 'stale',
      },
    );
  }
}

function targetInvalid(
  cause: 'cycle-not-found' | 'cycle-id-ambiguous' | 'foreign-operation-scope'
    | 'target-not-parallel-bound' | 'target-parallel-binding-not-stale'
    | 'retirement-fallback-missing' | 'retirement-fallback-ambiguous',
  testId: string,
  targetCycleId: string,
): never {
  repairError(
    'TDD_REPAIR_TARGET_INVALID',
    `${testId}:${targetCycleId} is not an eligible TDD repair target (${cause}).`,
    { cause, testId, targetCycleId },
  );
}

function resolveRepairCycle(evidence: TddEvidence, cycleId: string, testId: string): TddCycle {
  const matches = evidence.cycles.filter((cycle) => cycle.cycleId === cycleId);
  if (matches.length === 0) targetInvalid('cycle-not-found', testId, cycleId);
  if (matches.length > 1) targetInvalid('cycle-id-ambiguous', testId, cycleId);
  const target = matches[0]!;
  if (target.testId !== testId) {
    repairError('TDD_REPAIR_BINDING_MISMATCH', `${testId}:${cycleId} does not match the recorded test binding.`);
  }
  return target;
}

function authoritativeRepairCycle(cycle: TddCycle): boolean {
  return cycle.red.valid === true
    && cycle.green?.valid === true
    && cycle.red.testStatus === 'failed'
    && cycle.green.testStatus === 'passed'
    && Number.isInteger(cycle.red.order)
    && Number.isInteger(cycle.green.order)
    && cycle.red.order! < cycle.green.order!
    && cycle.red.commandSha256 === cycle.green.commandSha256;
}

async function repairCycleSourceCurrent(root: string, cycle: TddCycle): Promise<boolean> {
  const trace = await buildTrace(root, false);
  const test = trace.nodes.find((node) =>
    node.kind === 'test' && node.id === cycle.testId && node.path === cycle.testPath);
  if (!test) return false;
  const fingerprint = await testFingerprint(root, test);
  return cycle.red.testFingerprint === fingerprint
    && cycle.green?.testFingerprint === fingerprint;
}

async function persistRepairProjection(
  root: string,
  payload: TddRepairJournalPayload,
  evidence: TddEvidence,
  resumed: boolean,
  leases: TddWriteLeaseSet,
): Promise<TddRepairResult> {
  const repair = payload.record;
  const existing = (evidence.repairs ?? []).find((entry) => entry.operationId === repair.operationId);
  if (existing) return repairRecordResult(existing, !resumed, resumed);
  const order = await inspectEvidenceOrder(root);
  if (!order.valid) repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  const orderEntry = evidenceOrderRecord(order.records, 'tdd', repair.targetCycleId, `repair:${repair.operationId}`);
  if (orderEntry && orderEntry.sequence !== repair.order) {
    repairError('TDD_REPAIR_RESUME_INVALID', `${repair.operationId} cannot be resumed.`, {
      operationId: repair.operationId,
      cause: 'partial-projection-mismatch',
    });
  }
  if (!orderEntry) {
    const appended = await appendEvidenceOrder(root, {
      kind: 'tdd',
      entityId: repair.targetCycleId,
      phase: `repair:${repair.operationId}`,
      testId: repair.testId,
    }, leases.appendSession);
    if (appended.sequence !== repair.order) {
      repairError('TDD_REPAIR_RESUME_INVALID', `${repair.operationId} cannot be resumed.`, {
        operationId: repair.operationId,
        cause: 'partial-projection-mismatch',
      });
    }
  }
  const target = resolveRepairCycle(evidence, repair.targetCycleId, repair.testId);
  evidence.repairs ??= [];
  evidence.repairs.push(repair);
  appendRepairChainRecord(evidence, target, repair);
  await persistTddLedger(root, evidence, leases);
  return repairRecordResult(repair, false, resumed);
}

/** @id CODE-M5-WAVE1-TDD-REPAIR-001
 * @implements REQ-M5-COMPAT-013 REQ-M5-WAVE1-TDD-001 REQ-M5-WAVE1-TDD-002
 * @design DES-M5-TDD-REPAIR-001 DES-M5-TDD-REPAIR-002 DES-M5-TDD-REPAIR-004
 */
export async function appendTddRepair(root: string, input: {
  testId: string;
  targetCycleId: string;
  replacementCycleId?: string;
  retire?: boolean;
  approver: string;
  reason: string;
}): Promise<TddRepairResult> {
  const evidence = await loadTddEvidence(root);
  if (!evidence) repairError('TDD_REPAIR_TARGET_INVALID', 'No TDD evidence found.', {
    cause: 'cycle-not-found',
    testId: input.testId,
    targetCycleId: input.targetCycleId,
  });
  await requireNoPendingTddRepair(root, evidence);
  if (!completeRepairChainValid(evidence)) {
    repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  }
  const operationIdentity = tddRepairOperationIdentity({
    testId: input.testId,
    targetCycleId: input.targetCycleId,
    disposition: input.retire ? 'retirement' : 'replacement',
    ...(input.replacementCycleId ? { replacementCycleId: input.replacementCycleId } : {}),
    approver: input.approver,
    reason: input.reason,
  });
  const replay = (evidence.repairs ?? []).find((repair) => repair.operationId === operationIdentity.operationId);
  if (replay) return repairRecordResult(replay, true, false);
  const target = resolveRepairCycle(evidence, input.targetCycleId, input.testId);
  if ((evidence.repairs ?? []).some((repair) => repair.targetCycleId === input.targetCycleId)) {
    repairError('TDD_REPAIR_ALREADY_RECORDED', `${input.testId}:${input.targetCycleId} already has a TDD repair.`);
  }
  await requireRepairAuthorization(root, target);
  const context = await maintenanceChangeContext(root);
  if (!context || target.changeId !== context.changeId || (target.generation ?? 1) !== context.generation) {
    targetInvalid('foreign-operation-scope', input.testId, input.targetCycleId);
  }
  if (!target.parallel) targetInvalid('target-not-parallel-bound', input.testId, input.targetCycleId);
  if (!await repairCycleSourceCurrent(root, target)) {
    repairError('TDD_REPAIR_BINDING_MISMATCH', `${input.testId}:${input.targetCycleId} does not match current authoritative test source.`);
  }
  const provenance = await classifyParallelTddEvidence(root, {
    changeId: context.changeId,
    generation: context.generation,
    requirementId: target.requirementId,
    cycleId: target.cycleId ?? null,
    purpose: 'tdd-repair',
  });
  if (provenance !== 'PARALLEL_TDD_UNCONSUMED') {
    targetInvalid('target-parallel-binding-not-stale', input.testId, input.targetCycleId);
  }
  let replacement: TddCycle | undefined;
  let fallback: TddCycle | undefined;
  if (input.retire) {
    const candidates = repairAwareCycles(evidence).filter((cycle) =>
      cycle !== target
      && cycle.testId === target.testId
      && cycle.requirementId === target.requirementId
      && authoritativeRepairCycle(cycle));
    if (candidates.length === 0) targetInvalid('retirement-fallback-missing', input.testId, input.targetCycleId);
    if (candidates.length > 1) targetInvalid('retirement-fallback-ambiguous', input.testId, input.targetCycleId);
    fallback = candidates[0]!;
  } else {
    replacement = resolveRepairCycle(evidence, input.replacementCycleId!, input.testId);
    if (replacement === target
      || replacement.requirementId !== target.requirementId
      || replacement.changeId !== target.changeId
      || replacement.generation !== target.generation
      || JSON.stringify(replacement.binding ?? null) !== JSON.stringify(target.binding ?? null)
      || !authoritativeRepairCycle(replacement)
      || !await repairCycleSourceCurrent(root, replacement)
      || (evidence.repairs ?? []).some((repair) =>
        repair.targetCycleId === replacement!.cycleId || repair.replacementCycleId === replacement!.cycleId)) {
      repairError('TDD_REPAIR_REPLACEMENT_INVALID', `${input.replacementCycleId} is not the current authoritative replacement cycle.`);
    }
    if (replacement.parallel) {
      const replacementProvenance = await classifyParallelTddEvidence(root, {
        changeId: context.changeId,
        generation: context.generation,
        requirementId: target.requirementId,
        cycleId: replacement.cycleId ?? null,
        purpose: 'tdd-repair',
      });
      if (replacementProvenance !== 'pass') {
        repairError('TDD_REPAIR_REPLACEMENT_INVALID', `${input.replacementCycleId} is not the current authoritative replacement cycle.`);
      }
    }
  }
  const order = await inspectEvidenceOrder(root);
  if (!order.valid) repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  const recordedAt = new Date().toISOString();
  const record: TddRepairRecord = {
    operationId: operationIdentity.operationId,
    requestSha256: operationIdentity.requestSha256,
    targetCycleId: target.cycleId!,
    testId: target.testId,
    requirementId: target.requirementId,
    changeId: target.changeId ?? context.changeId,
    generation: target.generation ?? context.generation,
    ...(target.binding ? { binding: target.binding } : {}),
    parallel: target.parallel,
    ...(replacement ? { replacementCycleId: replacement.cycleId! } : {
      retired: true as const,
      fallbackCycleId: fallback!.cycleId!,
    }),
    approver: operationIdentity.request.approver,
    reason: operationIdentity.request.reason,
    order: order.records.size + 1,
    recordedAt,
  };
  const payload: TddRepairJournalPayload = {
    schemaVersion: 'tdd-repair-v1',
    operationId: operationIdentity.operationId,
    requestSha256: operationIdentity.requestSha256,
    request: operationIdentity.request,
    record,
  };
  return commitPreparedTddMutation(root, context, evidence, input.testId, async (latest, leases, source) => {
    await requireNoPendingTddRepair(root, latest, source);
    const currentOrder = await inspectEvidenceOrder(root);
    if (!currentOrder.valid) {
      repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
    }
    record.order = currentOrder.records.size + 1;
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: record.changeId,
      kind: 'tdd-repair-v1',
      idempotencyKey: operationIdentity.operationId,
      payload,
    }, leases.appendSession);
    return persistRepairProjection(root, payload, latest, false, leases);
  }, !!target.binding, [record.targetCycleId, ...(record.replacementCycleId ? [record.replacementCycleId] : []),
    ...(record.fallbackCycleId ? [record.fallbackCycleId] : [])]);
}

export async function resumeTddRepair(root: string, operationId: string): Promise<TddRepairResult> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const completed = (evidence.repairs ?? []).find((repair) => repair.operationId === operationId);
  if (completed) repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
    operationId,
    cause: 'already-completed',
  });
  const journal = await loadJournalRecords(root);
  const record = journal.find((entry) => entry.idempotencyKey === operationId);
  if (!record) repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
    operationId,
    cause: 'not-found',
  });
  const payload = repairJournalPayload(record);
  if (!payload || payload.schemaVersion !== 'tdd-repair-v1') {
    repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
      operationId,
      cause: 'journal-invalid',
    });
  }
  const identity = tddRepairOperationIdentity({
    testId: payload.request.testId,
    targetCycleId: payload.request.targetCycleId,
    disposition: payload.request.disposition,
    ...(payload.request.replacementCycleId
      ? { replacementCycleId: payload.request.replacementCycleId }
      : {}),
    approver: payload.request.approver,
    reason: payload.request.reason,
  });
  if (payload.operationId !== operationId
    || record.idempotencyKey !== operationId
    || payload.requestSha256 !== identity.requestSha256
    || identity.operationId !== operationId
    || payload.record.operationId !== operationId) {
    repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
      operationId,
      cause: 'identity-mismatch',
    });
  }
  const context = await maintenanceChangeContext(root);
  return commitPreparedTddMutation(root, context, evidence, payload.record.testId,
    (latest, leases) => persistRepairProjection(root, payload, latest, true, leases),
    !!payload.record.binding, [payload.record.targetCycleId,
      ...(payload.record.replacementCycleId ? [payload.record.replacementCycleId] : []),
      ...(payload.record.fallbackCycleId ? [payload.record.fallbackCycleId] : [])]);
}

function abandonmentResult(
  record: TddRepairAbandonmentRecord,
  replayed: boolean,
): TddRepairAbandonmentResult {
  return {
    abandoned: true,
    replayed,
    operationId: record.operationId,
    testId: record.testId,
    targetCycleId: record.targetCycleId,
    failureCause: record.failureCause,
    approver: record.approver,
    reason: record.reason,
    order: record.order,
  };
}

export async function abandonPendingTddRepair(
  root: string,
  operationId: string,
  approver: string,
  reason: string,
): Promise<TddRepairAbandonmentResult> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  if ((evidence.repairs ?? []).some((repair) => repair.operationId === operationId)) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'already-completed',
    });
  }
  const existing = (evidence.repairAbandonments ?? []).find((entry) => entry.operationId === operationId);
  if (existing) {
    if (existing.approver === approver.trim() && existing.reason === reason.trim()) {
      return abandonmentResult(existing, true);
    }
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'already-abandoned',
    });
  }
  const journal = await loadJournalRecords(root);
  const pendingRecord = journal.find((entry) =>
    entry.kind === 'tdd-repair-v1' && entry.idempotencyKey === operationId);
  if (!pendingRecord) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'not-found',
    });
  }
  const payload = repairJournalPayload(pendingRecord);
  if (!payload
    || typeof payload.record?.testId !== 'string'
    || typeof payload.record?.targetCycleId !== 'string') {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'journal-envelope-invalid',
    });
  }
  const identity = tddRepairOperationIdentity({
    testId: payload.request.testId,
    targetCycleId: payload.request.targetCycleId,
    disposition: payload.request.disposition,
    ...(payload.request.replacementCycleId
      ? { replacementCycleId: payload.request.replacementCycleId }
      : {}),
    approver: payload.request.approver,
    reason: payload.request.reason,
  });
  let failureCause: TddRepairFailureCause | null = null;
  if (payload.operationId !== operationId
    || payload.requestSha256 !== identity.requestSha256
    || identity.operationId !== operationId
    || payload.record.operationId !== operationId) {
    failureCause = 'identity-mismatch';
  }
  const orderLog = await loadEvidenceOrder(root);
  const partialFragments: TddRepairAbandonmentRecord['partialFragments'] = [];
  for (const [index, record] of (orderLog?.records ?? []).entries()) {
    if (record.kind === 'tdd'
      && record.entityId === payload.record.targetCycleId
      && record.phase === `repair:${operationId}`) {
      partialFragments.push({ kind: 'order', index, sha256: sha256(canonicalBytes(record)) });
    }
  }
  for (const [index, repair] of (evidence.repairs ?? []).entries()) {
    if (repair.operationId === operationId) {
      partialFragments.push({ kind: 'repair-projection', index, sha256: sha256(canonicalBytes(repair)) });
    }
  }
  for (const [index, chain] of (evidence.chain ?? []).entries()) {
    if (chain.phase === 'repair'
      && chain.cycleId === payload.record.targetCycleId
      && chain.phaseEvidenceSha256 === digest(JSON.stringify(payload.record))) {
      partialFragments.push({ kind: 'repair-chain', index, sha256: sha256(canonicalBytes(chain)) });
    }
  }
  if (!failureCause && partialFragments.length > 0) failureCause = 'partial-projection-mismatch';
  if (!failureCause) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'resumable',
    });
  }
  const precedence = new Map([['order', 0], ['repair-projection', 1], ['repair-chain', 2]]);
  partialFragments.sort((left, right) =>
    precedence.get(left.kind)! - precedence.get(right.kind)! || left.index - right.index);
  const inspected = await inspectEvidenceOrder(root);
  if (!inspected.valid || !completeRepairChainValid(evidence)) {
    repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  }
  const recordedAt = new Date().toISOString();
  const abandonment: TddRepairAbandonmentRecord = {
    operationId,
    testId: payload.record.testId,
    targetCycleId: payload.record.targetCycleId,
    failureCause,
    pendingJournalSha256: sha256(canonicalBytes(pendingRecord)),
    partialFragments,
    approver: approver.trim(),
    reason: reason.trim(),
    order: inspected.records.size + 1,
    recordedAt,
  };
  const abandonmentKey = `${operationId}:abandon:${sha256(canonicalBytes({
    approver: abandonment.approver,
    reason: abandonment.reason,
  }))}`;
  const context = await maintenanceChangeContext(root);
  return commitPreparedTddMutation(root, context, evidence, payload.record.testId, async (latest, leases) => {
    const currentOrder = await inspectEvidenceOrder(root);
    if (!currentOrder.valid) {
      repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
    }
    abandonment.order = currentOrder.records.size + 1;
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: payload.record.changeId,
      kind: 'tdd-repair-abandonment-v1',
      idempotencyKey: abandonmentKey,
      payload: {
        schemaVersion: 'tdd-repair-abandonment-v1',
        record: abandonment,
      },
    }, leases.appendSession);
    const order = await appendEvidenceOrder(root, {
      kind: 'tdd',
      entityId: operationId,
      phase: `repair-abandonment:${operationId}`,
      testId: abandonment.testId,
    }, leases.appendSession);
    if (order.sequence !== abandonment.order) {
      repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
    }
    latest.repairAbandonments ??= [];
    latest.repairAbandonments.push(abandonment);
    await persistTddLedger(root, latest, leases);
    return abandonmentResult(abandonment, false);
  }, !!payload.record.binding, [payload.record.targetCycleId,
    ...(payload.record.replacementCycleId ? [payload.record.replacementCycleId] : []),
    ...(payload.record.fallbackCycleId ? [payload.record.fallbackCycleId] : [])]);
}

/** Answers "is this cycle's recorded phase evidence genuinely intact" against
 * both the monotonic order log and the append-only hash chain, reused for
 * void-linkage validation (REQ-TDD-CYCLE-VOID-005..007) and for Green-candidate
 * verification when resolving an effective latest cycle (REQ-TDD-CYCLE-VOID-010).
 */
function phaseLinkageValid(
  order: ReturnType<typeof validateEvidenceOrderLog>,
  chain: TddChainRecord[] | undefined,
  chainIndex: TddChainIndex,
  cycle: TddCycle,
  phase: TddChainPhase,
  phaseEvidence: unknown,
): boolean {
  if (!order.valid || !cycle.cycleId || !chain) return false;
  if (phase === 'repair' || phase === 'source-supersession') return false;
  const phaseOrder = phase === 'void'
    ? cycle.void?.order
    : phase === 'migrate'
      ? cycle.migrate?.order
      : cycle[phase]?.order;
  if (phaseOrder === undefined) return false;
  const orderRecord = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, phase);
  if (!orderRecord || orderRecord.sequence !== phaseOrder) return false;
  if (phase === 'void' && orderRecord.testId !== cycle.testId) return false;
  const matches = chainIndex.get(tddChainKey(cycle.cycleId, cycle.testId, phase)) ?? [];
  if (matches.length !== 1) return false;
  const { record, position } = matches[0]!;
  const expectedPrevious = position === 0 ? null : chain[position - 1]!.recordSha256;
  const { recordSha256, ...payload } = record;
  return recordSha256 === chainRecordSha256(payload)
    && record.previousSha256 === expectedPrevious
    && record.phaseEvidenceSha256 === digest(JSON.stringify(phaseEvidence));
}

function voidLinkage(
  evidence: TddEvidence,
  order: ReturnType<typeof validateEvidenceOrderLog>,
  cycle: TddCycle,
  chainIndex: TddChainIndex = buildTddChainIndex(evidence.chain),
): { valid: boolean; reason?: string } {
  if (!cycle.void) return { valid: false };
  if (phaseLinkageValid(order, evidence.chain, chainIndex, cycle, 'void', cycle.void)) return { valid: true };
  let reason = 'an invalid monotonic evidence order log';
  if (order.valid) {
    if (!cycle.cycleId || cycle.void.order === undefined) {
      reason = 'a missing order record reference';
    } else {
      const orderRecord = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, 'void');
      if (!orderRecord || orderRecord.sequence !== cycle.void.order) reason = 'a missing or mismatched order record';
      else if (orderRecord.testId !== cycle.testId) reason = 'an order record testId mismatch';
      else if (!evidence.chain) reason = 'a missing hash chain';
      else {
        const matches = evidence.chain.filter((record) =>
          record.phase === 'void' && record.cycleId === cycle.cycleId && record.testId === cycle.testId);
        reason = matches.length === 0
          ? 'a missing chain record'
          : matches.length > 1
            ? 'a duplicate chain record'
            : 'a broken predecessor or payload hash link';
      }
    }
  }
  return { valid: false, reason: `${cycle.testId}'s void evidence is malformed: ${reason}.` };
}

export interface TddVoidResult {
  voided: boolean;
  testId: string;
  cycleId?: string;
  reason?: string;
}

/** @id CODE-M5-SOURCE-VOID-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013 REQ-M5-TDD-003
 * @design DES-M5-007 DES-M5-023 DES-M5-TDD-005
 */
export async function voidTddCycle(root: string, testId: string, approver: string, reason: string): Promise<TddVoidResult> {
  if (!approver?.trim()) throw new Error('An approver is required to void a TDD cycle.');
  if (!reason?.trim()) throw new Error('A reason is required to void a TDD cycle.');
  const evidence = await loadTddEvidence(root);
  if (!evidence) throw new Error('No TDD evidence found.');
  const source = await requireNoPendingTddRepair(root, evidence);
  const testCycles = evidence.cycles.filter((entry) => entry.testId === testId);
  if (!testCycles.length) throw new Error(`No TDD cycle found for ${testId}.`);
  const activeChange = await maintenanceChangeContext(root);
  const operationScope = activeScope(activeChange);
  const operationCycles = testCycles.filter(operationScope);
  if (!operationCycles.length) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  requireSourceWriterAllowed(source, activeChange
    ? { ...activeChange, repositoryId: await sourceRepositoryIdentity(root), testId } : null,
  operationCycles.flatMap((cycle) => cycle.cycleId ? [cycle.cycleId] : []));
  const structuralCycle = operationCycles.at(-1)!;
  if (!structuralCycle.cycleId) {
    throw new Error(`${testId} lacks a cycle ID; regenerate its evidence before voiding.`);
  }
  if (!evidence.chain && operationCycles.some((entry) => entry !== structuralCycle)) {
    throw new Error('Existing TDD evidence lacks an append-only hash chain; regenerate it before recording new phases.');
  }
  const order = await inspectEvidenceOrder(root);
  const chainIndex = buildTddChainIndex(evidence.chain);
  const validlyVoided = new Set(evidence.cycles.filter((entry) =>
    voidLinkage(evidence, order, entry, chainIndex).valid));
  const index = buildTddCurrencyIndex(evidence, order, validlyVoided, chainIndex,
    source.operations.flatMap((operation) => operation.projection ? [operation.projection] : []));
  const event = greatestVerifiedEvent(index, testId, {
    terminalScope: operationScope,
    voidScope: operationScope,
    workScope: operationScope,
  });
  if (!event) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  if (event.cycle.void && !validlyVoided.has(event.cycle)) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  if (event.kind === 'terminal') {
    throw new Error(`${testId}'s latest cycle has a valid Green phase; only a dangling cycle can be voided.`);
  }
  if (event.kind === 'void') throw new Error(`${testId}'s latest cycle is already voided.`);
  const cycle = event.cycle;
  if (cycle.void || cycle.green?.valid) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  let hasEligibleFallback = effectiveLatestCycle(index, testId, event.order, operationScope) !== undefined;
  if (!hasEligibleFallback && cycle.green?.valid === false) {
    const successorFallbacks = evidence.cycles.filter((candidate) =>
      candidate.cycleId !== cycle.cycleId
      && operationScope(candidate)
      && candidate.requirementId === cycle.requirementId
      && candidate.testPath === cycle.testPath
      && candidate.commandName === cycle.commandName
      && canonicalBytes(candidate.binding ?? null).equals(canonicalBytes(cycle.binding ?? null))
      && (candidate.red.order ?? 0) > (cycle.green?.order ?? cycle.red.order ?? 0)
      && !validlyVoided.has(candidate)
      && authoritativeRepairCycle(candidate));
    const successorFallback = successorFallbacks[0];
    if (successorFallbacks.length === 1
      && successorFallback
      && await repairCycleSourceCurrent(root, successorFallback)) {
      hasEligibleFallback = true;
    }
  }
  if (!hasEligibleFallback) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no earlier valid, non-voided Red-Green cycle to fall back on; voiding would leave it with no coverage.`,
    };
  }
  const record: TddVoidEvidence = { phase: 'void', approver, reason, recordedAt: new Date().toISOString() };
  return commitPreparedTddMutation(root, activeChange, evidence, testId, async (latest, leases, source) => {
    await requireNoPendingTddRepair(root, latest, source);
    const target = latest.cycles.find((entry) => entry.cycleId === cycle.cycleId)!;
    record.order = (await appendEvidenceOrder(root, {
      kind: 'tdd', entityId: target.cycleId!, phase: 'void', testId: target.testId,
    }, leases.appendSession)).sequence;
    target.void = record;
    appendChainRecord(latest, target, 'void', record);
    await persistTddLedger(root, latest, leases);
    return { voided: true, testId, cycleId: target.cycleId! };
  }, !!cycle.binding, [cycle.cycleId!]);
}

/** @id CODE-M5-TDD-MAINTENANCE-MERGE-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-011 DES-M5-023
 */
async function commitPreparedTddMutation<T>(
  root: string, scope: ActiveChangeContext | null, prepared: TddEvidence, testId: string,
  operation: (latest: TddEvidence, leases: TddWriteLeaseSet, source: VerifiedSourceEvidence) => Promise<T>,
  candidate: boolean,
  cycleIds: string[] = [],
): Promise<T> {
  const token = (evidence: TddEvidence): string => JSON.stringify({
    cycles: evidence.cycles.filter((cycle) => cycle.testId === testId),
    repairs: evidence.repairs,
    repairAbandonments: evidence.repairAbandonments,
    sourceSupersessions: evidence.sourceSupersessions?.filter((entry) => entry.scope.testId === testId),
  });
  const expected = token(prepared);
  return withTddEvidenceWrite(root, scope, async (leases, source) => {
    const latest = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
    if (token(latest) !== expected) {
      throw new Error('The TDD target changed during execution; run the phase again.');
    }
    return operation(latest, leases, source);
  }, candidate, true, { testId, cycleIds });
}

async function persistTddLedger(root: string, evidence: TddEvidence, leases: TddWriteLeaseSet): Promise<void> {
  await writeAuthorizedJson(root, '.musubix/evidence/tdd.json', evidence,
    () => assertTddWriteLeaseSetCurrent(root, leases), false);
}

/** @id CODE-M5-TDD-WRITER-MERGE-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-004 DES-M5-011 DES-M5-023
 */
async function withTddEvidenceWrite<T>(
  root: string, scope: ActiveChangeContext | null,
  operation: (leases: TddWriteLeaseSet, source: VerifiedSourceEvidence) => Promise<T>,
  candidate = false,
  maintenance = false,
  mutation?: { testId: string; cycleIds?: string[] },
): Promise<T> {
  try {
    const retry = Symbol('source-evidence-advanced');
    for (;;) {
      const prepared = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
      const source = await inspectSourceEvidence(root, prepared);
      requireSourceLedger(source);
      const writerScope = scope && mutation && source.operations.length
        ? { ...scope, repositoryId: await workspaceRepositoryIdentity(root), testId: mutation.testId } : null;
      requireSourceWriterAllowed(source, writerScope, mutation?.cycleIds);
      const result = await withTddWriteLeaseSet(root, scope ? [scope.changeId] : [], async (leases) => {
        const current = maintenance ? await maintenanceChangeContext(root) : await activeChangeContext(root);
        if (JSON.stringify(current) !== JSON.stringify(scope)) {
          throw new Error('CHANGE_GENERATION_PHASE: TDD recording scope changed before persistence.');
        }
        const [evidence, journals, order] = await Promise.all([
          loadTddEvidence(root), loadJournalRecords(root), loadEvidenceOrder(root),
        ]);
        const latest = classifySourceLedger(evidence ?? { schemaVersion: 1, cycles: [] }, journals, order);
        requireSourceLedger(latest);
        if (!canonicalBytes(latest.operations).equals(canonicalBytes(source.operations))) return retry;
        await source.recheck();
        requireSourceWriterAllowed(latest, writerScope, mutation?.cycleIds);
        return operation(leases, source);
      });
      if (result !== retry) return result;
    }
  } catch (cause) {
    if (cause instanceof LeaseAcquisitionTimeout) {
      const code = cause.leaseKind === 'repository-append'
        ? candidate ? 'CANDIDATE_JOURNAL_BUSY' : 'TDD_EVIDENCE_LEASE_BUSY'
        : candidate && cause.leaseKind === 'change' ? 'CANDIDATE_LEASE_BUSY' : 'CHANGE_PROJECTION_LEASE_BUSY';
      throw new Error(`${code}: ${cause.message}`);
    }
    if (candidate && cause instanceof LeaseFencedError) {
      throw new Error(`CANDIDATE_STATE_OWNERSHIP: ${cause.message}`);
    }
    throw cause;
  }
}

export async function runTddPhase(
  root: string,
  phase: TddPhase,
  testId: string,
  requirementId: string,
  commandName: string,
  runner: Runner = runProcess,
  workspace = root,
  parallel?: {
    planId: string;
    assignmentId: string;
    attempt: number;
    worktree: string;
    startCommit: string;
  },
  evidenceContext?: CandidateEvidenceContext,
): Promise<TddPhaseEvidence> {
  if (parallel) {
    if (!/^parallel-plan:[a-f0-9]{64}$/.test(parallel.planId)
      || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(parallel.assignmentId)
      || !Number.isInteger(parallel.attempt) || parallel.attempt < 1
      || !/^[a-f0-9]{40,64}$/.test(parallel.startCommit)
      || resolve(parallel.worktree) !== resolve(workspace)) {
      throw new Error('PARALLEL_TDD_UNCONSUMED: invalid parallel TDD recording identity.');
    }
  }
  const sourceBeforePreflight = await requireNoPendingTddRepair(root);
  const config = await loadConfig(root);
  if (phase === 'red') {
    const domain = await resolveRequirementDomain(root, config.approval, requirementId);
    await requireApproval(root, 'design', config.approval, domain);
  }
  const command = config.commands.find((entry) => entry.name === commandName);
  if (!command) throw new Error(`Configured command not found: ${commandName}`);
  if ((!command.tddArgs?.length || !command.tddReport) && !command.adapter) {
    throw new Error(`Configured command ${commandName} needs tddArgs and a structured tddReport.`);
  }
  if (sourceBeforePreflight.operations.some((operation) => operation.state === 'pending')) {
    const scope = await activeChangeContext(root);
    requireSourceWriterAllowed(sourceBeforePreflight,
      scope ? { ...scope, repositoryId: await workspaceRepositoryIdentity(root), testId } : null);
  }
  if (phase === 'red') {
    for (const name of config.tdd.redPreflightCommands) {
      const preflight = config.commands.find((entry) => entry.name === name)!;
      const execution = await runner(preflight.command, preflight.args, {
        cwd: commandCwd(workspace, preflight),
        timeoutMs: preflight.timeoutMs,
      });
      if (execution.status !== 'completed' || execution.exitCode !== 0) {
        throw new Error(`TDD Red preflight command ${name} failed with status ${execution.status} and exit code ${execution.exitCode ?? 'none'}.`);
      }
    }
  }
  const trace = await buildTrace(workspace, resolve(workspace) === resolve(root));
  const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
  if (!test) throw new Error(`Annotated test ID not found: ${testId}`);
  if (!trace.edges.some((edge) => edge.from === testId && edge.to === requirementId && edge.relation === 'verifies')) {
    throw new Error(`${testId} does not verify ${requirementId}.`);
  }
  const currentFingerprint = await testFingerprint(workspace, test);
  const activeChange = await activeChangeContext(root);
  const binding = evidenceContext
    ? candidateEvidenceBinding(evidenceContext, evidenceContext.candidateCommit)
    : undefined;
  const evidence: TddEvidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
  if (evidence.cycles.some((cycle) =>
    [cycle.red, cycle.green, cycle.refactor].some((item) => item && !Number.isInteger(item.order)))) {
    throw new Error('Existing TDD evidence lacks monotonic order; regenerate it before recording new phases.');
  }
  // Match a non-Red phase to the pending cycle for this exact (testId,
  // requirementId) pair, not merely the latest cycle for testId: one test ID
  // can have more than one independently pending cycle for different
  // requirement IDs. All validation for the phase runs here, before the test
  // command executes and before appendEvidenceOrder is called below, so a
  // rejection never leaks an order-log entry that could block a later,
  // correctly-matched recording for the same cycle.
  const previous = evidence.cycles
    .filter((cycle) => cycle.testId === testId && cycle.requirementId === requirementId)
    .at(-1);
  if (phase !== 'red') {
    if (!previous) throw new Error(`${phase} must use the same requirement and command as Red.`);
    if (previous.commandName !== commandName) throw new Error(`${phase} must use the same requirement and command as Red.`);
    if (!previous.red.valid) throw new Error(`A valid Red phase is required before ${phase}.`);
    if (previous.red.testFingerprint !== currentFingerprint) throw new Error('The test changed after Red; run the Red phase again.');
    if (phase === 'refactor' && !previous.green?.valid) throw new Error('A valid Green phase is required before Refactor.');
    if (activeChange && previous.changeId !== undefined
      && (previous.changeId !== activeChange.changeId || previous.generation !== activeChange.generation)) {
      throw new Error('CHANGE_GENERATION_MIXED: TDD phases cannot cross CHANGE generations.');
    }
    if (JSON.stringify(previous.parallel ?? null) !== JSON.stringify(parallel ?? null)) {
      throw new Error('PARALLEL_TDD_UNCONSUMED: TDD phases must use the same parallel assignment identity.');
    }
    if (binding && !validateCandidateBinding(previous, evidenceContext!).valid) {
      throw new Error('CANDIDATE_EVIDENCE_MISMATCH: TDD phases cannot cross candidate contexts.');
    }
  }
  const token = (current: TddEvidence): string => JSON.stringify({
    cycles: current.cycles.filter((cycle) => cycle.testId === testId),
    sourceSupersessions: current.sourceSupersessions?.filter((entry) => entry.scope.testId === testId),
  });
  const targetToken = token(evidence);
  const recheckTarget = (current: TddEvidence): void => {
    if (token(current) !== targetToken) {
      throw new Error('The TDD target changed during execution; run the phase again.');
    }
  };
  await withTddEvidenceWrite(root, activeChange, async (_leases, source) => {
    const current = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
    await requireNoPendingTddRepair(root, current, source);
    recheckTarget(current);
  }, !!evidenceContext, false, { testId, cycleIds: phase !== 'red' && previous?.cycleId ? [previous.cycleId] : [] });
  const adapter = command.adapter ? adapterInvocation(command.adapter, command.name, testId, test.path) : null;
  const reportPath = command.tddReport
    ? render(command.tddReport.path, testId, test.path, '')
    : adapter!.reportPath;
  const reportAbsolute = await safePath(workspace, reportPath);
  if (adapter) await clearAdapterOutput(adapter, reportAbsolute);
  else if (await exists(reportAbsolute)) await unlink(reportAbsolute);
  const targetedArgs = command.tddArgs
    ? command.tddArgs.map((arg) => render(arg, testId, test.path, reportPath))
    : adapter!.args;
  const configuredArgs = command.args.map((arg) => render(arg, testId, test.path, reportPath));
  const args = command.adapter
    ? mergeAdapterArgs(command.adapter, configuredArgs, targetedArgs)
    : [...configuredArgs, ...targetedArgs];
  const inputs = await captureTddInputs(workspace, [reportPath]);
  const authorityInputs = resolve(root) === resolve(workspace) ? inputs : await captureTddInputs(root);
  const executionOptions = {
    cwd: commandCwd(workspace, command),
    timeoutMs: command.timeoutMs,
  };
  const execution = config.testRuntime?.commandNames.some((name) => name === command.name)
    ? await runTestRuntimeCommand(workspace, command, args, executionOptions, runner,
      await testRuntimeExecutionContext(workspace, 'tdd', runner, activeChange ?? null), root)
    : await runner(command.command, args, executionOptions);
  const output = `${execution.stdout}\n${execution.stderr}`;
  const diagnostics: Diagnostic[] = [];
  let reportText: string | null = null;
  let testStatus: TddPhaseEvidence['testStatus'];
  if (adapter) {
    reportText = await readAdapterOutput(adapter, reportAbsolute, execution.stdout);
  } else if (await exists(reportAbsolute)) {
    reportText = await readText(workspace, reportPath);
  }
  if (reportText === null) {
    diagnostics.push(error('TDD_REPORT_MISSING', `${testId} did not produce a fresh structured TDD report.`, reportPath));
  }
  if (reportText !== null) {
    try {
      const report = command.tddReport
        ? parseMusubixTestReport(reportText)
        : normalizeAdapterReport(command.adapter!, reportText, testId);
      if (report.tests.length !== 1 || report.tests[0]?.id !== testId) {
        diagnostics.push(error('TDD_REPORT_NOT_SCOPED', `${testId} must be the only test result in the structured report.`, reportPath));
      } else {
        testStatus = report.tests[0].status;
        const expectedStatus = phase === 'red' ? 'failed' : 'passed';
        if (testStatus !== expectedStatus) {
          diagnostics.push(error('TDD_TARGET_RESULT', `${phase} requires ${testId} to report ${expectedStatus}, observed ${testStatus}.`, reportPath));
        }
      }
    } catch (cause) {
      diagnostics.push(error('TDD_REPORT_INVALID', cause instanceof Error ? cause.message : String(cause), reportPath));
    }
  }
  const expectedExit = phase === 'red' ? 'nonzero' : 'zero';
  const exitValid = execution.status === 'completed' && (phase === 'red' ? execution.exitCode !== 0 : execution.exitCode === 0);
  if (!exitValid) diagnostics.push(error('TDD_PHASE_RESULT', `${phase} requires a completed command with ${expectedExit} exit status.`));
  if (!Number.isSafeInteger(execution.durationMs) || execution.durationMs < 0) {
    diagnostics.push(error('TDD_DURATION_INVALID', `${phase} produced an invalid execution duration; archive the invalid evidence and regenerate this cycle from a clean Red baseline.`));
  }
  const currentSourceFingerprint = await sourceFingerprint(workspace, test.path, [reportPath]);
  const completedInputs = await captureTddInputs(workspace, [reportPath], inputs);
  assertTddInputsUnchanged(inputs, completedInputs);
  const completedAuthority = resolve(root) === resolve(workspace)
    ? completedInputs : await captureTddInputs(root, [], authorityInputs);
  assertTddInputsUnchanged(authorityInputs, completedAuthority);
  if (phase === 'green' && previous?.red.sourceFingerprint === currentSourceFingerprint) {
    diagnostics.push(error('TDD_GREEN_WITHOUT_SOURCE_CHANGE', `${testId} has no non-test project change between Red and Green.`, test.path));
  }
  const cycleId = phase === 'red' ? crypto.randomUUID() : previous?.cycleId;
  if (!cycleId) throw new Error(`A cycle ID is required before recording ${phase}.`);
  // Fires only on the call that persists the project's very first cycle
  // (evidence.cycles.length === 0 immediately before this call's push, and
  // only on 'red'), regardless of whether that Red is itself valid. The
  // causality clause mirrors gate.ts's `required('tdd') || tdd.present ||
  // hasChangeDocuments` formula (excluding tdd.present, which this call is
  // about to make true) without importing gate.ts, to avoid a circular
  // module dependency (gate.ts already imports from tdd.ts).
  let warnings: Diagnostic[] | undefined;
  if (phase === 'red' && evidence.cycles.length === 0) {
    const otherMandatoryRequirements = trace.nodes.filter((node) =>
      node.kind === 'requirement' && node.mandatory && node.id !== requirementId);
    const uncoveredIds = otherMandatoryRequirements
      .filter((requirement) => {
        const verifiedTests = trace.edges
          .filter((edge) => edge.relation === 'verifies' && edge.to === requirement.id)
          .map((edge) => edge.from);
        return !evidence.cycles.some((cycle) =>
          cycle.requirementId === requirement.id
          && verifiedTests.includes(cycle.testId)
          && cycle.red.valid
          && cycle.green?.valid);
      })
      .map((requirement) => requirement.id);
    const hasChangeDocuments = (await files(root)).some((path) => /^\.musubix\/changes\/CHANGE-\d+\.md$/.test(path));
    const alreadyRequired = config.requiredChecks.includes('tdd') || hasChangeDocuments;
    const uncoveredText = uncoveredIds.length
      ? `Other uncovered mandatory requirements: ${uncoveredIds.join(', ')}.`
      : 'There are zero other uncovered mandatory requirements.';
    const activationText = alreadyRequired
      ? "gate's tdd check was already required; this call activates its project-wide coverage evaluation for the first time."
      : "this call is what makes gate's tdd check required for the entire project.";
    warnings = [{
      code: 'TDD_ADOPTION_PROJECT_WIDE',
      severity: 'warning',
      message: `Recording this Red cycle persists the project's first TDD evidence. ${activationText} ${uncoveredText} ${requirementId} itself remains uncovered until it also has a valid Green phase.`,
    }];
  }
  const result: TddPhaseEvidence = {
    ...(execution.testRuntime ? { testRuntime: execution.testRuntime } : {}),
    phase,
    valid: !diagnostics.length,
    scoped: true,
    resultObserved: testStatus === (phase === 'red' ? 'failed' : 'passed'),
    ...(testStatus ? { testStatus } : {}),
    ...(reportText === null ? {} : { reportSha256: digest(reportText) }),
    commandSha256: digest(JSON.stringify([command.command, args])),
    outputSha256: digest(output),
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    testFingerprint: currentFingerprint,
    sourceFingerprint: currentSourceFingerprint,
    executionId: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    diagnostics,
    ...(warnings ? { warnings } : {}),
  };
  return withTddEvidenceWrite(root, activeChange, async (leases, source) => {
    const latest: TddEvidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
    await requireNoPendingTddRepair(root, latest, source);
    recheckTarget(latest);
    if (await testFingerprint(workspace, test) !== currentFingerprint) {
      throw new Error('The test changed after Red; run the Red phase again.');
    }
    assertTddInputsUnchanged(completedInputs, await captureTddInputs(workspace, [reportPath], completedInputs));
    if (resolve(root) !== resolve(workspace)) {
      assertTddInputsUnchanged(completedAuthority, await captureTddInputs(root, [], completedAuthority));
    }
    result.order = (await appendEvidenceOrder(root, {
      kind: 'tdd', entityId: cycleId, phase,
    }, leases.appendSession)).sequence;
    if (phase === 'red') {
      const cycle: TddCycle = {
        cycleId,
        ...(activeChange ? { changeId: activeChange.changeId, generation: activeChange.generation } : {}),
        ...(binding ? { binding } : {}),
        requirementId,
        testId,
        testPath: test.path,
        commandName,
        ...(parallel ? { parallel } : {}),
        red: result,
      };
      latest.cycles.push(cycle);
      appendChainRecord(latest, cycle, phase, result);
    } else {
      const target = latest.cycles.find((cycle) => cycle.cycleId === cycleId)!;
      if (activeChange && target.changeId === undefined) {
        target.changeId = activeChange.changeId;
        target.generation = activeChange.generation;
      }
      target[phase] = result;
      appendChainRecord(latest, target, phase, result);
    }
    await persistTddLedger(root, latest, leases);
    return result;
  }, !!evidenceContext, false, { testId, cycleIds: phase !== 'red' && previous?.cycleId ? [previous.cycleId] : [] });
}

export async function validateTddEvidence(
  root: string,
  purpose = 'readiness',
  evidenceContext?: CandidateEvidenceContext | IntegrationEvidenceContext,
  evidenceRoot = root,
): Promise<{
  present: boolean; valid: boolean; diagnostics: Diagnostic[]; cycles: number;
  voided: Array<{ testId: string; cycleId: string; void: { approver: string; reason: string; recordedAt: string } }>;
  sourceSupersessions?: SourceSupersessionSummary[]; sourceTerminalSelectors?: SourceTerminalSelector[];
}> {
  const evidence = await loadTddEvidence(evidenceRoot);
  if (!evidence?.cycles.length) {
    const source = await readTddSourceStatus(evidenceRoot, null, evidenceContext);
    return { present: source.diagnostics.length > 0, valid: false, cycles: 0, voided: [], ...source };
  }
  const diagnostics: Diagnostic[] = [];
  const order = await inspectEvidenceOrder(evidenceRoot);
  const sourceOrder = await loadEvidenceOrder(evidenceRoot);
  const sourceEvidence = await inspectSourceEvidence(evidenceRoot, evidence, undefined, sourceOrder);
  const repairLedger = validateTddRepairLedger(evidence);
  if (!repairLedger.valid) {
    diagnostics.push(error(
      'TDD_REPAIR_CHAIN_INVALID',
      'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.',
    ));
  }
  const repairedCycleIds = new Set(repairLedger.repairs.map((repair) => repair.targetCycleId));
  const effectiveCycles = repairAwareCycles(evidence);
  const activeChange = evidenceContext ? null : await activeChangeContext(evidenceRoot);
  const selectedCandidates = evidenceContext
    ? 'integrationId' in evidenceContext ? evidenceContext.candidates : [evidenceContext]
    : [];
  const activeCycle: TddCycleScopePredicate = evidenceContext
    ? (cycle) => selectedCandidates.some((candidate) =>
      cycle.changeId === candidate.changeId
      && (cycle.generation ?? 1) === candidate.generation
      && validateCandidateBinding(cycle, candidate).valid)
    : activeScope(activeChange);
  diagnostics.push(...order.diagnostics);
  if (evidenceContext) {
    for (const cycle of evidence.cycles) {
      const candidate = selectedCandidates.find((entry) =>
        cycle.changeId === entry.changeId && (cycle.generation ?? 1) === entry.generation);
      if (candidate) diagnostics.push(...validateCandidateBinding(cycle, candidate).diagnostics);
    }
  }
  if (!evidence.chain) {
    diagnostics.push(error('TDD_CHAIN_MISSING', 'TDD evidence lacks the append-only hash chain.'));
  } else {
    const records = new Map<string, TddChainRecord>();
    for (const [index, record] of evidence.chain.entries()) {
      const expectedSequence = index + 1;
      const expectedPrevious = index === 0 ? null : evidence.chain[index - 1]!.recordSha256;
      const { recordSha256, ...payload } = record;
      if (record.sequence !== expectedSequence) {
        diagnostics.push(error('TDD_CHAIN_SEQUENCE', `TDD chain record ${record.sequence} is out of order; expected ${expectedSequence}.`));
      }
      if (record.previousSha256 !== expectedPrevious) {
        diagnostics.push(error('TDD_CHAIN_LINK', `TDD chain record ${record.sequence} does not link to the preceding record.`));
      }
      if (recordSha256 !== chainRecordSha256(payload)) {
        diagnostics.push(error('TDD_CHAIN_HASH_MISMATCH', `TDD chain record ${record.sequence} has an invalid SHA-256.`));
      }
      const key = record.phase === 'source-supersession'
        ? `source-supersession:${record.operationKey}` : `${record.cycleId}:${record.phase}`;
      if (records.has(key)) diagnostics.push(error('TDD_CHAIN_PHASE_DUPLICATE', `${key} appears more than once in the TDD chain.`));
      records.set(key, record);
    }
    for (const cycle of evidence.cycles) {
      for (const phase of ['red', 'green', 'refactor', 'migrate', 'void'] as const) {
        const phaseEvidence = cycle[phase];
        if (!phaseEvidence) continue;
        const key = `${cycle.cycleId ?? 'missing'}:${phase}`;
        const record = records.get(key);
        if (!record) {
          diagnostics.push(error('TDD_CHAIN_PHASE_MISSING', `${cycle.testId}:${phase} is absent from the TDD hash chain.`, cycle.testPath));
          continue;
        }
        if (record.requirementId !== cycle.requirementId
          || record.testId !== cycle.testId
          || record.testPath !== cycle.testPath
          || record.commandName !== cycle.commandName
          || JSON.stringify(record.parallel ?? null) !== JSON.stringify(cycle.parallel ?? null)
          || JSON.stringify(record.binding ?? null) !== JSON.stringify(cycle.binding ?? null)
          || record.phaseEvidenceSha256 !== digest(JSON.stringify(phaseEvidence))) {
          diagnostics.push(error('TDD_CHAIN_PAYLOAD_MISMATCH', `${cycle.testId}:${phase} does not match its immutable TDD chain record.`, cycle.testPath));
        }
        records.delete(key);
      }
    }
    for (const repair of repairLedger.repairs) {
      const target = evidence.cycles.find((cycle) => cycle.cycleId === repair.targetCycleId);
      const key = `${repair.targetCycleId}:repair`;
      const record = records.get(key);
      if (!target || !record
        || record.requirementId !== repair.requirementId
        || record.testId !== repair.testId
        || record.phaseEvidenceSha256 !== digest(JSON.stringify(repair))) {
        diagnostics.push(error(
          'TDD_REPAIR_CHAIN_INVALID',
          'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.',
        ));
      }
      records.delete(key);
    }
    if (sourceEvidence.valid) for (const operation of sourceEvidence.operations) {
      if (operation.projection) records.delete(`source-supersession:${operation.projection.operationKey}`);
    }
    for (const record of records.values()) {
      diagnostics.push(error('TDD_CHAIN_ORPHAN', `TDD chain record ${record.sequence} has no matching cycle phase.`));
    }
  }
  const supersededCycles = new Set<TddCycle>();
  for (const cycle of evidence.cycles.filter((entry) => !activeCycle(entry))) supersededCycles.add(cycle);
  for (const cycle of evidence.cycles.filter((entry) =>
    entry.cycleId !== undefined && repairedCycleIds.has(entry.cycleId))) supersededCycles.add(cycle);
  const authoritativeParallelCycleIds = new Set<string>();
  for (const cycle of effectiveCycles.filter((entry) =>
    activeCycle(entry) && entry.parallel && entry.cycleId && entry.red.valid && entry.green?.valid)) {
    const provenance = await classifyParallelTddEvidence(root, {
      changeId: cycle.changeId ?? activeChange?.changeId ?? '',
      generation: cycle.generation ?? activeChange?.generation ?? 1,
      requirementId: cycle.requirementId,
      cycleId: cycle.cycleId ?? null,
      purpose,
      evidenceRoot,
    });
    if (provenance === 'pass') authoritativeParallelCycleIds.add(cycle.cycleId!);
  }
  const provenanceSupersededIds = supersededParallelTddCycles(
    effectiveCycles.filter(activeCycle),
    authoritativeParallelCycleIds,
  );
  for (const cycle of evidence.cycles) {
    if (cycle.cycleId && provenanceSupersededIds.has(cycle.cycleId)) supersededCycles.add(cycle);
  }
  {
    const cyclesByTest = new Map<string, TddCycle[]>();
    for (const cycle of evidence.cycles) {
      const list = cyclesByTest.get(cycle.testId);
      if (list) list.push(cycle); else cyclesByTest.set(cycle.testId, [cycle]);
    }
    for (const cycles of cyclesByTest.values()) {
      for (let index = 0; index < cycles.length; index++) {
        if (cycles.slice(index + 1).some((later) => later.red.valid && later.green?.valid)) {
          supersededCycles.add(cycles[index]!);
        }
      }
    }
  }
  const validlyVoidedCycles = new Set<TddCycle>();
  let runtimeRepositoryId: string | undefined;
  const currencyChainIndex = buildTddChainIndex(evidence.chain);
  const voided: Array<{ testId: string; cycleId: string; void: { approver: string; reason: string; recordedAt: string } }> = [];
  for (const cycle of evidence.cycles) {
    if (!cycle.void) continue;
    const linkage = voidLinkage(evidence, order, cycle, currencyChainIndex);
    if (linkage.valid) {
      validlyVoidedCycles.add(cycle);
      voided.push({
        testId: cycle.testId,
        cycleId: cycle.cycleId!,
        void: { approver: cycle.void.approver, reason: cycle.void.reason, recordedAt: cycle.void.recordedAt },
      });
    } else {
      diagnostics.push(error('TDD_VOID_EVIDENCE_MALFORMED', linkage.reason!, cycle.testPath));
    }
  }
  const currencyIndex = buildTddCurrencyIndex(
    {
      ...evidence,
      cycles: effectiveCycles.filter((cycle) =>
        !cycle.cycleId || !provenanceSupersededIds.has(cycle.cycleId)),
    },
    order,
    validlyVoidedCycles,
    currencyChainIndex,
    sourceEvidence.valid ? sourceEvidence.operations.flatMap((operation) => operation.projection ? [operation.projection] : []) : [],
  );
  const trace = await buildTrace(root, false);
  const selectedChangeIds = new Set(selectedCandidates.map((candidate) => candidate.changeId));
  const selectedChangeEvidence = evidenceContext ? await loadChangeEvidence(evidenceRoot) : null;
  const activeRequirementIds = evidenceContext
    ? new Set(selectedChangeEvidence?.changes
      .filter((change) => selectedChangeIds.has(change.changeId)
        && selectedCandidates.some((candidate) =>
          candidate.changeId === change.changeId
          && candidate.generation === activeChangeGeneration(change)))
      .flatMap((change) => change.requirementIds) ?? [])
    : activeChange ? new Set(activeChange.requirementIds) : null;
  for (const requirement of trace.nodes.filter((node) =>
    node.kind === 'requirement'
    && node.mandatory
    && (activeRequirementIds === null || activeRequirementIds.has(node.id)))) {
    const verifiedTests = trace.edges
      .filter((edge) => edge.relation === 'verifies' && edge.to === requirement.id)
      .map((edge) => edge.from);
    let covered = false;
    for (const cycle of effectiveCycles.filter((entry) =>
      !entry.cycleId || !provenanceSupersededIds.has(entry.cycleId))) {
      if (!activeCycle(cycle)
        || cycle.requirementId !== requirement.id
        || !verifiedTests.includes(cycle.testId)
        || !cycle.red.valid
        || !cycle.green?.valid) continue;
      const provenance = await classifyParallelTddEvidence(root, {
        changeId: cycle.changeId ?? activeChange?.changeId ?? '',
        generation: cycle.generation ?? activeChange?.generation ?? 1,
        requirementId: requirement.id,
        cycleId: cycle.cycleId ?? null,
        purpose,
        evidenceRoot,
      });
      if (provenance !== 'PARALLEL_TDD_UNCONSUMED') {
        covered = true;
        break;
      }
    }
    if (!covered) {
      diagnostics.push(error(
        'TDD_REQUIREMENT_UNCOVERED',
        `${requirement.id} has no valid Red-Green cycle from an authoritative verifying test.`,
        requirement.path,
        requirement.line,
      ));
    }
  }
  const sourceTextCache = new Map<string, Promise<string>>();
  const fingerprintCache = new Map<string, Promise<string>>();
  const currencyCandidates = effectiveCycles
    .filter((cycle) =>
      (!cycle.cycleId || !provenanceSupersededIds.has(cycle.cycleId))
      && cycle.green?.valid && (!activeChange || activeCycle(cycle)))
    .map((cycle) => ({ cycle, terminal: terminalFingerprintEvidence(currencyIndex, cycle) }))
    .filter((entry): entry is { cycle: TddCycle; terminal: EffectiveTddCurrencySelection } =>
      entry.terminal !== undefined);
  const allCurrencyCandidates = effectiveCycles
    .map((cycle) => ({ cycle, terminal: terminalFingerprintEvidence(currencyIndex, cycle) }))
    .filter((entry): entry is { cycle: TddCycle; terminal: EffectiveTddCurrencySelection } =>
      entry.terminal !== undefined);
  const explicitlySupersededTests = new Set<string>();
  for (const test of trace.nodes.filter((node) => node.kind === 'test')) {
    let sourceText = sourceTextCache.get(test.path);
    if (!sourceText) {
      sourceText = readText(root, test.path);
      sourceTextCache.set(test.path, sourceText);
    }
    const source = await sourceText;
    const escapedId = test.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(`/\\*\\*[\\s\\S]*?@id\\s+${escapedId}\\b[\\s\\S]*?\\*/`).exec(source)?.[0];
    const replacements = block
      ? [...block.matchAll(/@supersededBy\s+([^\r\n*]+)/g)]
        .flatMap((match) => match[1]!.match(/TEST-[A-Z0-9-]+/g) ?? [])
      : [];
    if (!replacements.length) continue;
    const requirements = new Set(allCurrencyCandidates
      .filter(({ cycle }) => cycle.testId === test.id)
      .map(({ cycle }) => cycle.requirementId));
    let covered = requirements.size > 0;
    for (const requirementId of requirements) {
      let requirementCovered = false;
      for (const replacementId of replacements) {
        const replacement = trace.nodes.find((node) =>
          node.kind === 'test' && node.id === replacementId);
        const terminals = allCurrencyCandidates.filter(({ cycle }) =>
          cycle.testId === replacementId && cycle.requirementId === requirementId);
        if (!replacement || !terminals.length) continue;
        let current = fingerprintCache.get(replacementId);
        if (!current) {
          let replacementSource = sourceTextCache.get(replacement.path);
          if (!replacementSource) {
            replacementSource = readText(root, replacement.path);
            sourceTextCache.set(replacement.path, replacementSource);
          }
          current = replacementSource.then((text) => testFingerprintFromText(replacement, text));
          fingerprintCache.set(replacementId, current);
        }
        const currentFingerprint = await current;
        if (terminals.some(({ terminal }) => terminal.fingerprint === currentFingerprint)) {
          requirementCovered = true;
          break;
        }
      }
      if (!requirementCovered) {
        covered = false;
        break;
      }
    }
    if (covered) explicitlySupersededTests.add(test.id);
  }
  const currencyTargets = new Set(
    currencyCandidates
      .filter(({ cycle }) => !explicitlySupersededTests.has(cycle.testId))
      .map(({ cycle }) => cycle.testId),
  );
  for (const testId of currencyTargets) {
    const unbounded = effectiveLatestCycle(currencyIndex, testId);
    if (!unbounded) continue;
    const eventScope: TddEventScope = activeChange
      ? {
          terminalScope: allCycles,
          voidScope: allCycles,
          workScope: activeCycle,
        }
      : {
          terminalScope: allCycles,
          voidScope: allCycles,
          workScope: noActiveWorkScope(unbounded),
        };
    const event = greatestVerifiedEvent(currencyIndex, testId, eventScope);
    if (event?.kind === 'work') continue;
    const selection = event?.kind === 'void'
      ? effectiveLatestCycle(currencyIndex, testId, event.order)
      : unbounded;
    if (!selection) continue;
    const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
    if (!test) continue;
    let current = fingerprintCache.get(testId);
    if (!current) {
      let sourceText = sourceTextCache.get(test.path);
      if (!sourceText) {
        sourceText = readText(root, test.path);
        sourceTextCache.set(test.path, sourceText);
      }
      current = sourceText.then((text) => testFingerprintFromText(test, text));
      fingerprintCache.set(testId, current);
    }
    if (await current !== selection.fingerprint) {
      diagnostics.push(error(
        'TDD_TEST_STALE',
        `${testId} changed after its latest passing TDD phase.`,
        test.path,
      ));
    }
  }
  for (const cycle of effectiveCycles.filter(activeCycle)) {
    for (const phase of ['red', 'green', 'refactor'] as const) {
      const item = cycle[phase];
      if (!item) continue;
      if (!Number.isSafeInteger(item.durationMs) || item.durationMs < 0) {
        diagnostics.push(error('TDD_DURATION_INVALID', `${cycle.testId}:${phase} has an invalid execution duration; archive the invalid evidence and regenerate this cycle from a clean Red baseline.`, cycle.testPath));
      }
      if (!cycle.cycleId || !Number.isInteger(item.order)) {
        diagnostics.push(error('TDD_ORDER_MIGRATION_REQUIRED', `${cycle.testId}:${phase} lacks monotonic order evidence; archive legacy evidence and regenerate the complete cycle instead of editing append-only records.`, cycle.testPath));
        continue;
      }
      const record = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, phase);
      if (!record || record.sequence !== item.order) {
        diagnostics.push(error('TDD_ORDER_MISMATCH', `${cycle.testId}:${phase} does not match the monotonic evidence order log.`, cycle.testPath));
      }
    }
    if (cycle.green?.order !== undefined && cycle.red.order !== undefined && cycle.green.order <= cycle.red.order) {
      diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:green is not after Red in monotonic evidence order.`, cycle.testPath));
    }
    if (cycle.refactor?.order !== undefined && cycle.green?.order !== undefined && cycle.refactor.order <= cycle.green.order) {
      diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:refactor is not after Green in monotonic evidence order.`, cycle.testPath));
    }
    if (cycle.migrate) {
      if (!cycle.cycleId || !Number.isInteger(cycle.migrate.order)) {
        diagnostics.push(error('TDD_ORDER_MIGRATION_REQUIRED', `${cycle.testId}:migrate lacks monotonic order evidence; archive legacy evidence and regenerate the complete cycle instead of editing append-only records.`, cycle.testPath));
      } else {
        const record = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, 'migrate');
        if (!record || record.sequence !== cycle.migrate.order) {
          diagnostics.push(error('TDD_ORDER_MISMATCH', `${cycle.testId}:migrate does not match the monotonic evidence order log.`, cycle.testPath));
        }
      }
      const latestNonMigrateOrder = cycle.refactor?.valid ? cycle.refactor.order : cycle.green?.order;
      if (cycle.migrate.order !== undefined && latestNonMigrateOrder !== undefined && cycle.migrate.order <= latestNonMigrateOrder) {
        diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:migrate is not after Green/Refactor in monotonic evidence order.`, cycle.testPath));
      }
      if (!cycle.migrate.approver?.trim()) {
        diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId}:migrate lacks a recorded human approver.`, cycle.testPath));
      }
    }
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle)
      && (!cycle.red.scoped || !cycle.red.resultObserved || cycle.red.testStatus !== 'failed' || !cycle.red.reportSha256 || !cycle.red.sourceFingerprint || !cycle.red.executionId)) {
      diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} lacks test-scoped execution provenance; archive the legacy cycle and regenerate it from a clean Red baseline: move .musubix/evidence/tdd.json aside and re-record every cycle with tdd red/green/refactor. There is no partial prune command; hand-editing the evidence is not supported.`, cycle.testPath));
    }
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle) && !cycle.red.valid) diagnostics.push(error('TDD_RED_MISSING', `${cycle.testId} has no valid failing Red phase; archive it and regenerate the complete cycle by moving .musubix/evidence/tdd.json aside and re-recording every cycle.`, cycle.testPath));
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle) && !cycle.green?.valid) diagnostics.push(error('TDD_GREEN_MISSING', `${cycle.testId} has no valid passing Green phase; archive it and regenerate the complete cycle by moving .musubix/evidence/tdd.json aside and re-recording every cycle.`, cycle.testPath));
    if (cycle.green?.valid) {
      if (!cycle.green.scoped || !cycle.green.resultObserved || cycle.green.testStatus !== 'passed' || !cycle.green.reportSha256 || !cycle.green.sourceFingerprint || !cycle.green.executionId) {
        diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} Green lacks test-scoped execution provenance.`, cycle.testPath));
      }
      if (cycle.red.sourceFingerprint === cycle.green.sourceFingerprint) {
        diagnostics.push(error('TDD_GREEN_WITHOUT_SOURCE_CHANGE', `${cycle.testId} has no non-test project change between Red and Green.`, cycle.testPath));
      }
    }
    if (cycle.green && cycle.green.commandSha256 !== cycle.red.commandSha256) {
      diagnostics.push(error('TDD_COMMAND_CHANGED', `${cycle.testId} used a different command between Red and Green.`, cycle.testPath));
    }
    if (cycle.refactor && cycle.refactor.commandSha256 !== cycle.red.commandSha256) {
      diagnostics.push(error('TDD_COMMAND_CHANGED', `${cycle.testId} used a different command during Refactor.`, cycle.testPath));
    }
    if (cycle.refactor?.valid && (!cycle.refactor.scoped || !cycle.refactor.resultObserved || cycle.refactor.testStatus !== 'passed' || !cycle.refactor.reportSha256 || !cycle.refactor.sourceFingerprint || !cycle.refactor.executionId)) {
      diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} Refactor lacks test-scoped execution provenance.`, cycle.testPath));
    }
    for (const phase of [cycle.red, cycle.green, cycle.refactor]) {
      if (!phase?.testRuntime) continue;
      try {
        runtimeRepositoryId ??= await workspaceRepositoryIdentity(root);
        await validateTestRuntimeOutcome(root, phase.testRuntime, {
          repositoryId: runtimeRepositoryId, changeId: cycle.changeId ?? null,
          generation: cycle.generation ?? null, role: 'tdd',
        }, phase.commandSha256);
      } catch (cause) {
        diagnostics.push(error('TEST_RUNTIME_BOOTSTRAP_INVALID',
          cause instanceof Error ? cause.message : String(cause), cycle.testPath));
      }
    }
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle) && (
      cycle.red.testRuntime && cycle.green && !cycle.green.testRuntime
      || cycle.green?.testRuntime && cycle.refactor && !cycle.refactor.testRuntime
      || cycle.red.testRuntime && cycle.green?.testRuntime
        && cycle.red.testRuntime.profileSha256 !== cycle.green.testRuntime.profileSha256)) {
      diagnostics.push(error('TEST_RUNTIME_BOOTSTRAP_INVALID',
        `${cycle.testId}: phase-runtime-transition.`, cycle.testPath));
    }
  }
  for (const phase of ['red', 'green', 'refactor'] as const) {
    const hashes = new Map<string, TddCycle>();
    for (const cycle of effectiveCycles.filter(activeCycle)) {
      const item = cycle[phase];
      if (!item) continue;
      // The structured report names the selected test, so it is the authoritative
      // reuse signal; console output alone collides for quiet runners.
      const key = item.reportSha256 ? `report:${item.reportSha256}` : `output:${item.outputSha256}`;
      const previous = hashes.get(key);
      if (previous && previous.testId !== cycle.testId) {
        diagnostics.push(error(
          'TDD_EVIDENCE_REUSED',
          `${previous.testId} and ${cycle.testId} reuse identical ${phase} ${item.reportSha256 ? 'report' : 'output'} evidence.`,
          cycle.testPath,
        ));
      } else hashes.set(key, cycle);
    }
  }
  const currentTestFingerprints = new Map<string, string>();
  for (const node of trace.nodes.filter((node) => node.kind === 'test')) {
    currentTestFingerprints.set(node.id, await testFingerprint(root, node));
  }
  const source = tddSourceReadProjection(evidence, sourceOrder, sourceEvidence,
    evidenceContext || activeChange ? activeCycle : () => false, currentTestFingerprints);
  diagnostics.push(...source.diagnostics);
  return { present: true, valid: !diagnostics.length, diagnostics, cycles: evidence.cycles.length, voided,
    sourceSupersessions: source.sourceSupersessions, sourceTerminalSelectors: source.sourceTerminalSelectors };
}
