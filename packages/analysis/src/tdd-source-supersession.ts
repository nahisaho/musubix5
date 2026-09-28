import { lstat, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalBytes, canonicalRepositoryIdentity, sha256 } from './canonical.js';
import { resolveChangeContext, type ActiveChangeContext } from './change-generation.js';
import { runProcess } from './process.js';
import type { CommandConfig } from './config.js';
import { safePath } from './files.js';
import {
  assertTddWriteLeaseSetCurrent, loadJournalRecords, writeAuthorizedJson, withTddWriteLeaseSet, LeaseAcquisitionTimeout,
  appendJournalRecord,
  type JournalRecord, type TddWriteLeaseSet,
} from './journal.js';
import { appendEvidenceOrder, loadEvidenceOrder, type EvidenceOrderLog } from './order.js';
import {
  classifySourceLedger, sourceCompletedResult, sourceOrderPhase, sourceProjection, sourceTerminalChainRecord,
  sourceApprovalGuard, validateSourceReview, validateSourceApproval, sourceConflict, sourceHash, sourceOperationKey,
  sourcePath, deriveSourceRequestDigest, sourceHunkGuard, sourceResumeArgs,
  type SourceLedgerClassification, type SourceLedgerOperation,
} from './tdd-source-ledger.js';
import { SourceOperationError, sourceIoFailure, type SourceErrorContext } from './tdd-source-diagnostics.js';
import type {
  SourceResult, SourceOperationScope, SourceReview, SourceApproval, SourceScope, SourceBinding, SourceReplacement,
  SourcePreparationRequest, SourcePreparationResult, SourceApprovalResult, SourceJournalPayload, SourceHunk,
} from './tdd-source-types.js';
import type { TddEvidence } from './tdd-types.js';
import { sourceBlobVerification, sourceEvidencePrefix, sourceSafePath, publishSourceFile, publishSourceBlob } from './tdd-source-storage.js';
import { verifySourceReviewBlobs, verifySourceRunBlobs } from './tdd-source-artifacts.js';
import { captureSourceSnapshot, recheckSourceSnapshot } from './tdd-source-snapshot.js';
import { spliceCanonicalTestBlock, sourceReviewHunks } from './tdd-source-review.js';
import { verifySyntheticPair, verifySourceExecution } from './tdd-source-pair.js';

export interface PreparedSourceAdmission {
  scope: SourceScope;
  source: SourceBinding;
  node: { id: string; path: string; line: number };
  currentFile: string;
  command: CommandConfig;
  replacement: SourceReplacement | null;
  approvalContext: SourceReview['approvalContext'];
  recheck: (evidence: TddEvidence, order: EvidenceOrderLog | null, source: SourceLedgerClassification) => Promise<void>;
}
export type SourceAdmissionPreparer = (
  root: string, input: SourcePreparationRequest, replayArtifact: boolean,
) => Promise<PreparedSourceAdmission>;

async function preparationInput(root: string, path: string): Promise<Buffer> {
  if (!sourcePath(path) || path === '.git' || path.startsWith('.git/')) {
    throw new Error('CLI_ERROR: unsafe-path {"reason":"unsafe-path"}');
  }
  const absolute = await safePath(root, path);
  try {
    if (!(await lstat(absolute)).isFile()) throw new Error('CLI_ERROR: unsafe-path {"reason":"unsafe-path"}');
    return await readFile(absolute);
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('CLI_ERROR:')) throw cause;
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', undefined, { path });
  }
}

function decodePreparationInput(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (cause) {
    if (cause instanceof TypeError && 'code' in cause && cause.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'splice-invalid');
    }
    throw cause;
  }
}

async function optionalSourceReview(root: string, scope: SourceOperationScope): Promise<SourceReview | null> {
  try { return await readSourceReview(root, scope); }
  catch (cause) {
    if (cause instanceof SourceOperationError && cause.code === 'TDD_SOURCE_APPROVAL_INVALID'
      && cause.diagnostic.details.reason === 'review-missing') return null;
    throw cause;
  }
}

