import type { Diagnostic } from '../../domain/src/index.js';
import type { CandidateEvidenceBinding } from './approval.js';

export type TddPhase = 'red' | 'green' | 'refactor';

export interface TddPhaseEvidence {
  phase: TddPhase;
  valid: boolean;
  scoped?: boolean;
  resultObserved?: boolean;
  testStatus?: 'passed' | 'failed' | 'skipped' | 'error';
  reportSha256?: string;
  commandSha256: string;
  outputSha256: string;
  exitCode: number | null;
  durationMs: number;
  testFingerprint: string;
  sourceFingerprint?: string;
  executionId?: string;
  order?: number;
  recordedAt: string;
  diagnostics: Diagnostic[];
  warnings?: Diagnostic[];
}

export type TddChainPhase = TddPhase | 'migrate' | 'void' | 'repair';

export interface TddMigrationEvidence {
  phase: 'migrate';
  fromFingerprint: string;
  toFingerprint: string;
  approver: string;
  order?: number;
  recordedAt: string;
}

export interface TddVoidEvidence {
  phase: 'void';
  approver: string;
  reason: string;
  order?: number;
  recordedAt: string;
}

export interface TddCycle {
  cycleId?: string;
  changeId?: string;
  generation?: number;
  binding?: CandidateEvidenceBinding;
  requirementId: string;
  testId: string;
  testPath: string;
  commandName: string;
  parallel?: {
    planId: string;
    assignmentId: string;
    attempt: number;
    worktree: string;
    startCommit: string;
  };
  red: TddPhaseEvidence;
  green?: TddPhaseEvidence;
  refactor?: TddPhaseEvidence;
  migrate?: TddMigrationEvidence;
  void?: TddVoidEvidence;
}

export interface TddChainRecord {
  sequence: number;
  cycleId: string;
  changeId?: string;
  generation?: number;
  binding?: CandidateEvidenceBinding;
  requirementId: string;
  testId: string;
  testPath: string;
  commandName: string;
  parallel?: TddCycle['parallel'];
  phase: TddChainPhase;
  phaseEvidenceSha256: string;
  previousSha256: string | null;
  recordSha256: string;
}

export type TddRepairDisposition = 'replacement' | 'retirement';

export interface TddRepairRequest {
  schemaVersion: 1;
  testId: string;
  targetCycleId: string;
  disposition: TddRepairDisposition;
  replacementCycleId: string | null;
  approver: string;
  reason: string;
}

export interface TddRepairRecord {
  operationId: string;
  requestSha256: string;
  targetCycleId: string;
  testId: string;
  requirementId: string;
  changeId: string;
  generation: number;
  binding?: CandidateEvidenceBinding;
  parallel: NonNullable<TddCycle['parallel']>;
  replacementCycleId?: string;
  retired?: true;
  fallbackCycleId?: string;
  approver: string;
  reason: string;
  order: number;
  recordedAt: string;
}

export type TddRepairFailureCause =
  | 'journal-invalid'
  | 'identity-mismatch'
  | 'partial-projection-mismatch';

export interface TddRepairPartialFragment {
  kind: 'order' | 'repair-projection' | 'repair-chain';
  index: number;
  sha256: string;
}

export interface TddRepairAbandonmentRecord {
  operationId: string;
  testId: string;
  targetCycleId: string;
  failureCause: TddRepairFailureCause;
  pendingJournalSha256: string;
  partialFragments: TddRepairPartialFragment[];
  approver: string;
  reason: string;
  order: number;
  recordedAt: string;
}

export interface TddRepairJournalPayload {
  schemaVersion: 'tdd-repair-v1';
  operationId: string;
  requestSha256: string;
  request: TddRepairRequest;
  record: TddRepairRecord;
}

export interface TddEvidence {
  schemaVersion: 1;
  cycles: TddCycle[];
  chain?: TddChainRecord[];
  repairs?: TddRepairRecord[];
  repairAbandonments?: TddRepairAbandonmentRecord[];
}
