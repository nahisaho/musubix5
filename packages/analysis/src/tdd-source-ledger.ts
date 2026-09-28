import { error, type Diagnostic } from '../../domain/src/index.js';
import { canonicalBytes, sha256 } from './canonical.js';
import type { SourceReview, SourceScope, SourceTarget, SourceApproval, SourceJournalPayload,
  SourceProjection, SourceRun, SourceResult } from './tdd-source-types.js';
import type { SourcePair } from './tdd-source-types.js';
import type { TddEvidence, TddCycle, TddChainRecord } from './tdd-types.js';
import { validateEvidenceOrderLog, type EvidenceOrderLog } from './order.js';
import { validateJournalRecords, type JournalRecord } from './journal.js';
import { SourceOperationError, type SourceDiagnostic, type SourceReason } from './tdd-source-diagnostics.js';

type Guard = (value: unknown) => boolean;
export const sourceHash: Guard = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text: Guard = (value) => typeof value === 'string' && value.trim().length > 0;
const natural: Guard = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
const positive: Guard = (value) => natural(value) && Number(value) > 0;
const nullable = (guard: Guard): Guard => (value) => value === null || guard(value);
const array = (guard: Guard): Guard => (value) => Array.isArray(value) && value.every(guard);
const literal = (...values: unknown[]): Guard => (value) => values.includes(value);
const timestamp: Guard = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const gitObjectId: Guard = (value) => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);
export const sourcePath: Guard = (value) => typeof value === 'string' && value === value.normalize('NFC')
  && value.length > 0 && !value.includes('\\') && !/[\u0000-\u001f:]/.test(value)
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
export function sourceObject(shape: Record<string, Guard>): Guard {
  return (value) => !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(shape).length
    && Object.entries(shape).every(([key, guard]) => key in value && guard(Reflect.get(value, key)));
}
const candidate = sourceObject({
  schemaVersion: literal(1), kind: literal('candidate'), repositoryId: text, changeId: text, generation: positive,
  candidateId: (value) => typeof value === 'string' && /^candidate:[a-f0-9]{64}$/.test(value),
  candidateCommit: gitObjectId, baseCommit: gitObjectId,
});
export const sourceScopeGuard = sourceObject({
  repositoryId: text, changeId: (v) => typeof v === 'string' && /^CHANGE-\d+$/.test(v),
  generation: positive, requirementId: (v) => typeof v === 'string' && /^REQ-[A-Z0-9-]+$/.test(v),
  testId: (v) => typeof v === 'string' && /^TEST-[A-Z0-9-]+$/.test(v), path: sourcePath, command: text,
  candidate: nullable(candidate),
  parallel: nullable(sourceObject({
    planId: (v) => typeof v === 'string' && /^parallel-plan:[a-f0-9]{64}$/.test(v),
    assignmentId: text, attempt: positive, worktree: text, startCommit: text,
  })),
  domain: nullable(text),
});
export const sourceTargetGuard = sourceObject({
  cycleId: text, kind: literal('green', 'refactor', 'migration', 'source-supersession'),
  order: positive, payloadSha256: sourceHash, oldFingerprint: sourceHash,
});
const sourceBinding = sourceObject({
  nodeId: text, annotationStart: natural, statementEnd: positive,
  currentFileSha256: sourceHash, newBlockSha256: sourceHash, oldBlockSha256: nullable(sourceHash),
  oldFingerprint: sourceHash, newFingerprint: sourceHash, oldSourceDigest: sourceHash, newSourceDigest: sourceHash,
});
const snapshot = sourceObject({
  manifestSha256: sourceHash, environmentSha256: sourceHash, runnerSha256: sourceHash,
  configSha256: sourceHash, productionSha256: sourceHash, head: text, stateSha256: sourceHash,
});
export const sourceHunkGuard = sourceObject({
  oldStart: natural, oldLength: natural, newStart: natural, newLength: natural,
  requirementIds: array(text), assertion: text, threshold: text, failureSemantics: text,
  equivalenceRationale: text, supportingBlobSha256s: array(sourceHash),
});
const run = sourceObject({
  invocationId: text, testId: text, command: text, startedAt: timestamp, completedAt: timestamp,
  exitCode: literal(0), runnerSha256: sourceHash, configSha256: sourceHash, environmentSha256: sourceHash,
  reportSha256: sourceHash, preSourceSha256: sourceHash, postSourceSha256: sourceHash,
  preProductionSha256: sourceHash, postProductionSha256: sourceHash,
  preInputManifestSha256: sourceHash, postInputManifestSha256: sourceHash,
  outputs: sourceObject({ beforeSha256: sourceHash, afterBuildSha256: sourceHash, afterSha256: sourceHash }),
});
const pair = sourceObject({
  manifestSha256: sourceHash, oldReportSha256: sourceHash, newReportSha256: sourceHash,
  oldRun: run, newRun: run,
});
const replacement = sourceObject({
  cycleId: text, redOrder: positive, redPayloadSha256: sourceHash,
  greenOrder: positive, greenPayloadSha256: sourceHash, testFingerprint: sourceHash,
});
const reviewShape = sourceObject({
  schemaVersion: literal(1), kind: literal('tdd-source-review'), changeId: text,
  operationId: (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v),
  scope: sourceScopeGuard, target: sourceTargetGuard, source: sourceBinding, snapshot,
  mode: literal('test-only', 'behavior-change'), reason: text, hunks: array(sourceHunkGuard),
  pair: nullable(pair), replacement: nullable(replacement),
  preparedAt: timestamp, preparationInvocationId: text,
  approvalContext: sourceObject({ requirementsSha256: sourceHash, designSha256: sourceHash, domain: nullable(text) }),
});