async function sourceAdmissionLease<T>(
  root: string, operation: SourceOperationScope, scope: SourceScope, target: SourceReview['target'],
  callback: (evidence: TddEvidence, order: EvidenceOrderLog | null, source: SourceLedgerClassification,
    leases: TddWriteLeaseSet) => Promise<T>,
): Promise<T> {
  const context = { operationId: operation.operationId, scope, target };
  const retry = Symbol('source-prerequisites-advanced');
  for (;;) {
    const verified = await inspectSourceEvidence(root, await readSourceTddEvidence(root));
    requireSourceLedger(verified);
    try {
      const result = await withTddWriteLeaseSet(root, [operation.changeId], async (leases) => {
        await requireSourceOperationGeneration(root, operation);
        if (await sourceRepositoryIdentity(root, context) !== scope.repositoryId) {
          throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'foreign-target', context);
        }
        const [evidence, journals, order] = await Promise.all([
          readSourceTddEvidence(root), loadJournalRecords(root), loadEvidenceOrder(root),
        ]);
        const latest = classifySourceLedger(evidence, journals, order);
        requireSourceLedger(latest);
        if (!canonicalBytes(latest.operations).equals(canonicalBytes(verified.operations))) return retry;
        await verified.recheck();
        return callback(evidence, order, latest, leases);
      });
      if (result !== retry) return result;
    } catch (cause) {
      if (cause instanceof LeaseAcquisitionTimeout) {
        if (cause.leaseKind === 'repository-append') {
          throw new SourceOperationError('TDD_SOURCE_LEASE_BUSY', 'append-timeout', context);
        }
        throw new Error(`CHANGE_PROJECTION_LEASE_BUSY: ${cause.message}`);
      }
      throw cause;
    }
  }
}

function preparationResult(review: SourceReview): SourcePreparationResult {
  return { schemaVersion: 1, operationId: review.operationId, artifactPath: sourceArtifactPath({
    changeId: review.changeId, generation: review.scope.generation, operationId: review.operationId,
  }), artifactSha256: sha256(canonicalBytes(review)), mode: review.mode, target: review.target, scope: review.scope };
}

function requestFromReview(review: SourceReview): SourcePreparationRequest {
  return {
    changeId: review.changeId, generation: review.scope.generation, operationId: review.operationId,
    testId: review.scope.testId, requirementId: review.scope.requirementId, command: review.scope.command,
    target: review.target, mode: review.mode, reason: review.reason,
    ...(review.replacement ? { replacementCycleId: review.replacement.cycleId } : {}),
  };
}

/** @id CODE-M5-SOURCE-PREPARE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-004 DES-M5-007 DES-M5-023
 */
export async function prepareSourceReview(
  root: string, input: SourcePreparationRequest, admit: SourceAdmissionPreparer,
): Promise<SourcePreparationResult> {
  await requireSourceOperationGeneration(root, input);
  requireSourceLedger(await inspectSourceEvidence(root, await readSourceTddEvidence(root)));
  const existing = await optionalSourceReview(root, input);
  const admission = await admit(root, input, existing !== null);
  const context = { operationId: input.operationId, scope: admission.scope, target: input.target };
  let hunks: SourceHunk[] = [];
  let splice: ReturnType<typeof spliceCanonicalTestBlock> | null = null;
  const frozenInputs: Array<{ path: string; sha256: string }> = [];
  if (input.mode === 'test-only') {
    if (!input.oldBlockPath || !input.hunkReviewPath) throw new Error('CLI_ERROR: missing-option {"reason":"missing-option"}');
    const [old, hunkBytes] = await Promise.all([
      preparationInput(root, input.oldBlockPath), preparationInput(root, input.hunkReviewPath),
    ]);
    splice = spliceCanonicalTestBlock(admission.node, admission.currentFile, decodePreparationInput(old), input.target.oldFingerprint);
    let value: unknown;
    try { value = JSON.parse(decodePreparationInput(hunkBytes)); }
    catch (cause) {
      if (cause instanceof SyntaxError) throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'equivalence-unconfirmed', context);
      throw cause;
    }
    const hunk = (entry: unknown): entry is SourceHunk => sourceHunkGuard(entry);
    if (!Array.isArray(value) || !value.every(hunk)) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'equivalence-unconfirmed', context);
    }
    hunks = value;
    const coordinates = hunks.map(({ oldStart, oldLength, newStart, newLength }) => ({ oldStart, oldLength, newStart, newLength }));
    if (!canonicalBytes(coordinates).equals(canonicalBytes(sourceReviewHunks(splice.oldBlock, splice.newBlock)))
      || hunks.some((entry) => !entry.requirementIds.includes(input.requirementId))) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'equivalence-unconfirmed', context);
    }
    frozenInputs.push({ path: input.oldBlockPath, sha256: sha256(old) }, { path: input.hunkReviewPath, sha256: sha256(hunkBytes) });
  }
  const store = (bytes: Uint8Array) => publishSourceBlob(root, bytes);
  const captured = await captureSourceSnapshot(root, admission.command, admission.node.path, store);
  if (captured.manifest.entries.find((entry) => entry.path === admission.node.path)?.sha256 !== admission.source.currentFileSha256) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
  }
  const source = { ...admission.source, oldBlockSha256: splice ? await store(Buffer.from(splice.oldBlock)) : null };
  await store(Buffer.from(admission.currentFile).subarray(source.annotationStart, source.statementEnd));
  if (existing && (!canonicalBytes(requestFromReview(existing)).equals(canonicalBytes({
    changeId: input.changeId, generation: input.generation, operationId: input.operationId,
    testId: input.testId, requirementId: input.requirementId, command: input.command, target: input.target,
    mode: input.mode, reason: input.reason,
    ...(input.replacementCycleId ? { replacementCycleId: input.replacementCycleId } : {}),
  })) || !canonicalBytes(existing.scope).equals(canonicalBytes(admission.scope))
    || !canonicalBytes(existing.source).equals(canonicalBytes(source))
    || !canonicalBytes(existing.snapshot).equals(canonicalBytes(captured.binding))
    || !canonicalBytes(existing.hunks).equals(canonicalBytes(hunks))
    || !canonicalBytes(existing.approvalContext).equals(canonicalBytes(admission.approvalContext)))) {
    throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'request-mismatch', context);
  }
  const base = {
    schemaVersion: 1 as const, kind: 'tdd-source-review' as const, changeId: input.changeId,
    operationId: input.operationId, scope: admission.scope, target: input.target, source, snapshot: captured.binding,
    reason: input.reason, hunks, preparedAt: new Date().toISOString(), preparationInvocationId: randomUUID(),
    approvalContext: admission.approvalContext,
  };
  const review: SourceReview = existing ?? (input.mode === 'test-only'
    ? { ...base, mode: 'test-only', replacement: null,
      pair: await verifySyntheticPair(root, root, captured, admission.command, admission.node, splice!, store) }
    : { ...base, mode: 'behavior-change', pair: null, replacement: admission.replacement! });
  const references = sourceBlobVerification(root);
  await verifySourceReviewBlobs(root, review, references.read);
  await references.verifyGitAttributes();
  await recheckSourceSnapshot(root, admission.command, admission.node.path, captured).then((current) => {
    if (current.binding.stateSha256 !== captured.binding.stateSha256) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
  });
  return sourceAdmissionLease(root, input, admission.scope, input.target, async (evidence, order, sources, leases) => {
    await admission.recheck(evidence, order, sources);
    const current = await recheckSourceSnapshot(root, admission.command, admission.node.path, captured);
    if (current.binding.stateSha256 !== captured.binding.stateSha256) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
    for (const entry of frozenInputs) if (sha256(await preparationInput(root, entry.path)) !== entry.sha256) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
    await references.recheck();
    await publishSourceFile(root, sourceArtifactPath(input), canonicalBytes(review), () => assertTddWriteLeaseSetCurrent(root, leases));
    return preparationResult(review);
  });
}

