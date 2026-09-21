import { canonicalBytes, sha256 } from './canonical.js';
import { exists, readText, safePath, writeJson } from './files.js';

export type ReleaseOperationScope = 'publish' | 'tag' | 'push';

export interface ReleaseOperationAuthorization {
  schemaVersion: 1;
  operationId: string;
  scope: ReleaseOperationScope;
  candidateSha256: string;
  releaseApprovalSha256: string;
  authorizer: string;
  authorizationSha256: string;
  status: 'authorized' | 'executing' | 'completed';
  history: Array<{
    order: number;
    status: 'authorized' | 'executing' | 'completed';
    outputSha256: string | null;
  }>;
  outputSha256: string | null;
}

function authorizationPath(operationId: string): string {
  return `.musubix/evidence/release/operations/${operationId}.json`;
}

function validateOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(operationId)) {
    throw new Error('RELEASE_OPERATION_ID_INVALID: operationId must be a safe identifier.');
  }
}

async function loadAuthorization(
  root: string,
  operationId: string,
): Promise<ReleaseOperationAuthorization> {
  validateOperationId(operationId);
  const path = authorizationPath(operationId);
  if (!await exists(await safePath(root, path))) {
    throw new Error(`RELEASE_OPERATION_NOT_AUTHORIZED: ${operationId}.`);
  }
  const value = JSON.parse(await readText(root, path)) as ReleaseOperationAuthorization;
  if (value.schemaVersion !== 1 || value.operationId !== operationId
    || !Array.isArray(value.history)) {
    throw new Error(`RELEASE_OPERATION_AUTHORIZATION_INVALID: ${operationId}.`);
  }
  const identity = {
    operationId: value.operationId,
    scope: value.scope,
    candidateSha256: value.candidateSha256,
    releaseApprovalSha256: value.releaseApprovalSha256,
    authorizer: value.authorizer,
  };
  const historyValid = value.history.every((entry, index) =>
    entry.order === index + 1
    && (index === 0 ? entry.status === 'authorized' : true));
  if (value.authorizationSha256 !== sha256(canonicalBytes(identity)) || !historyValid) {
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
  candidateSha256: string;
  releaseApprovalSha256: string;
  authorizer: string;
  confirm: boolean;
}): Promise<ReleaseOperationAuthorization> {
  validateOperationId(request.operationId);
  if (!request.confirm) {
    throw new Error('RELEASE_OPERATION_CONFIRMATION_REQUIRED: explicit external-operation confirmation is required.');
  }
  if (!['publish', 'tag', 'push'].includes(request.scope)
    || !/^[a-f0-9]{64}$/.test(request.candidateSha256)
    || !/^[a-f0-9]{64}$/.test(request.releaseApprovalSha256)
    || !request.authorizer.trim()) {
    throw new Error('RELEASE_OPERATION_AUTHORIZATION_INVALID: scope, candidate, approval, and authorizer are required.');
  }
  const path = authorizationPath(request.operationId);
  if (await exists(await safePath(root, path))) {
    throw new Error(`RELEASE_OPERATION_EXISTS: ${request.operationId}.`);
  }
  const identity = {
    operationId: request.operationId,
    scope: request.scope,
    candidateSha256: request.candidateSha256,
    releaseApprovalSha256: request.releaseApprovalSha256,
    authorizer: request.authorizer,
  };
  const authorization: ReleaseOperationAuthorization = {
    schemaVersion: 1,
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
): Promise<ReleaseOperationAuthorization> {
  return loadAuthorization(root, operationId);
}

export async function executeReleaseOperation(
  root: string,
  operationId: string,
  request: { scope: ReleaseOperationScope; candidateSha256: string },
  executor: () => Promise<{ outputSha256: string }>,
): Promise<ReleaseOperationAuthorization> {
  const authorization = await loadAuthorization(root, operationId);
  if (authorization.status !== 'authorized') {
    throw new Error(`RELEASE_OPERATION_ALREADY_USED: ${operationId}.`);
  }
  if (authorization.scope !== request.scope) {
    throw new Error(`RELEASE_OPERATION_SCOPE_MISMATCH: authorized ${authorization.scope}, requested ${request.scope}.`);
  }
  if (authorization.candidateSha256 !== request.candidateSha256) {
    throw new Error('RELEASE_OPERATION_CANDIDATE_MISMATCH: authorization is bound to another candidate.');
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
