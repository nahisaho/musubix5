import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes } from './canonical.js';
import {
  acquireChangeLease,
  assertChangeLeaseCurrent,
  releaseChangeLease,
  type ChangeLease,
} from './journal.js';

const execFileAsync = promisify(execFile);
const registryRelativePath = '.musubix/candidates/registry.json';
const candidateIdPattern = /^candidate:[a-f0-9]{64}$/;
const integrationIdPattern = /^integration:[a-f0-9]{64}$/;
const repositoryIdPattern = /^repository:[a-f0-9]{64}$/;
const changeIdPattern = /^CHANGE-\d+$/;
const commitPattern = /^[a-f0-9]{40,64}$/;

export const operationalStatePaths = [
  '.musubix/candidates',
  '.musubix/evidence',
  '.musubix/journal',
] as const;

export type CandidateLifecycleState =
  | 'prepared'
  | 'active'
  | 'ready'
  | 'integrating'
  | 'verified'
  | 'integrated'
  | 'failed'
  | 'abandoned'
  | 'stale'
  | 'deleted';

export interface CandidateBinding {
  candidateId: string;
  changeId: string;
  generation: number;
  repositoryId: string;
  baseCommit: string;
  candidateCommit: string;
}

export interface CandidateRegistryEntry extends CandidateBinding {
  schemaVersion: 1;
  creationEpoch: number;
  branch: string;
  worktreePath: string;
  state: CandidateLifecycleState;
  preparedOrder: number;
  activeOrder: number;
  dependencyIds: string[];
  manifestDigest?: string;
  deletedOrder?: number;
  readinessBindings?: CandidateReadinessBindings;
}

export interface CandidateIntegrationEntry {
  schemaVersion: 1;
  integrationId: string;
  repositoryId: string;
  changeIds: string[];
  candidateIds: string[];
  worktreePath: string;
  state: 'prepared' | 'integrating' | 'verified' | 'integrated' | 'failed' | 'deleted';
}

export interface CandidateRegistry {
  schemaVersion: 1;
  repositoryId: string;
  candidates: CandidateRegistryEntry[];
  integrations: CandidateIntegrationEntry[];
}

export interface CandidateLeaseAdapter<Lease = unknown> {
  acquire(changeId: string): Promise<Lease | null>;
  assertCurrent(lease: Lease): Promise<void>;
  release(lease: Lease): Promise<void>;
}

export interface CandidateTransitionOptions {
  refreshed?: boolean;
  integrationResume?: boolean;
}

export interface CandidateRegistrationResult {
  candidate: CandidateRegistryEntry;
  replayed: boolean;
}

export interface RoutedCandidateState {
  kind: 'candidate';
  sourceRoot: string;
  controlRoot: string;
  projectionRoot: string;
  binding: CandidateBinding;
}

export type CandidateCheckStatus = 'current' | 'drift' | 'base-drift' | 'failed';

export interface CandidateCheckResult {
  status: CandidateCheckStatus;
  fingerprint: string;
  diagnostic?: string;
}