async function optionalSourceApproval(root: string, input: SourceOperationScope, review: SourceReview,
  artifactSha256: string): Promise<SourceApproval | null> {
  try { return await readSourceApproval(root, input, review, artifactSha256); }
  catch (cause) {
    if (cause instanceof SourceOperationError && cause.code === 'TDD_SOURCE_APPROVAL_INVALID'
      && cause.diagnostic.details.reason === 'approval-missing') return null;
    throw cause;
  }
}

function requireCurrentReview(review: SourceReview, admission: PreparedSourceAdmission): void {
  const context = { operationId: review.operationId, scope: review.scope, target: review.target };
  if (!canonicalBytes(review.scope).equals(canonicalBytes(admission.scope))
    || !canonicalBytes(review.source).equals(canonicalBytes({ ...admission.source, oldBlockSha256: review.source.oldBlockSha256 }))) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
  }
  if (!canonicalBytes(review.approvalContext).equals(canonicalBytes(admission.approvalContext))) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'general-approval-stale', context);
  }
}

/** @id CODE-M5-SOURCE-APPROVE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-004 DES-M5-007 DES-M5-023
 */
export async function approveSourceReview(
  root: string, input: SourceOperationScope & { artifactSha256: string; approver: string; confirm: boolean },
  admit: SourceAdmissionPreparer,
): Promise<SourceApprovalResult> {
  if (!input.confirm) throw new Error('CLI_ERROR: confirmation-required {"reason":"confirmation-required"}');
  if (!input.approver.trim()) throw new Error('CLI_ERROR: blank-value {"reason":"blank-value"}');
  if (!sourceHash(input.artifactSha256)) throw new Error('CLI_ERROR: invalid-selector {"reason":"invalid-selector"}');
  await requireSourceOperationGeneration(root, input);
  requireSourceLedger(await inspectSourceEvidence(root, await readSourceTddEvidence(root)));
  const review = await readSourceReview(root, input, input.artifactSha256);
  const admission = await admit(root, requestFromReview(review), true);
  requireCurrentReview(review, admission);
  const context = { operationId: input.operationId, scope: review.scope, target: review.target };
  const references = sourceBlobVerification(root);
  await verifySourceReviewBlobs(root, review, references.read);
  await references.verifyGitAttributes();
  const captured = await captureSourceSnapshot(root, admission.command, admission.node.path);
  if (captured.binding.stateSha256 !== review.snapshot.stateSha256) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
  }
  const approver = input.approver.trim();
  const prepared: SourceApproval = {
    schemaVersion: 1, kind: 'tdd-source-approval', changeId: input.changeId, operationId: input.operationId,
    scope: review.scope, mode: review.mode, target: review.target, artifactSha256: input.artifactSha256,
    approver, confirmed: true, approvedAt: new Date().toISOString(),
  };
  return sourceAdmissionLease(root, input, review.scope, review.target, async (evidence, order, sources, leases) => {
    await admission.recheck(evidence, order, sources);
    if ((await recheckSourceSnapshot(root, admission.command, admission.node.path, captured)).binding.stateSha256 !== review.snapshot.stateSha256) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
    await readSourceReview(root, input, input.artifactSha256);
    await references.recheck();
    const existing = await optionalSourceApproval(root, input, review, input.artifactSha256);
    if (existing && existing.approver !== approver) {
      throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'actor-mismatch', context);
    }
    const approval = existing ?? prepared;
    const approvalPath = sourceArtifactPath(input, 'approval');
    await publishSourceFile(root, approvalPath, canonicalBytes(approval), () => assertTddWriteLeaseSetCurrent(root, leases));
    return { schemaVersion: 1, operationId: input.operationId, artifactSha256: input.artifactSha256,
      approvalPath, approvalSha256: sha256(canonicalBytes(approval)) };
  });
}

