import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, sha256 } from './canonical.js';
import {
  loadChangeEvidence, activeChangeGeneration, projectBatchCheckpoint,
  supersedeApprovedPhase, generationOrderPhase, validateBatchCheckpointJournal,
  type ChangeEvidence,
} from './change-evidence.js';
import { phaseCheckpointRecords, reconcilePendingPhaseCheckpoints } from './change-phase-checkpoint.js';
import { loadEvidenceOrder, validateEvidenceOrderLog, type EvidenceOrderLog } from './order.js';
import {
  inspectSourceEvidence, readSourceTddEvidence, recheckSourceMaterialization, requireSourceLedger,
  sourceMaterializationTailValid, readSourceReview, readSourceApproval, type VerifiedSourceEvidence,
} from './tdd-source-supersession.js';
import { sourceEvidencePrefix } from './tdd-source-storage.js';
import { verifyCandidateReachableObjectSizes, verifyCandidateLfsClosure } from './candidate-git-distribution.js';
import type { TddEvidence } from './tdd-types.js';
import {
  integrationWorktreeRelativePath,
  logicalOwnerFromFilesystemKey,
  normalizeCandidatePathError,
} from './candidate-path.js';
import {
  assertCanonicalCandidateStateMembers,
  integrationStateRoot,
  isOperationalStatePath,
  readCandidateRegistry,
  replaceCandidateRegistry,
  withMultiChangeWrite,
  withMultiChangeProjectionWrite, assertFinalizationLeases,
  materializeOperationalState as materializeRecoveredState, assertOperationalBaseline,
  operationalStateBaseline,
  type BatchCheckpointRecovery,
  type CandidateLifecycleState,
  type CandidateRegistry,
  type CandidateRegistryEntry,
} from './candidate-state.js';
import {
  appendJournalRecord,
  loadJournalRecords, writeAuthorizedJson, writeAuthorizedFile, syncJournalDirectory, validateJournalRecords,
  type ChangeProjectionAppendLeaseSet,
  type JournalRecord,
  type JournalRecordInput,
} from './journal.js';

const execFileAsync = promisify(execFile);

const candidateIdPattern = /^candidate:[a-f0-9]{64}$/;
const integrationIdPattern = /^integration:[a-f0-9]{64}$/;
const repositoryIdPattern = /^repository:[a-f0-9]{64}$/;
const changeIdPattern = /^CHANGE-\d+$/;
const commitPattern = /^[a-f0-9]{40,64}$/;

export interface CandidateDependency {
  candidateId: string;
  candidateCommit: string;
}

export interface IntegrationCandidate {
  candidateId: string;
  changeId: string;
  generation: number;
  repositoryId: string;
  baseCommit: string;
  candidateCommit: string;
  recordedCandidateCommit: string;
  state: CandidateLifecycleState;
  reachable: boolean;
  changedPaths: string[];
  dependencies: CandidateDependency[];
}

export interface SatisfiedCandidateDependency extends CandidateDependency {
  integrated: true;
}

export interface CandidateIntegrationAnalysisOptions {
  repositoryId: string;
  baseCommit: string;
  caseInsensitivePaths?: boolean;
  satisfiedDependencies?: readonly SatisfiedCandidateDependency[];
}

export interface CandidateIntegrationAnalysis {
  applyOrder: string[];
  consumedCommits: string[];
  ownedPaths: Record<string, string[]>;
}

export interface IntegrationIdentityCandidate {
  candidateId: string;
  changeId: string;
  generation: number;
  candidateCommit: string;
}

export interface IntegrationIdentity {
  schemaVersion: 1;
  integrationId: string;
  repositoryId: string;
  startingDefaultCommit: string;
  candidates: IntegrationIdentityCandidate[];
}

export interface IntegrationManifestEntry {
  path: string;
  gitMode: string;
  objectType: string;
  objectId: string;
}

export interface IntegrationSourceManifest {
  schemaVersion: 1;
  kind: 'integration-source-manifest-v1';
  entries: IntegrationManifestEntry[];
  sha256: string;
}

export interface VerificationDiagnostic {
  code: string;
  detail?: string;
  sourceStage?: string;
  domain?: string | null;
}

export interface VerificationMember {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  diagnostics?: VerificationDiagnostic[];
}

export interface ClosedIntegrationVerification {
  requiredCommandNames?: string[];
  requiredCheckNames?: string[];
  requiredCommands: VerificationMember[];
  requiredChecks: VerificationMember[];
  status: {
    exitCode: number;
    ready: boolean;
  };
}

export interface IntegrationAttempt {
  schemaVersion: 1;
  integrationId: string;
  repositoryId: string;
  startingDefaultCommit: string;
  integrationCommit?: string;
  candidateIds: string[];
  inputCommits: string[];
  state: 'prepared' | 'integrating' | 'verified' | 'integrated' | 'failed' | 'deleted';
}

export interface CandidateFinalizationMarker {
  schemaVersion: 1;
  kind: 'candidate-finalization-v1';
  integrationId: string;
  integrationCommit: string;
  startingDefaultCommit: string;
  fencingToken: number | string;
  leaseContext?: IntegrationLeaseContext;
}

export interface CandidateCleanupState {
  dirty: boolean;
  untracked: boolean;
  unintegratedCommits: boolean;
  leaseActive: boolean;
  unresolvedConflict: boolean;
  state?: CandidateLifecycleState;
}

export interface IntegrationVerificationContext {
  integrationId: string;
  controlRoot: string;
  worktreePath: string;
  startingDefaultCommit: string;
  candidateIds: string[];
  changeIds: string[];
  applyOrder: string[];
  inputCommits: string[];
  sourceManifest: IntegrationSourceManifest;
}

export interface CandidateIntegrationEvidenceContext {
  repositoryId: string;
  integrationId: string;
  startingDefaultCommit: string;
  candidates: IntegrationIdentityCandidate[];
  applyOrder: string[];
  sourceManifestSha256: string;
  integrationCommit?: string;
}

export interface IntegrationOrchestrationInput {
  controlRoot: string;
  selectors: string[];
  verify(context: IntegrationVerificationContext): Promise<ClosedIntegrationVerification>;
  transaction?: IntegrationTransactionAdapter;
  recoverBatchCheckpoints?: BatchCheckpointRecovery;
}

export interface IntegrationOrchestrationResult extends IntegrationVerificationContext {
  state: IntegrationAttempt['state'];
  integrationCommit?: string;
  resumed: boolean;
}

export interface FinalizeCandidateIntegrationInput {
  controlRoot: string;
  integrationId: string;
  transaction?: IntegrationTransactionAdapter;
  recoverBatchCheckpoints: BatchCheckpointRecovery;
}

export interface CleanupCandidateIntegrationInput {
  controlRoot: string;
  integrationId: string;
  deletedBy: string;
  transaction?: IntegrationTransactionAdapter;
  inspect?: CleanupInspectionAdapter;
}

export interface IntegrationTransactionAdapter {
  run(
    changeIds: readonly string[],
    operation: (context?: IntegrationLeaseContext) => Promise<any>,
  ): Promise<any>;
  append?(root: string, input: JournalRecordInput): Promise<JournalRecord>;
  leases?: ChangeProjectionAppendLeaseSet;
}

export interface IntegrationLeaseBinding {
  changeId: string;
  fencingToken: number;
}

export interface IntegrationLeaseContext {
  leases: IntegrationLeaseBinding[];
  finalizationToken: number | string;
  projectionFencingToken?: number;
}

export interface FinalizationLeaseContext extends IntegrationLeaseContext {
  finalizationToken: number;
  projectionFencingToken: number;
}

export interface CleanupInspectionAdapter {
  (): Promise<{
    porcelainZ: string;
    unresolvedEntries: string;
    candidateReachableFromBase: boolean;
    liveLease: boolean;
  }>;
}

export interface IntegrationTombstone {
  schemaVersion: 1;
  integrationId: string;
  deletedBy: string;
  deletedAt: string;
  worktreePath: string;
  journalOrder: number;
}

interface PersistedIntegrationAttempt extends IntegrationAttempt {
  changeIds: string[];
  applyOrder: string[];
  sourceManifest: IntegrationSourceManifest;
  worktreePath: string;
  releaseOwnerCandidateId: string;
  verifiedReportSha256?: string;
  materializedManifestSha256?: string;
  releaseOwnerPreviousCommit?: string;
  finalizationLeaseContext?: IntegrationLeaseContext;
  finalizationContextRecord?: {
    idempotencyKey: string; order: number; recordSha256: string; leaseContext: FinalizationLeaseContext;
  };
  postApplicationCommit: string;
  identityCandidates: IntegrationIdentityCandidate[];
  tombstone?: IntegrationTombstone;
}

