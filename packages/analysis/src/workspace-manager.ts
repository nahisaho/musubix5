import { execFile } from 'node:child_process';
import { lstat, mkdir, open, readFile, readlink, rename } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, canonicalRepositoryIdentity, sha256 } from './canonical.js';
import { resolveChangeContext, type ChangeContextSelection } from './change-generation.js';
import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  releaseChangeLease,
  verifyJournal,
  type JournalRecord,
} from './journal.js';

const execFileAsync = promisify(execFile);
const generatedStatePrefixes = [
  '.musubix/candidates/',
  '.musubix/evidence/',
  '.musubix/journal/',
];
const candidateRegistryPath = '.musubix/candidates/registry.json';

export interface DirtyPathState {
  status: string;
  exists: boolean;
  mode: number | null;
  contentSha256: string | null;
  indexEntry: string;
}

export interface DirtyState {
  sha256: string;
  paths: Record<string, DirtyPathState>;
}

export interface BaselineWorkspace {
  changeId: string;
  repositoryId: string;
  commitSha: string;
  dirtyStateSha256: string;
  order: number;
}

export interface CandidateWorkspace extends BaselineWorkspace {
  workspaceKind: 'candidate';
  path: string;
  branch: string;
  candidateId: string;
}

export interface RegisteredCandidateWorkspace {
  schemaVersion: 1;
  candidateId: string;
  changeId: string;
  generation: number;
  repositoryId: string;
  creationEpoch: number;
  baseCommit: string;
  candidateCommit: string;
  branch: string;
  worktreePath: string;
  state: 'active';
  preparedOrder: number;
  activeOrder: number;
}

export interface RegisteredCandidateWorkspaceResult extends RegisteredCandidateWorkspace {
  replayed: boolean;
}

interface CandidateWorkspaceRegistry {
  schemaVersion: 1;
  repositoryId: string;
  candidates: RegisteredCandidateWorkspace[];
}

export interface QaWorkspace {
  changeId: string;
  workspaceKind: 'qa';
  path: string;
  candidateId: string;
  candidateCommit: string;
  order: number;
}

export interface CandidateSnapshot {
  snapshotId: string;
  changeId: string;
  generation: number | null;
  repositoryId: string;
  branch: string;
  commit: string;
  artifactManifestDigest: string | null;
  createdAt: string | null;
  order: number;
  journalPath: string;
  replayed: boolean;
  guidance: string;
}

export interface CandidateSnapshotEvaluators {
  requireApprovals(root: string, context: ChangeContextSelection): Promise<void>;
  requireQuality(root: string, context: ChangeContextSelection): Promise<void>;
}

export interface CandidateSnapshotStructuralProjection {
  snapshotId: string;
  recordVersion: 0 | 1;
  legacy: boolean;
  changeId: string;
  generation: number | null;
  repositoryId: string;
  branch: string;
  commit: string;
  artifactManifestDigest: string | null;
  createdAt: string | null;
  order: number;
  journalPath: string;
  deleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  commitStatus: 'reachable' | 'unreachable';
  repositoryStatus: 'match' | 'foreign';
  conflicting: boolean;
}

export interface CandidateSnapshotDeleteEvaluation {
  protected: boolean;
  releaseApprovalStatus: 'current' | 'missing' | 'stale' | 'not-current';
  releaseApprovalArtifactSha256: string | null;
  invalidatedStates: string[];
}

export interface CandidateSnapshotDeleteEvaluators {
  evaluateProtection(
    root: string,
    snapshot: CandidateSnapshotStructuralProjection,
  ): Promise<CandidateSnapshotDeleteEvaluation>;
}

export interface CandidateSnapshotDeleteResult {
  snapshotId: string;
  changeId: string;
  commit: string;
  artifactManifestDigest: string | null;
  deletedBy: string;
  deletedAt: string;
  releaseApprovalStatus: CandidateSnapshotDeleteEvaluation['releaseApprovalStatus'];
  releaseApprovalArtifactSha256: string | null;
  tombstoneOrder: number;
  tombstonePath: string;
  replayed: boolean;
  invalidatedStates: string[];
  guidance: string;
}

export interface CandidateGitEntry {
  rawPath: Buffer;
  nfcPath: string;
  objectId: string;
  gitMode: string;
  objectType: string;
}

export interface CandidateTreeManifestEntry {
  path: string;
  gitMode: string;
  objectType: string;
  objectId: string;
}

export interface CandidateTreeManifest {
  entries: CandidateTreeManifestEntry[];
  artifactManifestDigest: string;
}

async function git(root: string, args: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (cause) {
    if (allowFailure) return '';
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`WORKSPACE_GIT_FAILED: git ${args.join(' ')}: ${message}`, { cause });
  }
}

async function gitRaw(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`WORKSPACE_GIT_FAILED: git ${args.join(' ')}: ${message}`, { cause });
  }
}

async function gitBuffer(root: string, args: string[]): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024,
    });
    return stdout;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`WORKSPACE_GIT_FAILED: git ${args.join(' ')}: ${message}`, { cause });
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw cause;
  }
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
  await rename(temporary, path);
}

async function gitCommonDirectory(root: string): Promise<string> {
  return resolve(root, await git(root, ['rev-parse', '--git-common-dir']));
}