function recordedSourceResult(
  source: SourceLedgerClassification,
  input: SourceOperationScope & { artifactSha256: string; approvalSha256: string },
): SourceResult | null {
  requireSourceLedger(source);
  const operation = source.operations.find((entry) => entry.journal.idempotencyKey === sourceOperationKey(input, input.operationId));
  if (!operation) return null;
  const p = operation.journal.payload;
  const context = { operationId: input.operationId, scope: p.scope, target: p.target };
  if (p.reviewSha256 !== input.artifactSha256 || p.approvalSha256 !== input.approvalSha256) {
    throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'request-mismatch', context);
  }
  if (!operation.projection) {
    throw new SourceOperationError('TDD_SOURCE_PENDING', 'resume-required', context, {
      blockingOperationId: p.operationId, testId: p.scope.testId, targetCycleId: p.target.cycleId,
      requestSha256: p.requestSha256, artifactSha256: p.reviewSha256, approvalSha256: p.approvalSha256,
      resumeArgs: sourceResumeArgs(operation),
    });
  }
  return sourceCompletedResult(operation.projection);
}

/** @id CODE-M5-SOURCE-RECORD-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-004 DES-M5-007 DES-M5-023
 */
export async function recordSourceReview(
  root: string, input: SourceOperationScope & { artifactSha256: string; approvalSha256: string },
  admit: SourceAdmissionPreparer,
): Promise<SourceResult> {
  if (!sourceHash(input.artifactSha256) || !sourceHash(input.approvalSha256)) {
    throw new Error('CLI_ERROR: invalid-selector {"reason":"invalid-selector"}');
  }
  await requireSourceOperationGeneration(root, input);
  const initial = await inspectSourceEvidence(root, await readSourceTddEvidence(root));
  const prior = initial.operations.find((entry) => entry.journal.idempotencyKey === sourceOperationKey(input, input.operationId));
  if (prior) await requireSourceRepository(root, prior);
  const existing = recordedSourceResult(initial, input);
  if (existing) return existing;
  const review = await readSourceReview(root, input, input.artifactSha256);
  const approval = await readSourceApproval(root, input, review, input.artifactSha256, input.approvalSha256);
  const admission = await admit(root, requestFromReview(review), false);
  requireCurrentReview(review, admission);
  const context = { operationId: input.operationId, scope: review.scope, target: review.target };
  const references = sourceBlobVerification(root);
  await verifySourceReviewBlobs(root, review, references.read);
  await references.verifyGitAttributes();
  const captured = await captureSourceSnapshot(root, admission.command, admission.node.path);
  if (captured.binding.stateSha256 !== review.snapshot.stateSha256) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
  }
  const execution = review.mode === 'behavior-change'
    ? await verifySourceExecution(root, root, captured, admission.command, admission.node,
      admission.currentFile, admission.source.newFingerprint, (bytes) => publishSourceBlob(root, bytes)) : null;
  if (execution) {
    await verifySourceRunBlobs(root, execution, references.read);
    if (execution.preInputManifestSha256 !== sha256(canonicalBytes(captured.manifest.entries))) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
  }
  return sourceAdmissionLease(root, input, review.scope, review.target, async (evidence, order, sources, leases) => {
    const replay = recordedSourceResult(sources, input);
    if (replay) return replay;
    await admission.recheck(evidence, order, sources);
    if ((await recheckSourceSnapshot(root, admission.command, admission.node.path, captured)).binding.stateSha256 !== review.snapshot.stateSha256) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'input-drift', context);
    }
    await readSourceReview(root, input, input.artifactSha256);
    await readSourceApproval(root, input, review, input.artifactSha256, input.approvalSha256);
    await references.recheck();
    const payload: SourceJournalPayload = {
      schemaVersion: 1, operationId: input.operationId,
      requestSha256: deriveSourceRequestDigest({ operationId: input.operationId, scope: review.scope, mode: review.mode,
        target: review.target, artifactSha256: input.artifactSha256, approvalSha256: input.approvalSha256 }),
      mode: review.mode, scope: review.scope, target: review.target, newFingerprint: review.source.newFingerprint,
      reviewSha256: input.artifactSha256, approvalSha256: input.approvalSha256,
      source: review.source, snapshot: review.snapshot, pair: review.pair, replacement: review.replacement,
      reason: review.reason, approver: approval.approver, execution, recordedAt: new Date().toISOString(),
      fencing: { change: leases.changeLeases[0]!.fencingToken, projection: leases.projectionLease.fencingToken,
        append: leases.appendSession.fencingToken },
    };
    const append = { stream: 'normal' as const, changeId: input.changeId, kind: 'tdd-source-supersession',
      idempotencyKey: sourceOperationKey(input, input.operationId), payload };
    const journals = await loadJournalRecords(root);
    const envelope = { schemaVersion: 1 as const, order: journals.length + 1, ...append,
      previousSha256: journals.at(-1)?.recordSha256 ?? null };
    const prospective = { ...envelope, recordSha256: sha256(canonicalBytes(envelope)) };
    requireSourceLedger(classifySourceLedger(evidence, [...journals, prospective], order));
    await assertTddWriteLeaseSetCurrent(root, leases);
    const journal = await appendJournalRecord(root, append, leases.appendSession)
      .catch((cause: unknown) => sourceIoFailure(cause, 'append', context));
    return completeSourceSuffix(root, journal, leases);
  });
}