export interface CandidateReadinessAdapter {
  approvals(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  tdd(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  quality(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  workspace(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  snapshot(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  gate(candidate: CandidateRegistryEntry): Promise<CandidateCheckResult>;
  recordTransition?(input: {
    candidate: CandidateRegistryEntry;
    state: CandidateLifecycleState;
    bindings: CandidateReadinessBindings;
    checks: Record<keyof CandidateReadinessBindings, CandidateCheckResult>;
  }): Promise<void>;
}

export type CandidateReadinessBindings = Record<
  'approvals' | 'tdd' | 'quality' | 'workspace' | 'snapshot' | 'gate',
  string
>;

export interface CandidateExecutionContextOptions {
  selector?: string;
  changeId?: string;
  cwd?: string;
  managedRoot?: string;
  repositoryId: string;
  activeGeneration: number;
}

export interface CandidateRefreshOptions {
  managedRoot?: string;
  defaultCommit: string;
  hasLiveSnapshot(candidate: CandidateRegistryEntry): Promise<boolean>;
  invalidateEvidence(input: {
    candidate: CandidateRegistryEntry;
    previousCommit: string;
    candidateCommit: string;
  }): Promise<void>;
  recordTransition?(input: {
    candidate: CandidateRegistryEntry;
    previousCommit: string;
    candidateCommit: string;
    defaultCommit: string;
  }): Promise<void>;
}

export interface CandidateCleanupOptions {
  managedRoot?: string;
  defaultCommit: string;
  deletedBy: string;
  confirm: boolean;
  hasLiveLease(candidate: CandidateRegistryEntry): Promise<boolean>;
  appendTombstone(input: {
    candidate: CandidateRegistryEntry;
    deletedBy: string;
  }): Promise<number>;
}

const transitions: Readonly<Record<CandidateLifecycleState, readonly CandidateLifecycleState[]>> = {
  prepared: ['active', 'failed', 'abandoned', 'deleted'],
  active: ['ready', 'failed', 'abandoned', 'stale', 'deleted'],
  ready: ['active', 'integrating', 'failed', 'abandoned', 'stale', 'deleted'],
  integrating: ['integrating', 'ready', 'verified', 'failed', 'stale', 'deleted'],
  verified: ['integrating', 'ready', 'integrated', 'failed', 'stale', 'deleted'],
  integrated: ['deleted'],
  failed: ['active', 'abandoned', 'deleted'],
  abandoned: ['deleted'],
  stale: ['active', 'deleted'],
  deleted: [],
};

function ownershipError(message: string): Error {
  return new Error(`CANDIDATE_STATE_OWNERSHIP: ${message}`);
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function isSafeRelativePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes('\0')) return false;
  const normalized = portable(path);
  return normalized !== '..'
    && !normalized.startsWith('../')
    && !normalized.includes('/../')
    && !normalized.startsWith('/');
}

function assertCandidateId(candidateId: string): void {
  if (!candidateIdPattern.test(candidateId)) {
    throw ownershipError('candidate ID is malformed.');
  }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw ownershipError(`${field} must be a positive integer.`);
  }
}

function assertCandidateEntry(
  entry: CandidateRegistryEntry,
  repositoryId: string,
): void {
  if (entry.schemaVersion !== 1) throw ownershipError('candidate schema version is invalid.');
  assertCandidateId(entry.candidateId);
  if (!changeIdPattern.test(entry.changeId)) throw ownershipError('candidate CHANGE ID is malformed.');
  assertPositiveInteger(entry.generation, 'candidate generation');
  if (entry.repositoryId !== repositoryId) {
    throw ownershipError('candidate repository owner does not match the registry.');
  }
  assertPositiveInteger(entry.creationEpoch, 'candidate creation epoch');
  if (!commitPattern.test(entry.baseCommit) || !commitPattern.test(entry.candidateCommit)) {
    throw ownershipError('candidate commit binding is malformed.');
  }
  if (!entry.branch || entry.branch.includes('\0')) throw ownershipError('candidate branch is malformed.');
  if (!isSafeRelativePath(entry.worktreePath)) {
    throw ownershipError('candidate worktree path must be relative and normalized.');
  }
  if (!Object.hasOwn(transitions, entry.state)) throw ownershipError('candidate lifecycle state is invalid.');
  assertPositiveInteger(entry.preparedOrder, 'candidate prepared order');
  assertPositiveInteger(entry.activeOrder, 'candidate active order');
  if (!Array.isArray(entry.dependencyIds)
    || entry.dependencyIds.some((candidateId) => !candidateIdPattern.test(candidateId))) {
    throw ownershipError('candidate dependencies are invalid.');
  }
  if (entry.manifestDigest !== undefined && !/^[a-f0-9]{64}$/.test(entry.manifestDigest)) {
    throw ownershipError('candidate manifest digest is malformed.');
  }
  if (entry.deletedOrder !== undefined) assertPositiveInteger(entry.deletedOrder, 'candidate deleted order');
  if (entry.readinessBindings !== undefined) {
    for (const key of ['approvals', 'tdd', 'quality', 'workspace', 'snapshot', 'gate'] as const) {
      if (typeof entry.readinessBindings[key] !== 'string' || !entry.readinessBindings[key]) {
        throw ownershipError('candidate readiness bindings are invalid.');
      }
    }
  }
}

function assertIntegrationEntry(
  entry: CandidateIntegrationEntry,
  repositoryId: string,
): void {
  if (entry.schemaVersion !== 1 || !integrationIdPattern.test(entry.integrationId)) {
    throw ownershipError('integration identity is malformed.');
  }
  if (entry.repositoryId !== repositoryId) {
    throw ownershipError('integration repository owner does not match the registry.');
  }
  if (!isSafeRelativePath(entry.worktreePath)) {
    throw ownershipError('integration worktree path must be relative and normalized.');
  }
  if (!Array.isArray(entry.changeIds)
    || entry.changeIds.some((changeId) => !changeIdPattern.test(changeId))
    || new Set(entry.changeIds).size !== entry.changeIds.length) {
    throw ownershipError('integration CHANGE owners are invalid.');
  }
  if (!Array.isArray(entry.candidateIds)
    || entry.candidateIds.some((candidateId) => !candidateIdPattern.test(candidateId))
    || new Set(entry.candidateIds).size !== entry.candidateIds.length) {
    throw ownershipError('integration candidate owners are invalid.');
  }
}

export function validateCandidateRegistry(value: unknown): CandidateRegistry {
  if (!value || typeof value !== 'object') throw ownershipError('candidate registry is invalid.');
  const registry = value as CandidateRegistry;
  if (registry.schemaVersion !== 1
    || !repositoryIdPattern.test(registry.repositoryId)
    || !Array.isArray(registry.candidates)
    || !Array.isArray(registry.integrations)) {
    throw ownershipError('candidate registry is invalid.');
  }

  const candidateIds = new Set<string>();
  const liveOwners = new Set<string>();
  const worktreePaths = new Set<string>();
  for (const candidate of registry.candidates) {
    assertCandidateEntry(candidate, registry.repositoryId);
    if (candidateIds.has(candidate.candidateId)) {
      throw ownershipError('candidate identity is duplicated.');
    }
    candidateIds.add(candidate.candidateId);
    const worktreeKey = portable(candidate.worktreePath);
    if (worktreePaths.has(worktreeKey)) throw ownershipError('candidate worktree path is aliased.');
    worktreePaths.add(worktreeKey);
    if (candidate.state !== 'deleted') {
      const ownerKey = `${candidate.repositoryId}\0${candidate.changeId}\0${candidate.generation}`;
      if (liveOwners.has(ownerKey)) throw ownershipError('candidate generation has multiple live owners.');
      liveOwners.add(ownerKey);
    }
  }

  const integrationIds = new Set<string>();
  for (const integration of registry.integrations) {
    assertIntegrationEntry(integration, registry.repositoryId);
    if (integrationIds.has(integration.integrationId)) {
      throw ownershipError('integration identity is duplicated.');
    }
    integrationIds.add(integration.integrationId);
    const worktreeKey = portable(integration.worktreePath);
    if (worktreePaths.has(worktreeKey)) throw ownershipError('managed worktree path is aliased.');
    worktreePaths.add(worktreeKey);
  }
  return registry;
}

export function candidateStateRoot(controlRoot: string, candidateId: string): string {
  assertCandidateId(candidateId);
  const base = resolve(controlRoot, '.musubix', 'candidates');
  const destination = resolve(base, candidateId);
  if (relative(base, destination).startsWith('..')) {
    throw ownershipError('candidate state path escapes its partition.');
  }
  return destination;
}

export function candidateEvidenceRoot(controlRoot: string, candidateId: string): string {
  return resolve(candidateStateRoot(controlRoot, candidateId), 'evidence');
}

export function candidateReportRoot(controlRoot: string, candidateId: string): string {
  return resolve(candidateStateRoot(controlRoot, candidateId), 'reports');
}

export function routeCandidateState(
  controlRoot: string,
  sourceRoot: string,
  candidate: CandidateRegistryEntry,
): RoutedCandidateState {
  assertCandidateEntry(candidate, candidate.repositoryId);
  return {
    kind: 'candidate',
    sourceRoot: resolve(sourceRoot),
    controlRoot: resolve(controlRoot),
    projectionRoot: candidateStateRoot(controlRoot, candidate.candidateId),
    binding: {
      candidateId: candidate.candidateId,
      changeId: candidate.changeId,
      generation: candidate.generation,
      repositoryId: candidate.repositoryId,
      baseCommit: candidate.baseCommit,
      candidateCommit: candidate.candidateCommit,
    },
  };
}

export function integrationStateRoot(controlRoot: string, integrationId: string): string {
  if (!integrationIdPattern.test(integrationId)) {
    throw ownershipError('integration ID is malformed.');
  }
  return resolve(controlRoot, '.musubix', 'candidates', 'integrations', integrationId);
}

export function isOperationalStatePath(path: string): boolean {
  const normalized = portable(path).replace(/^\.\/+/, '').replace(/\/+$/, '');
  return operationalStatePaths.some((prefix) =>
    normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/** @id CODE-M5-CANDIDATE-OWNERSHIP-PATHS-001
 * @implements REQ-M5-MULTI-CHANGE-004
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-006
 */
export function candidateOwnedSourcePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map((path) => portable(path).replace(/^\.\/+/, '')))]
    .filter((path) => path !== '' && !isOperationalStatePath(path))
    .sort((left, right) => left.localeCompare(right));
}

export function assertCandidateOwnedPath(
  controlRoot: string,
  candidateId: string,
  path: string,
): void {
  const ownerRoot = candidateStateRoot(controlRoot, candidateId);
  const destination = resolve(path);
  const relation = relative(ownerRoot, destination);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw ownershipError('path belongs to another candidate partition.');
  }
}

export function assertCandidateBinding(
  expected: CandidateBinding,
  actual: CandidateBinding,
): void {
  const fields: Array<keyof CandidateBinding> = [
    'candidateId',
    'changeId',
    'generation',
    'repositoryId',
    'baseCommit',
    'candidateCommit',
  ];
  const mismatch = fields.find((field) => expected[field] !== actual[field]);
  if (mismatch) throw ownershipError(`candidate ${mismatch} binding does not match.`);
}

export async function readCandidateRegistry(root: string): Promise<CandidateRegistry | null> {
  try {
    const source = await readFile(resolve(root, registryRelativePath), 'utf8');
    return validateCandidateRegistry(JSON.parse(source));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (cause instanceof SyntaxError) throw ownershipError('candidate registry is not valid JSON.');
    throw cause;
  }
}

function sortedRegistry(registry: CandidateRegistry): CandidateRegistry {
  return {
    schemaVersion: 1,
    repositoryId: registry.repositoryId,
    candidates: [...registry.candidates].sort((left, right) =>
      left.changeId.localeCompare(right.changeId)
      || left.generation - right.generation
      || left.creationEpoch - right.creationEpoch
      || left.candidateId.localeCompare(right.candidateId)),
    integrations: [...registry.integrations].sort((left, right) =>
      left.integrationId.localeCompare(right.integrationId)),
  };
}

export async function replaceCandidateRegistry(
  root: string,
  registry: CandidateRegistry,
): Promise<void> {
  validateCandidateRegistry(registry);
  const path = resolve(root, registryRelativePath);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(canonicalBytes(sortedRegistry(registry)));
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

export async function listCandidates(root: string): Promise<CandidateRegistryEntry[]> {
  return [...(await readCandidateRegistry(root))?.candidates ?? []];
}

export async function loadCandidate(
  root: string,
  selector: string,
): Promise<CandidateRegistryEntry> {
  if (!candidateIdPattern.test(selector) && !changeIdPattern.test(selector)) {
    throw new Error('CLI_ERROR: candidate selector must be CHANGE-<digits> or candidate:<sha256>.');
  }
  const candidates = (await listCandidates(root)).filter((candidate) =>
    candidate.state !== 'deleted'
    && (candidate.candidateId === selector || candidate.changeId === selector));
  if (candidates.length === 0) {
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  if (candidates.length !== 1) {
    throw ownershipError('candidate selector is ambiguous.');
  }
  return candidates[0]!;
}

function candidateWorktreeRoot(
  controlRoot: string,
  candidate: CandidateRegistryEntry,
  managedRoot?: string,
): string {
  return resolve(managedRoot ?? controlRoot, candidate.worktreePath);
}

function pathContains(parent: string, child: string): boolean {
  const relation = relative(resolve(parent), resolve(child));
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

/** @id CODE-M5-CANDIDATE-CONTEXT-E2E-001
 * @implements REQ-M5-MULTI-CHANGE-002
 * @design DES-M5-MULTI-CHANGE-001
 */
export async function resolveCandidateExecutionContext(
  controlRoot: string,
  options: CandidateExecutionContextOptions,
): Promise<RoutedCandidateState> {
  if (!repositoryIdPattern.test(options.repositoryId)
    || !Number.isInteger(options.activeGeneration)
    || options.activeGeneration < 1) {
    throw new Error('CLI_ERROR: candidate repository identity and generation are required.');
  }
  if (options.selector !== undefined
    && !candidateIdPattern.test(options.selector)
    && !changeIdPattern.test(options.selector)) {
    throw new Error('CLI_ERROR: candidate selector must be CHANGE-<digits> or candidate:<sha256>.');
  }
  if (options.changeId !== undefined && !changeIdPattern.test(options.changeId)) {
    throw new Error('CLI_ERROR: change-id must match CHANGE-<digits>.');
  }
  const registry = await readCandidateRegistry(controlRoot);
  const live = registry?.candidates.filter((candidate) => candidate.state !== 'deleted') ?? [];
  const cwdMatches = options.cwd === undefined
    ? []
    : live.filter((candidate) =>
      pathContains(candidateWorktreeRoot(controlRoot, candidate, options.managedRoot), options.cwd!));
  if (cwdMatches.length > 1) throw ownershipError('candidate workspace paths overlap.');
  const cwdCandidate = cwdMatches[0];
  const explicitSelector = options.selector ?? options.changeId;
  const selectorMatches = explicitSelector === undefined
    ? []
    : live.filter((candidate) =>
      candidate.candidateId === explicitSelector || candidate.changeId === explicitSelector);
  if (explicitSelector !== undefined && selectorMatches.length === 0) {
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  if (selectorMatches.length > 1) throw ownershipError('candidate selector is ambiguous.');
  const selected = selectorMatches[0] ?? cwdCandidate;
  if (!selected) {
    if (live.length > 1) {
      throw new Error('CHANGE_GENERATION_MIXED: more than one CHANGE has an active candidate.');
    }
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  if (cwdCandidate && cwdCandidate.candidateId !== selected.candidateId) {
    throw new Error(
      'CANDIDATE_WORKSPACE_SELECTOR_MISMATCH: current workspace and explicit selector identify different candidates.',
    );
  }
  if (options.changeId !== undefined && selected.changeId !== options.changeId) {
    throw new Error(
      'CANDIDATE_WORKSPACE_SELECTOR_MISMATCH: candidate workspace belongs to another CHANGE.',
    );
  }
  if (selected.repositoryId !== options.repositoryId || registry?.repositoryId !== options.repositoryId) {
    throw new Error(
      'CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: candidate workspace belongs to another repository.',
    );
  }
  if (selected.generation !== options.activeGeneration) {
    throw new Error(
      'CANDIDATE_WORKSPACE_GENERATION_MISMATCH: candidate workspace belongs to another generation.',
    );
  }
  return routeCandidateState(
    controlRoot,
    candidateWorktreeRoot(controlRoot, selected, options.managedRoot),
    selected,
  );
}

export async function registerCandidate(
  root: string,
  input: CandidateRegistryEntry,
): Promise<CandidateRegistrationResult> {
  const registry = await readCandidateRegistry(root) ?? {
    schemaVersion: 1,
    repositoryId: input.repositoryId,
    candidates: [],
    integrations: [],
  };
  if (registry.repositoryId !== input.repositoryId) {
    throw new Error(
      'CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: registry belongs to another repository.',
    );
  }
  const identityMatch = registry.candidates.find((candidate) =>
    candidate.candidateId === input.candidateId);
  if (identityMatch) {
    assertCandidateBinding(identityMatch, input);
    if (canonicalBytes(identityMatch).equals(canonicalBytes(input))) {
      return { candidate: identityMatch, replayed: true };
    }
    throw ownershipError('candidate identity was reused with divergent state.');
  }
  const ownerMatch = registry.candidates.find((candidate) =>
    candidate.state !== 'deleted'
    && candidate.changeId === input.changeId
    && candidate.generation === input.generation);
  if (ownerMatch) {
    throw ownershipError('candidate generation already has a live owner.');
  }
  await replaceCandidateRegistry(root, {
    ...registry,
    candidates: [...registry.candidates, input],
  });
  return { candidate: input, replayed: false };
}

export async function transitionCandidate(
  root: string,
  candidateId: string,
  state: CandidateLifecycleState,
  options: CandidateTransitionOptions = {},
): Promise<CandidateRegistryEntry> {
  const registry = await readCandidateRegistry(root);
  if (!registry) {
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  const index = registry.candidates.findIndex((candidate) => candidate.candidateId === candidateId);
  const current = registry.candidates[index];
  if (!current) {
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  assertCandidateTransition(current.state, state, options);
  const updated: CandidateRegistryEntry = { ...current, state };
  const candidates = [...registry.candidates];
  candidates[index] = updated;
  await replaceCandidateRegistry(root, { ...registry, candidates });
  return updated;
}

function readinessState(
  candidate: CandidateRegistryEntry,
  checks: Record<keyof CandidateReadinessBindings, CandidateCheckResult>,
): CandidateLifecycleState {
  if (Object.values(checks).some((check) => check.status === 'failed')) return 'failed';
  if (Object.values(checks).some((check) => check.status === 'base-drift')) return 'stale';
  if (Object.values(checks).some((check) => check.status === 'drift')) {
    return candidate.state === 'ready' ? 'active' : candidate.state;
  }
  return 'ready';
}

/** @id CODE-M5-CANDIDATE-READINESS-001
 * @implements REQ-M5-MULTI-CHANGE-007
 * @design DES-M5-MULTI-CHANGE-007
 */
export async function markCandidateReady(
  root: string,
  selector: string,
  adapter: CandidateReadinessAdapter,
): Promise<{
  candidate: CandidateRegistryEntry;
  bindings: CandidateReadinessBindings;
  checks: Record<keyof CandidateReadinessBindings, CandidateCheckResult>;
}> {
  const candidate = await loadCandidate(root, selector);
  if (candidate.state === 'stale') {
    throw new Error('CANDIDATE_BASE_STALE: stale candidate must be refreshed before readiness.');
  }
  if (['abandoned', 'deleted', 'integrating', 'verified', 'integrated'].includes(candidate.state)) {
    throw new Error(
      candidate.state === 'abandoned'
        ? 'CHANGE_GENERATION_PHASE: abandoned candidate cannot produce readiness evidence.'
        : 'CANDIDATE_INTEGRATION_CONFLICT: candidate cannot be marked ready in its current state.',
    );
  }
  const checks = {
    approvals: await adapter.approvals(candidate),
    tdd: await adapter.tdd(candidate),
    quality: await adapter.quality(candidate),
    workspace: await adapter.workspace(candidate),
    snapshot: await adapter.snapshot(candidate),
    gate: await adapter.gate(candidate),
  };
  for (const check of Object.values(checks)) {
    if (!['current', 'drift', 'base-drift', 'failed'].includes(check.status)
      || typeof check.fingerprint !== 'string'
      || !check.fingerprint) {
      throw new Error('CANDIDATE_EVIDENCE_MISMATCH: readiness adapter returned invalid evidence.');
    }
  }
  const bindings = Object.fromEntries(
    Object.entries(checks).map(([key, check]) => [key, check.fingerprint]),
  ) as CandidateReadinessBindings;
  const nextState = readinessState(candidate, checks);
  const registry = await readCandidateRegistry(root);
  if (!registry) throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  const index = registry.candidates.findIndex((entry) => entry.candidateId === candidate.candidateId);
  const updated: CandidateRegistryEntry = {
    ...candidate,
    state: nextState,
    ...(nextState === 'ready' ? { readinessBindings: bindings } : {}),
  };
  if (candidate.state === 'failed' && nextState === 'ready') {
    await adapter.recordTransition?.({
      candidate,
      state: 'active',
      bindings,
      checks,
    });
  }
  await adapter.recordTransition?.({
    candidate: candidate.state === 'failed' && nextState === 'ready'
      ? { ...candidate, state: 'active' }
      : candidate,
    state: nextState,
    bindings,
    checks,
  });
  const candidates = [...registry.candidates];
  candidates[index] = updated;
  await replaceCandidateRegistry(root, { ...registry, candidates });
  return { candidate: updated, bindings, checks };
}

export async function resumeCandidate(
  root: string,
  selector: string,
): Promise<CandidateRegistryEntry> {
  return loadCandidate(root, selector);
}

async function git(
  root: string,
  args: string[],
  options: { allowFailure?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      ...(options.env === undefined ? {} : { env: options.env }),
    });
    return stdout.trim();
  } catch (cause) {
    if (options.allowFailure) return '';
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`CANDIDATE_GIT_FAILED: git ${args.join(' ')}: ${message}`, { cause });
  }
}

async function gitSucceeds(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      ...(env === undefined ? {} : { env }),
    });
    return true;
  } catch {
    return false;
  }
}

async function gitRaw(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
    });
    return stdout;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`CANDIDATE_GIT_FAILED: git ${args.join(' ')}: ${message}`, { cause });
  }
}

