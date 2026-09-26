const candidateIdPattern = /^candidate:([a-f0-9]{64})$/;
const integrationIdPattern = /^integration:([a-f0-9]{64})$/;
const candidateKeyPattern = /^candidate-([a-f0-9]{64})$/;
const integrationKeyPattern = /^integration-([a-f0-9]{64})$/;

declare const candidateFilesystemKeyBrand: unique symbol;
declare const integrationFilesystemKeyBrand: unique symbol;

export type CandidateFilesystemKey = string & {
  readonly [candidateFilesystemKeyBrand]: true;
};

export type IntegrationFilesystemKey = string & {
  readonly [integrationFilesystemKeyBrand]: true;
};

function ownershipError(message: string): Error {
  return new Error(`CANDIDATE_STATE_OWNERSHIP: ${message}`);
}

/** @id CODE-M5-CANDIDATE-PATH-PORTABILITY-001
 * @implements REQ-M5-MULTI-CHANGE-004
 * @design DES-M5-MULTI-CHANGE-010
 */
export function candidateFilesystemKey(candidateId: string): CandidateFilesystemKey {
  const match = candidateIdPattern.exec(candidateId);
  if (!match) throw ownershipError('candidate ID is not canonical.');
  return `candidate-${match[1]}` as CandidateFilesystemKey;
}

export function integrationFilesystemKey(integrationId: string): IntegrationFilesystemKey {
  const match = integrationIdPattern.exec(integrationId);
  if (!match) throw ownershipError('integration ID is not canonical.');
  return `integration-${match[1]}` as IntegrationFilesystemKey;
}

export function logicalOwnerFromFilesystemKey(
  key: string,
): `candidate:${string}` | `integration:${string}` {
  const candidate = candidateKeyPattern.exec(key);
  if (candidate) return `candidate:${candidate[1]}`;
  const integration = integrationKeyPattern.exec(key);
  if (integration) return `integration:${integration[1]}`;
  throw ownershipError('candidate state directory is not canonical.');
}

export function integrationWorktreeRelativePath(integrationId: string): string {
  return `musubix5/workspaces/integrations/${integrationFilesystemKey(integrationId)}`;
}

export function normalizeCandidatePathError(error: unknown): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && ['EINVAL', 'ENAMETOOLONG', 'ENOENT'].includes(code)) {
    return ownershipError(`candidate state path was rejected by the platform (${code}).`);
  }
  return error instanceof Error ? error : ownershipError(String(error));
}