async function loadCandidateWorkspaceRegistry(root: string): Promise<CandidateWorkspaceRegistry | null> {
  const path = resolve(root, candidateRegistryPath);
  if (!await pathExists(path)) return null;
  const registry = JSON.parse(await readFile(path, 'utf8')) as Partial<CandidateWorkspaceRegistry>;
  if (registry.schemaVersion !== 1
    || typeof registry.repositoryId !== 'string'
    || !Array.isArray(registry.candidates)
    || registry.candidates.some((candidate) =>
      candidate.schemaVersion !== 1
      || typeof candidate.candidateId !== 'string'
      || !/^candidate:[a-f0-9]{64}$/.test(candidate.candidateId)
      || !/^CHANGE-\d+$/.test(candidate.changeId)
      || !Number.isInteger(candidate.generation) || candidate.generation < 1
      || candidate.repositoryId !== registry.repositoryId
      || !Number.isInteger(candidate.creationEpoch) || candidate.creationEpoch < 1
      || !/^[a-f0-9]{40,64}$/.test(candidate.baseCommit)
      || !/^[a-f0-9]{40,64}$/.test(candidate.candidateCommit)
      || typeof candidate.branch !== 'string' || !candidate.branch
      || typeof candidate.worktreePath !== 'string' || !candidate.worktreePath
      || candidate.state !== 'active'
      || !Number.isInteger(candidate.preparedOrder) || candidate.preparedOrder < 1
      || !Number.isInteger(candidate.activeOrder) || candidate.activeOrder < 1)) {
    throw new Error('CANDIDATE_STATE_OWNERSHIP: candidate workspace registry is invalid.');
  }
  return registry as CandidateWorkspaceRegistry;
}

async function writeCandidateWorkspaceRegistry(
  root: string,
  registry: CandidateWorkspaceRegistry,
): Promise<void> {
  await writeCanonicalJson(resolve(root, candidateRegistryPath), {
    ...registry,
    candidates: [...registry.candidates].sort((left, right) =>
      left.changeId.localeCompare(right.changeId)
      || left.generation - right.generation
      || left.candidateId.localeCompare(right.candidateId)),
  });
}

async function repositoryIdentity(root: string): Promise<string> {
  const repositoryRoot = await git(root, ['rev-parse', '--show-toplevel']);
  const remotes = await git(root, ['config', '--get-all', 'remote.origin.url'], true);
  return canonicalRepositoryIdentity(remotes.split(/\r?\n/, 1)[0], repositoryRoot);
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

async function dirtyPathState(root: string, status: string, path: string): Promise<DirtyPathState> {
  const absolute = resolve(root, path);
  let exists = true;
  let mode: number | null = null;
  let contentSha256: string | null = null;
  try {
    const entry = await lstat(absolute);
    mode = entry.mode;
    contentSha256 = sha256(entry.isSymbolicLink()
      ? Buffer.from(await readlink(absolute))
      : await readFile(absolute));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    exists = false;
  }
  const indexEntry = await git(root, ['ls-files', '--stage', '--', path], true);
  return { status, exists, mode, contentSha256, indexEntry };
}

/** @id CODE-M5-WORKTREE-002
 * @implements REQ-M5-WORKTREE-002
 * @design DES-M5-012
 */
export async function captureDirtyState(root: string): Promise<DirtyState> {
  const output = await gitRaw(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const entries = output.split('\0');
  const statuses = new Map<string, string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = portable(entry.slice(3));
    if (!generatedStatePrefixes.some((prefix) => path.startsWith(prefix))) statuses.set(path, status);
    if (/[RC]/.test(status)) {
      const previous = portable(entries[++index] ?? '');
      if (previous && !generatedStatePrefixes.some((prefix) => previous.startsWith(prefix))) {
        statuses.set(previous, status);
      }
    }
  }
  const paths: Record<string, DirtyPathState> = {};
  for (const path of [...statuses.keys()].sort()) {
    paths[path] = await dirtyPathState(root, statuses.get(path)!, path);
  }
  return { sha256: sha256(canonicalBytes(paths)), paths };
}

/** @id CODE-M5-WORKTREE-004
 * @implements REQ-M5-WORKTREE-004
 * @design DES-M5-012
 */
export async function captureBaseline(root: string, changeId: string): Promise<BaselineWorkspace> {
  if (!/^CHANGE-\d+$/.test(changeId)) {
    throw new Error('WORKSPACE_CHANGE_ID_INVALID: changeId must match CHANGE-<digits>.');
  }
  const commitSha = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], true);
  if (!/^[a-f0-9]{40,64}$/i.test(commitSha)) {
    throw new Error('WORKSPACE_BASELINE_COMMIT_REQUIRED: candidate execution requires an immutable commit.');
  }
  const dirty = await captureDirtyState(root);
  const repositoryId = await repositoryIdentity(root);
  const record = await appendJournalRecord(root, {
    stream: 'normal',
    changeId,
    kind: 'workspace-baseline',
    idempotencyKey: `workspace:${changeId}:baseline:${commitSha}`,
    payload: {
      repositoryId,
      commitSha,
      dirtyStateSha256: dirty.sha256,
    },
  });
  return {
    changeId,
    repositoryId,
    commitSha,
    dirtyStateSha256: dirty.sha256,
    order: record.order,
  };
}

/** @id CODE-M5-WORKTREE-001
 * @implements REQ-M5-WORKTREE-001
 * @design DES-M5-012
 */