async function assertCleanCandidateWorktree(worktree: string): Promise<void> {
  if (await git(worktree, ['status', '--porcelain=v1', '--untracked-files=all'])) {
    throw new Error('CANDIDATE_CLEANUP_UNSAFE: candidate worktree is dirty or has untracked paths.');
  }
  if (await git(worktree, ['ls-files', '-u'])) {
    throw new Error('CANDIDATE_CLEANUP_UNSAFE: candidate worktree has unresolved conflicts.');
  }
}

async function persistCandidate(
  root: string,
  candidate: CandidateRegistryEntry,
): Promise<void> {
  const registry = await readCandidateRegistry(root);
  if (!registry) throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  const index = registry.candidates.findIndex((entry) => entry.candidateId === candidate.candidateId);
  if (index < 0) throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  const candidates = [...registry.candidates];
  candidates[index] = candidate;
  await replaceCandidateRegistry(root, { ...registry, candidates });
}

/** @id CODE-M5-CANDIDATE-REFRESH-001
 * @implements REQ-M5-MULTI-CHANGE-007
 * @design DES-M5-MULTI-CHANGE-004
 */
export async function refreshCandidate(
  root: string,
  selector: string,
  options: CandidateRefreshOptions,
): Promise<{ candidate: CandidateRegistryEntry; previousCommit: string }> {
  const candidate = await loadCandidate(root, selector);
  if (['integrating', 'verified', 'integrated', 'abandoned'].includes(candidate.state)) {
    throw new Error('CANDIDATE_INTEGRATION_CONFLICT: candidate cannot be refreshed in its current state.');
  }
  if (!commitPattern.test(options.defaultCommit)) {
    throw new Error('CLI_ERROR: default commit must be a full lowercase Git object ID.');
  }
  if (await options.hasLiveSnapshot(candidate)) {
    throw new Error(
      'CANDIDATE_SNAPSHOT_CONFLICT: delete the live candidate snapshot before refresh.',
    );
  }
  const worktree = candidateWorktreeRoot(root, candidate, options.managedRoot);
  await assertCleanCandidateWorktree(worktree);
  const head = await git(worktree, ['rev-parse', 'HEAD^{commit}']);
  if (head !== candidate.candidateCommit) {
    throw new Error('CANDIDATE_COMMIT_UNREACHABLE: candidate worktree HEAD moved.');
  }
  if (!await gitSucceeds(worktree, ['cat-file', '-e', `${options.defaultCommit}^{commit}`])) {
    throw new Error('CANDIDATE_COMMIT_UNREACHABLE: default commit is unavailable.');
  }

  const nonce = randomUUID();
  const patchPath = resolve(worktree, `.musubix5-refresh-${nonce}.patch`);
  const indexPath = resolve(worktree, `.musubix5-refresh-${nonce}.index`);
  const pathspec = [
    '.',
    ':(exclude).musubix/evidence/**',
    ':(exclude).musubix/journal/**',
    ':(exclude).musubix/candidates/**',
  ];
  try {
    const patch = await gitRaw(worktree, [
      'diff',
      '--binary',
      '--full-index',
      candidate.baseCommit,
      candidate.candidateCommit,
      '--',
      ...pathspec,
    ]);
    await writeFile(patchPath, patch);
    const environment = { ...process.env, GIT_INDEX_FILE: indexPath };
    await git(worktree, ['read-tree', options.defaultCommit], { env: environment });
    if (patch) {
      try {
        await git(worktree, ['apply', '--cached', '--check', patchPath], { env: environment });
      } catch {
        throw new Error(
          'CANDIDATE_INTEGRATION_CONFLICT: candidate diff does not apply to the new default commit.',
        );
      }
    }
    await rm(indexPath, { force: true });
    await rm(patchPath, { force: true });

    await git(worktree, ['reset', '--hard', options.defaultCommit]);
    if (patch) {
      await writeFile(patchPath, patch);
      try {
        await git(worktree, ['apply', '--index', patchPath]);
      } catch {
        await git(worktree, ['reset', '--hard', candidate.candidateCommit]);
        throw new Error(
          'CANDIDATE_INTEGRATION_CONFLICT: candidate refresh failed without changing history.',
        );
      }
      await git(worktree, ['commit', '-m', `musubix5: refresh ${candidate.changeId}`]);
    }
    const candidateCommit = await git(worktree, ['rev-parse', 'HEAD^{commit}']);
    const updated: CandidateRegistryEntry = {
      ...candidate,
      baseCommit: options.defaultCommit,
      candidateCommit,
      state: 'active',
    };
    delete updated.readinessBindings;
    try {
      await options.invalidateEvidence({
        candidate,
        previousCommit: candidate.candidateCommit,
        candidateCommit,
      });
      await options.recordTransition?.({
        candidate,
        previousCommit: candidate.candidateCommit,
        candidateCommit,
        defaultCommit: options.defaultCommit,
      });
      await persistCandidate(root, updated);
    } catch (cause) {
      await git(worktree, ['reset', '--hard', candidate.candidateCommit]);
      throw cause;
    }
    return { candidate: updated, previousCommit: candidate.candidateCommit };
  } finally {
    await rm(patchPath, { force: true });
    await rm(indexPath, { force: true });
  }
}

