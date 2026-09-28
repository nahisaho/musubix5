import { error, type Diagnostic } from '../../domain/src/index.js';
import { canonicalBytes } from './canonical.js';
import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  releaseChangeLease,
} from './journal.js';

export const evidenceKinds = [
  'trace',
  'graph',
  'tdd',
  'workflow',
  'approval',
  'release',
  'benchmark',
  'waiver',
  'budget',
  'bootstrap',
  'integration',
  'quality',
  'package',
] as const;

export type EvidenceKind = typeof evidenceKinds[number];
export type EvidenceStatus =
  | 'pass'
  | 'failed'
  | 'skipped'
  | 'unsupported'
  | 'flaky'
  | 'waived';
export type EvidenceClassification = EvidenceStatus | 'stale' | 'foreign';

export interface EvidencePolicy {
  kind: EvidenceKind;
  storagePath: string;
  freshnessBindings: readonly ['producer', 'repository', 'candidate', 'change', 'input', 'dependencies', 'order'];
}

export type ReleaseEvidenceRequirement =
  | 'requirements-approval'
  | 'design-approval'
  | 'tdd'
  | 'integration'
  | 'trace'
  | 'graph'
  | 'formal-classification'
  | 'workflow'
  | 'quality'
  | 'release-review'
  | 'release-approval'
  | 'package'
  | 'budget'
  | 'bootstrap'
  | 'benchmark'
  | 'waiver';

export interface EvidenceRecord {
  schemaVersion: 1;
  kind: EvidenceKind;
  producerId: string;
  repositoryId: string;
  candidateId: string;
  changeId: string;
  inputDigest: string;
  dependencyHeads: Record<string, string>;
  status: EvidenceStatus;
  order: number;
  payload: unknown;
}

export interface EvidenceContext {
  producerId: string;
  repositoryId: string;
  candidateId: string;
  changeId: string;
  inputDigest: string;
  dependencyHeads: Record<string, string>;
  supersedingOrder: number;
}

export interface EvidenceClassificationResult {
  classification: EvidenceClassification;
  current: boolean;
  diagnostics: Diagnostic[];
}

export interface AppendEvidenceInput extends Omit<EvidenceRecord, 'schemaVersion' | 'order'> {
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalBytes(left).equals(canonicalBytes(right));
}

const policies = new Map<EvidenceKind, EvidencePolicy>(evidenceKinds.map((kind) => [kind, {
  kind,
  storagePath: `.musubix/evidence/${kind}/`,
  freshnessBindings: ['producer', 'repository', 'candidate', 'change', 'input', 'dependencies', 'order'],
}]));

/** @id CODE-M5-EVIDENCE-001
 * @implements REQ-M5-EVIDENCE-001
 * @design DES-M5-007
 */
export function evidencePolicy(kind: EvidenceKind): EvidencePolicy {
  const policy = policies.get(kind);
  if (!policy) throw new Error(`EVIDENCE_KIND_UNKNOWN: ${String(kind)} is not generated evidence.`);
  return {
    ...policy,
    freshnessBindings: [...policy.freshnessBindings],
  };
}

const mandatoryReleaseEvidence: ReleaseEvidenceRequirement[] = [
  'requirements-approval',
  'design-approval',
  'tdd',
  'integration',
  'trace',
  'graph',
  'formal-classification',
  'workflow',
  'quality',
  'release-review',
  'release-approval',
  'package',
];

/** @id CODE-M5-EVIDENCE-004
 * @implements REQ-M5-EVIDENCE-004
 * @design DES-M5-007 DES-M5-015
 */
export function requiredReleaseEvidence(input: {
  configuredKinds: ReleaseEvidenceRequirement[];
  usedBootstrap: boolean;
  usedBudget: boolean;
}): ReleaseEvidenceRequirement[] {
  const required = [...mandatoryReleaseEvidence];
  for (const kind of [...input.configuredKinds].sort()) {
    if (!required.includes(kind)) required.push(kind);
  }
  if (input.usedBudget && !required.includes('budget')) required.push('budget');
  if (input.usedBootstrap && !required.includes('bootstrap')) required.push('bootstrap');
  return required;
}

/** @id CODE-M5-EVIDENCE-002
 * @implements REQ-M5-EVIDENCE-002
 * @design DES-M5-007
 */
export function classifyEvidence(value: unknown, context: EvidenceContext): EvidenceClassificationResult {
  if (!isRecord(value)) {
    return {
      classification: 'foreign',
      current: false,
      diagnostics: [error('INCOMPATIBLE_EVIDENCE', 'Evidence is missing its identity envelope.')],
    };
  }

  const identityFields = ['producerId', 'repositoryId', 'candidateId', 'changeId'] as const;
  const foreign = identityFields.filter((field) =>
    typeof value[field] !== 'string' || value[field] !== context[field]);
  if (foreign.length) {
    return {
      classification: 'foreign',
      current: false,
      diagnostics: [error(
        'INCOMPATIBLE_EVIDENCE',
        `Evidence identity does not match the current ${foreign.join(', ')} binding.`,
      )],
    };
  }

  if (value.schemaVersion !== 1
    || typeof value.kind !== 'string'
    || !evidenceKinds.includes(value.kind as EvidenceKind)
    || typeof value.inputDigest !== 'string'
    || !isRecord(value.dependencyHeads)
    || typeof value.order !== 'number'
    || !Number.isInteger(value.order)
    || typeof value.status !== 'string'
    || !['pass', 'failed', 'skipped', 'unsupported', 'flaky', 'waived'].includes(value.status)) {
    return {
      classification: 'foreign',
      current: false,
      diagnostics: [error('INCOMPATIBLE_EVIDENCE', 'Evidence has an unknown or malformed schema.')],
    };
  }

  if (value.inputDigest !== context.inputDigest
    || !sameValue(value.dependencyHeads, context.dependencyHeads)
    || value.order < context.supersedingOrder) {
    return {
      classification: 'stale',
      current: false,
      diagnostics: [error('EVIDENCE_STALE', 'Evidence bindings were superseded by current inputs or order.')],
    };
  }
  const classification = value.status as EvidenceStatus;
  return {
    classification,
    current: classification === 'pass',
    diagnostics: classification === 'pass'
      ? []
      : [error(`EVIDENCE_${classification.toUpperCase()}`, `Evidence status is ${classification}.`)],
  };
}

/** @id CODE-M5-EVIDENCE-003
 * @implements REQ-M5-EVIDENCE-003 REQ-M5-EVIDENCE-005
 * @design DES-M5-003 DES-M5-007
 */
export async function appendEvidence(root: string, input: AppendEvidenceInput): Promise<EvidenceRecord> {
  const lease = await acquireChangeLease(root, input.changeId);
  try {
    await assertChangeLeaseCurrent(lease);
    const { idempotencyKey, ...evidence } = input;
    const record = await appendJournalRecord(root, {
      stream: input.kind === 'bootstrap' ? 'bootstrap' : 'normal',
      changeId: input.changeId,
      kind: 'evidence',
      idempotencyKey,
      payload: {
        ...evidence,
        schemaVersion: 1,
      },
    });
    return {
      ...evidence,
      schemaVersion: 1,
      order: record.order,
    };
  } finally {
    await releaseChangeLease(lease);
  }
}