function integrationError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function normalizedSourcePath(path: string, caseInsensitive: boolean): string {
  const portable = path.replaceAll('\\', '/').normalize('NFC');
  if (!portable
    || portable.startsWith('/')
    || portable === '..'
    || portable.startsWith('../')
    || portable.includes('/../')
    || portable.includes('\0')) {
    throw integrationError('CANDIDATE_STATE_OWNERSHIP', 'candidate source path is unsafe.');
  }
  return caseInsensitive ? portable.toLocaleLowerCase('en-US') : portable;
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function assertCandidateShape(candidate: IntegrationCandidate): void {
  if (!candidateIdPattern.test(candidate.candidateId)
    || !changeIdPattern.test(candidate.changeId)
    || !Number.isInteger(candidate.generation)
    || candidate.generation < 1
    || !repositoryIdPattern.test(candidate.repositoryId)
    || !commitPattern.test(candidate.baseCommit)
    || !commitPattern.test(candidate.candidateCommit)
    || !commitPattern.test(candidate.recordedCandidateCommit)) {
    throw integrationError('CANDIDATE_STATE_OWNERSHIP', 'candidate binding is malformed.');
  }
}

/** @id CODE-M5-MULTI-CHANGE-INTEGRATION-001
 * @implements REQ-M5-MULTI-CHANGE-005 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
 * @design DES-M5-MULTI-CHANGE-006 DES-M5-MULTI-CHANGE-008
 */
export function analyzeCandidateIntegration(
  candidates: readonly IntegrationCandidate[],
  options: CandidateIntegrationAnalysisOptions,
): CandidateIntegrationAnalysis {
  if (candidates.length === 0) {
    throw integrationError('CLI_ERROR', 'at least one candidate is required.');
  }
  const byId = new Map<string, IntegrationCandidate>();
  for (const candidate of candidates) {
    assertCandidateShape(candidate);
    if (byId.has(candidate.candidateId)) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate identity is duplicated.');
    }
    if (candidate.state === 'integrated') {
      throw integrationError('CANDIDATE_ALREADY_INTEGRATED', 'candidate is already integrated.');
    }
    if (!candidate.reachable) {
      throw integrationError('CANDIDATE_COMMIT_UNREACHABLE', 'candidate commit is unreachable.');
    }
    if (candidate.repositoryId !== options.repositoryId
      || candidate.baseCommit !== options.baseCommit
      || candidate.candidateCommit !== candidate.recordedCandidateCommit) {
      throw integrationError('CANDIDATE_BASE_STALE', 'candidate base or recorded tip is stale.');
    }
    byId.set(candidate.candidateId, candidate);
  }

  const ownedPaths: Record<string, string[]> = {};
  const owners: Array<{ candidateId: string; path: string }> = [];
  for (const candidate of candidates) {
    const paths = [...new Set(candidate.changedPaths
      .map((path) => normalizedSourcePath(path, options.caseInsensitivePaths === true))
      .filter((path) => !isOperationalStatePath(path)))]
      .sort(byteCompare);
    ownedPaths[candidate.candidateId] = paths;
    for (const path of paths) {
      const conflict = owners.find((owner) =>
        owner.candidateId !== candidate.candidateId && pathsOverlap(owner.path, path));
      if (conflict) {
        throw integrationError(
          'CANDIDATE_OWNERSHIP_CONFLICT',
          `${candidate.candidateId}:${path} overlaps ${conflict.candidateId}:${conflict.path}.`,
        );
      }
      owners.push({ candidateId: candidate.candidateId, path });
    }
  }

  const satisfied = new Map(
    (options.satisfiedDependencies ?? []).map((dependency) => [
      dependency.candidateId,
      dependency.candidateCommit,
    ]),
  );
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const candidate of candidates) {
    outgoing.set(candidate.candidateId, []);
    indegree.set(candidate.candidateId, 0);
  }
  for (const candidate of candidates) {
    for (const dependency of candidate.dependencies) {
      const selected = byId.get(dependency.candidateId);
      if (!selected) {
        if (satisfied.get(dependency.candidateId) !== dependency.candidateCommit) {
          throw integrationError(
            'CANDIDATE_DEPENDENCY_UNSATISFIED',
            `${candidate.candidateId} has an incomplete dependency.`,
          );
        }
        continue;
      }
      if (selected.candidateCommit !== dependency.candidateCommit) {
        throw integrationError('CANDIDATE_BASE_STALE', 'dependency candidate commit moved.');
      }
      outgoing.get(selected.candidateId)!.push(candidate.candidateId);
      indegree.set(candidate.candidateId, indegree.get(candidate.candidateId)! + 1);
    }
  }

  const ready = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([candidateId]) => candidateId)
    .sort(byteCompare);
  const applyOrder: string[] = [];
  while (ready.length > 0) {
    const candidateId = ready.shift()!;
    applyOrder.push(candidateId);
    for (const dependent of outgoing.get(candidateId)!.sort(byteCompare)) {
      const remaining = indegree.get(dependent)! - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort(byteCompare);
      }
    }
  }
  if (applyOrder.length !== candidates.length) {
    throw integrationError('CANDIDATE_DEPENDENCY_CYCLE', 'candidate dependency graph is cyclic.');
  }
  return {
    applyOrder,
    consumedCommits: applyOrder.map((candidateId) => byId.get(candidateId)!.candidateCommit),
    ownedPaths,
  };
}

export function deriveIntegrationIdentity<Candidate extends IntegrationIdentityCandidate>(input: {
  repositoryId: string;
  startingDefaultCommit: string;
  candidates: readonly Candidate[];
}): IntegrationIdentity {
  if (!repositoryIdPattern.test(input.repositoryId)
    || !commitPattern.test(input.startingDefaultCommit)
    || input.candidates.length === 0) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration identity input is invalid.');
  }
  const candidates = input.candidates.map((candidate) => ({
    changeId: candidate.changeId,
    generation: candidate.generation,
    candidateId: candidate.candidateId,
    candidateCommit: candidate.candidateCommit,
  })).sort((left, right) => byteCompare(left.candidateId, right.candidateId));
  if (new Set(candidates.map((candidate) => candidate.candidateId)).size !== candidates.length
    || candidates.some((candidate) =>
      !candidateIdPattern.test(candidate.candidateId)
      || !changeIdPattern.test(candidate.changeId)
      || !Number.isInteger(candidate.generation)
      || candidate.generation < 1
      || !commitPattern.test(candidate.candidateCommit))) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate identity tuple is invalid.');
  }
  const identityInput = {
    repositoryId: input.repositoryId,
    startingDefaultCommit: input.startingDefaultCommit,
    candidates,
  };
  return {
    schemaVersion: 1,
    integrationId: `integration:${sha256(canonicalBytes(identityInput))}`,
    ...identityInput,
  };
}

export function validateReadyDependencyBindings(
  candidate: Pick<IntegrationCandidate, 'candidateId' | 'dependencies'>,
  available: readonly IntegrationIdentityCandidate[],
): void {
  const commits = new Map(available.map((entry) => [entry.candidateId, entry.candidateCommit]));
  for (const dependency of candidate.dependencies) {
    const currentCommit = commits.get(dependency.candidateId);
    if (currentCommit === undefined) {
      throw integrationError(
        'CANDIDATE_DEPENDENCY_UNSATISFIED',
        `${candidate.candidateId} dependency is not available.`,
      );
    }
    if (currentCommit !== dependency.candidateCommit) {
      throw integrationError(
        'CANDIDATE_BASE_STALE',
        `${candidate.candidateId} dependency commit changed after readiness.`,
      );
    }
  }
}

export function integrationSourceManifest(
  input: readonly IntegrationManifestEntry[],
): IntegrationSourceManifest {
  const entries = input
    .map((entry) => ({ ...entry, path: normalizedSourcePath(entry.path, false) }))
    .filter((entry) => !isOperationalStatePath(entry.path))
    .sort((left, right) =>
      byteCompare(left.path, right.path)
      || byteCompare(left.gitMode, right.gitMode)
      || byteCompare(left.objectType, right.objectType)
      || byteCompare(left.objectId, right.objectId));
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length
    || entries.some((entry) =>
      !/^[0-7]{6}$/.test(entry.gitMode)
      || !entry.objectType
      || !commitPattern.test(entry.objectId))) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'integration source manifest entry is invalid.',
    );
  }
  const projection = {
    schemaVersion: 1 as const,
    kind: 'integration-source-manifest-v1' as const,
    entries,
  };
  return { ...projection, sha256: sha256(canonicalBytes(projection)) };
}

const toleratedApprovalDiagnostics = new Map<string, string>([
  ['APPROVAL_CANDIDATE_MISSING', 'integration-candidate-snapshot-missing'],
  ['RELEASE_GATE_EVIDENCE_MISSING', 'integration-candidate-gate-missing'],
  ['RELEASE_GATE_EVIDENCE_STALE', 'integration-candidate-context-mismatch'],
  ['RELEASE_GATE_CANDIDATE_MISMATCH', 'integration-candidate-context-mismatch'],
  ['APPROVAL_MISSING', 'integration-release-approval-missing'],
  ['APPROVAL_STALE', 'integration-release-approval-stale'],
]);

export function validateClosedIntegrationVerification(
  verification: ClosedIntegrationVerification,
): { accepted: true; toleratedApprovalFailure: boolean } {
  const fail = (): never => {
    throw integrationError(
      'CANDIDATE_INTEGRATION_VERIFICATION_FAILED',
      'closed integration verification did not pass.',
    );
  };
  if (![0, 1].includes(verification.status.exitCode)
    || verification.requiredCommands.length === 0
    || verification.requiredChecks.length === 0
    || verification.requiredCommands.some((command) => command.status !== 'passed')) {
    return fail();
  }
  const hasExactSet = (
    expected: readonly string[] | undefined,
    actual: readonly VerificationMember[],
  ): boolean => {
    if (!expected) return true;
    return expected.length === actual.length
      && [...expected].sort(byteCompare)
        .every((name, index) => name === actual.map((entry) => entry.name).sort(byteCompare)[index]);
  };
  if (!hasExactSet(verification.requiredCommandNames, verification.requiredCommands)
    || !hasExactSet(verification.requiredCheckNames, verification.requiredChecks)
    || new Set(verification.requiredCommands.map((entry) => entry.name)).size
    !== verification.requiredCommands.length
    || new Set(verification.requiredChecks.map((entry) => entry.name)).size
    !== verification.requiredChecks.length) {
    return fail();
  }
  const failed = verification.requiredChecks.filter((check) => check.status === 'failed');
  if (verification.requiredChecks.some((check) => check.status === 'skipped')) return fail();
  if (failed.length === 0) {
    if (verification.status.exitCode !== 0
      || verification.requiredChecks.some((check) => check.status !== 'passed')) return fail();
    return { accepted: true, toleratedApprovalFailure: false };
  }
  const exitCode = verification.status.exitCode === 0
    && verification.requiredCommandNames === undefined
    && verification.requiredCheckNames === undefined
    ? 1
    : verification.status.exitCode;
  if (exitCode !== 1
    || failed.length !== 1
    || failed[0]!.name !== 'approval'
    || verification.status.ready) {
    return fail();
  }
  const diagnostics = failed[0]!.diagnostics ?? [];
  if (diagnostics.length === 0) return fail();
  for (const diagnostic of diagnostics) {
    const detail = toleratedApprovalDiagnostics.get(diagnostic.code);
    if (!detail || diagnostic.detail !== detail) return fail();
    if (diagnostic.code === 'APPROVAL_MISSING' || diagnostic.code === 'APPROVAL_STALE') {
      if (diagnostic.sourceStage !== 'release' || diagnostic.domain !== null) return fail();
    }
  }
  if (verification.requiredChecks
    .filter((check) => check !== failed[0])
    .some((check) => check.status !== 'passed')) return fail();
  return { accepted: true, toleratedApprovalFailure: true };
}

export function planIntegrationResume(
  attempt: IntegrationAttempt,
  requested: Pick<IntegrationAttempt, 'integrationId' | 'candidateIds' | 'inputCommits'>,
): { action: 'resume-verification' | 'resume-finalization' | 'already-integrated'; state: string } {
  const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length
    && [...left].sort(byteCompare).every((value, index) => value === [...right].sort(byteCompare)[index]);
  if (attempt.integrationId !== requested.integrationId
    || !sameSet(attempt.candidateIds, requested.candidateIds)
    || !sameSet(attempt.inputCommits, requested.inputCommits)) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'resume input does not match the persisted integration attempt.',
    );
  }
  if (attempt.state === 'integrated') return { action: 'already-integrated', state: attempt.state };
  if (attempt.state === 'verified') return { action: 'resume-finalization', state: attempt.state };
  if (attempt.state === 'prepared' || attempt.state === 'integrating') {
    return { action: 'resume-verification', state: attempt.state };
  }
  throw integrationError(
    'CANDIDATE_INTEGRATION_CONFLICT',
    'terminal integration attempt cannot be resumed.',
  );
}

export function deriveResumeIdentity(
  identityInput: Parameters<typeof deriveIntegrationIdentity>[0],
  attempt: IntegrationAttempt,
  strict = false,
): string {
  const derived = deriveIntegrationIdentity(identityInput).integrationId;
  if (strict && derived !== attempt.integrationId) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'persisted integration identity does not match current immutable inputs.',
    );
  }
  return strict ? derived : attempt.integrationId;
}

export function planTerminalAttemptResolution(
  state: IntegrationAttempt['state'],
): { action: 'reject'; code: 'CANDIDATE_INTEGRATION_CONFLICT' }
  | { action: 'return'; state: 'integrated' } {
  return state === 'integrated'
    ? { action: 'return', state }
    : { action: 'reject', code: 'CANDIDATE_INTEGRATION_CONFLICT' };
}