export async function createCandidateWorkspace(
  root: string,
  baseline: BaselineWorkspace,
): Promise<CandidateWorkspace> {
  const commonDirectory = await gitCommonDirectory(root);
  const relativePath = `musubix5/workspaces/${baseline.changeId}/candidate`;
  const path = resolve(commonDirectory, relativePath);
  const branch = `musubix5/${baseline.changeId}/candidate`;
  await mkdir(dirname(path), { recursive: true });
  if (await pathExists(path)) {
    const existingHead = await git(path, ['rev-parse', 'HEAD'], true);
    const existingBranch = await git(path, ['branch', '--show-current'], true);
    if (existingHead !== baseline.commitSha || existingBranch !== branch) {
      throw new Error('WORKSPACE_CANDIDATE_CONFLICT: existing candidate workspace has another identity.');
    }
  } else {
    const branchCommit = await git(root, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], true);
    if (branchCommit && branchCommit !== baseline.commitSha) {
      throw new Error('WORKSPACE_CANDIDATE_CONFLICT: candidate branch points to another baseline.');
    }
    await git(root, branchCommit
      ? ['worktree', 'add', '--quiet', path, branch]
      : ['worktree', 'add', '--quiet', '-b', branch, path, baseline.commitSha]);
  }
  const candidateId = `candidate:${baseline.commitSha}`;
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: baseline.changeId,
    kind: 'workspace-candidate',
    idempotencyKey: `workspace:${baseline.changeId}:candidate:${baseline.commitSha}`,
    payload: {
      repositoryId: baseline.repositoryId,
      baselineCommit: baseline.commitSha,
      candidateId,
      branch,
      workspacePath: relativePath,
    },
  });
  return {
    ...baseline,
    workspaceKind: 'candidate',
    path,
    branch,
    candidateId,
  };
}

/** @id CODE-M5-MULTI-CHANGE-CANDIDATE-001
 * @implements REQ-M5-MULTI-CHANGE-001 REQ-M5-MULTI-CHANGE-004
 * @design DES-M5-MULTI-CHANGE-002 DES-M5-MULTI-CHANGE-003 DES-M5-MULTI-CHANGE-004
 */
export async function createRegisteredCandidateWorkspace(
  root: string,
  changeId: string,
): Promise<RegisteredCandidateWorkspaceResult> {
  if (!/^CHANGE-\d+$/.test(changeId)) {
    throw new Error('CLI_ERROR: change-id must match CHANGE-<digits>.');
  }
  const context = await resolveChangeContext(root, { changeId });
  if (!context || context.generation === null) {
    throw new Error(`CHANGE_GENERATION_PHASE: CHANGE ${changeId} has no active generation.`);
  }
  const repositoryId = await repositoryIdentity(root);
  const existingRegistry = await loadCandidateWorkspaceRegistry(root);
  if (existingRegistry && existingRegistry.repositoryId !== repositoryId) {
    throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: registry belongs to another repository.');
  }
  const existing = existingRegistry?.candidates.find((candidate) =>
    candidate.changeId === changeId && candidate.generation === context.generation);
  if (existing) return { ...existing, replayed: true };

  const baseCommit = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], true);
  if (!/^[a-f0-9]{40,64}$/.test(baseCommit)) {
    throw new Error('CANDIDATE_COMMIT_UNREACHABLE: candidate creation requires an immutable HEAD.');
  }
  const creationEpoch = 1 + Math.max(0, ...(existingRegistry?.candidates
    .filter((candidate) => candidate.changeId === changeId)
    .map((candidate) => candidate.creationEpoch) ?? []));
  const candidateId = `candidate:${sha256(canonicalBytes({
    schemaVersion: 1,
    repositoryId,
    changeId,
    generation: context.generation,
    baseCommit,
    creationEpoch,
  }))}`;
  const suffix = candidateId.slice('candidate:'.length, 'candidate:'.length + 16);
  const branch = `musubix5/${changeId}/g${context.generation}/${suffix}`;
  const worktreePath = `musubix5/workspaces/${changeId}/g${context.generation}/${suffix}`;
  const absoluteWorktreePath = resolve(await gitCommonDirectory(root), worktreePath);
  const prepared = await appendJournalRecord(root, {
    stream: 'normal',
    changeId,
    kind: 'candidate-workspace-prepared',
    idempotencyKey: `candidate-workspace:${candidateId}:prepared`,
    payload: {
      schemaVersion: 1,
      candidateId,
      changeId,
      generation: context.generation,
      repositoryId,
      creationEpoch,
      baseCommit,
      branch,
      worktreePath,
      state: 'prepared',
    },
  });
  await mkdir(dirname(absoluteWorktreePath), { recursive: true });
  const branchCommit = await git(root, [
    'rev-parse',
    '--verify',
    `refs/heads/${branch}^{commit}`,
  ], true);
  if (await pathExists(absoluteWorktreePath)) {
    const existingHead = await git(absoluteWorktreePath, ['rev-parse', 'HEAD'], true);
    const existingBranch = await git(absoluteWorktreePath, ['branch', '--show-current'], true);
    if (existingHead !== baseCommit || existingBranch !== branch) {
      throw new Error(
        'CANDIDATE_STATE_OWNERSHIP: existing candidate worktree has another identity.',
      );
    }
  } else {
    if (branchCommit && branchCommit !== baseCommit) {
      throw new Error(
        'CANDIDATE_STATE_OWNERSHIP: existing candidate branch has another identity.',
      );
    }
    await git(root, branchCommit
      ? ['worktree', 'add', '--quiet', absoluteWorktreePath, branch]
      : ['worktree', 'add', '--quiet', '-b', branch, absoluteWorktreePath, baseCommit]);
  }
  const active = await appendJournalRecord(root, {
    stream: 'normal',
    changeId,
    kind: 'candidate-workspace-active',
    idempotencyKey: `candidate-workspace:${candidateId}:active`,
    payload: {
      schemaVersion: 1,
      candidateId,
      changeId,
      generation: context.generation,
      repositoryId,
      creationEpoch,
      baseCommit,
      candidateCommit: baseCommit,
      branch,
      worktreePath,
      state: 'active',
      preparedOrder: prepared.order,
    },
  });
  const candidate: RegisteredCandidateWorkspace = {
    schemaVersion: 1,
    candidateId,
    changeId,
    generation: context.generation,
    repositoryId,
    creationEpoch,
    baseCommit,
    candidateCommit: baseCommit,
    branch,
    worktreePath,
    state: 'active',
    preparedOrder: prepared.order,
    activeOrder: active.order,
  };
  await writeCandidateWorkspaceRegistry(root, {
    schemaVersion: 1,
    repositoryId,
    candidates: [...(existingRegistry?.candidates ?? []), candidate],
  });
  return { ...candidate, replayed: false };
}