export function sourceArtifactPath(scope: SourceOperationScope, kind: 'artifact' | 'approval' = 'artifact'): string {
  if (!/^CHANGE-\d+$/.test(scope.changeId) || !Number.isSafeInteger(scope.generation) || scope.generation < 1
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(scope.operationId)) throw new Error('CLI_ERROR: invalid-selector');
  return `${sourceEvidencePrefix}/${scope.changeId}/g${scope.generation}/${scope.operationId}/${kind}.json`;
}

async function readSourcePrerequisite(root: string, scope: SourceOperationScope, kind: 'artifact' | 'approval',
  expectedHash?: string): Promise<unknown> {
  const path = sourceArtifactPath(scope, kind);
  let bytes: Buffer;
  try { bytes = await readFile(await sourceSafePath(root, path)); }
  catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') {
      throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', kind === 'artifact' ? 'review-missing' : 'approval-missing',
        { operationId: scope.operationId, scope: null, target: null });
    }
    if (cause instanceof Error && cause.message.startsWith('CLI_ERROR: unsafe-path')) throw cause;
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read',
      { operationId: scope.operationId, scope: null, target: null }, { path });
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', kind === 'artifact' ? 'review-schema' : 'approval-schema');
  }
  if (!canonicalBytes(value).equals(bytes) || (expectedHash !== undefined && sha256(bytes) !== expectedHash)) {
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', kind === 'artifact' ? 'review-hash' : 'approval-hash');
  }
  return value;
}

