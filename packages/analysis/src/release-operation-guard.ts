import { canonicalBytes, sha256 } from './canonical.js';
import { exists, readText, safePath, writeJson } from './files.js';
import { readReleaseApprovalDigest } from './approval.js';

export type ReleaseOperationScope = 'publish' | 'release' | 'tag' | 'push';
type ReleaseOperationStatus = 'authorized' | 'executing' | 'completed';

interface ReleaseOperationHistoryEntry {
  order: number;
  status: ReleaseOperationStatus;
  outputSha256: string | null;
}

export interface LegacyReleaseOperationAuthorization {
  schemaVersion: 1;
  operationId: string;
  scope: Exclude<ReleaseOperationScope, 'release'>;
  candidateSha256: string;
  releaseApprovalSha256: string;
  authorizer: string;
  authorizationSha256: string;
  status: ReleaseOperationStatus;
  history: ReleaseOperationHistoryEntry[];
  outputSha256: string | null;
}

export interface ReleaseOperationAuthorization {
  schemaVersion: 2;
  operationId: string;
  scope: ReleaseOperationScope;
  candidateCommit: string;
  releaseApprovalSha256: string;
  releaseTag: string;
  authorizer: string;
  authorizationSha256: string;
  status: ReleaseOperationStatus;
  history: ReleaseOperationHistoryEntry[];
  outputSha256: string | null;
}

export type ReadableReleaseOperationAuthorization =
  | LegacyReleaseOperationAuthorization
  | ReleaseOperationAuthorization;

export interface ReleaseOperationBinding {
  scope: ReleaseOperationScope;
  candidateCommit: string;
  releaseTag: string;
}

export interface ValidatedReleaseOperationAuthorization extends ReleaseOperationAuthorization {
  verifiedReleaseApprovalSha256: string;
}

function authorizationPath(operationId: string): string {
  return `.musubix/evidence/release/operations/${operationId}.json`;
}

function validateOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(operationId)) {
    throw new Error('RELEASE_OPERATION_ID_INVALID: operationId must be a safe identifier.');
  }
}

function validHistory(value: ReadableReleaseOperationAuthorization): boolean {
  if (!Array.isArray(value.history) || value.history.length === 0) return false;
  const entriesValid = value.history.every((entry, index) =>
    entry.order === index + 1
    && (entry.status === 'authorized' || entry.status === 'executing' || entry.status === 'completed')
    && (entry.outputSha256 === null || /^[a-f0-9]{64}$/.test(entry.outputSha256))
    && (index !== 0 || entry.status === 'authorized'));
  const final = value.history.at(-1)!;
  return entriesValid
    && final.status === value.status
    && final.outputSha256 === value.outputSha256
    && (value.status === 'completed'
      ? typeof value.outputSha256 === 'string'
      : value.outputSha256 === null);
}

function v1Identity(value: LegacyReleaseOperationAuthorization): Record<string, unknown> {
  return {
    operationId: value.operationId,
    scope: value.scope,
    candidateSha256: value.candidateSha256,
    releaseApprovalSha256: value.releaseApprovalSha256,
    authorizer: value.authorizer,
  };
}

function v2Identity(value: Pick<ReleaseOperationAuthorization,
  'schemaVersion' | 'operationId' | 'scope' | 'candidateCommit'
  | 'releaseApprovalSha256' | 'releaseTag' | 'authorizer'>): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    operationId: value.operationId,
    scope: value.scope,
    candidateCommit: value.candidateCommit,
    releaseApprovalSha256: value.releaseApprovalSha256,
    releaseTag: value.releaseTag,
    authorizer: value.authorizer,
  };
}

function validReleaseTag(value: string): boolean {
  return /^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(value);
}

async function loadAuthorization(
  root: string,
  operationId: string,
): Promise<ReadableReleaseOperationAuthorization> {
  validateOperationId(operationId);
  const path = authorizationPath(operationId);
  if (!await exists(await safePath(root, path))) {
    throw new Error(`RELEASE_OPERATION_NOT_AUTHORIZED: ${operationId}.`);
  }
  const value = JSON.parse(await readText(root, path)) as ReadableReleaseOperationAuthorization;
  if (value.operationId !== operationId || !validHistory(value)) {
    throw new Error(`RELEASE_OPERATION_AUTHORIZATION_INVALID: ${operationId}.`);
  }
  if (value.schemaVersion === 1) {
    if (!['publish', 'tag', 'push'].includes(value.scope)
      || !/^[a-f0-9]{64}$/.test(value.candidateSha256)
      || !/^[a-f0-9]{64}$/.test(value.releaseApprovalSha256)
      || !value.authorizer.trim()
      || value.authorizationSha256 !== sha256(canonicalBytes(v1Identity(value)))) {
      throw new Error(`RELEASE_OPERATION_AUTHORIZATION_INVALID: ${operationId}.`);
    }
    return value;
  }
  if (value.schemaVersion !== 2
    || !['publish', 'release', 'tag', 'push'].includes(value.scope)
    || !/^[a-f0-9]{40,64}$/.test(value.candidateCommit)
    || !/^[a-f0-9]{64}$/.test(value.releaseApprovalSha256)
    || !validReleaseTag(value.releaseTag)
    || !value.authorizer.trim()
    || value.authorizationSha256 !== sha256(canonicalBytes(v2Identity(value)))) {
    throw new Error(`RELEASE_OPERATION_AUTHORIZATION_INVALID: ${operationId}.`);
  }
  return value;
}

/** @id CODE-M5-RELEASE-001
 * @implements REQ-M5-RELEASE-001 REQ-M5-BOOTSTRAP-004
 * @design DES-M5-016
 */
