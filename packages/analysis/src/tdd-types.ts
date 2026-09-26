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

export type TddChainPhase = TddPhase | 'migrate' | 'void';

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

export interface TddEvidence {
  schemaVersion: 1;
  cycles: TddCycle[];
  chain?: TddChainRecord[];
}