export async function listRegisteredCandidateWorkspaces(
  root: string,
): Promise<RegisteredCandidateWorkspace[]> {
  const registry = await loadCandidateWorkspaceRegistry(root);
  if (!registry) return [];
  const repositoryId = await repositoryIdentity(root);
  if (registry.repositoryId !== repositoryId) {
    throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: registry belongs to another repository.');
  }
  return [...registry.candidates].sort((left, right) =>
    left.changeId.localeCompare(right.changeId)
    || left.generation - right.generation
    || left.candidateId.localeCompare(right.candidateId));
}

export async function showRegisteredCandidateWorkspace(
  root: string,
  selector: string,
): Promise<RegisteredCandidateWorkspace> {
  const candidates = await listRegisteredCandidateWorkspaces(root);
  const matches = candidates.filter((candidate) =>
    candidate.candidateId === selector || candidate.changeId === selector);
  if (matches.length !== 1) {
    throw new Error('CANDIDATE_WORKSPACE_NOT_FOUND: candidate workspace was not found.');
  }
  return matches[0]!;
}

export async function createQaWorkspace(root: string, input: CandidateWorkspace & {
  candidateCommit: string;
}): Promise<QaWorkspace> {
  if (!/^[a-f0-9]{40,64}$/.test(input.candidateCommit)) {
    throw new Error('WORKSPACE_CANDIDATE_COMMIT_INVALID: QA requires an identified candidate commit.');
  }
  const candidateHead = await git(input.path, ['rev-parse', 'HEAD'], true);
  if (candidateHead !== input.candidateCommit) {
    throw new Error('WORKSPACE_CANDIDATE_COMMIT_INVALID: QA must use the candidate workspace HEAD.');
  }
  if (await gitRaw(input.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) {
    throw new Error('WORKSPACE_CANDIDATE_DIRTY: QA requires a committed candidate snapshot.');
  }
  const commonDirectory = await gitCommonDirectory(root);
  const relativePath = `musubix5/workspaces/${input.changeId}/qa-${input.candidateCommit.slice(0, 12)}`;
  const path = resolve(commonDirectory, relativePath);
  await mkdir(dirname(path), { recursive: true });
  if (await pathExists(path)) {
    const existingHead = await git(path, ['rev-parse', 'HEAD'], true);
    if (existingHead !== input.candidateCommit) {
      throw new Error('WORKSPACE_QA_CONFLICT: existing QA workspace has another candidate identity.');
    }
  } else {
    await git(root, ['worktree', 'add', '--quiet', '--detach', path, input.candidateCommit]);
  }
  const candidateId = `candidate:${input.candidateCommit}`;
  const record = await appendJournalRecord(root, {
    stream: 'normal',
    changeId: input.changeId,
    kind: 'workspace-qa',
    idempotencyKey: `workspace:${input.changeId}:qa:${input.candidateCommit}`,
    payload: {
      repositoryId: input.repositoryId,
      baselineCommit: input.commitSha,
      candidateId,
      candidateCommit: input.candidateCommit,
      workspacePath: relativePath,
    },
  });
  return {
    changeId: input.changeId,
    workspaceKind: 'qa',
    path,
    candidateId,
    candidateCommit: input.candidateCommit,
    order: record.order,
  };
}

/** @id CODE-M5-WORKTREE-CANDIDATE-SNAPSHOT-001
 * @implements REQ-M5-WORKTREE-001 REQ-M5-APPROVAL-007
 * @design DES-M5-012
 */
export async function persistCandidateSnapshot(
  root: string,
  changeId: string,
  evaluators?: CandidateSnapshotEvaluators,
): Promise<CandidateSnapshot> {
  if (!/^CHANGE-\d+$/.test(changeId)) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: changeId must match CHANGE-<digits>.');
  }
  const resolveLifecycle = async (): Promise<ChangeContextSelection> => {
    if (!evaluators) {
      const compatibleContext = await resolveChangeContext(root, { maintenance: true });
      if (compatibleContext?.changeId === changeId && compatibleContext.generation !== null) {
        return compatibleContext;
      }
      return { changeId, generation: 1, requirementIds: [], documentStatus: 'active' };
    }
    const context = await resolveChangeContext(root);
    if (!context || context.changeId !== changeId || context.generation === null) {
      throw new Error(`CHANGE_GENERATION_PHASE: ${changeId} is not the sole active CHANGE generation.`);
    }
    await evaluators.requireApprovals(root, context);
    await evaluators.requireQuality(root, context);
    return context;
  };
  const resolveWorkspace = async () => {
    const commit = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], true);
    const branch = await git(root, ['branch', '--show-current'], true);
    const ownedChange = /(?:^|[^A-Za-z0-9])(CHANGE-\d+)(?=$|[^A-Za-z0-9])/.exec(branch)?.[1];
    if (ownedChange !== undefined && ownedChange !== changeId) {
      throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate branch belongs to another CHANGE.');
    }
    if (!branch) {
      throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot requires a current branch containing HEAD.');
    }
    const mergeBase = commit ? await git(root, ['merge-base', commit, branch], true) : '';
    if (!commit || mergeBase !== commit) {
      throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate commit is not reachable from its branch.');
    }
    const repositoryId = await repositoryIdentity(root);
    const manifest = await candidateTreeManifest(root, commit);
    return { commit, branch, repositoryId, manifest };
  };
  const result = (record: JournalRecord, replayed: boolean): CandidateSnapshot => {
    const payload = record.payload as {
      generation: number;
      repositoryId: string;
      branch: string;
      commit: string;
      artifactManifestDigest: string;
      createdAt: string;
    };
    const snapshotId = `snapshot-${String(record.order).padStart(12, '0')}`;
    return {
      snapshotId,
      changeId: record.changeId,
      generation: payload.generation,
      repositoryId: payload.repositoryId,
      branch: payload.branch,
      commit: payload.commit,
      artifactManifestDigest: payload.artifactManifestDigest,
      createdAt: payload.createdAt,
      order: record.order,
      journalPath: `.musubix/journal/normal/${String(record.order).padStart(12, '0')}.json`,
      replayed,
      guidance: `Commit the journal record without amending the candidate, run candidate-snapshot show ${snapshotId}, then run candidate-bound gates before release approval.`,
    };
  };
  const persist = async (context: ChangeContextSelection): Promise<CandidateSnapshot> => {
    const workspace = await resolveWorkspace();
    await listCandidateSnapshotRecords(root);
    const records = await candidateJournal(root);
    const tombstoneEpoch = records
      .filter((record) => record.stream === 'normal'
        && record.kind === 'workspace-candidate-snapshot-deleted'
        && record.changeId === changeId
        && (record.payload as { repositoryId?: unknown }).repositoryId === workspace.repositoryId)
      .reduce((greatest, record) => Math.max(greatest, record.order), 0);
    const idempotencyKey = [
      'workspace',
      changeId,
      'candidate-snapshot',
      `g${context.generation}`,
      workspace.commit,
      workspace.manifest.artifactManifestDigest,
      workspace.repositoryId,
      `t${tombstoneEpoch}`,
    ].join(':');
    const creations = records.filter((record) =>
      record.stream === 'normal'
      && record.kind === 'workspace-candidate-snapshot'
      && record.changeId === changeId);
    const deletedOrders = new Set(records.flatMap((record) => {
      if (record.stream !== 'normal' || record.kind !== 'workspace-candidate-snapshot-deleted') return [];
      const payload = record.payload as { repositoryId?: unknown; snapshotOrder?: unknown };
      return payload.repositoryId === workspace.repositoryId && Number.isInteger(payload.snapshotOrder)
        ? [Number(payload.snapshotOrder)]
        : [];
    }));
    const live = creations.filter((record) =>
      !deletedOrders.has(record.order)
      && (record.payload as { repositoryId?: unknown }).repositoryId === workspace.repositoryId);
    const replay = live.find((record) => record.idempotencyKey === idempotencyKey);
    if (replay) {
      const payload = replay.payload as { branch?: unknown };
      if (payload.branch !== workspace.branch) {
        throw new Error(`JOURNAL_IDEMPOTENCY_CONFLICT: ${idempotencyKey} is bound to another branch.`);
      }
      return result(replay, true);
    }
    if (live.length > 0) {
      throw new Error('CANDIDATE_SNAPSHOT_CONFLICT: delete the existing live candidate snapshot before creating another.');
    }
    if (await gitRaw(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) {
      throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot requires a clean worktree.');
    }
    const createdAt = new Date().toISOString();
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId,
      kind: 'workspace-candidate-snapshot',
      idempotencyKey,
      payload: {
        recordVersion: 1,
        changeId,
        generation: context.generation,
        repositoryId: workspace.repositoryId,
        branch: workspace.branch,
        commit: workspace.commit,
        artifactManifestDigest: workspace.manifest.artifactManifestDigest,
        createdAt,
      },
    });
    return result(record, false);
  };

  await resolveLifecycle();
  await resolveWorkspace();
  const lease = await acquireChangeLease(root, changeId);
  try {
    await assertChangeLeaseCurrent(lease);
    const context = await resolveLifecycle();
    return await persist(context);
  } finally {
    await releaseChangeLease(lease);
  }
}