export function deriveIntegrationLeaseContext(
  leases: readonly IntegrationLeaseBinding[],
): IntegrationLeaseContext {
  const sorted = [...leases].sort((left, right) => byteCompare(left.changeId, right.changeId));
  if (sorted.length === 0
    || new Set(sorted.map((lease) => lease.changeId)).size !== sorted.length
    || sorted.some((lease) =>
      !changeIdPattern.test(lease.changeId)
      || !Number.isInteger(lease.fencingToken)
      || lease.fencingToken < 1)) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'live lease context is invalid.');
  }
  return {
    leases: sorted,
    finalizationToken: `fencing:${sha256(canonicalBytes(sorted))}`,
  };
}

export function assertFinalizationLeaseLineage(
  persisted: IntegrationLeaseContext,
  live: IntegrationLeaseContext,
): void {
  if (persisted.leases.length !== live.leases.length
    || persisted.leases.some((lease, index) =>
      lease.changeId !== live.leases[index]?.changeId
      || live.leases[index]!.fencingToken < lease.fencingToken)) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'live leases do not descend from the persisted finalization lineage.',
    );
  }
}

function exactFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

/** @id CODE-M5-FINALIZATION-MARKER-001
 * @implements REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-008
 */
export function isFinalizationLeaseContext(value: unknown): value is FinalizationLeaseContext {
  const positive = (token: unknown): boolean => Number.isSafeInteger(token) && Number(token) > 0;
  if (!exactFields(value, ['leases', 'projectionFencingToken', 'finalizationToken'])
    || !positive(value.projectionFencingToken) || !positive(value.finalizationToken)
    || !Array.isArray(value.leases) || !value.leases.length) return false;
  let previous = '';
  for (const lease of value.leases) {
    if (!exactFields(lease, ['changeId', 'fencingToken'])
      || typeof lease.changeId !== 'string' || !changeIdPattern.test(lease.changeId)
      || !positive(lease.fencingToken) || byteCompare(previous, lease.changeId) >= 0) return false;
    previous = lease.changeId;
  }
  return true;
}

export function validateFinalizationMarker(input: {
  attempt: IntegrationAttempt;
  marker: CandidateFinalizationMarker;
  liveLeaseContext?: IntegrationLeaseContext;
  liveFencingToken?: number;
  integrationCommitReachable: boolean;
}): void {
  const { attempt, marker } = input;
  const persistedAttempt = attempt as IntegrationAttempt & {
    finalizationLeaseContext?: IntegrationLeaseContext;
  };
  const stored = persistedAttempt.finalizationLeaseContext;
  const live = input.liveLeaseContext;
  if (!exactFields(marker, ['schemaVersion', 'kind', 'integrationId', 'integrationCommit',
    'startingDefaultCommit', 'fencingToken', 'leaseContext'])
    || !isFinalizationLeaseContext(stored) || !isFinalizationLeaseContext(live)
    || !isFinalizationLeaseContext(marker.leaseContext)
    || !canonicalBytes(marker.leaseContext).equals(canonicalBytes(stored))
    || marker.fencingToken !== stored.finalizationToken
    || live.projectionFencingToken < stored.projectionFencingToken
    || live.finalizationToken < stored.finalizationToken) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'finalization marker lease binding is invalid.');
  }
  assertFinalizationLeaseLineage(stored, live);
  if (!attempt.integrationCommit
    || !integrationIdPattern.test(marker.integrationId)
    || !commitPattern.test(marker.integrationCommit)
    || !commitPattern.test(marker.startingDefaultCommit)
    || marker.schemaVersion !== 1
    || marker.kind !== 'candidate-finalization-v1'
    || marker.integrationId !== attempt.integrationId
    || marker.integrationCommit !== attempt.integrationCommit
    || marker.startingDefaultCommit !== attempt.startingDefaultCommit
    || !input.integrationCommitReachable) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'finalization marker is not bound to the live lease and persisted integration.',
    );
  }
}

export function planCompareAndSwapFailure(
  candidateIds: readonly string[],
  _reason: string,
): {
  code: 'CANDIDATE_BASE_STALE';
  staleCandidateIds: string[];
  retainMarker: false;
} {
  return {
    code: 'CANDIDATE_BASE_STALE',
    staleCandidateIds: [...candidateIds],
    retainMarker: false,
  };
}

export function planPostCompareAndSwapFailure(integrationCommit: string): {
  code: 'CANDIDATE_INTEGRATION_CONFLICT';
  recoveryCommit: string;
  retainMarker: true;
} {
  return {
    code: 'CANDIDATE_INTEGRATION_CONFLICT',
    recoveryCommit: integrationCommit,
    retainMarker: true,
  };
}

export function recoverCandidateFinalization(input: {
  attempt: IntegrationAttempt;
  marker: CandidateFinalizationMarker;
  currentFencingToken: number | string;
  currentDefaultCommit: string;
  integrationCommitReachable: boolean;
  controlWorktreeRefreshed: boolean;
}): {
  action: 'retry-before-fast-forward' | 'refresh-and-record-integrated' | 'record-integrated';
  removeMarker: true;
  resetToCommit?: string;
} {
  const { attempt, marker } = input;
  if (marker.schemaVersion !== 1
    || marker.kind !== 'candidate-finalization-v1'
    || !integrationIdPattern.test(marker.integrationId)
    || marker.integrationId !== attempt.integrationId
    || marker.integrationCommit !== attempt.integrationCommit
    || marker.startingDefaultCommit !== attempt.startingDefaultCommit
    || marker.fencingToken !== input.currentFencingToken
    || !input.integrationCommitReachable) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'finalization marker or fencing lineage is invalid.',
    );
  }
  if (input.currentDefaultCommit === attempt.startingDefaultCommit) {
    return {
      action: 'retry-before-fast-forward',
      removeMarker: true,
      ...(attempt.candidateIds.length === 1
        ? { resetToCommit: marker.integrationCommit }
        : {}),
    };
  }

  if (input.currentDefaultCommit !== attempt.integrationCommit) {
    throw integrationError('CANDIDATE_BASE_STALE', 'default branch advanced during finalization.');
  }
  return {
    action: input.controlWorktreeRefreshed
      ? 'record-integrated'
      : 'refresh-and-record-integrated',
    removeMarker: true,
  };
}

export async function withIntegrationTransition<Result>(
  changeIds: readonly string[],
  transaction: IntegrationTransactionAdapter,
  operation: (context?: IntegrationLeaseContext) => Promise<Result>,
): Promise<Result> {
  const sorted = [...new Set(changeIds)].sort(byteCompare);
  if (sorted.length === 0 || sorted.some((changeId) => !changeIdPattern.test(changeId))) {
    throw integrationError('CLI_ERROR', 'integration transition requires valid CHANGE IDs.');
  }
  return transaction.run(sorted, operation);
}

export async function inspectCandidateCleanupSafety(input: {
  worktreePath: string;
  candidateCommit: string;
  baseCommit: string;
  state: CandidateLifecycleState;
  inspect: CleanupInspectionAdapter;
}): Promise<void> {
  const inspection = await input.inspect();
  const records = inspection.porcelainZ.split('\0').filter(Boolean);
  const untracked = records.some((record) => record.startsWith('?? '));
  const dirty = records.some((record) => !record.startsWith('?? '));
  assertCandidateCleanupSafe({
    dirty,
    untracked,
    unintegratedCommits: !inspection.candidateReachableFromBase,
    leaseActive: inspection.liveLease,
    unresolvedConflict: Boolean(inspection.unresolvedEntries),
    state: input.state,
  });
}

export function assertOperationalStateStable(
  baselineSha256: string,
  currentSha256: string,
): void {
  if (baselineSha256 !== currentSha256) {
    throw integrationError(
      'CANDIDATE_OPERATIONAL_STATE_DRIFT',
      'control operational state changed during finalization.',
    );
  }
}

export function assertCandidateCleanupSafe(state: CandidateCleanupState): void {
  const permitsUnintegrated = state.state === 'failed'
    || state.state === 'abandoned'
    || state.state === 'stale';
  if (state.dirty
    || state.untracked
    || state.leaseActive
    || state.unresolvedConflict
    || (state.unintegratedCommits && !permitsUnintegrated)) {
    throw integrationError(
      'CANDIDATE_CLEANUP_UNSAFE',
      'candidate workspace has state that cannot be removed safely.',
    );
  }
}

async function git(
  root: string,
  args: string[],
  options: { allowFailure?: boolean; timeoutMs?: number; preserveLf?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-c', 'core.longpaths=true',
      ...(options.preserveLf ? ['-c', 'core.autocrlf=false'] : []),
      '-C', root,
      ...args,
    ], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: options.timeoutMs ?? 30_000,
    });
    return stdout.trim();
  } catch (cause) {
    if (options.allowFailure) return '';
    const message = cause instanceof Error ? cause.message : String(cause);
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', `git ${args.join(' ')}: ${message}`);
  }
}

async function gitRaw(root: string, args: string[], preserveLf = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-c', 'core.longpaths=true',
      ...(preserveLf ? ['-c', 'core.autocrlf=false'] : []),
      '-C', root,
      ...args,
    ], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    return stdout;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', `git ${args.join(' ')}: ${message}`);
  }
}

async function gitSucceeds(root: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync('git', [
      '-c', 'core.longpaths=true',
      '-C', root,
      ...args,
    ], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function gitCommonDirectory(root: string): Promise<string> {
  return resolve(root, await git(root, ['rev-parse', '--git-common-dir']));
}

function integrationRecordPath(root: string, integrationId: string): string {
  return resolve(integrationStateRoot(root, integrationId), 'integration.json');
}

export { integrationWorktreeRelativePath };

async function writeCanonicalJson(path: string, value: unknown, authorize?: () => Promise<void>): Promise<void> {
  if (authorize) return writeAuthorizedJson(dirname(path), basename(path), value, authorize);
  try {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(canonicalBytes(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, path);
    } catch (cause) {
      await rm(temporary, { force: true });
      throw cause;
    }
  } catch (cause) {
    throw normalizeCandidatePathError(cause);
  }
}

function finalizationBinding(attempt: PersistedIntegrationAttempt) {
  if (!commitPattern.test(attempt.postApplicationCommit ?? '') || !attempt.verifiedReportSha256
    || !Array.isArray(attempt.identityCandidates)
    || deriveIntegrationIdentity({
      repositoryId: attempt.repositoryId, startingDefaultCommit: attempt.startingDefaultCommit,
      candidates: attempt.identityCandidates,
    }).integrationId !== attempt.integrationId) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'immutable finalization binding is missing or invalid.');
  }
  return {
    schemaVersion: 1, integrationId: attempt.integrationId, repositoryId: attempt.repositoryId,
    startingDefaultCommit: attempt.startingDefaultCommit, inputs: attempt.identityCandidates,
    applyOrder: attempt.applyOrder, verifiedReportSha256: attempt.verifiedReportSha256,
    postApplicationCommit: attempt.postApplicationCommit, sourceManifestSha256: attempt.sourceManifest.sha256,
  };
}