/** @id CODE-M5-CANDIDATE-CLEANUP-001
 * @implements REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-007
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-004
 */
export async function cleanupCandidate(
  root: string,
  selector: string,
  options: CandidateCleanupOptions,
): Promise<{ candidateId: string; state: 'deleted'; tombstoneOrder: number }> {
  if (!options.confirm || !options.deletedBy.trim()) {
    throw new Error('CLI_ERROR: candidate cleanup requires --deleted-by and --confirm.');
  }
  if (!commitPattern.test(options.defaultCommit)) {
    throw new Error('CLI_ERROR: default commit must be a full lowercase Git object ID.');
  }
  const candidate = await loadCandidate(root, selector);
  if (await options.hasLiveLease(candidate)
    || ['integrating', 'verified'].includes(candidate.state)) {
    throw new Error('CANDIDATE_CLEANUP_UNSAFE: candidate has an active operation.');
  }
  const worktree = candidateWorktreeRoot(root, candidate, options.managedRoot);
  await assertCleanCandidateWorktree(worktree);
  const head = await git(worktree, ['rev-parse', 'HEAD^{commit}']);
  if (head !== candidate.candidateCommit) {
    throw new Error('CANDIDATE_CLEANUP_UNSAFE: candidate worktree HEAD moved.');
  }
  const integrated = await gitSucceeds(
    worktree,
    ['merge-base', '--is-ancestor', candidate.candidateCommit, options.defaultCommit],
  );
  if (!integrated) {
    throw new Error('CANDIDATE_CLEANUP_UNSAFE: candidate has unintegrated commits.');
  }
  const tombstoneOrder = await options.appendTombstone({
    candidate,
    deletedBy: options.deletedBy,
  });
  assertPositiveInteger(tombstoneOrder, 'candidate tombstone order');
  await git(root, ['worktree', 'remove', worktree]);
  await persistCandidate(root, {
    ...candidate,
    state: 'deleted',
    deletedOrder: tombstoneOrder,
  });
  return { candidateId: candidate.candidateId, state: 'deleted', tombstoneOrder };
}

