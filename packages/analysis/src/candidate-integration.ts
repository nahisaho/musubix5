import { canonicalBytes, sha256 } from './canonical.js';
import {
  isOperationalStatePath,
  type CandidateLifecycleState,
} from './candidate-state.js';

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
  fencingToken: number;
}

export interface CandidateCleanupState {
  dirty: boolean;
  untracked: boolean;
  unintegratedCommits: boolean;
  leaseActive: boolean;
  unresolvedConflict: boolean;
  state?: CandidateLifecycleState;
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

export function deriveIntegrationIdentity(input: {
  repositoryId: string;
  startingDefaultCommit: string;
  candidates: readonly IntegrationIdentityCandidate[];
}): IntegrationIdentity {
  if (!repositoryIdPattern.test(input.repositoryId)
    || !commitPattern.test(input.startingDefaultCommit)
    || input.candidates.length === 0) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration identity input is invalid.');
  }
  const candidates = [...input.candidates].sort((left, right) =>
    byteCompare(left.candidateId, right.candidateId));
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
  if (verification.status.exitCode !== 0
    || verification.requiredCommands.length === 0
    || verification.requiredChecks.length === 0
    || verification.requiredCommands.some((command) => command.status !== 'passed')) {
    return fail();
  }
  const failed = verification.requiredChecks.filter((check) => check.status === 'failed');
  if (verification.requiredChecks.some((check) => check.status === 'skipped')) return fail();
  if (failed.length === 0) {
    if (verification.requiredChecks.some((check) => check.status !== 'passed')) return fail();
    return { accepted: true, toleratedApprovalFailure: false };
  }
  if (failed.length !== 1 || failed[0]!.name !== 'approval' || verification.status.ready) {
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

export function recoverCandidateFinalization(input: {
  attempt: IntegrationAttempt;
  marker: CandidateFinalizationMarker;
  currentFencingToken: number;
  currentDefaultCommit: string;
  integrationCommitReachable: boolean;
  controlWorktreeRefreshed: boolean;
}): {
  action: 'retry-before-fast-forward' | 'refresh-and-record-integrated' | 'record-integrated';
  removeMarker: true;
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
    return { action: 'retry-before-fast-forward', removeMarker: true };
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