/** @id CODE-M5-SOURCE-PREREQUISITES-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export async function readSourceReview(root: string, scope: SourceOperationScope, hash?: string): Promise<SourceReview> {
  const value = await readSourcePrerequisite(root, scope, 'artifact', hash);
  const validation = validateSourceReview(value);
  if (!validation.valid || !validation.review || validation.review.changeId !== scope.changeId
    || validation.review.scope.generation !== scope.generation || validation.review.operationId !== scope.operationId) {
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'review-schema');
  }
  return validation.review;
}

export async function readSourceApproval(root: string, scope: SourceOperationScope, review: SourceReview,
  artifactSha256: string, approvalSha256?: string): Promise<SourceApproval> {
  const value = await readSourcePrerequisite(root, scope, 'approval', approvalSha256);
  if (!sourceApprovalGuard(value)) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'approval-schema');
  if (!validateSourceApproval(value, review, artifactSha256)) {
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'approval-binding');
  }
  return value;
}

export interface VerifiedSourceEvidence extends SourceLedgerClassification {
  invalidOperationKeys: string[];
  recheck: () => Promise<void>;
}

/** @id CODE-M5-SOURCE-MATERIALIZE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
export async function recheckSourceMaterialization(root: string, prepared?: VerifiedSourceEvidence): Promise<boolean> {
  const [evidence, journals, order] = await Promise.all([
    readSourceTddEvidence(root), loadJournalRecords(root), loadEvidenceOrder(root),
  ]);
  const current = classifySourceLedger(evidence, journals, order);
  requireSourceLedger(current);
  if (!prepared) return current.operations.length === 0;
  requireSourceLedger(prepared);
  if (!canonicalBytes(current.operations).equals(canonicalBytes(prepared.operations))) return false;
  await prepared.recheck();
  return true;
}

/** @id CODE-M5-SOURCE-TAIL-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
export function sourceMaterializationTailValid(
  baseline: TddEvidence, current: Omit<TddEvidence, 'sourceSupersessions'> & { sourceSupersessions?: unknown[] },
  verified: SourceLedgerClassification, committedJournalOrder: number,
): boolean {
  if (!verified.valid) return false;
  const { chain: oldChain = [], sourceSupersessions: oldProjections = [], ...oldState } = baseline;
  const { chain = [], sourceSupersessions: projections = [], ...state } = current;
  const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  if (!equal(oldState, state) || !equal(chain.slice(0, oldChain.length), oldChain)
    || !equal(projections.slice(0, oldProjections.length), oldProjections)
    || chain.length - oldChain.length !== projections.length - oldProjections.length) return false;
  const prefix = [...oldChain];
  for (const [index, record] of chain.slice(oldChain.length).entries()) {
    if (record.phase !== 'source-supersession') return false;
    const operation = verified.operations.find((entry) => entry.journal.idempotencyKey === record.operationKey);
    const projection = projections[oldProjections.length + index];
    if (!operation?.projection || operation.journal.order <= committedJournalOrder
      || !equal(projection, operation.projection)
      || !equal(record, sourceTerminalChainRecord({ ...state, chain: prefix }, operation.projection))) return false;
    prefix.push(record);
  }
  return true;
}

/** @id CODE-M5-SOURCE-INTEGRITY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export async function inspectSourceEvidence(
  root: string, evidence: TddEvidence, journalInput?: JournalRecord[], orderInput?: EvidenceOrderLog | null,
): Promise<VerifiedSourceEvidence> {
  const [journals, order] = await Promise.all([
    journalInput ?? loadJournalRecords(root), orderInput === undefined ? loadEvidenceOrder(root) : orderInput,
  ]);
  const ledger = classifySourceLedger(evidence, journals, order);
  const invalidOperationKeys: string[] = [];
  const blobs = sourceBlobVerification(root);
  const rechecks: Array<() => Promise<void>> = [];
  if (ledger.valid) for (const operation of ledger.operations) {
    const p = operation.journal.payload;
    const scope = { changeId: p.scope.changeId, generation: p.scope.generation, operationId: p.operationId };
    try {
      const review = await readSourceReview(root, scope, p.reviewSha256);
      const approval = await readSourceApproval(root, scope, review, p.reviewSha256, p.approvalSha256);
      const sealed = (value: Pick<SourceReview, 'mode' | 'scope' | 'target' | 'source' | 'snapshot' | 'pair' | 'replacement' | 'reason'>) => ({
        mode: value.mode, scope: value.scope, target: value.target, source: value.source, snapshot: value.snapshot,
        pair: value.pair, replacement: value.replacement, reason: value.reason,
      });
      if (!canonicalBytes(sealed(p)).equals(canonicalBytes(sealed(review))) || approval.approver !== p.approver) {
        throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'approval-binding');
      }
      const manifest = await verifySourceReviewBlobs(root, review, blobs.read);
      if (p.execution) {
        if (p.execution.preInputManifestSha256 !== sha256(canonicalBytes(manifest.entries))) {
          throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
        }
        await verifySourceRunBlobs(root, p.execution, blobs.read);
      }
      await blobs.verifyGitAttributes();
      rechecks.push(async () => {
        await readSourceReview(root, scope, p.reviewSha256);
        await readSourceApproval(root, scope, review, p.reviewSha256, p.approvalSha256);
      });
    } catch (cause) {
      if (!(cause instanceof SourceOperationError) || cause.exitCode === 2) throw cause;
      ledger.valid = false;
      invalidOperationKeys.push(operation.journal.idempotencyKey);
      ledger.diagnostics.push({ ...cause.diagnostic,
        details: { ...cause.diagnostic.details, operationId: p.operationId, scope: p.scope, target: p.target } });
    }
  }
  const recheck = async (): Promise<void> => {
    requireSourceLedger(ledger);
    await Promise.all(rechecks.map((check) => check()));
    await blobs.recheck();
  };
  if (ledger.valid) await recheck();
  return { ...ledger, invalidOperationKeys, recheck };
}

export async function readSourceTddEvidence(root: string): Promise<TddEvidence> {
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(root, '.musubix/evidence/tdd.json'), 'utf8')); }
  catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') {
      return { schemaVersion: 1, cycles: [], chain: [] };
    }
    if (cause instanceof SyntaxError) throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', 'scope-unreadable');
    sourceIoFailure(cause, 'read', undefined, { path: '.musubix/evidence/tdd.json' });
  }
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('cycles' in value) || !Array.isArray(value.cycles)) {
    throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', 'scope-unreadable');
  }
  return value as TddEvidence;
}

export function requireSourceLedger(classification: SourceLedgerClassification): void {
  if (!classification.valid) {
    const diagnostic = classification.diagnostics[0]!;
    throw new Error(`${diagnostic.code}: ${diagnostic.message} ${JSON.stringify(diagnostic.details)}`);
  }
}

/** @id CODE-M5-SOURCE-WRITER-SCOPE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
export function requireSourceWriterAllowed(
  ledger: SourceLedgerClassification, scope: Parameters<typeof sourceConflict>[1], explicitCycleIds: string[] = [],
): void {
  requireSourceLedger(ledger);
  const conflict = sourceConflict(ledger, scope, explicitCycleIds);
  if (conflict) throw new Error(`${conflict.code}: ${conflict.message} ${JSON.stringify(conflict.details)}`);
}

/** @id CODE-M5-SOURCE-SUFFIX-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-007 DES-M5-023
 */