async function candidateJournal(root: string): Promise<JournalRecord[]> {
  try {
    return await verifyJournal(root);
  } catch {
    throw new Error(
      'APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.',
    );
  }
}

function parseCandidateSnapshotRecord(
  record: JournalRecord,
): Omit<CandidateSnapshotStructuralProjection, 'deleted' | 'commitStatus' | 'repositoryStatus' | 'conflicting'> {
  const payload = record.payload as Record<string, unknown>;
  const legacy = payload.recordVersion === undefined;
  if ((!legacy && payload.recordVersion !== 1)
    || typeof payload.repositoryId !== 'string'
    || typeof payload.branch !== 'string' || !payload.branch
    || typeof payload.commit !== 'string' || !/^[a-f0-9]{40,64}$/.test(payload.commit)
    || (!legacy && (!Number.isInteger(payload.generation) || Number(payload.generation) < 1))
    || (!legacy && (typeof payload.artifactManifestDigest !== 'string'
      || !/^[a-f0-9]{64}$/.test(payload.artifactManifestDigest)))
    || (!legacy && (typeof payload.createdAt !== 'string'
      || !Number.isFinite(Date.parse(payload.createdAt))))) {
    throw new Error(
      'APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.',
    );
  }
  return {
    snapshotId: `snapshot-${String(record.order).padStart(12, '0')}`,
    recordVersion: legacy ? 0 : 1,
    legacy,
    changeId: record.changeId,
    generation: legacy ? null : Number(payload.generation),
    repositoryId: payload.repositoryId,
    branch: payload.branch,
    commit: payload.commit,
    artifactManifestDigest: legacy ? null : String(payload.artifactManifestDigest),
    createdAt: legacy ? null : String(payload.createdAt),
    order: record.order,
    journalPath: `.musubix/journal/normal/${String(record.order).padStart(12, '0')}.json`,
  };
}

