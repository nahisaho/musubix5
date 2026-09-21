import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, sha256 } from './canonical.js';
import { appendJournalRecord, verifyJournal } from './journal.js';

const execFileAsync = promisify(execFile);
const generatedStatePrefixes = ['.musubix/evidence/', '.musubix/journal/'];

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

export interface QaWorkspace {
  changeId: string;
  workspaceKind: 'qa';
  path: string;
  candidateId: string;
  candidateCommit: string;
  order: number;
}

export interface CandidateSnapshot {
  changeId: string;
  repositoryId: string;
  branch: string;
  commit: string;
  order: number;
}

export interface CandidateGitEntry {
  rawPath: Buffer;
  nfcPath: string;
  objectId: string;
  gitMode: string;
  objectType: string;
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

async function gitCommonDirectory(root: string): Promise<string> {
  return resolve(root, await git(root, ['rev-parse', '--git-common-dir']));
}

async function repositoryIdentity(root: string): Promise<string> {
  const repositoryRoot = await git(root, ['rev-parse', '--show-toplevel']);
  const remote = await git(root, ['config', '--get', 'remote.origin.url'], true);
  return `repository:${sha256(canonicalBytes({
    identity: remote || `local:${repositoryRoot}`,
  }))}`;
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
  const branch = `musubix5/${baseline.changeId}`;
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

export async function createQaWorkspace(root: string, input: CandidateWorkspace & {
  candidateCommit: string;
}): Promise<QaWorkspace> {
  if (!/^[a-f0-9]{40,64}$/i.test(input.candidateCommit)) {
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
): Promise<CandidateSnapshot> {
  if (!/^CHANGE-\d+$/.test(changeId)) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: changeId must match CHANGE-<digits>.');
  }
  if (await gitRaw(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot requires a clean worktree.');
  }
  const commit = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'], true);
  const branch = await git(root, ['branch', '--show-current'], true);
  const ownedChange = /(?:^|\/)(CHANGE-\d+)(?:$|\/)/.exec(branch)?.[1];
  if (ownedChange !== undefined && ownedChange !== changeId) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate branch belongs to another CHANGE.');
  }
  const mergeBase = commit && branch ? await git(root, ['merge-base', commit, branch], true) : '';
  if (!commit || !branch || mergeBase !== commit) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate commit is not reachable from its branch.');
  }
  const repositoryId = await repositoryIdentity(root);
  const record = await appendJournalRecord(root, {
    stream: 'normal',
    changeId,
    kind: 'workspace-candidate-snapshot',
    idempotencyKey: `workspace:${changeId}:candidate-snapshot:${commit}`,
    payload: { repositoryId, branch, commit },
  });
  return { changeId, repositoryId, branch, commit, order: record.order };
}

export async function resolveCandidateSnapshot(
  root: string,
  requestedChangeId?: string,
): Promise<CandidateSnapshot> {
  const snapshots = (await verifyJournal(root)).flatMap((record) => {
    if (record.stream !== 'normal' || record.kind !== 'workspace-candidate-snapshot') return [];
    const payload = record.payload as Partial<CandidateSnapshot>;
    if (typeof payload.repositoryId !== 'string'
      || typeof payload.branch !== 'string'
      || typeof payload.commit !== 'string') return [];
    return [{
      changeId: record.changeId,
      repositoryId: payload.repositoryId,
      branch: payload.branch,
      commit: payload.commit,
      order: record.order,
    }];
  });
  const latestByChange = new Map<string, CandidateSnapshot>();
  for (const snapshot of snapshots) {
    const current = latestByChange.get(snapshot.changeId);
    if (!current || snapshot.order > current.order) latestByChange.set(snapshot.changeId, snapshot);
  }
  const selected = requestedChangeId === undefined
    ? [...latestByChange.values()]
    : [latestByChange.get(requestedChangeId)].filter(
      (snapshot): snapshot is CandidateSnapshot => snapshot !== undefined,
    );
  if (selected.length !== 1) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: exactly one persisted candidate snapshot is required.');
  }
  const snapshot = selected[0]!;
  if (snapshot.repositoryId !== await repositoryIdentity(root)) {
    throw new Error('APPROVAL_CANDIDATE_UNAVAILABLE: candidate snapshot belongs to another repository.');
  }
  const commit = await git(root, ['rev-parse', '--verify', `${snapshot.commit}^{commit}`], true);
  const branchHead = await git(root, ['rev-parse', '--verify', `${snapshot.branch}^{commit}`], true);
  const mergeBase = commit && branchHead
    ? await git(root, ['merge-base', snapshot.commit, branchHead], true)
    : '';
  if (commit !== snapshot.commit || !branchHead || mergeBase !== snapshot.commit) {
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