export async function controlStateRoot(sourceRoot: string): Promise<string> {
  const { stdout: commonOutput } = await execFileAsync(
    'git',
    ['-C', sourceRoot, 'rev-parse', '--git-common-dir'],
    { encoding: 'utf8' },
  );
  const commonDirectory = resolve(sourceRoot, commonOutput.trim());
  const { stdout } = await execFileAsync(
    'git',
    ['-C', sourceRoot, 'worktree', 'list', '--porcelain'],
    { encoding: 'utf8' },
  );
  const roots = stdout.split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).find((line) => line.startsWith('worktree '))?.slice(9))
    .filter((path): path is string => Boolean(path));
  for (const root of roots) {
    try {
      const { stdout: candidateCommonOutput } = await execFileAsync(
        'git',
        ['-C', root, 'rev-parse', '--git-common-dir'],
        { encoding: 'utf8' },
      );
      if (resolve(root, candidateCommonOutput.trim()) !== commonDirectory) continue;
      if (await readCandidateRegistry(root)) return resolve(root);
    } catch {
      continue;
    }
  }
  return resolve(roots[0] ?? sourceRoot);
}

export async function assertNoSymlinkAliases(root: string, relativePath: string): Promise<void> {
  if (!isSafeRelativePath(relativePath)) {
    throw ownershipError('managed worktree path must be relative and normalized.');
  }
  const destination = resolve(root, relativePath);
  const relation = relative(resolve(root), destination);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw ownershipError('managed worktree path escapes its root.');
  }
  let current = resolve(root);
  for (const segment of relation.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw ownershipError('managed worktree path contains a symlink alias.');
      }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw cause;
    }
  }
}

