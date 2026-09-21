import { canonicalBytes, sha256 } from './canonical.js';
import { appendEvidence } from './evidence-registry.js';
import { snapshot, writeJson } from './files.js';

export type NativeApprovalStage = 'requirements' | 'design' | 'release';

export interface NativeApprovalManifest {
  schemaVersion: 1;
  stage: NativeApprovalStage;
  artifacts: Record<string, string>;
  projection: unknown;
  artifactSha256: string;
}

export interface PrepareNativeApprovalInput {
  stage: NativeApprovalStage;
  paths: string[];
  projection: unknown;
}

export interface RecordNativeApprovalInput extends PrepareNativeApprovalInput {
  producerId: string;
  repositoryId: string;
  candidateId: string;
  changeId: string;
  expectedArtifactSha256: string;
  approver: string;
  confirmed: boolean;
  idempotencyKey: string;
}

export interface NativeApprovalEvidence extends NativeApprovalManifest {
  producerId: string;
  repositoryId: string;
  candidateId: string;
  changeId: string;
  approver: string;
  order: number;
}

export async function prepareNativeApproval(
  root: string,
  input: PrepareNativeApprovalInput,
): Promise<NativeApprovalManifest> {
  const paths = [...new Set(input.paths)].sort();
  const artifacts = await snapshot(root, paths);
  const payload = {
    schemaVersion: 1 as const,
    stage: input.stage,
    artifacts,
    projection: input.projection,
  };
  return {
    ...payload,
    artifactSha256: sha256(canonicalBytes(payload)),
  };
}

/** @id CODE-M5-APPROVAL-001
 * @implements REQ-M5-APPROVAL-001
 * @design DES-M5-006
 */
export async function recordNativeApproval(
  root: string,
  input: RecordNativeApprovalInput,
): Promise<NativeApprovalEvidence> {
  if (!input.confirmed) throw new Error('APPROVAL_CONFIRMATION_REQUIRED: explicit confirmation is required.');
  const approver = input.approver.trim();
  if (!approver || approver.includes('\0')) {
    throw new Error('APPROVAL_APPROVER_INVALID: approver must be a nonempty name without NUL bytes.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.expectedArtifactSha256)) {
    throw new Error('APPROVAL_HASH_INVALID: expected artifact SHA-256 must be lowercase hexadecimal.');
  }
  const manifest = await prepareNativeApproval(root, input);
  if (manifest.artifactSha256 !== input.expectedArtifactSha256) {
    throw new Error(
      `APPROVAL_MANIFEST_CHANGED: expected ${input.expectedArtifactSha256}, current ${manifest.artifactSha256}.`,
    );
  }
  const evidence = await appendEvidence(root, {
    kind: 'approval',
    producerId: input.producerId,
    repositoryId: input.repositoryId,
    candidateId: input.candidateId,
    changeId: input.changeId,
    inputDigest: manifest.artifactSha256,
    dependencyHeads: { manifest: manifest.artifactSha256 },
    status: 'pass',
    idempotencyKey: input.idempotencyKey,
    payload: {
      stage: input.stage,
      artifacts: manifest.artifacts,
      projection: manifest.projection,
      approver,
    },
  });
  const approval: NativeApprovalEvidence = {
    ...manifest,
    producerId: input.producerId,
    repositoryId: input.repositoryId,
    candidateId: input.candidateId,
    changeId: input.changeId,
    approver,
    order: evidence.order,
  };
  await writeJson(
    root,
    `.musubix/evidence/approvals/native/${input.stage}.json`,
    approval,
  );
  return approval;
}
