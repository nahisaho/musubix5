import { execFile } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, sha256 } from './canonical.js';
import {
  isOperationalStatePath,
  readCandidateRegistry,
  replaceCandidateRegistry,
  type CandidateLifecycleState,
  type CandidateRegistry,
  type CandidateRegistryEntry,
} from './candidate-state.js';
import { appendJournalRecord } from './journal.js';

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

export interface IntegrationOrchestrationInput {
  controlRoot: string;
  selectors: string[];
  verify(context: IntegrationVerificationContext): Promise<ClosedIntegrationVerification>;
}

export interface IntegrationOrchestrationResult extends IntegrationVerificationContext {
  state: IntegrationAttempt['state'];
  integrationCommit?: string;
  resumed: boolean;
}

export interface FinalizeCandidateIntegrationInput {
  controlRoot: string;
  integrationId: string;
}

export interface CleanupCandidateIntegrationInput {
  controlRoot: string;
  integrationId: string;
  deletedBy: string;
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

async function git(
  root: string,
  args: string[],
  options: { allowFailure?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
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

async function gitRaw(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
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
    await execFileAsync('git', ['-C', root, ...args], {
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

function integrationRelativePath(integrationId: string): string {
  return `musubix5/workspaces/integrations/${integrationId.slice('integration:'.length)}`;
}

function integrationRecordPath(root: string, integrationId: string): string {
  return resolve(
    root,
    '.musubix',
    'candidates',
    'integrations',
    integrationId,
    'integration.json',
  );
}

async function writeCanonicalJson(path: string, value: unknown): Promise<void> {
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
}

async function readIntegrationAttempt(
  root: string,
  integrationId: string,
): Promise<PersistedIntegrationAttempt> {
  try {
    const attempt = JSON.parse(
      await readFile(integrationRecordPath(root, integrationId), 'utf8'),
    ) as PersistedIntegrationAttempt;
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
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const attempts: PersistedIntegrationAttempt[] = [];
    for (const entry of entries.sort((left, right) => byteCompare(left.name, right.name))) {
      if (!entry.isDirectory() || !integrationIdPattern.test(entry.name)) continue;
      attempts.push(await readIntegrationAttempt(root, entry.name));
    }
    return attempts;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw cause;
  }
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
  if (await git(worktreePath, ['status', '--porcelain', '--untracked-files=all'])) {
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
    candidates.map(async (candidate) => ({
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
        if (!dependency) {
          return { candidateId, candidateCommit: '' };
        }
        return { candidateId, candidateCommit: dependency.candidateCommit };
      }),
    })),
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
  registry: CandidateRegistry,
  attempt: PersistedIntegrationAttempt,
  candidateState: CandidateLifecycleState,
): Promise<void> {
  const commonDirectory = await gitCommonDirectory(root);
  const selected = new Set(attempt.candidateIds);
  const candidates = registry.candidates.map((candidate) =>
    selected.has(candidate.candidateId) ? { ...candidate, state: candidateState } : candidate);
  const existing = registry.integrations.findIndex((entry) =>
    entry.integrationId === attempt.integrationId);
  const integration = {
    schemaVersion: 1 as const,
    integrationId: attempt.integrationId,
    repositoryId: attempt.repositoryId,
    changeIds: [...attempt.changeIds],
    candidateIds: [...attempt.candidateIds],
    worktreePath: relative(commonDirectory, attempt.worktreePath).split(sep).join('/'),
    state: attempt.state,
  };
  const integrations = [...registry.integrations];
  if (existing < 0) integrations.push(integration);
  else integrations[existing] = integration;
  await replaceCandidateRegistry(root, { ...registry, candidates, integrations });
  await writeCanonicalJson(integrationRecordPath(root, attempt.integrationId), {
    ...attempt,
    worktreePath: integration.worktreePath,
  });
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: [...attempt.changeIds].sort(byteCompare)[0]!,
    kind: `candidate-integration-${attempt.state}`,
    idempotencyKey: `candidate-integration:${attempt.integrationId}:${attempt.state}`,
    payload: attempt,
  });
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
  registry: CandidateRegistry,
  attempt: PersistedIntegrationAttempt,
  verify: IntegrationOrchestrationInput['verify'],
  resumed: boolean,
): Promise<IntegrationOrchestrationResult> {
  const verification = await verify(orchestrationResult(root, attempt, resumed));
  validateClosedIntegrationVerification(verification);
  const verified: PersistedIntegrationAttempt = {
    ...attempt,
    state: 'verified',
    verifiedReportSha256: sha256(canonicalBytes(verification)),
  };
  await persistAttempt(root, registry, verified, 'verified');
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
    return resumeCandidateIntegration(input);
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
  const worktreeRelativePath = integrationRelativePath(identity.integrationId);
  const worktreePath = resolve(commonDirectory, worktreeRelativePath);
  if (await lstat(worktreePath).then(() => true, () => false)) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration worktree already exists.');
  }
  await mkdir(dirname(worktreePath), { recursive: true });
  await git(root, ['worktree', 'add', '--detach', worktreePath, resolved.startingDefaultCommit]);
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
        await git(worktreePath, ['cherry-pick', commit]);
      }
    }
    if (await git(worktreePath, ['status', '--porcelain', '--untracked-files=all'])) {
      throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration worktree is dirty.');
    }
  } catch (cause) {
    await git(worktreePath, ['cherry-pick', '--abort'], { allowFailure: true });
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
    worktreePath,
    releaseOwnerCandidateId: [...resolved.candidates]
      .sort((left, right) => byteCompare(left.changeId, right.changeId))[0]!.candidateId,
  };
  await persistAttempt(root, resolved.registry, attempt, 'integrating');
  return verifyPersistedAttempt(
    root,
    (await readCandidateRegistry(root))!,
    attempt,
    input.verify,
    false,
  );
}