export function assertCandidateTransition(
  from: CandidateLifecycleState,
  to: CandidateLifecycleState,
  options: CandidateTransitionOptions = {},
): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`CANDIDATE_LIFECYCLE_INVALID: cannot transition ${from} to ${to}.`);
  }
  if (from === 'stale' && to === 'active' && options.refreshed !== true) {
    throw new Error('CANDIDATE_LIFECYCLE_INVALID: stale candidates require a successful refresh.');
  }
  if (from === 'integrating' && to === 'integrating' && options.integrationResume !== true) {
    throw new Error('CANDIDATE_LIFECYCLE_INVALID: integrating replay requires the same integration.');
  }
}

export async function withCandidateLeases<Lease, Result>(
  changeIds: readonly string[],
  adapter: CandidateLeaseAdapter<Lease>,
  operation: (leases: readonly Lease[]) => Promise<Result>,
): Promise<Result> {
  const ordered = [...new Set(changeIds)].sort((left, right) => left.localeCompare(right));
  if (ordered.length === 0 || ordered.some((changeId) => !changeIdPattern.test(changeId))) {
    throw new Error('CLI_ERROR: candidate writes require valid CHANGE IDs.');
  }
  const leases: Lease[] = [];
  try {
    for (const changeId of ordered) {
      const lease = await adapter.acquire(changeId);
      if (lease === null) throw new Error('CANDIDATE_LEASE_BUSY: CHANGE lease is busy.');
      leases.push(lease);
    }
    for (const lease of leases) await adapter.assertCurrent(lease);
    const result = await operation(leases);
    for (const lease of leases) await adapter.assertCurrent(lease);
    return result;
  } finally {
    for (const lease of [...leases].reverse()) await adapter.release(lease);
  }
}