/** @id CODE-M5-WORKTREE-SNAPSHOT-READ-001
 * @implements REQ-M5-WORKTREE-006
 * @design DES-M5-012
 */
export async function listCandidateSnapshotRecords(
  root: string,
): Promise<CandidateSnapshotStructuralProjection[]> {
  const records = await candidateJournal(root);
  const repositoryId = await repositoryIdentity(root);
  const tombstones = new Map<number, {
    repositoryId?: string;
    snapshotId?: string;
    deletedAt: string;
    deletedBy: string;
  }>();
  for (const record of records) {
    if (record.stream !== 'normal' || record.kind !== 'workspace-candidate-snapshot-deleted') continue;
    const payload = record.payload as Record<string, unknown>;
    if (!Number.isInteger(payload.snapshotOrder)
      || typeof payload.deletedAt !== 'string' || !Number.isFinite(Date.parse(payload.deletedAt))
      || typeof payload.deletedBy !== 'string' || !payload.deletedBy.trim()) {
      throw new Error(
        'APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.',
      );
    }
    tombstones.set(Number(payload.snapshotOrder), {
      ...(typeof payload.repositoryId === 'string' ? { repositoryId: payload.repositoryId } : {}),
      ...(typeof payload.snapshotId === 'string' ? { snapshotId: payload.snapshotId } : {}),
      deletedAt: payload.deletedAt,
      deletedBy: payload.deletedBy,
    });
  }
  const parsed = records.flatMap((record) =>
    record.stream === 'normal' && record.kind === 'workspace-candidate-snapshot'
      ? [parseCandidateSnapshotRecord(record)]
      : []);
  const liveMatchingCounts = new Map<string, number>();
  for (const snapshot of parsed) {
    const tombstone = tombstones.get(snapshot.order);
    const deleted = tombstone !== undefined
      && (tombstone.repositoryId === undefined || tombstone.repositoryId === snapshot.repositoryId);
    if (!deleted && snapshot.repositoryId === repositoryId) {
      liveMatchingCounts.set(snapshot.changeId, (liveMatchingCounts.get(snapshot.changeId) ?? 0) + 1);
    }
  }
  return Promise.all(parsed.map(async (snapshot) => {
    const candidateDeletion = tombstones.get(snapshot.order);
    const deletion = candidateDeletion
      && (candidateDeletion.repositoryId === undefined
        || candidateDeletion.repositoryId === snapshot.repositoryId)
      ? candidateDeletion
      : undefined;
    const commit = await git(root, ['rev-parse', '--verify', `${snapshot.commit}^{commit}`], true);
    const branchTip = await git(root, ['rev-parse', '--verify', `${snapshot.branch}^{commit}`], true);
    const mergeBase = commit && branchTip
      ? await git(root, ['merge-base', snapshot.commit, snapshot.branch], true)
      : '';
    return {
      ...snapshot,
      deleted: deletion !== undefined,
      ...(deletion ? { deletedAt: deletion.deletedAt, deletedBy: deletion.deletedBy } : {}),
      commitStatus: commit === snapshot.commit && mergeBase === snapshot.commit
        ? 'reachable' as const
        : 'unreachable' as const,
      repositoryStatus: snapshot.repositoryId === repositoryId ? 'match' as const : 'foreign' as const,
      conflicting: !deletion && snapshot.repositoryId === repositoryId
        && (liveMatchingCounts.get(snapshot.changeId) ?? 0) > 1,
    };
  }));
}

export async function showCandidateSnapshotRecord(
  root: string,
  selector: string,
): Promise<CandidateSnapshotStructuralProjection> {
  const snapshots = await listCandidateSnapshotRecords(root);
  if (/^snapshot-\d{12}$/.test(selector)) {
    const selected = snapshots.find((snapshot) => snapshot.snapshotId === selector);
    if (!selected) throw new Error('CANDIDATE_SNAPSHOT_MISSING: snapshot ID was not found.');
    return selected;
  }
  if (!/^CHANGE-\d+$/.test(selector)) {
    throw new Error('CLI_ERROR: selector must match CHANGE-<digits> or snapshot-<12 digits>.');
  }
  const knownChange = await pathExists(resolve(root, '.musubix', 'changes', `${selector}.md`));
  if (!knownChange) throw new Error(`CHANGE_GENERATION_PHASE: ${selector} is not a known CHANGE.`);
  const matching = snapshots.filter((snapshot) =>
    snapshot.changeId === selector && !snapshot.deleted && snapshot.repositoryStatus === 'match');
  if (matching.length === 0) throw new Error('CANDIDATE_SNAPSHOT_MISSING: no live candidate snapshot exists.');
  if (matching.length > 1) throw new Error('CANDIDATE_SNAPSHOT_CONFLICT: multiple live candidate snapshots exist.');
  return matching[0]!;
}

function deleteResult(record: JournalRecord, replayed: boolean): CandidateSnapshotDeleteResult {
  const payload = record.payload as {
    snapshotId: string;
    changeId: string;
    commit: string;
    artifactManifestDigest: string | null;
    deletedBy: string;
    deletedAt: string;
    releaseApprovalStatus: CandidateSnapshotDeleteEvaluation['releaseApprovalStatus'];
    releaseApprovalArtifactSha256: string | null;
    invalidatedStates: string[];
  };
  return {
    snapshotId: payload.snapshotId,
    changeId: payload.changeId,
    commit: payload.commit,
    artifactManifestDigest: payload.artifactManifestDigest,
    deletedBy: payload.deletedBy,
    deletedAt: payload.deletedAt,
    releaseApprovalStatus: payload.releaseApprovalStatus,
    releaseApprovalArtifactSha256: payload.releaseApprovalArtifactSha256,
    tombstoneOrder: record.order,
    tombstonePath: `.musubix/journal/normal/${String(record.order).padStart(12, '0')}.json`,
    replayed,
    invalidatedStates: payload.invalidatedStates,
    guidance: 'The creation record and Git commit remain immutable; create a replacement snapshot when required.',
  };
}

