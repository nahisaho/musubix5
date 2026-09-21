import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, sha256 } from './canonical.js';
import { appendJournalRecord } from './journal.js';

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
  const remote = await git(root, ['config', '--get', 'remote.origin.url'], true);
  const repositoryId = `repository:${sha256(canonicalBytes({
    identity: remote || `local:${commitSha}`,
  }))}`;
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