export async function withCandidateWrite<Result>(
  root: string,
  candidate: Pick<CandidateBinding, 'changeId'>,
  operation: (lease: ChangeLease) => Promise<Result>,
): Promise<Result> {
  const adapter: CandidateLeaseAdapter<ChangeLease> = {
    acquire: async (changeId) => {
      try {
        return await acquireChangeLease(root, changeId);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (message.includes('Timed out') || message.includes('lease')) return null;
        throw cause;
      }
    },
    assertCurrent: assertChangeLeaseCurrent,
    release: releaseChangeLease,
  };
  return withCandidateLeases([candidate.changeId], adapter, async ([lease]) => operation(lease!));
}

export async function withMultiChangeWrite<Result>(
  root: string,
  changeIds: readonly string[],
  operation: (leases: readonly ChangeLease[]) => Promise<Result>,
): Promise<Result> {
  const adapter: CandidateLeaseAdapter<ChangeLease> = {
    acquire: async (changeId) => {
      try {
        return await acquireChangeLease(root, changeId);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (message.includes('Timed out') || message.includes('lease')) return null;
        throw cause;
      }
    },
    assertCurrent: assertChangeLeaseCurrent,
    release: releaseChangeLease,
  };
  return withCandidateLeases(changeIds, adapter, operation);
}

/** @id CODE-M5-CANDIDATE-STATE-001
 * @implements REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-004 REQ-M5-LIFECYCLE-005
 * @implements REQ-M5-WORKTREE-005 REQ-M5-WORKTREE-006 REQ-M5-WORKTREE-007
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-004
 */
export function candidateStateImplementationTrace(): true {
  return true;
}