async function selectDeleteCandidate(
  root: string,
  selector: string,
): Promise<CandidateSnapshotStructuralProjection> {
  if (/^snapshot-\d{12}$/.test(selector)) {
    return showCandidateSnapshotRecord(root, selector);
  }
  if (!/^CHANGE-\d+$/.test(selector)) {
    throw new Error('CLI_ERROR: selector must match CHANGE-<digits> or snapshot-<12 digits>.');
  }
  if (!await pathExists(resolve(root, '.musubix', 'changes', `${selector}.md`))) {
    throw new Error(`CHANGE_GENERATION_PHASE: ${selector} is not a known CHANGE.`);
  }
  const matching = (await listCandidateSnapshotRecords(root)).filter((snapshot) =>
    snapshot.changeId === selector && snapshot.repositoryStatus === 'match');
  const live = matching.filter((snapshot) => !snapshot.deleted);
  if (live.length === 1) return live[0]!;
  if (live.length > 1) {
    throw new Error('CANDIDATE_SNAPSHOT_CONFLICT: multiple live candidate snapshots exist.');
  }
  const deleted = matching.filter((snapshot) => snapshot.deleted);
  if (deleted.length === 1) return deleted[0]!;
  if (deleted.length > 1) {
    throw new Error('CANDIDATE_SNAPSHOT_CONFLICT: multiple deleted candidate snapshots exist.');
  }
  throw new Error('CANDIDATE_SNAPSHOT_MISSING: no candidate snapshot exists.');
}

/** @id CODE-M5-WORKTREE-SNAPSHOT-DELETE-001
 * @implements REQ-M5-WORKTREE-007
 * @design DES-M5-012
 */
export async function deleteCandidateSnapshot(
  root: string,
  selector: string,
  deletedBy: string,
  evaluators: CandidateSnapshotDeleteEvaluators,
): Promise<CandidateSnapshotDeleteResult> {
  if (!deletedBy.trim()) throw new Error('CLI_ERROR: --deleted-by must not be blank.');
  const initiallySelected = await selectDeleteCandidate(root, selector);
  const lease = await acquireChangeLease(root, initiallySelected.changeId);
  try {
    await assertChangeLeaseCurrent(lease);
    const selected = await selectDeleteCandidate(root, selector);
    if (selected.changeId !== initiallySelected.changeId) {
      throw new Error(
        'APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot journal is invalid.',
      );
    }
    const records = await candidateJournal(root);
    const tombstone = records.find((record) =>
      record.stream === 'normal'
      && record.kind === 'workspace-candidate-snapshot-deleted'
      && (record.payload as { snapshotOrder?: unknown }).snapshotOrder === selected.order
      && ((record.payload as { repositoryId?: unknown }).repositoryId === undefined
        || (record.payload as { repositoryId?: unknown }).repositoryId === selected.repositoryId));
    if (tombstone) {
      const payload = tombstone.payload as { deletedBy?: unknown };
      if (payload.deletedBy !== deletedBy) {
        throw new Error(
          'CANDIDATE_SNAPSHOT_ALREADY_DELETED: the snapshot was deleted by another actor.',
        );
      }
      return deleteResult(tombstone, true);
    }
    const evaluation = await evaluators.evaluateProtection(root, selected);
    if (evaluation.protected) {
      throw new Error(
        `CANDIDATE_SNAPSHOT_PROTECTED: run \`musubix5 change-record ${selected.changeId} impact --reopen\` before retrying deletion.`,
      );
    }
    const deletedAt = new Date().toISOString();
    const invalidatedStates = [...new Set(evaluation.invalidatedStates)].sort();
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: selected.changeId,
      kind: 'workspace-candidate-snapshot-deleted',
      idempotencyKey: [
        'workspace',
        selected.changeId,
        'candidate-snapshot-delete',
        selected.snapshotId,
        deletedBy,
      ].join(':'),
      payload: {
        recordVersion: 1,
        repositoryId: selected.repositoryId,
        snapshotId: selected.snapshotId,
        snapshotOrder: selected.order,
        changeId: selected.changeId,
        commit: selected.commit,
        artifactManifestDigest: selected.artifactManifestDigest,
        deletedBy,
        deletedAt,
        releaseApprovalStatus: evaluation.releaseApprovalStatus,
        releaseApprovalArtifactSha256: evaluation.releaseApprovalArtifactSha256,
        invalidatedStates,
      },
    });
    return deleteResult(record, false);
  } finally {
    await releaseChangeLease(lease);
  }
}

/** @id CODE-M5-RELEASE-DETACHED-SNAPSHOT-001
 * @implements REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-020 DES-M5-021
 */
