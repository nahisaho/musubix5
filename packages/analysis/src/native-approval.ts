import { canonicalBytes, sha256 } from './canonical.js';
import { loadApprovalProjectionConfig } from './config.js';
import { appendEvidence } from './evidence-registry.js';
import { snapshot, writeJson } from './files.js';
import { error, type Diagnostic } from '../../domain/src/index.js';
import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  releaseChangeLease,
} from './journal.js';
import {
  buildReleaseCandidateContent, releaseExclusionIdentity,
} from './release-manifest.js';
import {
  resolveNormativeArtifacts, snapshotNormativeArtifacts,
} from './approval-normative.js';

export type NativeApprovalStage = 'requirements' | 'design' | 'release';

export interface NativeApprovalManifest {
  schemaVersion: 1;
  stage: NativeApprovalStage;
  domain?: string;
  changeId?: string;
  artifacts: Record<string, string>;
  projection: unknown;
  exclusions: Array<{ path: string; reason: string; sha256: string }>;
  artifactSha256: string;
}

export interface PrepareNativeApprovalInput {
  stage: NativeApprovalStage;
  paths: string[];
  projection: unknown;
  changeId?: string;
  exclusions?: Array<{ path: string; reason: string; sha256: string }>;
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

export interface ApprovalSupersession {
  order: number;
  stage: NativeApprovalStage;
  previousHead: string;
  currentHead: string;
  affectedKinds: string[];
}

export interface BootstrapApprovalBinding {
  changeId: string;
  repositoryId: string;
  producerId: string;
  stage: 'requirements' | 'design';
  artifactSha256: string;
  projectionSha256: string;
}

export interface BootstrapApprovalRecord extends BootstrapApprovalBinding {
  approver: string;
}

export async function prepareNativeApproval(
  root: string,
  input: PrepareNativeApprovalInput,
): Promise<NativeApprovalManifest> {
  const paths = [...new Set(input.paths)].sort();
  const artifacts = await snapshot(root, paths);
  return nativeManifestFromArtifacts(input.stage, artifacts, input.projection, {
    ...(input.changeId ? { changeId: input.changeId } : {}),
    ...(input.exclusions ? { exclusions: input.exclusions } : {}),
  });
}

function nativeManifestFromArtifacts(
  stage: NativeApprovalStage,
  artifacts: Record<string, string>,
  projection: unknown,
  input: {
    changeId?: string;
    exclusions?: Array<{ path: string; reason: string; sha256: string }>;
  } = {},
): NativeApprovalManifest {
  const payload = {
    schemaVersion: 1 as const,
    stage,
    ...(input.changeId ? { changeId: input.changeId } : {}),
    artifacts,
    projection,
    exclusions: input.exclusions ?? [],
  };
  const digestPayload = {
    ...payload,
    exclusions: releaseExclusionIdentity(payload.exclusions),
  };
  return {
    ...payload,
    artifactSha256: sha256(canonicalBytes(digestPayload)),
  };
}

const designProjectionKeys = [
  'schemaVersion',
  'commands',
  'requiredChecks',
  'thresholds',
  'architecture',
  'codeGraph',
  'formal',
  'mutation',
  'tdd',
  'workflow',
  'attestation',
] as const;

function selectProjection(config: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, config[key]]));
}

/** @id CODE-M5-APPROVAL-007
 * @implements REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013 REQ-M5-WORKTREE-001
 * @design DES-M5-006
 */