export async function completeSourceSuffix(
  root: string, expectedJournal: JournalRecord, leases: TddWriteLeaseSet,
): Promise<SourceResult> {
  await assertTddWriteLeaseSetCurrent(root, leases);
  if (!leases.changeLeases.some((lease) => lease.changeId === expectedJournal.changeId)) {
    throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', 'scope-unreadable');
  }
  const [evidence, journals, order] = await Promise.all([
    readSourceTddEvidence(root), loadJournalRecords(root), loadEvidenceOrder(root),
  ]);
  const classification = classifySourceLedger(evidence, journals, order);
  requireSourceLedger(classification);
  const operation = classification.operations.find((entry) => entry.journal.idempotencyKey === expectedJournal.idempotencyKey);
  if (!operation) throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'unknown-operation');
  if (!canonicalBytes(operation.journal).equals(canonicalBytes(expectedJournal))) {
    throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'request-mismatch');
  }
  if (operation.projection) return sourceCompletedResult(operation.projection);
  const p = operation.journal.payload;
  const input = { kind: 'tdd' as const, entityId: p.operationId, phase: sourceOrderPhase(p.scope), testId: p.scope.testId };
  const sequence = operation.order ?? Math.max(0, ...(order?.records ?? []).map((entry) => entry.sequence)) + 1;
  const projection = sourceProjection(operation.journal, sequence);
  const chain = sourceTerminalChainRecord(evidence, projection);
  const prospectiveEvidence: TddEvidence = {
    ...evidence, chain: [...(evidence.chain ?? []), chain],
    sourceSupersessions: [...(evidence.sourceSupersessions ?? []), projection],
  };
  const prospectiveOrder: EvidenceOrderLog = { schemaVersion: 1, records: [...(order?.records ?? [])] };
  if (operation.order === null) {
    const record = { sequence, ...input, previousSha256: prospectiveOrder.records.at(-1)?.recordSha256 ?? null };
    prospectiveOrder.records.push({ ...record, recordSha256: sha256(Buffer.from(JSON.stringify(record))) });
  }
  requireSourceLedger(classifySourceLedger(prospectiveEvidence, journals, prospectiveOrder));
  if (operation.order === null) {
    await assertTddWriteLeaseSetCurrent(root, leases);
    const appended = await appendEvidenceOrder(root, input, leases.appendSession)
      .catch((cause: unknown) => sourceIoFailure(cause, 'append',
        { operationId: p.operationId, scope: p.scope, target: p.target }));
    if (appended.sequence !== sequence) throw new SourceOperationError('TDD_SOURCE_LEDGER_INVALID', 'order-invalid');
  }
  await writeAuthorizedJson(root, '.musubix/evidence/tdd.json', prospectiveEvidence,
    () => assertTddWriteLeaseSetCurrent(root, leases), false)
    .catch((cause: unknown) => sourceIoFailure(cause, 'atomic-replace',
      { operationId: p.operationId, scope: p.scope, target: p.target }, { path: '.musubix/evidence/tdd.json' }));
  return sourceCompletedResult(projection);
}

/** @id CODE-M5-SOURCE-ACTIVE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-005 DES-M5-007 DES-M5-023
 */
export async function requireSourceOperationGeneration(
  root: string, scope: SourceOperationScope,
): Promise<ActiveChangeContext> {
  sourceArtifactPath(scope);
  const current = await resolveChangeContext(root, { changeId: scope.changeId });
  if (!current || current.documentStatus !== 'active' || current.generation !== scope.generation) {
    throw new Error('CHANGE_GENERATION_PHASE: source supersession requires the explicitly selected current active generation.');
  }
  return { changeId: current.changeId, generation: current.generation, requirementIds: current.requirementIds };
}

