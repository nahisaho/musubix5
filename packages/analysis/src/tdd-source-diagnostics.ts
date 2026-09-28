import type { Diagnostic } from '../../domain/src/index.js';
import type { SourceScope, SourceTarget } from './tdd-source-types.js';

export const sourceReasons = {
  TDD_SOURCE_LEDGER_INVALID: ['scope-unreadable', 'journal-schema', 'journal-chain', 'order-invalid',
    'order-multiple', 'chain-linkage', 'projection-mismatch', 'successor-self', 'successor-cycle', 'successor-branch'],
  TDD_SOURCE_PENDING: ['same-test-writer', 'explicit-target-conflict', 'resume-required', 'completion-required'],
  TDD_SOURCE_REPLAY_INVALID: ['unknown-operation', 'request-mismatch', 'not-completed'],
  TDD_SOURCE_ADMISSION_INVALID: ['inactive-generation', 'foreign-target', 'requirement-outside-scope',
    'ownership-ambiguous', 'general-approval-missing', 'general-approval-stale', 'domain-mismatch',
    'candidate-mismatch', 'parallel-tuple-mismatch', 'parallel-stale', 'parallel-unconsumed', 'target-missing',
    'target-not-selected', 'old-fingerprint-mismatch', 'unchanged-fingerprint', 'target-retired', 'successor-exists',
    'trace-ambiguous', 'boundary-unresolved', 'splice-invalid', 'outside-block-diff', 'snapshot-unverifiable',
    'input-drift', 'pair-mismatch', 'report-invalid', 'report-not-fresh', 'selected-run-failed',
    'equivalence-unconfirmed', 'behavior-change-required', 'replacement-invalid'],
  TDD_SOURCE_APPROVAL_INVALID: ['review-missing', 'review-schema', 'review-hash', 'blob-hash', 'approval-missing',
    'approval-schema', 'approval-hash', 'approval-binding', 'actor-mismatch'],
  TDD_SOURCE_IO_FAILED: ['read', 'execute', 'fsync', 'atomic-replace', 'append'],
  TDD_SOURCE_LEASE_BUSY: ['append-timeout'],
} as const;
export type SourceErrorCode = keyof typeof sourceReasons;
export type SourceReason<C extends SourceErrorCode> = typeof sourceReasons[C][number];
export interface SourceErrorContext {
  operationId: string | null;
  scope: SourceScope | null;
  target: SourceTarget | null;
}
export type SourceDiagnostic = Diagnostic & {
  details: SourceErrorContext & { reason: string; [key: string]: unknown };
};

/** @id CODE-M5-SOURCE-IO-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-004 DES-M5-023
 */
export function sourceIoFailure(
  cause: unknown, reason: SourceReason<'TDD_SOURCE_IO_FAILED'>,
  context?: SourceErrorContext, extra: Record<string, unknown> = {},
): never {
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
    && (('errno' in cause && typeof cause.errno === 'number') || cause.code.startsWith('ERR_FS_'))) {
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', reason, context, extra);
  }
  throw cause;
}

/** @id CODE-M5-SOURCE-DIAGNOSTIC-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-002 DES-M5-023
 */
export class SourceOperationError<C extends SourceErrorCode = SourceErrorCode> extends Error {
  readonly diagnostic: SourceDiagnostic;
  readonly exitCode: 1 | 2;
  constructor(
    readonly code: C, reason: SourceReason<C>,
    context: SourceErrorContext = { operationId: null, scope: null, target: null },
    extra: Record<string, unknown> = {},
  ) {
    const details = { ...extra, ...context, reason };
    super(`${code}: ${reason} ${JSON.stringify(details)}`);
    this.name = 'SourceOperationError';
    this.exitCode = code === 'TDD_SOURCE_IO_FAILED' ? 2 : 1;
    this.diagnostic = { code, severity: 'error', message: reason, details };
  }
}