export async function prepareStageApproval(root: string, input: {
  stage: NativeApprovalStage;
  changeId: string;
  runLocalPaths: string[];
}): Promise<NativeApprovalManifest> {
  if (input.stage === 'release') {
    const content = await buildReleaseCandidateContent(root, input.changeId);
    const payload = {
      schemaVersion: 1 as const,
      stage: input.stage,
      changeId: content.changeId,
      artifacts: content.artifacts,
      projection: null,
      exclusions: content.exclusions,
    };
    return {
      ...payload,
      artifactSha256: sha256(canonicalBytes({
        ...payload,
        exclusions: releaseExclusionIdentity(content.exclusions),
      })),
    };
  }
  const config = await loadApprovalProjectionConfig(root);
  if (input.stage === 'requirements') {
    const artifacts = await snapshotNormativeArtifacts(
      root,
      await resolveNormativeArtifacts(root, 'requirements'),
    );
    return nativeManifestFromArtifacts(input.stage, artifacts, selectProjection(
      config as unknown as Record<string, unknown>,
      ['schemaVersion', 'approval'],
    ));
  }
  if (input.stage === 'design') {
    const artifacts = await snapshotNormativeArtifacts(
      root,
      await resolveNormativeArtifacts(root, 'design'),
    );
    return nativeManifestFromArtifacts(
      input.stage,
      artifacts,
      selectProjection(config as unknown as Record<string, unknown>, designProjectionKeys),
    );
  }
  throw new Error(`APPROVAL_STAGE_INVALID: ${input.stage}`);
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
  const manifest = input.stage === 'release'
    ? await prepareStageApproval(root, {
      stage: 'release',
      changeId: input.changeId,
      runLocalPaths: [],
    })
    : await prepareNativeApproval(root, {
      stage: input.stage,
      paths: input.paths,
      projection: input.projection,
      ...(input.exclusions ? { exclusions: input.exclusions } : {}),
    });
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

const requirementsDependents = [
  'requirements-approval',
  'design-approval',
  'tdd',
  'integration',
  'trace',
  'graph',
  'workflow',
  'quality',
  'release-review',
  'release-approval',
  'package',
];
const designDependents = requirementsDependents.slice(1);
const releaseDependents = ['release-approval'];

/** @id CODE-M5-APPROVAL-008
 * @implements REQ-M5-APPROVAL-008
 * @design DES-M5-006
 */
export async function supersedeFrom(root: string, input: {
  changeId: string;
  stage: NativeApprovalStage;
  previousHead: string;
  currentHead: string;
  idempotencyKey: string;
}): Promise<ApprovalSupersession> {
  if (input.previousHead === input.currentHead) {
    throw new Error('APPROVAL_SUPERSESSION_UNCHANGED: dependency head did not change.');
  }
  const lease = await acquireChangeLease(root, input.changeId);
  try {
    await assertChangeLeaseCurrent(lease);
    const affectedKinds = input.stage === 'requirements'
      ? requirementsDependents
      : input.stage === 'design' ? designDependents : releaseDependents;
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: input.changeId,
      kind: 'approval-supersession',
      idempotencyKey: input.idempotencyKey,
      payload: {
        stage: input.stage,
        previousHead: input.previousHead,
        currentHead: input.currentHead,
        affectedKinds,
      },
    });
    return {
      order: record.order,
      stage: input.stage,
      previousHead: input.previousHead,
      currentHead: input.currentHead,
      affectedKinds: [...affectedKinds],
    };
  } finally {
    await releaseChangeLease(lease);
  }
}

/** @id CODE-M5-APPROVAL-009
 * @implements REQ-M5-APPROVAL-009
 * @design DES-M5-006
 */
export function validateBootstrapApproval(
  approval: BootstrapApprovalRecord,
  expected: BootstrapApprovalBinding,
): {
  valid: boolean;
  developmentAuthorized: boolean;
  releaseCurrent: false;
  diagnostics: Diagnostic[];
} {
  const fields = [
    'changeId',
    'repositoryId',
    'producerId',
    'stage',
    'artifactSha256',
    'projectionSha256',
  ] as const;
  const mismatches = fields.filter((field) => approval[field] !== expected[field]);
  if (mismatches.length || !approval.approver.trim()) {
    return {
      valid: false,
      developmentAuthorized: false,
      releaseCurrent: false,
      diagnostics: [error(
        'BOOTSTRAP_APPROVAL_BINDING_MISMATCH',
        `Bootstrap approval does not match ${mismatches.join(', ') || 'approver'} binding.`,
      )],
    };
  }
  return {
    valid: true,
    developmentAuthorized: true,
    releaseCurrent: false,
    diagnostics: [],
  };
}
