import { mkdir, open } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { canonicalBytes, sha256 } from './canonical.js';
import { snapshot } from './files.js';
import type { NativeApprovalManifest } from './native-approval.js';
import {
  resolveNormativeArtifacts, snapshotNormativeArtifacts,
} from './approval-normative.js';

export interface RunLocalWorkspace {
  root: string;
  path: string;
  relativePath: string;
  changeId: string;
  runId: string;
  approval: NativeApprovalManifest;
}

function safeSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`RUN_LOCAL_ID_INVALID: ${label} must be one safe path segment.`);
  }
}

function containedPath(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`);
}

/** @id CODE-M5-APPROVAL-002
 * @implements REQ-M5-APPROVAL-002
 * @design DES-M5-006
 */
export async function assertApprovedSpecificationCurrent(
  workspace: RunLocalWorkspace,
): Promise<void> {
  let current: Record<string, string>;
  try {
    if (workspace.approval.stage === 'release') {
      throw new Error('release approval is not valid for a run-local workspace.');
    }
    current = Object.hasOwn(workspace.approval.artifacts, '.musubix/constitution.md')
      ? await snapshotNormativeArtifacts(
        workspace.root,
        await resolveNormativeArtifacts(workspace.root, workspace.approval.stage),
      )
      : await snapshot(workspace.root, Object.keys(workspace.approval.artifacts));
  } catch (cause) {
    throw new Error('APPROVED_SPECIFICATION_CHANGED: an approved normative file is unavailable.', {
      cause,
    });
  }
  if (sha256(canonicalBytes(current)) !== sha256(canonicalBytes(workspace.approval.artifacts))) {
    throw new Error(
      'APPROVED_SPECIFICATION_CHANGED: normative content requires a new manifest and manual approval.',
    );
  }
}

export async function createRunLocalWorkspace(root: string, input: {
  changeId: string;
  runId: string;
  approval: NativeApprovalManifest;
}): Promise<RunLocalWorkspace> {
  if (input.approval.stage === 'release') {
    throw new Error('RUN_LOCAL_STAGE_INVALID: release approval is manual-only.');
  }
  safeSegment(input.changeId, 'changeId');
  safeSegment(input.runId, 'runId');
  const absoluteRoot = resolve(root);
  const relativePath = `.musubix/runs/${input.changeId}/${input.runId}`;
  const path = resolve(absoluteRoot, relativePath);
  if (!containedPath(absoluteRoot, path)) {
    throw new Error('RUN_LOCAL_PATH_ESCAPE: workspace must remain inside the repository.');
  }
  const workspace = {
    root: absoluteRoot,
    path,
    relativePath,
    changeId: input.changeId,
    runId: input.runId,
    approval: input.approval,
  };
  await assertApprovedSpecificationCurrent(workspace);
  await mkdir(path, { recursive: true });
  return workspace;
}

export async function writeRunLocalArtifact(
  workspace: RunLocalWorkspace,
  relativePath: string,
  value: unknown,
): Promise<{ path: string; sha256: string }> {
  if (!relativePath || relativePath.includes('\\') || relativePath.startsWith('/')) {
    throw new Error('RUN_LOCAL_PATH_ESCAPE: artifact path must be repository-relative.');
  }
  const destination = resolve(workspace.path, relativePath);
  if (!containedPath(workspace.path, destination)) {
    throw new Error('RUN_LOCAL_PATH_ESCAPE: artifact must remain inside the run-local workspace.');
  }
  await assertApprovedSpecificationCurrent(workspace);
  await mkdir(dirname(destination), { recursive: true });
  const bytes = canonicalBytes(value);
  const handle = await open(destination, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {
    path: relative(workspace.root, destination).split(sep).join('/'),
    sha256: sha256(bytes),
  };
}