/** @id CODE-M5-FINALIZATION-CONTEXT-001
 * @implements REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-008
 */
function resolveFinalizationContext(
  records: JournalRecord[], attempt: PersistedIntegrationAttempt,
): PersistedIntegrationAttempt {
  const keys = new Set<string>();
  let result = { ...attempt };
  for (const record of records) {
    if (record.kind !== 'candidate-finalization-lease-context') continue;
    const payload = record.payload;
    if (!(payload && typeof payload === 'object' && 'integrationId' in payload
      && payload.integrationId === attempt.integrationId)
      && !record.idempotencyKey.includes(attempt.integrationId)) continue;
    const binding = finalizationBinding(attempt);
    if (record.schemaVersion !== 1 || record.stream !== 'normal'
      || !exactFields(payload, [...Object.keys(binding), 'leaseContext'])
      || !isFinalizationLeaseContext(payload.leaseContext)
      || record.changeId !== [...attempt.changeIds].sort(byteCompare)[0]
      || !canonicalBytes(payload).equals(canonicalBytes({ ...binding, leaseContext: payload.leaseContext }))
      || record.idempotencyKey !== canonicalBytes([
        'candidate-finalization-lease-context', attempt.integrationId, payload.leaseContext,
      ]).toString().trimEnd()
      || keys.has(record.idempotencyKey)
      || JSON.stringify(payload.leaseContext.leases.map((lease) => lease.changeId))
      !== JSON.stringify([...new Set(attempt.changeIds)].sort(byteCompare))) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'invalid or ambiguous finalization context journal.');
    }
    keys.add(record.idempotencyKey);
    result = {
      ...result, finalizationLeaseContext: payload.leaseContext,
      finalizationContextRecord: {
        idempotencyKey: record.idempotencyKey, order: record.order, recordSha256: record.recordSha256,
        leaseContext: payload.leaseContext,
      },
    };
  }
  return result;
}

async function persistFinalizationContext(
  root: string, attempt: PersistedIntegrationAttempt, leases: ChangeProjectionAppendLeaseSet,
): Promise<PersistedIntegrationAttempt> {
  await assertFinalizationLeases(root, leases);
  const leaseContext: FinalizationLeaseContext = {
    leases: leases.changeLeases.map((lease) => ({ changeId: lease.changeId, fencingToken: lease.fencingToken })),
    projectionFencingToken: leases.projectionLease.fencingToken,
    finalizationToken: leases.appendSession!.fencingToken,
  };
  const input: JournalRecordInput = {
    stream: 'normal', changeId: leases.changeLeases[0]!.changeId, kind: 'candidate-finalization-lease-context',
    idempotencyKey: canonicalBytes(['candidate-finalization-lease-context', attempt.integrationId, leaseContext]).toString().trimEnd(),
    payload: { ...finalizationBinding(attempt), leaseContext },
  };
  try { await appendJournalRecord(root, input, leases.appendSession); }
  catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('JOURNAL_IDEMPOTENCY_CONFLICT:')) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', cause.message);
    }
    throw cause;
  }
  await assertFinalizationLeases(root, leases);
  await syncJournalDirectory(resolve(root, '.musubix/journal/normal'));
  await assertFinalizationLeases(root, leases);
  const result = resolveFinalizationContext(await loadJournalRecords(root), attempt);
  await writeCanonicalJson(integrationRecordPath(root, attempt.integrationId), {
    ...result, worktreePath: relative(await gitCommonDirectory(root), result.worktreePath).split(sep).join('/'),
  }, () => assertFinalizationLeases(root, leases));
  return result;
}

async function readIntegrationAttempt(
  root: string,
  integrationId: string,
): Promise<PersistedIntegrationAttempt> {
  try {
    const records = await loadJournalRecords(root);
    let attempt: PersistedIntegrationAttempt | undefined;
    for (const record of records) {
      if (record.kind.startsWith('candidate-integration-') && record.payload
        && typeof record.payload === 'object' && 'integrationId' in record.payload
        && record.payload.integrationId === integrationId) {
        attempt = record.payload as PersistedIntegrationAttempt;
      }
    }
    if (!attempt) {
      attempt = JSON.parse(await readFile(integrationRecordPath(root, integrationId), 'utf8')) as PersistedIntegrationAttempt;
    }
    attempt = resolveFinalizationContext(records, attempt);
    return {
      ...attempt,
      worktreePath: resolve(await gitCommonDirectory(root), attempt.worktreePath),
    };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'integration attempt was not found.');
    }
    throw cause;
  }
}

async function listIntegrationAttempts(root: string): Promise<PersistedIntegrationAttempt[]> {
  const directory = resolve(root, '.musubix', 'candidates', 'integrations');
  const ids = new Set((await loadJournalRecords(root)).flatMap((record) => {
    if (!record.kind.startsWith('candidate-integration-') || !record.payload
      || typeof record.payload !== 'object' || !('integrationId' in record.payload)
      || typeof record.payload.integrationId !== 'string') return [];
    return [record.payload.integrationId];
  }));
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => byteCompare(left.name, right.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw integrationError(
          'CANDIDATE_STATE_OWNERSHIP',
          `integration state member ${entry.name} is not a canonical directory.`,
        );
      }
      let integrationId: string;
      try {
        integrationId = logicalOwnerFromFilesystemKey(entry.name);
      } catch {
        throw integrationError(
          'CANDIDATE_STATE_OWNERSHIP',
          `integration state member ${entry.name} is not canonical.`,
        );
      }
      if (!integrationIdPattern.test(integrationId)) {
        throw integrationError(
          'CANDIDATE_STATE_OWNERSHIP',
          `integration state member ${entry.name} has another owner type.`,
        );
      }
      ids.add(integrationId);
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
  return Promise.all([...ids].sort(byteCompare).map((id) => readIntegrationAttempt(root, id)));
}

/** @id CODE-M5-MULTI-CHANGE-INTEGRATION-EVIDENCE-CONTEXT-001
 * @implements REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-005 DES-M5-MULTI-CHANGE-008
 */
export async function loadIntegrationEvidenceContext(
  controlRoot: string,
  integrationId: string,
): Promise<CandidateIntegrationEvidenceContext> {
  if (!integrationIdPattern.test(integrationId)) {
    throw integrationError('CLI_ERROR', 'integration selector must be integration:<sha256>.');
  }
  const root = resolve(controlRoot);
  const [attempt, registry] = await Promise.all([
    readIntegrationAttempt(root, integrationId),
    readCandidateRegistry(root),
  ]);
  if (!registry) {
    throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'candidate registry was not found.');
  }
  const integration = registry.integrations.find((entry) =>
    entry.integrationId === integrationId);
  if (!integration) {
    throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'integration context was not found.');
  }
  if (integration.repositoryId !== registry.repositoryId
    || attempt.repositoryId !== registry.repositoryId
    || integration.repositoryId !== attempt.repositoryId) {
    throw integrationError(
      'CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH',
      'integration context belongs to another repository.',
    );
  }
  if (attempt.integrationId !== integrationId
    || attempt.candidateIds.length === 0
    || attempt.candidateIds.length !== attempt.inputCommits.length
    || new Set(attempt.candidateIds).size !== attempt.candidateIds.length
    || integration.candidateIds.length !== attempt.candidateIds.length
    || ![...integration.candidateIds].sort(byteCompare)
      .every((candidateId, index) =>
        candidateId === [...attempt.candidateIds].sort(byteCompare)[index])
    || !commitPattern.test(attempt.startingDefaultCommit)
    || !/^[a-f0-9]{64}$/.test(attempt.sourceManifest.sha256)
    || attempt.applyOrder.length !== attempt.candidateIds.length
    || new Set(attempt.applyOrder).size !== attempt.applyOrder.length
    || attempt.applyOrder.some((candidateId) => !attempt.candidateIds.includes(candidateId))) {
    throw integrationError(
      'CANDIDATE_STATE_OWNERSHIP',
      'integration attempt does not match its registry context.',
    );
  }
  const candidates = attempt.candidateIds.map((candidateId, index) => {
    const candidate = registry.candidates.find((entry) => entry.candidateId === candidateId);
    const candidateCommit = attempt.inputCommits[index]!;
    if (!candidate
      || candidate.repositoryId !== registry.repositoryId
      || !attempt.changeIds.includes(candidate.changeId)
      || !commitPattern.test(candidateCommit)) {
      throw integrationError(
        'CANDIDATE_STATE_OWNERSHIP',
        'integration candidate ownership binding is invalid.',
      );
    }
    return {
      changeId: candidate.changeId,
      generation: candidate.generation,
      candidateId,
      candidateCommit,
    };
  }).sort((left, right) => byteCompare(left.candidateId, right.candidateId));
  const context: CandidateIntegrationEvidenceContext = {
    repositoryId: attempt.repositoryId,
    integrationId,
    startingDefaultCommit: attempt.startingDefaultCommit,
    candidates,
    applyOrder: [...attempt.applyOrder],
    sourceManifestSha256: attempt.sourceManifest.sha256,
    ...(attempt.integrationCommit ? { integrationCommit: attempt.integrationCommit } : {}),
  };
  return context;
}

async function candidateChangedPaths(
  root: string,
  candidate: CandidateRegistryEntry,
): Promise<string[]> {
  const output = await gitRaw(root, [
    'diff',
    '--name-only',
    '-z',
    candidate.baseCommit,
    candidate.candidateCommit,
    '--',
  ]);
  return output.split('\0').filter(Boolean);
}

