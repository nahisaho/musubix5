import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { canonicalBytes, sha256 } from './canonical.js';
import { exists, readText, safePath, writeJson, writeText } from './files.js';

export type BootstrapOperationKind = 'read' | 'write' | 'test';
export type BootstrapPermission = 'read' | 'write' | 'execute';

export interface BootstrapOperation {
  id: string;
  kind: BootstrapOperationKind;
  targetPath: string;
  estimatedUsage: number;
  inputDigest: string;
  content?: string;
}

export interface BootstrapAuthorityManifest {
  schemaVersion: 1;
  explicitBootstrap: true;
  runId: string;
  changeId: string;
  candidateId: string;
  targetPaths: string[];
  permissions: readonly BootstrapPermission[];
  budget: number;
  maxIterations: number;
  maxDurationMs: number;
  operations: BootstrapOperation[];
}

export interface BootstrapHistoryEntry {
  order: number;
  operationId: string;
  invocationKey: string;
  status: 'pending' | 'completed' | 'failed';
  inputDigest: string;
  outputDigest: string | null;
  reservedUsage: number;
  actualUsage: number | null;
  candidateDigest: string | null;
  changedPaths: string[];
}

export interface BootstrapState {
  schemaVersion: 1;
  runId: string;
  changeId: string;
  candidateId: string;
  manifestSha256: string;
  manifest: BootstrapAuthorityManifest;
  status: 'running' | 'completed' | 'failed';
  terminalReason: 'budget-exhausted' | 'iteration-limit-exceeded'
    | 'duration-limit-exceeded' | 'operation-output-invalid' | null;
  consumedBudget: number;
  completedIterations: number;
  elapsedMs: number;
  history: BootstrapHistoryEntry[];
}

export interface BootstrapIngestionRequest {
  schemaVersion: 1;
  runId: string;
  changeId: string;
  candidateId: string;
  status: 'pending-normal-ingestion';
  normalEvidenceAuthorized: false;
  bootstrapStateSha256: string;
  completedIterations: number;
  consumedBudget: number;
  changedPaths: string[];
}

export type BootstrapExecutor = (
  operation: BootstrapOperation,
  context: { invocationKey: string; candidateId: string },
) => Promise<{
  outputDigest: string;
  actualUsage: number;
  candidateDigest: string;
  changedPaths: string[];
}>;

const protectedTargets = [
  '.git',
  '.musubix/journal/normal',
  '.musubix/evidence/approval',
  '.musubix/evidence/approvals',
  '.musubix/evidence/tdd',
  '.musubix/evidence/trace',
  '.musubix/evidence/graph',
  '.musubix/evidence/workflow',
  '.musubix/evidence/quality',
  '.musubix/evidence/release',
  '.musubix/evidence/package',
  '.musubix/evidence/waiver',
  '.musubix/evidence/waivers',
];

function statePath(runId: string): string {
  return `.musubix/evidence/bootstrap/${runId}.json`;
}

function pathWithin(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function validateRelativePath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('\\')
    || path.split('/').some((segment) => segment === '..' || segment === '')) {
    throw new Error(`BOOTSTRAP_TARGET_INVALID: unsafe target path ${path}.`);
  }
}

function requiredPermission(kind: BootstrapOperationKind): BootstrapPermission {
  return kind === 'read' ? 'read' : kind === 'write' ? 'write' : 'execute';
}

/** @id CODE-M5-BOOTSTRAP-002
 * @implements REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-004
 * @design DES-M5-013
 */
