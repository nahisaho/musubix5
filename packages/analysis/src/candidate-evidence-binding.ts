import { error, type Diagnostic } from '../../domain/src/index.js';
import { canonicalBytes, sha256 } from './canonical.js';

export interface CandidateEvidenceContext {
  repositoryId: string;
  candidateId: string;
  changeId: string;
  generation: number;
  baseCommit: string;
  candidateCommit?: string;
}

export interface CandidateEvidenceBinding {
  schemaVersion: 1;
  kind: 'candidate';
  repositoryId: string;
  candidateId: string;
  changeId: string;
  generation: number;
  baseCommit: string;
  candidateCommit: string;
}

export interface IntegrationEvidenceContext {
  repositoryId: string;
  integrationId: string;
  startingDefaultCommit: string;
  candidates: Array<CandidateEvidenceContext & { candidateCommit: string }>;
  applyOrder: string[];
  sourceManifestSha256: string;
  integrationCommit?: string;
}

export interface IntegrationEvidenceBinding {
  schemaVersion: 1;
  kind: 'integration';
  repositoryId: string;
  integrationId: string;
  startingDefaultCommit: string;
  candidates: Array<CandidateEvidenceContext & { candidateCommit: string }>;
  applyOrder: string[];
  sourceManifestSha256: string;
  integrationCommit?: string;
}

export type EvidenceBinding = CandidateEvidenceBinding | IntegrationEvidenceBinding;

const gitObjectId = /^[a-f0-9]{40,64}$/;
const candidateIdentity = /^candidate:[a-f0-9]{64}$/;
const integrationIdentity = /^integration:[a-f0-9]{64}$/;

function assertCandidateContext(
  context: CandidateEvidenceContext,
  candidateCommit: string,
): void {
  if (!context.repositoryId
    || !candidateIdentity.test(context.candidateId)
    || !/^CHANGE-\d+$/.test(context.changeId)
    || !Number.isInteger(context.generation) || context.generation < 1
    || !gitObjectId.test(context.baseCommit)
    || !gitObjectId.test(candidateCommit)) {
    throw new Error('CANDIDATE_EVIDENCE_MISMATCH: candidate evidence context is invalid.');
  }
}

/** @id CODE-M5-CANDIDATE-EVIDENCE-BINDING-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
 * @design DES-M5-MULTI-CHANGE-005
 */
export function candidateEvidenceBinding(
  context: CandidateEvidenceContext,
  candidateCommit = context.candidateCommit ?? '',
): CandidateEvidenceBinding {
  assertCandidateContext(context, candidateCommit);
  return {
    schemaVersion: 1,
    kind: 'candidate',
    repositoryId: context.repositoryId,
    candidateId: context.candidateId,
    changeId: context.changeId,
    generation: context.generation,
    baseCommit: context.baseCommit,
    candidateCommit,
  };
}

/** @id CODE-M5-INTEGRATION-EVIDENCE-BINDING-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-PARALLEL-010
 * @design DES-M5-MULTI-CHANGE-005
 */
export function integrationEvidenceBinding(
  context: IntegrationEvidenceContext,
): IntegrationEvidenceBinding {
  if (!context.repositoryId
    || !integrationIdentity.test(context.integrationId)
    || !gitObjectId.test(context.startingDefaultCommit)
    || !/^[a-f0-9]{64}$/.test(context.sourceManifestSha256)
    || (context.integrationCommit !== undefined && !gitObjectId.test(context.integrationCommit))
    || !context.candidates.length) {
    throw new Error('CANDIDATE_EVIDENCE_MISMATCH: integration evidence context is invalid.');
  }
  const candidates = context.candidates
    .map((entry) => {
      assertCandidateContext(entry, entry.candidateCommit);
      return { ...entry };
    })
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const candidateIds = new Set(candidates.map((entry) => entry.candidateId));
  if (candidateIds.size !== candidates.length
    || context.applyOrder.length !== candidates.length
    || new Set(context.applyOrder).size !== candidates.length
    || context.applyOrder.some((candidateId) => !candidateIds.has(candidateId))) {
    throw new Error('CANDIDATE_EVIDENCE_MISMATCH: integration apply order does not match its candidate set.');
  }
  return {
    schemaVersion: 1,
    kind: 'integration',
    repositoryId: context.repositoryId,
    integrationId: context.integrationId,
    startingDefaultCommit: context.startingDefaultCommit,
    candidates,
    applyOrder: [...context.applyOrder],
    sourceManifestSha256: context.sourceManifestSha256,
    ...(context.integrationCommit ? { integrationCommit: context.integrationCommit } : {}),
  };
}

export function integrationApprovalContext(
  context: IntegrationEvidenceContext,
): { changeId: string; generation: number } {
  const owner = integrationEvidenceBinding(context).candidates
    .sort((left, right) => Buffer.compare(Buffer.from(left.changeId), Buffer.from(right.changeId)))[0]!;
  return { changeId: owner.changeId, generation: owner.generation };
}

function candidateBindingOf(record: unknown): CandidateEvidenceBinding | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const value = record as Record<string, unknown>;
  const binding = value.binding && typeof value.binding === 'object' && !Array.isArray(value.binding)
    ? value.binding as Record<string, unknown>
    : value;
  return binding.kind === 'candidate' && binding.schemaVersion === 1
    ? binding as unknown as CandidateEvidenceBinding
    : null;
}

export function validateCandidateBinding(
  record: unknown,
  context: CandidateEvidenceContext | null,
): { valid: boolean; diagnostics: Diagnostic[] } {
  if (context === null) return { valid: true, diagnostics: [] };
  const expected = candidateEvidenceBinding(context);
  const actual = candidateBindingOf(record);
  const valid = actual !== null
    && actual.repositoryId === expected.repositoryId
    && actual.candidateId === expected.candidateId
    && actual.changeId === expected.changeId
    && actual.generation === expected.generation
    && actual.baseCommit === expected.baseCommit
    && actual.candidateCommit === expected.candidateCommit;
  return valid ? { valid, diagnostics: [] } : {
    valid,
    diagnostics: [{
      ...error(
        'CANDIDATE_EVIDENCE_MISMATCH',
        `Evidence is not bound to ${expected.changeId} generation ${expected.generation} candidate ${expected.candidateId}.`,
      ),
      changeId: expected.changeId,
    }],
  };
}

export function candidateEvidenceInputs(
  binding: EvidenceBinding,
  inputs: Record<string, unknown> = {},
): { schemaVersion: 1; binding: EvidenceBinding; inputs: Record<string, unknown>; sha256: string } {
  const identity = { schemaVersion: 1 as const, binding, inputs };
  return { ...identity, sha256: sha256(canonicalBytes(identity)) };
}

export function candidateEvidencePath(
  context: Pick<CandidateEvidenceContext, 'candidateId'> | null,
  relativePath: string,
): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.musubix\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('CANDIDATE_STATE_OWNERSHIP: candidate evidence path escapes its owned projection.');
  }
  if (context === null) return `.musubix/${normalized}`;
  if (!candidateIdentity.test(context.candidateId)) {
    throw new Error('CANDIDATE_STATE_OWNERSHIP: candidate identity is invalid.');
  }
  return `.musubix/candidates/${context.candidateId}/${normalized}`;
}

export function preserveEvidenceDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(diagnostic.waiver ? { waiver: { ...diagnostic.waiver } } : {}),
  }));
}