async function assertCandidateGitState(
  commonDirectory: string,
  candidate: CandidateRegistryEntry,
): Promise<void> {
  const worktreePath = resolve(commonDirectory, candidate.worktreePath);
  if (!await gitSucceeds(
    worktreePath,
    ['cat-file', '-e', `${candidate.candidateCommit}^{commit}`],
  )) {
    throw integrationError('CANDIDATE_COMMIT_UNREACHABLE', 'candidate commit is unreachable.');
  }
  const branchTip = await git(worktreePath, ['rev-parse', candidate.branch], { allowFailure: true });
  if (branchTip !== candidate.candidateCommit) {
    throw integrationError('CANDIDATE_BASE_STALE', 'candidate branch tip moved.');
  }
  if (await gitRaw(worktreePath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate worktree is dirty.');
  }
}

async function resolveIntegrationCandidates(
  root: string,
  selectors: readonly string[],
): Promise<{
  registry: CandidateRegistry;
  candidates: CandidateRegistryEntry[];
  analysis: CandidateIntegrationAnalysis;
  startingDefaultCommit: string;
  defaultRef: string;
}> {
  const registry = await readCandidateRegistry(root);
  if (!registry) {
    throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'candidate registry was not found.');
  }
  if (selectors.length === 0 || new Set(selectors).size !== selectors.length) {
    throw integrationError('CLI_ERROR', 'one or more unique candidate selectors are required.');
  }
  const candidates = selectors.map((selector) => {
    const matches = registry.candidates.filter((candidate) =>
      candidate.state !== 'deleted'
      && (candidate.candidateId === selector || candidate.changeId === selector));
    if (matches.length !== 1) {
      throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', `candidate ${selector} was not found.`);
    }
    return matches[0]!;
  });
  if (new Set(candidates.map((candidate) => candidate.candidateId)).size !== candidates.length) {
    throw integrationError('CLI_ERROR', 'candidate selectors resolve to duplicate candidates.');
  }
  for (const candidate of candidates) {
    if (candidate.state === 'integrated') {
      throw integrationError('CANDIDATE_ALREADY_INTEGRATED', 'candidate is already integrated.');
    }
    if (candidate.state !== 'ready') {
      throw integrationError('CANDIDATE_DEPENDENCY_UNSATISFIED', 'candidate is not ready.');
    }
  }
  const defaultRef = await git(root, ['symbolic-ref', 'HEAD']);
  const startingDefaultCommit = await git(root, ['rev-parse', defaultRef]);
  const commonDirectory = await gitCommonDirectory(root);
  await Promise.all(candidates.map((candidate) =>
    assertCandidateGitState(commonDirectory, candidate)));
  const selectedIds = new Set(candidates.map((candidate) => candidate.candidateId));
  const satisfiedDependencies = registry.candidates
    .filter((candidate) => candidate.state === 'integrated' && !selectedIds.has(candidate.candidateId))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      candidateCommit: candidate.candidateCommit,
      integrated: true as const,
    }));
  const integrationCandidates: IntegrationCandidate[] = await Promise.all(
    candidates.map(async (candidate) => {
      const dependencyCommits = (candidate as CandidateRegistryEntry & {
        dependencyCommits?: Record<string, string>;
      }).dependencyCommits;
      const integrationCandidate: IntegrationCandidate = {
        candidateId: candidate.candidateId,
        changeId: candidate.changeId,
        generation: candidate.generation,
        repositoryId: candidate.repositoryId,
        baseCommit: candidate.baseCommit,
        candidateCommit: candidate.candidateCommit,
        recordedCandidateCommit: candidate.candidateCommit,
        state: candidate.state,
        reachable: true,
        changedPaths: await candidateChangedPaths(root, candidate),
        dependencies: candidate.dependencyIds.map((candidateId) => {
          const dependency = registry.candidates.find((entry) => entry.candidateId === candidateId);
          return {
            candidateId,
            candidateCommit: dependencyCommits?.[candidateId]
              ?? dependency?.candidateCommit
              ?? '',
          };
        }),
      };
      validateReadyDependencyBindings(integrationCandidate, registry.candidates);
      return integrationCandidate;
    }),
  );
  const analysis = analyzeCandidateIntegration(integrationCandidates, {
    repositoryId: registry.repositoryId,
    baseCommit: startingDefaultCommit,
    satisfiedDependencies,
  });
  return { registry, candidates, analysis, startingDefaultCommit, defaultRef };
}

async function sourceManifestAt(root: string, commit = 'HEAD'): Promise<IntegrationSourceManifest> {
  const output = await gitRaw(root, ['ls-tree', '-r', '-z', commit]);
  const entries = output.split('\0').filter(Boolean).map((line) => {
    const match = /^([0-7]{6}) ([^ ]+) ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(line);
    if (!match) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'Git tree output is malformed.');
    }
    return {
      gitMode: match[1]!,
      objectType: match[2]!,
      objectId: match[3]!,
      path: match[4]!,
    };
  });
  return integrationSourceManifest(entries);
}

async function persistAttempt(
  root: string,
  attempt: PersistedIntegrationAttempt,
  candidateState: CandidateLifecycleState,
  transaction?: IntegrationTransactionAdapter,
): Promise<void> {
  const adapter = transaction ?? {
    run: async <Result>(
      changeIds: readonly string[],
      operation: (context?: IntegrationLeaseContext) => Promise<Result>,
    ): Promise<Result> => withMultiChangeWrite(root, changeIds, (leases) =>
      operation(deriveIntegrationLeaseContext(
        leases.map((lease, index) => ({
          changeId: [...new Set(changeIds)].sort(byteCompare)[index]!,
          fencingToken: lease.fencingToken,
        })),
      ))),
  };
  await withIntegrationTransition(attempt.changeIds, adapter, async () => {
    await persistAttemptUnderLease(root, attempt, candidateState, adapter);
  });
}

function projectAttemptRegistry(
  registry: CandidateRegistry,
  attempt: PersistedIntegrationAttempt,
  candidateState: CandidateLifecycleState,
  worktreePath: string,
): CandidateRegistry {
  const selected = new Set(attempt.candidateIds);
  const candidates = registry.candidates.map((candidate) => {
    if (selected.has(candidate.candidateId)) {
      return {
        ...candidate,
        state: candidateState,
        ...(candidateState === 'integrated'
          && candidate.candidateId === attempt.releaseOwnerCandidateId
          && attempt.integrationCommit
          ? { candidateCommit: attempt.integrationCommit }
          : {}),
      };
    }
    if (candidateState === 'integrated'
      && !['integrated', 'deleted', 'abandoned'].includes(candidate.state)) {
      return { ...candidate, state: 'stale' as const };
    }
    return candidate;
  });
  const existing = registry.integrations.findIndex((entry) =>
    entry.integrationId === attempt.integrationId);
  const integration = {
    schemaVersion: 1 as const,
    integrationId: attempt.integrationId,
    repositoryId: attempt.repositoryId,
    changeIds: [...attempt.changeIds],
    candidateIds: [...attempt.candidateIds],
    worktreePath,
    state: attempt.state,
  };
  const integrations = [...registry.integrations];
  if (existing < 0) integrations.push(integration);
  else integrations[existing] = integration;
  return { ...registry, candidates, integrations };
}

async function persistAttemptUnderLease(
  root: string, attempt: PersistedIntegrationAttempt, candidateState: CandidateLifecycleState,
  adapter: IntegrationTransactionAdapter,
): Promise<void> {
  const authorize = adapter.leases ? () => assertFinalizationLeases(root, adapter.leases!) : undefined;
  await authorize?.();
  const registry = await readCandidateRegistry(root);
  if (!registry) throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'candidate registry was not found.');
  const worktreePath = relative(await gitCommonDirectory(root), attempt.worktreePath).split(sep).join('/');
  const projected = projectAttemptRegistry(registry, attempt, candidateState, worktreePath);
  const append = adapter.append ?? appendJournalRecord;
  const persisted = { ...attempt, worktreePath };
  const contextKey = attempt.state === 'verified' ? attempt.finalizationContextRecord?.idempotencyKey : undefined;
  await authorize?.();
  await append(root, {
    stream: 'normal',
    changeId: [...attempt.changeIds].sort(byteCompare)[0]!,
    kind: `candidate-integration-${attempt.state}`,
    idempotencyKey: `candidate-integration:${attempt.integrationId}:${attempt.state}${contextKey
      ? `:${contextKey}:${attempt.verifiedReportSha256}` : ''}`,
    payload: persisted,
  });
  if (!adapter.leases || candidateState !== 'verified') await replaceCandidateRegistry(root, projected, authorize);
  await writeCanonicalJson(integrationRecordPath(root, attempt.integrationId), persisted, authorize);
}

function orchestrationResult(
  root: string,
  attempt: PersistedIntegrationAttempt,
  resumed: boolean,
): IntegrationOrchestrationResult {
  return {
    integrationId: attempt.integrationId,
    controlRoot: root,
    worktreePath: attempt.worktreePath,
    startingDefaultCommit: attempt.startingDefaultCommit,
    candidateIds: [...attempt.candidateIds],
    changeIds: [...attempt.changeIds],
    applyOrder: [...attempt.applyOrder],
    inputCommits: [...attempt.inputCommits],
    sourceManifest: attempt.sourceManifest,
    state: attempt.state,
    ...(attempt.integrationCommit ? { integrationCommit: attempt.integrationCommit } : {}),
    resumed,
  };
}

async function verifyPersistedAttempt(
  root: string,
  attempt: PersistedIntegrationAttempt,
  verify: IntegrationOrchestrationInput['verify'],
  resumed: boolean,
  transaction?: IntegrationTransactionAdapter,
): Promise<IntegrationOrchestrationResult> {
  const verification = await verify(orchestrationResult(root, attempt, resumed));
  validateClosedIntegrationVerification(verification);
  const verified: PersistedIntegrationAttempt = {
    ...attempt,
    state: 'verified',
    verifiedReportSha256: sha256(canonicalBytes(verification)),
  };
  await persistAttempt(root, verified, 'verified', transaction);
  return orchestrationResult(root, verified, resumed);
}

/** @id CODE-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-001
 * @implements REQ-M5-MULTI-CHANGE-005 REQ-M5-MULTI-CHANGE-006 REQ-M5-MULTI-CHANGE-007
 * @design DES-M5-MULTI-CHANGE-006 DES-M5-MULTI-CHANGE-008
 */
export async function orchestrateCandidateIntegration(
  input: IntegrationOrchestrationInput,
): Promise<IntegrationOrchestrationResult> {
  const root = resolve(input.controlRoot);
  const resolved = await resolveIntegrationCandidates(root, input.selectors);
  const identity = deriveIntegrationIdentity({
    repositoryId: resolved.registry.repositoryId,
    startingDefaultCommit: resolved.startingDefaultCommit,
    candidates: resolved.candidates,
  });
  const existing = await listIntegrationAttempts(root);
  const sameIdentity = existing.find((attempt) => attempt.integrationId === identity.integrationId);
  if (sameIdentity) {
    if (!input.recoverBatchCheckpoints) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'checkpoint recovery dependency is required.');
    }
    return resumeCandidateIntegration({ ...input, recoverBatchCheckpoints: input.recoverBatchCheckpoints });
  }
  if (existing.some((attempt) =>
    (attempt.state === 'integrating' || attempt.state === 'verified')
    && attempt.candidateIds.some((candidateId) =>
      identity.candidates.some((candidate) => candidate.candidateId === candidateId)))) {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'candidate belongs to another active integration attempt.',
    );
  }

  const commonDirectory = await gitCommonDirectory(root);
  const worktreeRelativePath = integrationWorktreeRelativePath(identity.integrationId);
  const worktreePath = resolve(commonDirectory, worktreeRelativePath);
  if (await lstat(worktreePath).then(() => true, () => false)) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration worktree already exists.');
  }
  await mkdir(dirname(worktreePath), { recursive: true });
  await git(
    root,
    ['worktree', 'add', '--detach', worktreePath, resolved.startingDefaultCommit],
    { preserveLf: true },
  );
  try {
    for (const candidateId of resolved.analysis.applyOrder) {
      const candidate = resolved.candidates.find((entry) => entry.candidateId === candidateId)!;
      const tip = await git(root, ['rev-parse', candidate.branch]);
      if (tip !== candidate.candidateCommit) {
        throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate tip moved during apply.');
      }
      const commits = (await git(root, [
        'rev-list',
        '--reverse',
        `${candidate.baseCommit}..${candidate.candidateCommit}`,
      ])).split(/\r?\n/).filter(Boolean);
      for (const commit of commits) {
        await git(worktreePath, ['cherry-pick', commit], { preserveLf: true });
      }
    }
    if (await gitRaw(
      worktreePath,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      true,
    )) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration worktree is dirty.');
    }
  } catch (cause) {
    await git(worktreePath, ['cherry-pick', '--abort'], {
      allowFailure: true,
      preserveLf: true,
    });
    await git(root, ['worktree', 'remove', '--force', worktreePath], { allowFailure: true });
    if (cause instanceof Error && cause.message.startsWith('CANDIDATE_')) throw cause;
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', String(cause));
  }

  const sourceManifest = await sourceManifestAt(worktreePath);
  const attempt: PersistedIntegrationAttempt = {
    schemaVersion: 1,
    integrationId: identity.integrationId,
    repositoryId: identity.repositoryId,
    startingDefaultCommit: identity.startingDefaultCommit,
    candidateIds: identity.candidates.map((candidate) => candidate.candidateId),
    inputCommits: identity.candidates.map((candidate) => candidate.candidateCommit),
    state: 'integrating',
    changeIds: resolved.candidates.map((candidate) => candidate.changeId).sort(byteCompare),
    applyOrder: resolved.analysis.applyOrder,
    sourceManifest,
    postApplicationCommit: await git(worktreePath, ['rev-parse', 'HEAD']),
    identityCandidates: identity.candidates,
    worktreePath,
    releaseOwnerCandidateId: [...resolved.candidates]
      .sort((left, right) => byteCompare(left.changeId, right.changeId))[0]!.candidateId,
  };
  await persistAttempt(root, attempt, 'integrating', input.transaction);
  return verifyPersistedAttempt(
    root,
    attempt,
    input.verify,
    false,
    input.transaction,
  );
}