export function validateBootstrapManifest(value: BootstrapAuthorityManifest): void {
  if (value.explicitBootstrap !== true) {
    throw new Error('BOOTSTRAP_EXPLICIT_MODE_REQUIRED: bootstrap must be requested explicitly.');
  }
  if (value.schemaVersion !== 1
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.runId)
    || !/^CHANGE-\d+$/.test(value.changeId)
    || !value.candidateId
    || !Number.isInteger(value.budget) || value.budget <= 0
    || !Number.isInteger(value.maxIterations) || value.maxIterations <= 0
    || !Number.isInteger(value.maxDurationMs) || value.maxDurationMs <= 0
    || !Array.isArray(value.targetPaths) || value.targetPaths.length === 0
    || !Array.isArray(value.operations)) {
    throw new Error('BOOTSTRAP_MANIFEST_INVALID: authority limits are missing or invalid.');
  }
  for (const target of value.targetPaths) {
    validateRelativePath(target);
    if (protectedTargets.some((prefix) => pathWithin(target, prefix))) {
      throw new Error(`BOOTSTRAP_TARGET_FORBIDDEN: ${target} belongs to protected normal state.`);
    }
  }
  if (value.operations.length > value.maxIterations) {
    throw new Error('BOOTSTRAP_ITERATION_LIMIT_EXCEEDED: manifest operations exceed maxIterations.');
  }
  const operationIds = new Set<string>();
  for (const operation of value.operations) {
    if (!operation || typeof operation !== 'object'
      || !['read', 'write', 'test'].includes(operation.kind)
      || !operation.id || operationIds.has(operation.id)
      || !Number.isInteger(operation.estimatedUsage) || operation.estimatedUsage <= 0
      || !/^[a-f0-9]{64}$/.test(operation.inputDigest)) {
      throw new Error('BOOTSTRAP_OPERATION_INVALID: operation identity or limits are invalid.');
    }
    operationIds.add(operation.id);
    validateRelativePath(operation.targetPath);
    if (protectedTargets.some((prefix) => pathWithin(operation.targetPath, prefix))) {
      throw new Error(`BOOTSTRAP_TARGET_FORBIDDEN: ${operation.targetPath} belongs to protected normal state.`);
    }
    if (!value.targetPaths.some((target) => pathWithin(operation.targetPath, target))) {
      throw new Error(`BOOTSTRAP_TARGET_OUT_OF_SCOPE: ${operation.targetPath} is outside manifest targets.`);
    }
    if (!value.permissions.includes(requiredPermission(operation.kind))) {
      throw new Error(`BOOTSTRAP_PERMISSION_DENIED: ${operation.kind} is not authorized.`);
    }
  }
}

async function loadState(root: string, runId: string): Promise<BootstrapState> {
  const path = statePath(runId);
  if (!await exists(await safePath(root, path))) {
    throw new Error(`BOOTSTRAP_RUN_NOT_FOUND: ${runId}.`);
  }
  const value = JSON.parse(await readText(root, path)) as BootstrapState;
  if (value.schemaVersion !== 1 || value.runId !== runId || !Array.isArray(value.history)) {
    throw new Error(`BOOTSTRAP_STATE_INVALID: ${runId}.`);
  }
  return value;
}

async function saveState(root: string, state: BootstrapState): Promise<void> {
  await writeJson(root, statePath(state.runId), state);
}

function invocationKey(state: BootstrapState, operation: BootstrapOperation): string {
  return `bootstrap:${sha256(canonicalBytes({
    manifestSha256: state.manifestSha256,
    operationId: operation.id,
    iteration: state.completedIterations + 1,
  }))}`;
}

async function executePending(
  root: string,
  state: BootstrapState,
  executor: BootstrapExecutor,
): Promise<BootstrapState> {
  while (state.completedIterations < state.manifest.operations.length) {
    if (state.completedIterations >= state.manifest.maxIterations) {
      state.status = 'failed';
      state.terminalReason = 'iteration-limit-exceeded';
      await saveState(root, state);
      return state;
    }
    if (state.elapsedMs >= state.manifest.maxDurationMs) {
      state.status = 'failed';
      state.terminalReason = 'duration-limit-exceeded';
      await saveState(root, state);
      return state;
    }
    const operation = state.manifest.operations[state.completedIterations]!;
    let pending = state.history.find((entry) =>
      entry.operationId === operation.id && entry.status === 'pending');
    if (!pending) {
      if (state.consumedBudget + operation.estimatedUsage > state.manifest.budget) {
        state.status = 'failed';
        state.terminalReason = 'budget-exhausted';
        await saveState(root, state);
        return state;
      }
      pending = {
        order: state.history.length + 1,
        operationId: operation.id,
        invocationKey: invocationKey(state, operation),
        status: 'pending',
        inputDigest: operation.inputDigest,
        outputDigest: null,
        reservedUsage: operation.estimatedUsage,
        actualUsage: null,
        candidateDigest: null,
        changedPaths: [],
      };
      state.history.push(pending);
      await saveState(root, state);
    }
    const started = performance.now();
    const result = await executor(operation, {
      invocationKey: pending.invocationKey,
      candidateId: state.candidateId,
    });
    state.elapsedMs += Math.max(0, Math.round(performance.now() - started));
    const outputValid = /^[a-f0-9]{64}$/.test(result.outputDigest)
      && /^[a-f0-9]{64}$/.test(result.candidateDigest)
      && Number.isFinite(result.actualUsage) && result.actualUsage >= 0
      && result.changedPaths.every((path) => {
        try {
          validateRelativePath(path);
          return state.manifest.targetPaths.some((target) => pathWithin(path, target))
            && !protectedTargets.some((target) => pathWithin(path, target));
        } catch {
          return false;
        }
      });
    if (!outputValid) {
      state.status = 'failed';
      state.terminalReason = 'operation-output-invalid';
      state.history.push({
        ...pending,
        order: state.history.length + 1,
        status: 'failed',
      });
      await saveState(root, state);
      return state;
    }
    state.history.push({
      ...pending,
      order: state.history.length + 1,
      status: 'completed',
      outputDigest: result.outputDigest,
      actualUsage: result.actualUsage,
      candidateDigest: result.candidateDigest,
      changedPaths: [...new Set(result.changedPaths)].sort(),
    });
    state.consumedBudget += result.actualUsage;
    state.completedIterations += 1;
    if (state.consumedBudget > state.manifest.budget) {
      state.status = 'failed';
      state.terminalReason = 'budget-exhausted';
      await saveState(root, state);
      return state;
    }
    if (state.elapsedMs > state.manifest.maxDurationMs) {
      state.status = 'failed';
      state.terminalReason = 'duration-limit-exceeded';
      await saveState(root, state);
      return state;
    }
    await saveState(root, state);
  }
  state.status = 'completed';
  state.terminalReason = null;
  await saveState(root, state);
  return state;
}