/** @id CODE-M5-SOURCE-SCHEMA-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function validateSourceReview(value: unknown): {
  valid: boolean; review?: SourceReview; diagnostics: Diagnostic[];
} {
  if (reviewShape(value)) {
    const review = value as SourceReview;
    if (review.changeId === review.scope.changeId
      && review.source.nodeId === review.scope.testId
      && review.source.oldFingerprint === review.target.oldFingerprint
      && review.source.oldSourceDigest === review.source.oldFingerprint
      && review.source.newSourceDigest === review.source.newFingerprint
      && review.source.statementEnd > review.source.annotationStart
      && review.source.oldFingerprint !== review.source.newFingerprint
      && review.approvalContext.domain === review.scope.domain
      && (review.scope.candidate === null
        || (review.scope.candidate.changeId === review.scope.changeId
          && review.scope.candidate.generation === review.scope.generation
          && review.scope.candidate.repositoryId === review.scope.repositoryId))
      && (review.mode === 'test-only'
        ? review.pair !== null && review.replacement === null && review.source.oldBlockSha256 !== null
          && sourcePairMatches(review.pair, review)
        : review.pair === null && review.replacement !== null && review.hunks.length === 0
          && review.replacement.cycleId !== review.target.cycleId
          && review.target.order < review.replacement.redOrder
          && review.replacement.redOrder < review.replacement.greenOrder
          && review.replacement.testFingerprint === review.source.newFingerprint)) {
      return { valid: true, review, diagnostics: [] };
    }
  }
  return { valid: false, diagnostics: [error('TDD_SOURCE_APPROVAL_INVALID', 'review-schema')] };
}

export const sourceApprovalGuard = sourceObject({
  schemaVersion: literal(1), kind: literal('tdd-source-approval'), changeId: text, operationId: text,
  scope: sourceScopeGuard, mode: literal('test-only', 'behavior-change'), target: sourceTargetGuard,
  artifactSha256: sourceHash, approver: text, confirmed: literal(true), approvedAt: timestamp,
});
export function validateSourceApproval(value: unknown, review: SourceReview, artifactSha256: string): value is SourceApproval {
  if (!sourceApprovalGuard(value)) return false;
  const approval = value as SourceApproval;
  return approval.changeId === review.changeId && approval.operationId === review.operationId
    && approval.mode === review.mode && approval.artifactSha256 === artifactSha256
    && canonicalBytes(approval.scope).equals(canonicalBytes(review.scope))
    && canonicalBytes(approval.target).equals(canonicalBytes(review.target));
}

export function deriveSourceRequestDigest(input: {
  operationId: string; scope: SourceScope; mode: SourceReview['mode']; target: SourceTarget;
  artifactSha256: string; approvalSha256: string;
}): string {
  return sha256(canonicalBytes({ schemaVersion: 1, ...input }));
}

export const sourceOperationKey = (scope: { changeId: string; generation: number }, operationId: string): string =>
  `tdd-source-supersession:${scope.changeId}:g${scope.generation}:${operationId}`;
export const sourceOrderPhase = (scope: { changeId: string; generation: number }): string =>
  `g${scope.generation}:source-supersession:${scope.changeId}`;
const same = (left: unknown, right: unknown): boolean => canonicalBytes(left).equals(canonicalBytes(right));
const rawHash = (value: unknown): string => sha256(Buffer.from(JSON.stringify(value)));
const journalPayloadGuard = sourceObject({
  schemaVersion: literal(1), operationId: (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v),
  requestSha256: sourceHash, mode: literal('test-only', 'behavior-change'), scope: sourceScopeGuard,
  target: sourceTargetGuard, newFingerprint: sourceHash, reviewSha256: sourceHash, approvalSha256: sourceHash,
  source: sourceBinding, snapshot, pair: nullable(pair), replacement: nullable(replacement),
  reason: text, approver: text, execution: nullable(run), recordedAt: timestamp,
  fencing: sourceObject({ change: positive, projection: positive, append: positive }),
});
const projectionGuard = sourceObject({
  schemaVersion: literal(1), operationId: text, operationKey: text, requestSha256: sourceHash,
  journalSha256: sourceHash, journalOrder: positive, order: positive, cycleId: text, scope: sourceScopeGuard,
  mode: literal('test-only', 'behavior-change'), target: sourceTargetGuard, newFingerprint: sourceHash,
  recordedAt: timestamp, reviewSha256: sourceHash, approvalSha256: sourceHash, state: literal('completed'),
});
export type SourceJournal = JournalRecord & { payload: SourceJournalPayload };
export interface SourceLedgerOperation {
  journal: SourceJournal;
  state: 'pending' | 'completed';
  order: number | null;
  projection: SourceProjection | null;
}
export interface SourceLedgerClassification {
  valid: boolean; operations: SourceLedgerOperation[]; diagnostics: SourceDiagnostic[];
}

export function sourceResumeArgs(operation: SourceLedgerOperation): string[] {
  const p = operation.journal.payload;
  return ['tdd', 'source-supersession', 'resume', '--change', p.scope.changeId,
    '--generation', String(p.scope.generation), '--operation-id', p.operationId, '--request-sha256', p.requestSha256];
}

/** @id CODE-M5-SOURCE-CONFLICT-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function sourceConflict(
  ledger: SourceLedgerClassification,
  scope: (Pick<SourceScope, 'repositoryId' | 'changeId' | 'generation' | 'testId'> & Partial<SourceScope>) | null,
  explicitCycleIds: string[] = [], exactOperationKey?: string,
): SourceDiagnostic | null {
  for (const operation of ledger.operations) {
    if (operation.state !== 'pending' || operation.journal.idempotencyKey === exactOperationKey) continue;
    const p = operation.journal.payload;
    const sameTest = scope !== null && p.scope.repositoryId === scope.repositoryId
      && p.scope.changeId === scope.changeId && p.scope.generation === scope.generation && p.scope.testId === scope.testId;
    const target = explicitCycleIds.includes(p.target.cycleId)
      || (p.replacement !== null && explicitCycleIds.includes(p.replacement.cycleId));
    if (sameTest || target) {
      return new SourceOperationError('TDD_SOURCE_PENDING', sameTest ? 'same-test-writer' : 'explicit-target-conflict',
        { operationId: p.operationId, scope: p.scope, target: p.target }, {
          blockingOperationId: p.operationId, testId: p.scope.testId, targetCycleId: p.target.cycleId,
          requestSha256: p.requestSha256, artifactSha256: p.reviewSha256, approvalSha256: p.approvalSha256,
          resumeArgs: sourceResumeArgs(operation),
        }).diagnostic;
    }
  }
  return null;
}

export function sourceRunMatches(run: SourceRun, binding: {
  scope: SourceScope; snapshot: SourceReview['snapshot'];
}, fingerprint: string): boolean {
  return run.testId === binding.scope.testId && run.command === binding.scope.command
    && Date.parse(run.completedAt) >= Date.parse(run.startedAt)
    && run.runnerSha256 === binding.snapshot.runnerSha256 && run.configSha256 === binding.snapshot.configSha256
    && run.environmentSha256 === binding.snapshot.environmentSha256 && run.exitCode === 0
    && run.preSourceSha256 === fingerprint && run.postSourceSha256 === fingerprint
    && run.preProductionSha256 === binding.snapshot.productionSha256
    && run.postProductionSha256 === binding.snapshot.productionSha256
    && run.preInputManifestSha256 === run.postInputManifestSha256;
}

/** @id CODE-M5-SOURCE-SEAL-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
function sourcePairMatches(pair: SourcePair, binding: {
  scope: SourceScope; snapshot: SourceReview['snapshot']; source: SourceReview['source'];
}): boolean {
  return pair.oldReportSha256 === pair.oldRun.reportSha256
    && pair.newReportSha256 === pair.newRun.reportSha256
    && pair.oldRun.invocationId !== pair.newRun.invocationId
    && pair.oldRun.outputs.afterBuildSha256 === pair.newRun.outputs.afterBuildSha256
    && sourceRunMatches(pair.oldRun, binding, binding.source.oldFingerprint)
    && sourceRunMatches(pair.newRun, binding, binding.source.newFingerprint);
}

export function sourceProjection(journal: SourceJournal, order: number): SourceProjection {
  const p = journal.payload;
  return {
    schemaVersion: 1, operationId: p.operationId, operationKey: journal.idempotencyKey,
    requestSha256: p.requestSha256, journalSha256: journal.recordSha256, journalOrder: journal.order, order,
    cycleId: p.mode === 'test-only' ? p.target.cycleId : p.replacement!.cycleId,
    scope: p.scope, mode: p.mode, target: p.target, newFingerprint: p.newFingerprint, recordedAt: p.recordedAt,
    reviewSha256: p.reviewSha256, approvalSha256: p.approvalSha256, state: 'completed',
  };
}

export function sourceTerminalChainRecord(evidence: TddEvidence, projection: SourceProjection): TddChainRecord {
  const cycle = evidence.cycles.find((entry) => entry.cycleId === projection.cycleId);
  if (!cycle) throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', 'chain-linkage');
  const previous = evidence.chain?.at(-1);
  const payload = {
    sequence: (previous?.sequence ?? 0) + 1, cycleId: projection.cycleId,
    changeId: projection.scope.changeId, generation: projection.scope.generation,
    ...(cycle.binding ? { binding: cycle.binding } : {}),
    requirementId: projection.scope.requirementId, testId: projection.scope.testId,
    testPath: projection.scope.path, commandName: projection.scope.command,
    ...(cycle.parallel ? { parallel: cycle.parallel } : {}),
    phase: 'source-supersession' as const, operationKey: projection.operationKey,
    phaseEvidenceSha256: sha256(canonicalBytes(projection)), previousSha256: previous?.recordSha256 ?? null,
  };
  return { ...payload, recordSha256: rawHash(payload) };
}

export function sourceCompletedResult(projection: SourceProjection): SourceResult {
  return {
    schemaVersion: 1, operationId: projection.operationId, requestSha256: projection.requestSha256,
    state: 'completed', scope: projection.scope, mode: projection.mode, target: projection.target,
    cycleId: projection.cycleId, newFingerprint: projection.newFingerprint, journalOrder: projection.journalOrder,
    order: projection.order, terminalSha256: sha256(canonicalBytes(projection)),
    artifactSha256: projection.reviewSha256, approvalSha256: projection.approvalSha256, recordedAt: projection.recordedAt,
  };
}

function cycleInSourceScope(cycle: TddCycle, scope: SourceScope): boolean {
  return cycle.changeId === scope.changeId && cycle.generation === scope.generation
    && cycle.requirementId === scope.requirementId && cycle.testId === scope.testId
    && cycle.testPath === scope.path && cycle.commandName === scope.command
    && same(cycle.binding ?? null, scope.candidate) && same(cycle.parallel ?? null, scope.parallel);
}

/** @id CODE-M5-SOURCE-LEDGER-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function classifySourceLedger(
  evidence: TddEvidence, journals: JournalRecord[], order: EvidenceOrderLog | null,
): SourceLedgerClassification {
  const operations: SourceLedgerOperation[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  let context: { operationId: string | null; scope: SourceScope | null; target: SourceTarget | null } =
    { operationId: null, scope: null, target: null };
  const fail: (reason: SourceReason<'TDD_SOURCE_LEDGER_INVALID'>) => never = (reason) => {
    throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', reason, context);
  };
  try {
    const sources = journals.filter((entry) => entry.kind === 'tdd-source-supersession'
      || entry.idempotencyKey.startsWith('tdd-source-supersession:'));
    const projections = evidence.sourceSupersessions ?? [];
    const sourceChains = (evidence.chain ?? []).filter((entry) => entry.phase === 'source-supersession');
    const sourceOrders = (order?.records ?? []).filter((entry) => entry.phase.includes(':source-supersession:'));
    if (!Array.isArray(projections)) fail('projection-mismatch');
    if (!sources.length && !projections.length && !sourceChains.length && !sourceOrders.length) {
      return { valid: true, operations, diagnostics };
    }
    try { validateJournalRecords(journals); }
    catch (cause) {
      if (!(cause instanceof Error && cause.message.startsWith('Invalid journal chain'))) throw cause;
      fail('journal-chain');
    }
    if (!validateEvidenceOrderLog(order).valid) fail('order-invalid');
    for (const [index, entry] of (evidence.chain ?? []).entries()) {
      const { recordSha256, ...payload } = entry;
      if (entry.sequence !== index + 1 || entry.previousSha256 !== (evidence.chain![index - 1]?.recordSha256 ?? null)
        || rawHash(payload) !== recordSha256) fail('chain-linkage');
    }
    const keys = new Set<string>();
    const consumedP = new Set<SourceProjection>();
    const consumedChain = new Set<TddChainRecord>();
    const consumedOrder = new Set<number>();
    const successors = new Map<string, string>();
    const targetIdentity = (target: Omit<SourceTarget, 'oldFingerprint'>): string =>
      JSON.stringify([target.cycleId, target.kind, target.order, target.payloadSha256]);
    const linkedPhase = (cycle: TddCycle, phase: 'red' | 'green' | 'refactor' | 'migrate'): boolean => {
      const value = cycle[phase];
      if (!value?.order) return false;
      const chains = (evidence.chain ?? []).filter((entry) => entry.cycleId === cycle.cycleId && entry.phase === phase);
      const orders = (order?.records ?? []).filter((entry) => entry.kind === 'tdd' && entry.entityId === cycle.cycleId
        && entry.phase === phase && entry.sequence === value.order);
      return chains.length === 1 && orders.length === 1 && chains[0]!.phaseEvidenceSha256 === rawHash(value)
        && chains[0]!.testId === cycle.testId && chains[0]!.requirementId === cycle.requirementId
        && chains[0]!.testPath === cycle.testPath && chains[0]!.commandName === cycle.commandName
        && chains[0]!.changeId === cycle.changeId && chains[0]!.generation === cycle.generation
        && same(chains[0]!.binding ?? null, cycle.binding ?? null)
        && same(chains[0]!.parallel ?? null, cycle.parallel ?? null);
    };
    const verifiedCycle = (id: string, scope: SourceScope): TddCycle => {
      const matches = evidence.cycles.filter((cycle) => cycle.cycleId === id);
      if (matches.length !== 1) fail('chain-linkage');
      const cycle = matches[0]!;
      if (!cycleInSourceScope(cycle, scope) || !cycle.red.valid || !cycle.green?.valid
        || !cycle.red.resultObserved || !cycle.green.resultObserved || !cycle.red.scoped || !cycle.green.scoped
        || cycle.red.testStatus !== 'failed' || cycle.green.testStatus !== 'passed'
        || cycle.red.exitCode === 0 || cycle.green.exitCode !== 0
        || !linkedPhase(cycle, 'red') || !linkedPhase(cycle, 'green')
        || cycle.red.order! >= cycle.green.order!) fail('chain-linkage');
      return cycle;
    };
    for (const entry of sources) {
      if (!journalPayloadGuard(entry.payload)) fail('journal-schema');
      const journal = entry as SourceJournal;
      const p = journal.payload;
      context = { operationId: p.operationId, scope: p.scope, target: p.target };
      const envelope = sourceObject({ schemaVersion: literal(1), order: positive, stream: literal('normal'),
        changeId: literal(p.scope.changeId), kind: literal('tdd-source-supersession'),
        idempotencyKey: literal(sourceOperationKey(p.scope, p.operationId)), payload: journalPayloadGuard,
        previousSha256: nullable(sourceHash), recordSha256: sourceHash });
      if (!envelope(journal)) fail('journal-schema');
      const { recordSha256, ...journalBody } = journal;
      if (sha256(canonicalBytes(journalBody)) !== recordSha256) fail('journal-chain');
      if (keys.has(journal.idempotencyKey)) fail('projection-mismatch');
      keys.add(journal.idempotencyKey);
      if (p.requestSha256 !== deriveSourceRequestDigest({ operationId: p.operationId, scope: p.scope,
        mode: p.mode, target: p.target, artifactSha256: p.reviewSha256, approvalSha256: p.approvalSha256 })
        || p.source.nodeId !== p.scope.testId || p.source.newFingerprint !== p.newFingerprint
        || p.source.oldFingerprint !== p.target.oldFingerprint || p.source.oldSourceDigest !== p.target.oldFingerprint
        || p.source.newSourceDigest !== p.newFingerprint || p.target.oldFingerprint === p.newFingerprint) fail('journal-schema');
      const targetCycle = verifiedCycle(p.target.cycleId, p.scope);
      if (p.target.kind === 'source-supersession') {
        const predecessor = operations.find((operation) => operation.projection?.cycleId === p.target.cycleId
          && operation.projection.order === p.target.order
          && sha256(canonicalBytes(operation.projection)) === p.target.payloadSha256);
        if (!predecessor?.projection || predecessor.projection.newFingerprint !== p.target.oldFingerprint) fail('chain-linkage');
      } else {
        const phase = p.target.kind === 'migration' ? 'migrate' : p.target.kind;
        const terminal = targetCycle[phase];
        if (!terminal || !linkedPhase(targetCycle, phase) || terminal.order !== p.target.order
          || rawHash(terminal) !== p.target.payloadSha256
          || (terminal.phase === 'migrate' ? terminal.toFingerprint : terminal.testFingerprint) !== p.target.oldFingerprint) {
          fail('chain-linkage');
        }
      }
      if (p.mode === 'test-only') {
        if (!p.pair || p.replacement || p.execution || !p.source.oldBlockSha256
          || !sourcePairMatches(p.pair, p)) fail('journal-schema');
      } else {
        if (p.pair || !p.replacement || !p.execution || !sourceRunMatches(p.execution, p, p.newFingerprint)) fail('journal-schema');
        const replacement = verifiedCycle(p.replacement.cycleId, p.scope);
        if (replacement.cycleId === targetCycle.cycleId || replacement.red.order! <= p.target.order
          || replacement.red.order !== p.replacement.redOrder || replacement.green!.order !== p.replacement.greenOrder
          || rawHash(replacement.red) !== p.replacement.redPayloadSha256
          || rawHash(replacement.green) !== p.replacement.greenPayloadSha256
          || replacement.red.testFingerprint !== p.newFingerprint || replacement.green!.testFingerprint !== p.newFingerprint
          || p.replacement.testFingerprint !== p.newFingerprint) fail('chain-linkage');
      }
      const matchingOrders = sourceOrders.filter((record) => record.entityId === p.operationId && record.phase === sourceOrderPhase(p.scope));
      if (matchingOrders.length > 1) fail('order-multiple');
      const operationOrder = matchingOrders[0];
      if (operationOrder && (operationOrder.kind !== 'tdd' || operationOrder.testId !== p.scope.testId
        || operationOrder.sequence <= p.target.order
        || !same(Object.keys(operationOrder).sort(), ['sequence', 'kind', 'entityId', 'phase', 'testId', 'previousSha256', 'recordSha256'].sort()))) fail('order-invalid');
      const ps = projections.filter((projection) => projection.operationKey === journal.idempotencyKey);
      const cs = sourceChains.filter((record) => record.operationKey === journal.idempotencyKey);
      if (ps.length !== cs.length || ps.length > 1 || (ps.length && !operationOrder)) fail('projection-mismatch');
      const projection = ps[0] ?? null;
      if (projection) {
        if (!projectionGuard(projection) || !same(projection, sourceProjection(journal, operationOrder!.sequence))) fail('projection-mismatch');
        const chain = cs[0]!;
        const prefix = { ...evidence, chain: evidence.chain!.slice(0, evidence.chain!.indexOf(chain)) };
        if (JSON.stringify(chain) !== JSON.stringify(sourceTerminalChainRecord(prefix, projection))) fail('chain-linkage');
        consumedP.add(projection);
        consumedChain.add(chain);
      }
      if (operationOrder) consumedOrder.add(operationOrder.sequence);
      const identity = targetIdentity(p.target);
      if (successors.has(identity)) fail('successor-branch');
      const next = projection ? targetIdentity({ cycleId: projection.cycleId, kind: 'source-supersession',
        order: projection.order, payloadSha256: sha256(canonicalBytes(projection)) }) : journal.idempotencyKey;
      if (identity === next) fail('successor-self');
      for (let cursor: string | undefined = next; cursor; cursor = successors.get(cursor)) {
        if (cursor === identity) fail('successor-cycle');
      }
      successors.set(identity, next);
      operations.push({ journal, state: projection ? 'completed' : 'pending', order: operationOrder?.sequence ?? null, projection });
    }
    if (consumedP.size !== projections.length || consumedChain.size !== sourceChains.length) fail('projection-mismatch');
    if (consumedOrder.size !== sourceOrders.length) fail('order-invalid');
  } catch (cause) {
    if (!(cause instanceof SourceOperationError)) throw cause;
    diagnostics.push(cause.diagnostic);
  }
  return { valid: diagnostics.length === 0, operations, diagnostics };
}