function finalizationMarkerPath(commonDirectory: string, integrationId: string): string {
  return resolve(
    commonDirectory,
    'musubix5',
    'finalizations',
    `${integrationId.slice('integration:'.length)}.json`,
  );
}

async function finalizationMarker(
  path: string,
): Promise<CandidateFinalizationMarker | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!exactFields(value, ['schemaVersion', 'kind', 'integrationId', 'integrationCommit',
      'startingDefaultCommit', 'fencingToken', 'leaseContext'])
      || value.schemaVersion !== 1 || value.kind !== 'candidate-finalization-v1'
      || typeof value.integrationId !== 'string' || !integrationIdPattern.test(value.integrationId)
      || typeof value.integrationCommit !== 'string' || !commitPattern.test(value.integrationCommit)
      || typeof value.startingDefaultCommit !== 'string' || !commitPattern.test(value.startingDefaultCommit)
      || !isFinalizationLeaseContext(value.leaseContext)
      || value.fencingToken !== value.leaseContext.finalizationToken) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'finalization marker has invalid fields.');
    }
    return {
      schemaVersion: 1, kind: 'candidate-finalization-v1', integrationId: value.integrationId,
      integrationCommit: value.integrationCommit, startingDefaultCommit: value.startingDefaultCommit,
      fencingToken: value.leaseContext.finalizationToken, leaseContext: value.leaseContext,
    };
  }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'finalization marker is malformed or unreadable.');
  }
}

async function assertSourceClean(root: string): Promise<void> {
  const dirty = (await gitRaw(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']))
    .split('\0').filter(Boolean).map((line) => line.slice(3)).filter((path) => !isOperationalStatePath(path));
  if (dirty.length) throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'unknown source changes must not be discarded.');
}

async function journalAtCommit(root: string, commit: string): Promise<JournalRecord[]> {
  const paths = (await gitRaw(root, ['ls-tree', '-r', '--name-only', commit, '--', '.musubix/journal']))
    .split(/\r?\n/).filter((path) => /^\.musubix\/journal\/(normal|bootstrap)\/\d{12}\.json$/.test(path));
  const records: JournalRecord[] = [];
  for (let index = 0; index < paths.length; index += 8) {
    records.push(...await Promise.all(paths.slice(index, index + 8).map(async (path) =>
      JSON.parse(await gitRaw(root, ['show', `${commit}:${path}`])) as JournalRecord)));
  }
  records.sort((a, b) => a.order - b.order);
  validateJournalRecords(records);
  return records;
}

async function markerAttempt(
  root: string, attempt: PersistedIntegrationAttempt, marker: CandidateFinalizationMarker,
  live: FinalizationLeaseContext,
): Promise<PersistedIntegrationAttempt> {
  if (!commitPattern.test(marker.integrationCommit ?? '')
    || !await gitSucceeds(root, ['cat-file', '-e', `${marker.integrationCommit}^{commit}`])) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'marker commit is unreachable.');
  }
  const records = await journalAtCommit(root, marker.integrationCommit);
  const fromCommit = resolveFinalizationContext(records, attempt);
  const projectionPath = relative(root, integrationRecordPath(root, attempt.integrationId)).split(sep).join('/');
  const projected = JSON.parse(await gitRaw(root, ['show', `${marker.integrationCommit}:${projectionPath}`])) as PersistedIntegrationAttempt;
  if (!fromCommit.finalizationContextRecord
    || !canonicalBytes(projected.finalizationContextRecord).equals(canonicalBytes(fromCommit.finalizationContextRecord))
    || !canonicalBytes(finalizationBinding(projected)).equals(canonicalBytes(finalizationBinding(attempt)))
    || !canonicalBytes(attempt.finalizationContextRecord).equals(canonicalBytes(fromCommit.finalizationContextRecord))) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'materialized context differs from the authoritative attempt.');
  }
  const recovered = { ...fromCommit, integrationCommit: marker.integrationCommit };
  validateFinalizationMarker({ attempt: recovered, marker, liveLeaseContext: live, integrationCommitReachable: true });
  if ((await sourceManifestAt(root, marker.integrationCommit)).sha256 !== attempt.sourceManifest.sha256) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'marker commit source differs from verified source.');
  }
  return recovered;
}

/** @id CODE-M5-FINALIZATION-TAIL-RECOVERY-001
 * @implements REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-008
 */
async function refreshControlPreservingJournal(
  root: string, startingCommit: string, commit: string, authorize: () => Promise<void>,
  changeIds: readonly string[], preparedSource: VerifiedSourceEvidence,
): Promise<void> {
  const sourcePaths = (output: string) => output.split('\0').filter((path) => path && !isOperationalStatePath(path));
  const untracked = sourcePaths(await gitRaw(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  const startingChanges = sourcePaths(await gitRaw(root, ['diff', '--name-only', '-z', startingCommit]));
  const integratedChanges = sourcePaths(await gitRaw(root, ['diff', '--name-only', '-z', commit]));
  if (untracked.length || (startingChanges.length && integratedChanges.length)) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'control source differs from both authorized refresh states.');
  }
  const records = await loadJournalRecords(root);
  const committed = await journalAtCommit(root, commit);
  if (committed.some((record, index) => records[index]?.recordSha256 !== record.recordSha256)) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'control journal diverges from materialized history.');
  }
  const baseline = await operationalStateBaseline(root);
  const saved = await Promise.all(baseline.map(async (entry) => ({
    ...entry, bytes: await readFile(resolve(root, entry.path)),
  })));
  const algorithm = await git(root, ['rev-parse', '--show-object-format']);
  const blobId = (bytes: Uint8Array) => createHash(algorithm)
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const tree = (await gitRaw(root, ['ls-tree', '-r', '-z', commit, '--',
    '.musubix/candidates', '.musubix/evidence', '.musubix/journal'])).split('\0').filter(Boolean);
  const allowed = new Map<string, Set<string>>();
  const rebuilt = new Map<string, Buffer>();
  const derivable = new Set<string>();
  const project = (path: string, bytes: Buffer) => {
    const hashes = allowed.get(path) ?? new Set<string>();
    hashes.add(blobId(bytes));
    allowed.set(path, hashes);
    rebuilt.set(path, bytes);
    derivable.add(path);
  };
  for (const entry of tree) {
    const match = /^[0-7]{6} blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    if (!match) throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'materialized operational tree is invalid.');
    allowed.set(match[2]!, new Set([match[1]!]));
  }
  const tail = records.slice(committed.length);
  const registryPath = '.musubix/candidates/registry.json';
  let tailRegistry = JSON.parse(await gitRaw(root, ['show', `${commit}:${registryPath}`])) as CandidateRegistry;
  project(registryPath, canonicalBytes(tailRegistry));
  const attempts = new Map<string, PersistedIntegrationAttempt>();
  for (const record of committed) {
    if (record.kind.startsWith('candidate-integration-')) {
      const persisted = record.payload as PersistedIntegrationAttempt;
      attempts.set(persisted.integrationId, persisted);
    }
  }
  const projectAttempt = (attempt: PersistedIntegrationAttempt, prefix: JournalRecord[]) => {
    const persisted = resolveFinalizationContext(prefix, attempt);
    const path = relative(root, integrationRecordPath(root, persisted.integrationId)).split(sep).join('/');
    project(path, canonicalBytes(persisted));
    attempts.set(persisted.integrationId, persisted);
  };
  for (const attempt of attempts.values()) projectAttempt(attempt, committed);
  for (const record of tail) {
    const path = `.musubix/journal/${record.stream}/${String(record.order).padStart(12, '0')}.json`;
    const bytes = saved.find((entry) => entry.path === path)?.bytes;
    if (!bytes) throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'journal tail file is missing.');
    allowed.set(path, new Set([blobId(bytes)]));
    if (record.kind.startsWith('candidate-integration-')) {
      const persisted = record.payload as PersistedIntegrationAttempt;
      if (persisted.state !== 'verified' || !persisted.finalizationContextRecord) {
        tailRegistry = projectAttemptRegistry(tailRegistry, persisted, persisted.state, persisted.worktreePath);
        project(registryPath, canonicalBytes(tailRegistry));
      }
      projectAttempt(persisted, records.slice(0, record.order));
    } else if (record.kind === 'candidate-finalization-lease-context') {
      const integrationId = (record.payload as { integrationId: string }).integrationId;
      const attempt = attempts.get(integrationId);
      if (!attempt) throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'context has no journaled integration attempt.');
      projectAttempt(attempt, records.slice(0, record.order));
    }
  }
  const orderPath = '.musubix/evidence/order.json';
  const committedOrder = allowed.has(orderPath)
    ? JSON.parse(await gitRaw(root, ['show', `${commit}:${orderPath}`])) as EvidenceOrderLog : null;
  const currentOrder = await loadEvidenceOrder(root) ?? committedOrder;
  if (!validateEvidenceOrderLog(currentOrder).valid
    || committedOrder?.records.some((record, index) => currentOrder?.records[index]?.recordSha256 !== record.recordSha256)) {
    throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'evidence order diverges from materialized history.');
  }
  if (currentOrder) {
    const bytes = saved.find((entry) => entry.path === orderPath)?.bytes
      ?? Buffer.from(await gitRaw(root, ['show', `${commit}:${orderPath}`]));
    project(orderPath, bytes);
  }
  const tddPath = '.musubix/evidence/tdd.json';
  const tddBytes = saved.find((entry) => entry.path === tddPath)?.bytes;
  if (tddBytes && allowed.has(tddPath)) {
    const baselineTdd = JSON.parse(await gitRaw(root, ['show', `${commit}:${tddPath}`])) as TddEvidence;
    const currentTdd = JSON.parse(tddBytes.toString()) as TddEvidence;
    if (!sourceMaterializationTailValid(baselineTdd, currentTdd, preparedSource, committed.length)) {
      throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'TDD projection is not a verified source journal tail.');
    }
    project(tddPath, tddBytes);
  }
  for (const entry of saved.filter((entry) => !allowed.has(entry.path)
    && entry.path.startsWith(`${sourceEvidencePrefix}/`))) {
    const relativeSource = entry.path.slice(sourceEvidencePrefix.length + 1);
    const blob = /^blobs\/([a-f0-9]{64})$/.exec(relativeSource);
    if (blob && sha256(entry.bytes) === blob[1]) {
      allowed.set(entry.path, new Set([blobId(entry.bytes)]));
      continue;
    }
    const artifact = /^(CHANGE-\d+)\/g([1-9]\d*)\/([a-z0-9][a-z0-9-]{0,63})\/(artifact|approval)\.json$/.exec(relativeSource);
    if (!artifact) throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'Invalid source prerequisite path or blob digest.');
    const scope = { changeId: artifact[1]!, generation: Number(artifact[2]), operationId: artifact[3]! };
    const review = await readSourceReview(root, scope);
    if (artifact[4] === 'approval') await readSourceApproval(root, scope, review, sha256(canonicalBytes(review)));
    allowed.set(entry.path, new Set([blobId(entry.bytes)]));
  }
  const changesPath = '.musubix/evidence/changes.json';
  if (allowed.has(changesPath)) {
    const bytes = Buffer.from(await gitRaw(root, ['show', `${commit}:${changesPath}`]));
    const changes = JSON.parse(bytes.toString()) as ChangeEvidence;
    const prefixes = changes.changes.map((change) => new Set([sha256(canonicalBytes(change))]));
    project(changesPath, bytes);
    const batches = validateBatchCheckpointJournal(records, changes.changes);
    if (!batches.valid) throw new Error(`CHANGE_CHECKPOINT_JOURNAL_INVALID: ${batches.diagnostics.map((entry) => entry.message).join(' ')}`);
    const phases = await phaseCheckpointRecords(root);
    for (const record of [...phases, ...batches.records]) {
      if (record.order <= committed.length) continue;
      if (!changeIds.includes(record.changeId)) continue;
      const change = changes.changes.find((entry) => entry.changeId === record.changeId);
      if (!change || record.payload.generation !== activeChangeGeneration(change)) continue;
      const phase = record.kind === 'change-phase-checkpoint'
        ? generationOrderPhase(record.payload.generation, record.payload.orderPhaseKey) : record.payload.orderPhaseKey;
      const order = currentOrder?.records.find((entry) =>
        entry.kind === 'change' && entry.entityId === change.changeId && entry.phase === phase);
      if (!order) continue;
      if (record.kind === 'change-batch-checkpoint') projectBatchCheckpoint(change, record.payload, order.sequence);
      else {
        const payload = record.payload;
        if ((change.phases[payload.phase]?.[payload.phase === 'design' ? 'designOrdinal' : 'requirementsOrdinal'] ?? 1) >= payload.ordinal) continue;
        supersedeApprovedPhase(change, payload.phase, {
          phase: payload.phase, order: order.sequence, recordedAt: payload.recordedAt, fingerprints: payload.fingerprints,
          approvalManifestSha256: payload.approvalManifestSha256, operationId: payload.operationId,
        }, payload.ordinal);
      }
      prefixes[changes.changes.indexOf(change)]!.add(sha256(canonicalBytes(change)));
      project(changesPath, Buffer.from(`${JSON.stringify(changes, null, 2)}\n`));
    }
    const currentBytes = saved.find((entry) => entry.path === changesPath)?.bytes;
    if (currentBytes) {
      const current = JSON.parse(currentBytes.toString()) as ChangeEvidence;
      if (!canonicalBytes({ ...current, changes: [] }).equals(canonicalBytes({ ...changes, changes: [] }))
        || current.changes.length !== prefixes.length
        || current.changes.some((change, index) => !prefixes[index]!.has(sha256(canonicalBytes(change))))) {
        throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'checkpoint projection is not a journal-derived recovery prefix.');
      }
      allowed.get(changesPath)!.add(blobId(currentBytes));
    }
    // Reconciliation owns allocation and predecessor checks; planning must not grant checkpoint credit.
    rebuilt.set(changesPath, currentBytes ?? bytes);
  }
  if (saved.some((entry) => !allowed.get(entry.path)?.has(blobId(entry.bytes)))
    || [...allowed.keys()].some((path) => !derivable.has(path) && !saved.some((entry) => entry.path === path))) {
    throw integrationError('CANDIDATE_OPERATIONAL_STATE_DRIFT', 'control operational bytes differ from materialized state and its journal tail.');
  }
  await authorize();
  await git(root, ['restore', `--source=${commit}`, '--staged', '--worktree', '--', '.',
    ':(exclude).musubix/candidates', ':(exclude).musubix/evidence', ':(exclude).musubix/journal'], { preserveLf: true });
  await authorize();
  await git(root, ['read-tree', commit]);
  for (const [path, bytes] of rebuilt) {
    await authorize();
    await writeAuthorizedFile(root, path, bytes, authorize);
  }
  validateJournalRecords(await loadJournalRecords(root));
}