export async function resolveCandidateSnapshot(
  root: string,
  requestedChangeId?: string,
): Promise<CandidateSnapshot> {
  const allSnapshots = await listCandidateSnapshotRecords(root);
  const snapshots = allSnapshots
    .filter((snapshot) => !snapshot.deleted && snapshot.repositoryStatus === 'match');
  const selected = requestedChangeId === undefined
    ? snapshots
    : snapshots.filter((snapshot) => snapshot.changeId === requestedChangeId);
  if (requestedChangeId !== undefined && selected.length === 0) {
    const foreignLive = allSnapshots.some((snapshot) =>
      snapshot.changeId === requestedChangeId
      && !snapshot.deleted
      && snapshot.repositoryStatus === 'foreign');
    if (foreignLive) {
      throw new Error(
        'APPROVAL_CANDIDATE_UNAVAILABLE: only foreign candidate snapshots exist; '
        + 'run `musubix5 candidate-snapshot list` and create a repository-matching snapshot.',
      );
    }
    throw new Error(
      `APPROVAL_CANDIDATE_MISSING: run \`musubix5 candidate-snapshot create ${requestedChangeId}\`.`,
    );
  }
  if (selected.length !== 1) {
    throw new Error(
      'APPROVAL_CANDIDATE_UNAVAILABLE: exactly one live repository-matching candidate snapshot is required; '
      + 'run `musubix5 candidate-snapshot list`.',
    );
  }
  const structural = selected[0]!;
  const active = await resolveChangeContext(root, { maintenance: true });
  if (active?.changeId === structural.changeId && active.generation !== null
    && (structural.legacy || structural.generation !== active.generation)) {
    throw new Error(
      'APPROVAL_CANDIDATE_UNAVAILABLE: the live candidate snapshot is legacy or belongs to a non-current generation; '
      + 'run `musubix5 candidate-snapshot list`, delete it, then create the current snapshot.',
    );
  }
  const snapshot: CandidateSnapshot = {
    snapshotId: structural.snapshotId,
    changeId: structural.changeId,
    generation: structural.generation,
    repositoryId: structural.repositoryId,
    branch: structural.branch,
    commit: structural.commit,
    artifactManifestDigest: structural.artifactManifestDigest,
    createdAt: structural.createdAt,
    order: structural.order,
    journalPath: structural.journalPath,
    replayed: false,
    guidance: '',
  };
  const commit = await git(root, ['rev-parse', '--verify', `${snapshot.commit}^{commit}`], true);
  const containingRefs = await git(
    root,
    [
      'for-each-ref',
      '--format=%(refname)',
      '--contains',
      snapshot.commit,
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ],
    true,
  );
  if (commit !== snapshot.commit || !containingRefs) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: persisted candidate snapshot is not reachable.');
  }
  return snapshot;
}

export async function listCandidateEntries(
  root: string,
  commit: string,
): Promise<CandidateGitEntry[]> {
  const output = await gitBuffer(root, [
    'ls-tree',
    '-rz',
    '-r',
    '--full-tree',
    '--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)',
    commit,
  ]);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: CandidateGitEntry[] = [];
  const normalized = new Set<string>();
  const rawEntries = output.length ? output.subarray(0, -1).toString('binary').split('\0') : [];
  for (const rawEntry of rawEntries) {
    const bytes = Buffer.from(rawEntry, 'binary');
    const separator = bytes.indexOf(0x09);
    if (separator < 0) throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: malformed Git tree entry.');
    const metadata = bytes.subarray(0, separator).toString('ascii').split(' ');
    const rawPath = bytes.subarray(separator + 1);
    let path: string;
    try {
      path = decoder.decode(rawPath);
    } catch {
      throw new Error('APPROVAL_PATH_ENCODING: candidate Git path is not valid UTF-8.');
    }
    const nfcPath = path.normalize('NFC');
    if (normalized.has(nfcPath)) {
      throw new Error(`APPROVAL_PATH_COLLISION: candidate paths normalize to ${nfcPath}.`);
    }
    normalized.add(nfcPath);
    entries.push({
      rawPath,
      nfcPath,
      gitMode: metadata[0] ?? '',
      objectType: metadata[1] ?? '',
      objectId: metadata[2] ?? '',
    });
  }
  return entries.sort((left, right) =>
    Buffer.compare(Buffer.from(left.nfcPath, 'utf8'), Buffer.from(right.nfcPath, 'utf8')));
}

/** @id CODE-M5-WORKTREE-SNAPSHOT-MANIFEST-001
 * @implements REQ-M5-WORKTREE-005
 * @design DES-M5-012
 */
export async function candidateTreeManifest(
  root: string,
  commit: string,
): Promise<CandidateTreeManifest> {
  if (!/^[a-f0-9]{40,64}$/.test(commit)) {
    throw new Error('WORKSPACE_CANDIDATE_COMMIT_INVALID: candidate manifest requires a full object ID.');
  }
  const entries = (await listCandidateEntries(root, commit)).map((entry) => {
    if (!entry.gitMode || !entry.objectType || entry.objectType === 'tree'
      || !/^[a-f0-9]{40,64}$/.test(entry.objectId)) {
      throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate tree object ID is invalid.');
    }
    return {
      path: entry.nfcPath,
      gitMode: entry.gitMode,
      objectType: entry.objectType,
      objectId: entry.objectId,
    };
  });
  return {
    entries,
    artifactManifestDigest: sha256(canonicalBytes(entries)),
  };
}

export async function readCandidateBlob(
  root: string,
  commit: string,
  objectId: string,
): Promise<Buffer> {
  await git(root, ['cat-file', '-e', `${commit}^{commit}`]);
  return gitBuffer(root, ['cat-file', 'blob', objectId]);
}

/** @id CODE-M5-WORKTREE-003
 * @implements REQ-M5-WORKTREE-003
 * @design DES-M5-012
 */
export function validateWorkspaceBinding(
  evidence: { changeId: string; candidateId: string; workspaceKind: 'candidate' | 'qa' },
  expected: { changeId: string; candidateId: string; workspaceKind: 'candidate' | 'qa' },
): { valid: boolean; terminalReason: 'foreign-workspace-evidence' | null } {
  const valid = evidence.changeId === expected.changeId
    && evidence.candidateId === expected.candidateId
    && evidence.workspaceKind === expected.workspaceKind;
  return { valid, terminalReason: valid ? null : 'foreign-workspace-evidence' };
}