/** @id CODE-M5-BOOTSTRAP-001
 * @implements REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-003
 * @design DES-M5-013
 */
export async function bootstrapRun(
  root: string,
  manifest: BootstrapAuthorityManifest,
  executor: BootstrapExecutor,
): Promise<BootstrapState> {
  validateBootstrapManifest(manifest);
  const path = statePath(manifest.runId);
  if (await exists(await safePath(root, path))) {
    throw new Error(`BOOTSTRAP_RUN_EXISTS: ${manifest.runId}; use bootstrap resume.`);
  }
  const state: BootstrapState = {
    schemaVersion: 1,
    runId: manifest.runId,
    changeId: manifest.changeId,
    candidateId: manifest.candidateId,
    manifestSha256: sha256(canonicalBytes(manifest)),
    manifest,
    status: 'running',
    terminalReason: null,
    consumedBudget: 0,
    completedIterations: 0,
    elapsedMs: 0,
    history: [],
  };
  await saveState(root, state);
  return executePending(root, state, executor);
}

export async function bootstrapResume(
  root: string,
  runId: string,
  executor: BootstrapExecutor,
): Promise<BootstrapState> {
  const state = await loadState(root, runId);
  validateBootstrapManifest(state.manifest);
  if (state.manifestSha256 !== sha256(canonicalBytes(state.manifest))) {
    throw new Error('BOOTSTRAP_MANIFEST_CHANGED: persisted authority manifest is not current.');
  }
  if (state.status === 'completed') return state;
  if (state.status === 'failed') {
    throw new Error(`BOOTSTRAP_TERMINAL: ${state.terminalReason}.`);
  }
  return executePending(root, state, executor);
}

export async function bootstrapStatus(root: string, runId: string): Promise<BootstrapState> {
  return loadState(root, runId);
}

/** @id CODE-M5-BOOTSTRAP-003
 * @implements REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004
 * @design DES-M5-013
 */
export async function requestNormalIngestion(
  root: string,
  runId: string,
): Promise<BootstrapIngestionRequest> {
  const state = await loadState(root, runId);
  if (state.status !== 'completed') {
    throw new Error('BOOTSTRAP_INGESTION_NOT_READY: only a completed run can re-enter the normal lifecycle.');
  }
  const request: BootstrapIngestionRequest = {
    schemaVersion: 1,
    runId,
    changeId: state.changeId,
    candidateId: state.candidateId,
    status: 'pending-normal-ingestion',
    normalEvidenceAuthorized: false,
    bootstrapStateSha256: sha256(canonicalBytes(state)),
    completedIterations: state.completedIterations,
    consumedBudget: state.consumedBudget,
    changedPaths: [...new Set(state.history
      .filter((entry) => entry.status === 'completed')
      .flatMap((entry) => entry.changedPaths))].sort(),
  };
  await writeJson(root, `.musubix/evidence/bootstrap/${runId}.attestation.json`, request);
  return request;
}

export async function executeBootstrapFileOperation(
  root: string,
  operation: BootstrapOperation,
  context: { invocationKey: string; candidateId: string },
): Promise<{
  outputDigest: string;
  actualUsage: number;
  candidateDigest: string;
  changedPaths: string[];
}> {
  const target = await safePath(root, operation.targetPath);
  if (operation.kind === 'write') {
    if (typeof operation.content !== 'string'
      || sha256(Buffer.from(operation.content)) !== operation.inputDigest) {
      throw new Error('BOOTSTRAP_WRITE_INPUT_INVALID: write content must match inputDigest.');
    }
    await writeText(root, operation.targetPath, operation.content);
  }
  const bytes = await readFile(target);
  const outputDigest = sha256(bytes);
  return {
    outputDigest,
    actualUsage: operation.estimatedUsage,
    candidateDigest: sha256(canonicalBytes({
      candidateId: context.candidateId,
      invocationKey: context.invocationKey,
      targetPath: operation.targetPath,
      outputDigest,
    })),
    changedPaths: operation.kind === 'write' ? [operation.targetPath] : [],
  };
}
