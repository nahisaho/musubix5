import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
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