/** @id CODE-M5-FINALIZATION-EXECUTION-001
 * @implements REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-006
 * @design DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-008
 */
export async function finalizeCandidateIntegration(
  input: FinalizeCandidateIntegrationInput,
): Promise<IntegrationOrchestrationResult> {
  const root = resolve(input.controlRoot);
  const initial = await readIntegrationAttempt(root, input.integrationId);
  if (typeof input.recoverBatchCheckpoints !== 'function') {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'checkpoint recovery dependency is required.');
  }
  const retry = Symbol('source-materialization-advanced');
  for (;;) {
    const preparedSource = await inspectSourceEvidence(root, await readSourceTddEvidence(root));
    requireSourceLedger(preparedSource);
    const outcome = await withMultiChangeProjectionWrite(root, initial.changeIds, async (leases) => {
    const authorize = () => assertFinalizationLeases(root, leases);
    await authorize();
    if (!await recheckSourceMaterialization(root, preparedSource)) return retry;
    let attempt = await readIntegrationAttempt(root, input.integrationId);
    const commonDirectory = await gitCommonDirectory(root);
    const markerPath = resolve(commonDirectory, 'musubix5/finalizations', `${attempt.integrationId.slice(12)}.json`);
    const marker = await finalizationMarker(markerPath);
    const live: FinalizationLeaseContext = {
      leases: leases.changeLeases.map((lease) => ({ changeId: lease.changeId, fencingToken: lease.fencingToken })),
      projectionFencingToken: leases.projectionLease.fencingToken, finalizationToken: leases.appendSession!.fencingToken,
    };
    const transaction: IntegrationTransactionAdapter = {
      leases,
      run: async (_ids, operation) => operation(live),
      append: (path, record) => appendJournalRecord(path, record, leases.appendSession),
    };
    const removeMarker = async () => { await authorize(); await rm(markerPath, { force: true }); };
    const registry = await readCandidateRegistry(root) ?? (marker
      ? JSON.parse(await gitRaw(root, ['show', `${marker.integrationCommit}:.musubix/candidates/registry.json`])) as CandidateRegistry
      : null);
    if (!registry || registry.repositoryId !== attempt.repositoryId) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate repository binding changed.');
    }
    const changeEvidence = await loadChangeEvidence(root);
    if (changeEvidence && attempt.identityCandidates.some((candidate) => {
      const change = changeEvidence.changes.find((entry) => entry.changeId === candidate.changeId);
      return !change || activeChangeGeneration(change) !== candidate.generation;
    })) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'selected CHANGE active generation changed.');
    }
    const defaultRef = await git(root, ['symbolic-ref', 'HEAD']);
    let defaultCommit = await git(root, ['rev-parse', defaultRef]);
    const stale = async (): Promise<never> => {
      await authorize();
      await persistAttemptUnderLease(root, { ...attempt, state: 'failed' }, 'stale', transaction);
      if (marker || await finalizationMarker(markerPath)) await removeMarker();
      throw integrationError('CANDIDATE_BASE_STALE', 'default branch advanced during finalization.');
    };
    const finish = async (recovered: PersistedIntegrationAttempt, resumed: boolean) => {
      const commit = recovered.integrationCommit!;
      await verifyCandidateReachableObjectSizes(root, commit);
      await verifyCandidateLfsClosure(root, commit, 'local');
      await refreshControlPreservingJournal(root, recovered.startingDefaultCommit, commit, authorize,
        recovered.changeIds, preparedSource);
      for (const changeId of recovered.changeIds) {
        await reconcilePendingPhaseCheckpoints(root, changeId, leases);
        await input.recoverBatchCheckpoints(root, changeId, leases);
      }
      const owner = registry.candidates.find((candidate) => candidate.candidateId === recovered.releaseOwnerCandidateId);
      if (!owner) throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'release owner is missing.');
      await authorize();
      await git(root, ['update-ref', `refs/heads/${owner.branch}`, commit]);
      await authorize();
      await git(resolve(commonDirectory, owner.worktreePath), ['reset', '--hard', commit], { preserveLf: true });
      const integrated: PersistedIntegrationAttempt = {
        ...recovered, state: 'integrated',
        materializedManifestSha256: recovered.materializedManifestSha256
          ?? sha256(Buffer.from(await gitRaw(root, ['ls-tree', '-r', '-z', commit]))),
        releaseOwnerPreviousCommit: recovered.releaseOwnerPreviousCommit
          ?? recovered.identityCandidates.find((candidate) => candidate.candidateId === owner.candidateId)!.candidateCommit,
      };
      await authorize();
      await persistAttemptUnderLease(root, integrated, 'integrated', transaction);
      await removeMarker();
      return orchestrationResult(root, integrated, resumed);
    };
    if (marker) {
      attempt = await markerAttempt(root, attempt, marker, live);
      if (defaultCommit === marker.integrationCommit) return finish(attempt, true);
      if (defaultCommit !== attempt.startingDefaultCommit) return stale();
      await removeMarker();
    } else if (attempt.state === 'integrated') {
      return orchestrationResult(root, attempt, true);
    }
    if (attempt.state !== 'verified') throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration is not verified.');
    if (defaultCommit !== attempt.startingDefaultCommit) return stale();
    let markers: string[] = [];
    try { markers = await readdir(dirname(markerPath)); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause; }
    if (markers.some((name) => name.endsWith('.json'))) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'another integration has an unresolved marker.');
    }
    await assertSourceClean(root);
    await assertSourceClean(attempt.worktreePath);
    if ((await sourceManifestAt(attempt.worktreePath)).sha256 !== attempt.sourceManifest.sha256
      || (await sourceManifestAt(root, attempt.postApplicationCommit)).sha256 !== attempt.sourceManifest.sha256) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'verified source manifest changed.');
    }
    for (const identity of attempt.identityCandidates) {
      const candidate = registry.candidates.find((entry) => entry.candidateId === identity.candidateId);
      if (!candidate || candidate.changeId !== identity.changeId || candidate.generation !== identity.generation
        || candidate.baseCommit !== attempt.startingDefaultCommit || candidate.candidateCommit !== identity.candidateCommit
        || !['integrating', 'verified'].includes(candidate.state)
        || await git(root, ['rev-parse', candidate.branch]) !== identity.candidateCommit
        || !await gitSucceeds(root, ['cat-file', '-e', `${identity.candidateCommit}^{commit}`])) {
        throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'selected candidate binding changed.');
      }
    }
    await authorize();
    await git(attempt.worktreePath, ['reset', '--hard', attempt.postApplicationCommit], { preserveLf: true });
    const { integrationCommit: _oldCommit, materializedManifestSha256: _oldManifest, ...freshAttempt } = attempt;
    attempt = await persistFinalizationContext(root, freshAttempt, leases);
    await persistAttemptUnderLease(root, attempt, 'verified', transaction);
    const baseline = await materializeRecoveredState(root, attempt.worktreePath, attempt.changeIds,
      input.recoverBatchCheckpoints, leases, preparedSource);
    await authorize();
    await git(attempt.worktreePath, ['add', '-A'], { preserveLf: true });
    await authorize();
    await git(attempt.worktreePath, [
      '-c', 'user.name=musubix5', '-c', 'user.email=musubix5@example.invalid',
      'commit', '--allow-empty', '-m', `Integrate ${attempt.integrationId}`,
    ], { preserveLf: true });
    const integrationCommit = await git(attempt.worktreePath, ['rev-parse', 'HEAD']);
    await authorize();
    await assertOperationalBaseline(root, baseline);
    const finalizationMarkerValue: CandidateFinalizationMarker = {
      schemaVersion: 1, kind: 'candidate-finalization-v1', integrationId: attempt.integrationId,
      integrationCommit, startingDefaultCommit: attempt.startingDefaultCommit,
      fencingToken: attempt.finalizationContextRecord!.leaseContext.finalizationToken,
      leaseContext: attempt.finalizationContextRecord!.leaseContext,
    };
    await writeCanonicalJson(markerPath, finalizationMarkerValue, authorize);
    await authorize();
    defaultCommit = await git(root, ['rev-parse', defaultRef]);
    if (defaultCommit !== attempt.startingDefaultCommit) return stale();
    await assertOperationalBaseline(root, baseline);
    try {
      await authorize();
      await git(root, ['update-ref', defaultRef, integrationCommit, attempt.startingDefaultCommit]);
    } catch (cause) {
      await authorize();
      if (await git(root, ['rev-parse', defaultRef]) !== attempt.startingDefaultCommit) return stale();
      throw cause;
    }
    return finish({ ...attempt, integrationCommit }, false);
    });
    if (outcome !== retry) return outcome;
  }
}