async function operationalStateFingerprint(root: string): Promise<string> {
  const entries: Array<{ path: string; sha256: string }> = [];
  const walk = async (directory: string): Promise<void> => {
    let children;
    try {
      children = await readdir(resolve(root, directory), { withFileTypes: true });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw cause;
    }
    for (const child of children.sort((left, right) => byteCompare(left.name, right.name))) {
      if (child.name.endsWith('.lock') || child.name.endsWith('.tmp')) continue;
      const path = `${directory}/${child.name}`;
      if (child.isDirectory()) await walk(path);
      else if (child.isFile()) {
        entries.push({ path, sha256: sha256(await readFile(resolve(root, path))) });
      }
    }
  };
  for (const path of ['.musubix/candidates', '.musubix/evidence', '.musubix/journal']) {
    await walk(path);
  }
  return sha256(canonicalBytes(entries));
}

async function materializeOperationalState(controlRoot: string, integrationRoot: string): Promise<void> {
  for (const path of ['.musubix/candidates', '.musubix/evidence', '.musubix/journal']) {
    const source = resolve(controlRoot, path);
    const destination = resolve(integrationRoot, path);
    await rm(destination, { recursive: true, force: true });
    if (await lstat(source).then(() => true, () => false)) {
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination, {
        recursive: true,
        filter: (entry) => !entry.endsWith('.lock') && !entry.endsWith('.tmp'),
      });
    }
  }
}

function finalizationMarkerPath(commonDirectory: string, integrationId: string): string {
  return resolve(
    commonDirectory,
    'musubix5',
    'finalizations',
    `${integrationId.slice('integration:'.length)}.json`,
  );
}