export async function replaySourceSupersession(
  root: string, input: SourceOperationScope & { requestSha256: string },
): Promise<SourceResult> {
  if (!sourceHash(input.requestSha256)) {
    throw new Error('CLI_ERROR: invalid-selector {"reason":"invalid-selector"}');
  }
  await requireSourceOperationGeneration(root, input);
  const source = await inspectSourceEvidence(root, await readSourceTddEvidence(root));
  const operation = matchingSourceOperation(source, input);
  await requireSourceRepository(root, operation);
  if (!operation.projection) throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'not-completed',
    { operationId: input.operationId, scope: operation.journal.payload.scope, target: operation.journal.payload.target });
  return sourceCompletedResult(operation.projection);
}

function matchingSourceOperation(
  source: SourceLedgerClassification, input: SourceOperationScope & { requestSha256: string },
): SourceLedgerOperation {
  requireSourceLedger(source);
  const operation = source.operations.find((entry) =>
    entry.journal.idempotencyKey === sourceOperationKey(input, input.operationId));
  const context = { operationId: input.operationId, scope: operation?.journal.payload.scope ?? null,
    target: operation?.journal.payload.target ?? null };
  if (!operation) throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'unknown-operation', context);
  if (operation.journal.payload.requestSha256 !== input.requestSha256) {
    throw new SourceOperationError('TDD_SOURCE_REPLAY_INVALID', 'request-mismatch', context);
  }
  return operation;
}

/** @id CODE-M5-SOURCE-REPOSITORY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-003 DES-M5-005 DES-M5-007 DES-M5-023
 */
export async function sourceRepositoryIdentity(root: string, context?: SourceErrorContext): Promise<string> {
  const [directory, origin] = await Promise.all([
    runProcess('git', ['-C', root, 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 30_000 }),
    runProcess('git', ['-C', root, 'config', '--get-all', 'remote.origin.url'], { cwd: root, timeoutMs: 30_000 }),
  ]);
  if (directory.status !== 'completed' || directory.exitCode !== 0 || origin.status !== 'completed'
    || (origin.exitCode !== 0 && origin.exitCode !== 1)) {
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', context, { stage: 'repository-identity' });
  }
  return canonicalRepositoryIdentity(origin.exitCode === 0 ? origin.stdout.split(/\r?\n/, 1)[0] : undefined,
    directory.stdout.trim());
}

async function requireSourceRepository(root: string, operation: SourceLedgerOperation): Promise<void> {
  const p = operation.journal.payload;
  const context = { operationId: p.operationId, scope: p.scope, target: p.target };
  if (await sourceRepositoryIdentity(root, context) !== p.scope.repositoryId) {
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'foreign-target', context);
  }
}

/** @id CODE-M5-SOURCE-RESUME-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-005 DES-M5-007 DES-M5-023
 */
export async function resumeSourceSupersession(
  root: string, input: SourceOperationScope & { requestSha256: string },
): Promise<SourceResult> {
  if (!sourceHash(input.requestSha256)) {
    throw new Error('CLI_ERROR: invalid-selector {"reason":"invalid-selector"}');
  }
  await requireSourceOperationGeneration(root, input);
  const retry = Symbol('source-evidence-advanced');
  for (;;) {
    const source = await inspectSourceEvidence(root, await readSourceTddEvidence(root));
    const operation = matchingSourceOperation(source, input);
    await requireSourceRepository(root, operation);
    if (operation.projection) return sourceCompletedResult(operation.projection);
    try {
      const result = await withTddWriteLeaseSet(root, [input.changeId], async (leases) => {
        await requireSourceOperationGeneration(root, input);
        await requireSourceRepository(root, operation);
        const [evidence, journals, order] = await Promise.all([
          readSourceTddEvidence(root), loadJournalRecords(root), loadEvidenceOrder(root),
        ]);
        const latest = classifySourceLedger(evidence, journals, order);
        requireSourceLedger(latest);
        if (!canonicalBytes(latest.operations).equals(canonicalBytes(source.operations))) return retry;
        await source.recheck();
        return completeSourceSuffix(root, operation.journal, leases);
      });
      if (result !== retry) return result;
    } catch (cause) {
      if (cause instanceof LeaseAcquisitionTimeout) {
        if (cause.leaseKind === 'repository-append') {
          throw new SourceOperationError('TDD_SOURCE_LEASE_BUSY', 'append-timeout', {
            operationId: input.operationId, scope: operation.journal.payload.scope, target: operation.journal.payload.target,
          });
        }
        throw new Error(`CHANGE_PROJECTION_LEASE_BUSY: ${cause.message}`);
      }
      throw cause;
    }
  }
}