export async function resumeCandidateIntegration(
  input: IntegrationOrchestrationInput & { recoverBatchCheckpoints: BatchCheckpointRecovery },
): Promise<IntegrationOrchestrationResult> {
  const root = resolve(input.controlRoot);
  const registry = await readCandidateRegistry(root);
  const attempts = await listIntegrationAttempts(root);
  if (!registry) {
    const matching = attempts.filter((attempt) => {
      const selected = input.selectors.map((selector) => attempt.identityCandidates?.find((candidate) =>
        candidate.candidateId === selector || candidate.changeId === selector)?.candidateId);
      return selected.length === attempt.candidateIds.length && selected.every(Boolean)
        && new Set(selected).size === attempt.candidateIds.length;
    });
    if (matching.length !== 1) throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'journal does not identify one selected integration.');
    return finalizeCandidateIntegration({
      controlRoot: root, integrationId: matching[0]!.integrationId,
      recoverBatchCheckpoints: input.recoverBatchCheckpoints,
    });
  }
  const selected = input.selectors.map((selector) => {
    const matches = registry.candidates.filter((candidate) =>
      candidate.candidateId === selector || candidate.changeId === selector);
    if (matches.length !== 1) {
      throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', `candidate ${selector} was not found.`);
    }
    return matches[0]!;
  });
  const candidateIds = selected.map((candidate) => candidate.candidateId);
  const attempt = attempts.find((candidate) => {
    const sameCandidateSet = candidate.candidateIds.length === candidateIds.length
      && [...candidate.candidateIds].sort(byteCompare)
        .every((candidateId, index) => candidateId === [...candidateIds].sort(byteCompare)[index]);
    if (candidate.state === 'integrated') return sameCandidateSet;
    try {
      planIntegrationResume(candidate, {
        integrationId: candidate.integrationId,
        candidateIds,
        inputCommits: candidate.inputCommits,
      });
      return true;
    } catch {
      return false;
    }
  });
  if (!attempt) {
    if (attempts.some((candidate) =>
      (candidate.state === 'integrating' || candidate.state === 'verified')
      && candidate.candidateIds.some((candidateId) => candidateIds.includes(candidateId)))) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'candidate set differs from attempt.');
    }
    throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'integration attempt was not found.');
  }
  const commitByCandidate = new Map(
    attempt.candidateIds.map((candidateId, index) => [candidateId, attempt.inputCommits[index]!]),
  );
  deriveResumeIdentity({
    repositoryId: registry.repositoryId,
    startingDefaultCommit: attempt.startingDefaultCommit,
    candidates: selected.map((candidate) => ({
      candidateId: candidate.candidateId,
      changeId: candidate.changeId,
      generation: candidate.generation,
      candidateCommit: commitByCandidate.get(candidate.candidateId)!,
    })),
  }, attempt, true);
  const markerPath = resolve(await gitCommonDirectory(root), 'musubix5/finalizations', `${attempt.integrationId.slice(12)}.json`);
  if (attempt.state === 'integrated' && !await finalizationMarker(markerPath)) {
    return orchestrationResult(root, attempt, true);
  }
  if (attempt.state === 'failed' || attempt.state === 'deleted') {
    throw integrationError(
      'CANDIDATE_INTEGRATION_CONFLICT',
      'terminal integration attempt cannot be resumed.',
    );
  }
  if (attempt.state === 'verified' || attempt.state === 'integrated') {
    if (!input.recoverBatchCheckpoints) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'checkpoint recovery dependency is required.');
    }
    return finalizeCandidateIntegration({
      controlRoot: root,
      integrationId: attempt.integrationId,
      recoverBatchCheckpoints: input.recoverBatchCheckpoints,
      ...(input.transaction ? { transaction: input.transaction } : {}),
    });
  }
  return verifyPersistedAttempt(
    root,
    attempt,
    input.verify,
    true,
    input.transaction,
  );
}

export async function cleanupCandidateIntegration(
  input: CleanupCandidateIntegrationInput,
): Promise<PersistedIntegrationAttempt & { tombstone: IntegrationTombstone }> {
  const root = resolve(input.controlRoot);
  if (!input.deletedBy.trim()) {
    throw integrationError('CLI_ERROR', 'cleanup requires a non-empty actor.');
  }
  const attempt = await readIntegrationAttempt(root, input.integrationId);
  if (attempt.state !== 'integrated' && attempt.state !== 'failed') {
    throw integrationError('CANDIDATE_CLEANUP_UNSAFE', 'integration attempt is not terminal.');
  }
  const commonDirectory = await gitCommonDirectory(root);
  const inspect = input.inspect ?? (async () => {
    const integrationCommit = attempt.integrationCommit;
    const leasesRoot = resolve(commonDirectory, 'musubix5', 'leases');
    const leaseIsLive = async (path: string): Promise<boolean> => {
      try {
        const owner = JSON.parse(
          await readFile(resolve(path, 'owner.json'), 'utf8'),
        ) as { token?: unknown; fencingToken?: unknown; expiresAt?: unknown };
        return typeof owner.token === 'string'
          && Number.isInteger(owner.fencingToken)
          && typeof owner.expiresAt === 'number'
          && owner.expiresAt > Date.now();
      } catch {
        return false;
      }
    };
    const liveLease = await Promise.all([
      ...attempt.changeIds.map((changeId) =>
        leaseIsLive(resolve(leasesRoot, encodeURIComponent(`change-${changeId}`)))),
      leaseIsLive(resolve(leasesRoot, encodeURIComponent('order'))),
    ]).then((states) => states.some(Boolean));
    return {
      porcelainZ: await gitRaw(
        attempt.worktreePath,
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      ),
      unresolvedEntries: await gitRaw(attempt.worktreePath, ['ls-files', '-u', '-z']),
      candidateReachableFromBase: Boolean(integrationCommit)
        && await gitSucceeds(root, [
          'merge-base',
          '--is-ancestor',
          integrationCommit!,
          'HEAD',
        ]),
      liveLease,
    };
  });
  await inspectCandidateCleanupSafety({
    worktreePath: attempt.worktreePath,
    candidateCommit: attempt.integrationCommit
      ?? attempt.inputCommits.at(-1)
      ?? attempt.startingDefaultCommit,
    baseCommit: attempt.startingDefaultCommit,
    state: attempt.state === 'failed' ? 'failed' : 'integrated',
    inspect,
  });
  const relativeWorktreePath = relative(commonDirectory, attempt.worktreePath).split(sep).join('/');
  await git(root, ['worktree', 'remove', attempt.worktreePath]);
  const transaction = input.transaction ?? {
    run: async <Result>(
      changeIds: readonly string[],
      operation: (context?: IntegrationLeaseContext) => Promise<Result>,
    ): Promise<Result> => withMultiChangeWrite(root, changeIds, (leases) =>
      operation(deriveIntegrationLeaseContext(
        leases.map((lease, index) => ({
          changeId: [...new Set(changeIds)].sort(byteCompare)[index]!,
          fencingToken: lease.fencingToken,
        })),
      ))),
  };
  return withIntegrationTransition(attempt.changeIds, transaction, async () => {
    const append = transaction.append ?? appendJournalRecord;
    const record = await append(root, {
      stream: 'normal',
      changeId: [...attempt.changeIds].sort(byteCompare)[0]!,
      kind: 'candidate-integration-deleted',
      idempotencyKey: `candidate-integration:${attempt.integrationId}:deleted`,
      payload: {
        integrationId: attempt.integrationId,
        deletedBy: input.deletedBy,
        worktreePath: relativeWorktreePath,
      },
    });
    const tombstone: IntegrationTombstone = {
      schemaVersion: 1,
      integrationId: attempt.integrationId,
      deletedBy: input.deletedBy,
      deletedAt: new Date().toISOString(),
      worktreePath: relativeWorktreePath,
      journalOrder: record.order,
    };
    const deleted: PersistedIntegrationAttempt & { tombstone: IntegrationTombstone } = {
      ...attempt,
      state: 'deleted',
      tombstone,
    };
    const registry = await readCandidateRegistry(root);
    if (!registry) {
      throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'registry was not found.');
    }
    const integrations = registry.integrations.map((integration) =>
      integration.integrationId === attempt.integrationId
        ? { ...integration, state: 'deleted' as const }
        : integration);
    await replaceCandidateRegistry(root, { ...registry, integrations });
    await writeCanonicalJson(integrationRecordPath(root, attempt.integrationId), {
      ...deleted,
      worktreePath: relativeWorktreePath,
    });
    return deleted;
  });
}