export async function finalizeCandidateIntegration(
  input: FinalizeCandidateIntegrationInput,
): Promise<IntegrationOrchestrationResult> {
  const root = resolve(input.controlRoot);
  let attempt = await readIntegrationAttempt(root, input.integrationId);
  if (attempt.state === 'integrated') return orchestrationResult(root, attempt, true);
  if (attempt.state !== 'verified') {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'integration is not verified.');
  }
  const registry = await readCandidateRegistry(root);
  if (!registry) throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'registry was not found.');
  const commonDirectory = await gitCommonDirectory(root);
  const markerPath = finalizationMarkerPath(commonDirectory, attempt.integrationId);
  let marker: CandidateFinalizationMarker | null = null;
  try {
    marker = JSON.parse(await readFile(markerPath, 'utf8')) as CandidateFinalizationMarker;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
  let currentDefault = await git(root, ['rev-parse', 'HEAD']);
  if (marker) {
    const recovery = recoverCandidateFinalization({
      attempt: { ...attempt, integrationCommit: marker.integrationCommit },
      marker,
      currentFencingToken: marker.fencingToken,
      currentDefaultCommit: currentDefault,
      integrationCommitReachable: await gitSucceeds(
        root,
        ['cat-file', '-e', `${marker.integrationCommit}^{commit}`],
      ),
      controlWorktreeRefreshed: currentDefault === marker.integrationCommit,
    });
    if (recovery.action !== 'retry-before-fast-forward') {
      await git(root, ['reset', '--hard', marker.integrationCommit]);
      attempt = { ...attempt, integrationCommit: marker.integrationCommit };
      const recoveredRegistry = await readCandidateRegistry(root) ?? registry;
      const recovered: PersistedIntegrationAttempt = {
        ...attempt,
        state: 'integrated',
        integrationCommit: marker.integrationCommit,
      };
      await persistAttempt(root, {
        ...recoveredRegistry,
        candidates: recoveredRegistry.candidates.map((candidate) =>
          candidate.candidateId === attempt.releaseOwnerCandidateId
            ? { ...candidate, candidateCommit: marker.integrationCommit }
            : candidate),
      }, recovered, 'integrated');
      await rm(markerPath, { force: true });
      return orchestrationResult(root, recovered, true);
    }
    await rm(markerPath, { force: true });
    currentDefault = await git(root, ['rev-parse', 'HEAD']);
  }
  if (currentDefault !== attempt.startingDefaultCommit) {
    throw integrationError('CANDIDATE_BASE_STALE', 'default branch advanced before finalization.');
  }
  const dirty = (await git(root, ['status', '--porcelain', '--untracked-files=all']))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((path) => !isOperationalStatePath(path));
  if (dirty.length > 0) {
    throw integrationError('CANDIDATE_INTEGRATION_CONFLICT', 'control worktree is dirty.');
  }

  const baseline = await operationalStateFingerprint(root);
  await materializeOperationalState(root, attempt.worktreePath);
  await git(attempt.worktreePath, ['add', '-A']);
  await git(attempt.worktreePath, [
    '-c',
    'user.name=musubix5',
    '-c',
    'user.email=musubix5@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    `Integrate ${attempt.integrationId}`,
  ]);
  const integrationCommit = await git(attempt.worktreePath, ['rev-parse', 'HEAD']);
  assertOperationalStateStable(baseline, await operationalStateFingerprint(root));

  const finalizationMarker: CandidateFinalizationMarker = {
    schemaVersion: 1,
    kind: 'candidate-finalization-v1',
    integrationId: attempt.integrationId,
    integrationCommit,
    startingDefaultCommit: attempt.startingDefaultCommit,
    fencingToken: Date.now(),
  };
  await writeCanonicalJson(markerPath, finalizationMarker);
  try {
    const defaultRef = await git(root, ['symbolic-ref', 'HEAD']);
    await git(root, [
      'update-ref',
      defaultRef,
      integrationCommit,
      attempt.startingDefaultCommit,
    ]);
    await git(root, ['reset', '--hard', integrationCommit]);
    const releaseOwner = registry.candidates.find((candidate) =>
      candidate.candidateId === attempt.releaseOwnerCandidateId);
    if (releaseOwner) {
      await git(root, ['update-ref', `refs/heads/${releaseOwner.branch}`, integrationCommit]);
      await git(resolve(commonDirectory, releaseOwner.worktreePath), ['reset', '--hard', integrationCommit]);
    }
    const integrated: PersistedIntegrationAttempt = {
      ...attempt,
      state: 'integrated',
      integrationCommit,
    };
    const currentRegistry = await readCandidateRegistry(root) ?? registry;
    await persistAttempt(root, {
      ...currentRegistry,
      candidates: currentRegistry.candidates.map((candidate) =>
        candidate.candidateId === attempt.releaseOwnerCandidateId
          ? { ...candidate, candidateCommit: integrationCommit }
          : candidate),
    }, integrated, 'integrated');
    return orchestrationResult(root, integrated, false);
  } finally {
    await rm(markerPath, { force: true });
  }
}

export async function resumeCandidateIntegration(
  input: IntegrationOrchestrationInput,
): Promise<IntegrationOrchestrationResult> {
  const root = resolve(input.controlRoot);
  const registry = await readCandidateRegistry(root);
  if (!registry) throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'registry was not found.');
  const selected = input.selectors.map((selector) => {
    const matches = registry.candidates.filter((candidate) =>
      candidate.candidateId === selector || candidate.changeId === selector);
    if (matches.length !== 1) {
      throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', `candidate ${selector} was not found.`);
    }
    return matches[0]!;
  });
  const candidateIds = selected.map((candidate) => candidate.candidateId);
  const inputCommits = selected.map((candidate) => candidate.candidateCommit);
  const attempts = await listIntegrationAttempts(root);
  const attempt = attempts.find((candidate) => {
    const sameCandidateSet = candidate.candidateIds.length === candidateIds.length
      && [...candidate.candidateIds].sort(byteCompare)
        .every((candidateId, index) => candidateId === [...candidateIds].sort(byteCompare)[index]);
    if (candidate.state === 'integrated') return sameCandidateSet;
    try {
      planIntegrationResume(candidate, {
        integrationId: candidate.integrationId,
        candidateIds,
        inputCommits,
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
    return orchestrateCandidateIntegration(input);
  }
  if (attempt.state === 'integrated') return orchestrationResult(root, attempt, true);
  if (attempt.state === 'verified') {
    return finalizeCandidateIntegration({ controlRoot: root, integrationId: attempt.integrationId });
  }
  return verifyPersistedAttempt(root, registry, attempt, input.verify, true);
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
  assertCandidateCleanupSafe({
    dirty: Boolean(await git(attempt.worktreePath, ['status', '--porcelain', '--untracked-files=all'])),
    untracked: false,
    unintegratedCommits: false,
    leaseActive: false,
    unresolvedConflict: Boolean(await git(attempt.worktreePath, ['ls-files', '-u'])),
    state: attempt.state === 'failed' ? 'failed' : 'integrated',
  });
  const commonDirectory = await gitCommonDirectory(root);
  const relativeWorktreePath = relative(commonDirectory, attempt.worktreePath).split(sep).join('/');
  await git(root, ['worktree', 'remove', attempt.worktreePath]);
  const record = await appendJournalRecord(root, {
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
  if (!registry) throw integrationError('CANDIDATE_WORKSPACE_NOT_FOUND', 'registry was not found.');
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
}