export async function authorizeReleaseOperation(root: string, request: {
  operationId: string;
  scope: ReleaseOperationScope;
  candidateCommit: string;
  releaseApprovalSha256: string;
  releaseTag: string;
  authorizer: string;
  confirm: boolean;
}): Promise<ReleaseOperationAuthorization> {
  validateOperationId(request.operationId);
  if (!request.confirm) {
    throw new Error('RELEASE_OPERATION_CONFIRMATION_REQUIRED: explicit external-operation confirmation is required.');
  }
  if (!['publish', 'release', 'tag', 'push'].includes(request.scope)
    || !/^[a-f0-9]{40,64}$/.test(request.candidateCommit)
    || !/^[a-f0-9]{64}$/.test(request.releaseApprovalSha256)
    || !validReleaseTag(request.releaseTag)
    || !request.authorizer.trim()) {
    throw new Error('RELEASE_OPERATION_AUTHORIZATION_INVALID: scope, candidate, approval, tag, and authorizer are required.');
  }
  const path = authorizationPath(request.operationId);
  if (await exists(await safePath(root, path))) {
    throw new Error(`RELEASE_OPERATION_EXISTS: ${request.operationId}.`);
  }
  const identity = {
    schemaVersion: 2 as const,
    operationId: request.operationId,
    scope: request.scope,
    candidateCommit: request.candidateCommit,
    releaseApprovalSha256: request.releaseApprovalSha256,
    releaseTag: request.releaseTag,
    authorizer: request.authorizer,
  };
  const authorization: ReleaseOperationAuthorization = {
    ...identity,
    authorizationSha256: sha256(canonicalBytes(identity)),
    status: 'authorized',
    history: [{ order: 1, status: 'authorized', outputSha256: null }],
    outputSha256: null,
  };
  await writeJson(root, path, authorization);
  return authorization;
}

export async function releaseOperationStatus(
  root: string,
  operationId: string,
): Promise<ReadableReleaseOperationAuthorization> {
  return loadAuthorization(root, operationId);
}

export async function validateReleaseOperationAuthorization(
  root: string,
  operationId: string,
  request: ReleaseOperationBinding,
  dependencies: {
    readReleaseApprovalDigest?: typeof readReleaseApprovalDigest;
  } = {},
): Promise<ValidatedReleaseOperationAuthorization> {
  const authorization = await loadAuthorization(root, operationId);
  if (authorization.schemaVersion !== 2
    || authorization.status !== 'authorized'
    || authorization.scope !== request.scope
    || authorization.candidateCommit !== request.candidateCommit
    || authorization.releaseTag !== request.releaseTag) {
    throw new Error(`RELEASE_OPERATION_NOT_AUTHORIZED: ${operationId} does not match the requested release operation.`);
  }
  let verifiedReleaseApprovalSha256: string;
  try {
    verifiedReleaseApprovalSha256 = await (
      dependencies.readReleaseApprovalDigest ?? readReleaseApprovalDigest
    )(root, request.candidateCommit);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`RELEASE_OPERATION_NOT_AUTHORIZED: ${detail}`);
  }
  if (authorization.releaseApprovalSha256 !== verifiedReleaseApprovalSha256) {
    throw new Error('RELEASE_OPERATION_NOT_AUTHORIZED: authorization is bound to another release approval.');
  }
  return { ...authorization, verifiedReleaseApprovalSha256 };
}

/**
 * @deprecated Legacy local-only state transition retained for direct-module
 * compatibility. Public release workflows must call
 * validateReleaseOperationAuthorization and perform side effects separately.
 */
export async function executeReleaseOperation(
  root: string,
  operationId: string,
  request: ReleaseOperationBinding,
  executor: () => Promise<{ outputSha256: string }>,
): Promise<ReleaseOperationAuthorization> {
  const authorization = await loadAuthorization(root, operationId);
  if (authorization.schemaVersion !== 2) {
    throw new Error(`RELEASE_OPERATION_NOT_AUTHORIZED: ${operationId} uses a historical schema.`);
  }
  if (authorization.status !== 'authorized') {
    throw new Error(`RELEASE_OPERATION_ALREADY_USED: ${operationId}.`);
  }
  if (authorization.scope !== request.scope) {
    throw new Error(`RELEASE_OPERATION_SCOPE_MISMATCH: authorized ${authorization.scope}, requested ${request.scope}.`);
  }
  if (authorization.candidateCommit !== request.candidateCommit) {
    throw new Error('RELEASE_OPERATION_CANDIDATE_MISMATCH: authorization is bound to another candidate.');
  }
  if (authorization.releaseTag !== request.releaseTag) {
    throw new Error('RELEASE_OPERATION_TAG_MISMATCH: authorization is bound to another release tag.');
  }
  authorization.status = 'executing';
  authorization.history.push({
    order: authorization.history.length + 1,
    status: 'executing',
    outputSha256: null,
  });
  await writeJson(root, authorizationPath(operationId), authorization);
  const executed = await executor();
  if (!/^[a-f0-9]{64}$/.test(executed.outputSha256)) {
    throw new Error('RELEASE_OPERATION_OUTPUT_INVALID: executor must return a SHA-256 digest.');
  }
  authorization.status = 'completed';
  authorization.outputSha256 = executed.outputSha256;
  authorization.history.push({
    order: authorization.history.length + 1,
    status: 'completed',
    outputSha256: executed.outputSha256,
  });
  await writeJson(root, authorizationPath(operationId), authorization);
  return authorization;
}
