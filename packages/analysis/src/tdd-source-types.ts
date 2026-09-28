import type { CandidateEvidenceBinding } from './candidate-evidence-binding.js';

export interface SourceScope {
  repositoryId: string;
  changeId: string;
  generation: number;
  requirementId: string;
  testId: string;
  path: string;
  command: string;
  candidate: CandidateEvidenceBinding | null;
  parallel: {
    planId: string; assignmentId: string; attempt: number; worktree: string; startCommit: string;
  } | null;
  domain: string | null;
}
export interface SourceTarget {
  cycleId: string;
  kind: 'green' | 'refactor' | 'migration' | 'source-supersession';
  order: number;
  payloadSha256: string;
  oldFingerprint: string;
}
export interface SourceBinding {
  nodeId: string;
  annotationStart: number;
  statementEnd: number;
  currentFileSha256: string;
  newBlockSha256: string;
  oldBlockSha256: string | null;
  oldFingerprint: string;
  newFingerprint: string;
  oldSourceDigest: string;
  newSourceDigest: string;
}
export interface SourceSnapshotBinding {
  manifestSha256: string; environmentSha256: string; runnerSha256: string;
  configSha256: string; productionSha256: string; head: string; stateSha256: string;
}
export interface SourceHunk {
  oldStart: number; oldLength: number; newStart: number; newLength: number;
  requirementIds: string[]; assertion: string; threshold: string;
  failureSemantics: string; equivalenceRationale: string; supportingBlobSha256s: string[];
}
export interface SourceRun {
  invocationId: string; testId: string; command: string; startedAt: string; completedAt: string;
  exitCode: number; runnerSha256: string; configSha256: string; environmentSha256: string;
  reportSha256: string;
  preSourceSha256: string; postSourceSha256: string;
  preProductionSha256: string; postProductionSha256: string;
  preInputManifestSha256: string; postInputManifestSha256: string;
  outputs: { beforeSha256: string; afterBuildSha256: string; afterSha256: string };
}
export interface SourcePair {
  manifestSha256: string; oldReportSha256: string; newReportSha256: string;
  oldRun: SourceRun; newRun: SourceRun;
}
export interface SourceReplacement {
  cycleId: string; redOrder: number; redPayloadSha256: string;
  greenOrder: number; greenPayloadSha256: string; testFingerprint: string;
}
interface SourceReviewBase {
  schemaVersion: 1;
  kind: 'tdd-source-review';
  changeId: string;
  operationId: string;
  scope: SourceScope;
  target: SourceTarget;
  source: SourceBinding;
  snapshot: SourceSnapshotBinding;
  reason: string;
  hunks: SourceHunk[];
  preparedAt: string;
  preparationInvocationId: string;
  approvalContext: { requirementsSha256: string; designSha256: string; domain: string | null };
}
export type SourceReview = SourceReviewBase & (
  { mode: 'test-only'; pair: SourcePair; replacement: null }
  | { mode: 'behavior-change'; pair: null; replacement: SourceReplacement }
);
export interface SourceApproval {
  schemaVersion: 1; kind: 'tdd-source-approval'; changeId: string; operationId: string;
  scope: SourceScope; mode: SourceReview['mode']; target: SourceTarget;
  artifactSha256: string; approver: string; confirmed: true; approvedAt: string;
}
export interface SourceJournalPayload {
  schemaVersion: 1; operationId: string; requestSha256: string;
  mode: SourceReview['mode']; scope: SourceScope; target: SourceTarget; newFingerprint: string;
  reviewSha256: string; approvalSha256: string; source: SourceBinding; snapshot: SourceSnapshotBinding;
  pair: SourcePair | null; replacement: SourceReplacement | null; reason: string; approver: string;
  execution: SourceRun | null; recordedAt: string;
  fencing: { change: number; projection: number; append: number };
}
export interface SourceProjection {
  schemaVersion: 1; operationId: string; operationKey: string; requestSha256: string;
  journalSha256: string; journalOrder: number; order: number; cycleId: string;
  scope: SourceScope; mode: SourceReview['mode']; target: SourceTarget;
  newFingerprint: string; recordedAt: string; reviewSha256: string; approvalSha256: string;
  state: 'completed';
}
export interface SourceOperationScope {
  changeId: string; generation: number; operationId: string;
}
export interface SourcePreparationRequest extends SourceOperationScope {
  testId: string; requirementId: string; command: string; target: SourceTarget;
  mode: SourceReview['mode']; reason: string;
  oldBlockPath?: string; hunkReviewPath?: string; replacementCycleId?: string | undefined;
}
export interface SourcePreparationResult {
  schemaVersion: 1; operationId: string; artifactPath: string; artifactSha256: string;
  mode: SourceReview['mode']; target: SourceTarget; scope: SourceScope;
}
export interface SourceApprovalResult {
  schemaVersion: 1; operationId: string; artifactSha256: string; approvalPath: string; approvalSha256: string;
}
export interface SourceResult {
  schemaVersion: 1; operationId: string; requestSha256: string; state: 'completed';
  scope: SourceScope; mode: SourceReview['mode']; target: SourceTarget; cycleId: string;
  newFingerprint: string; journalOrder: number; order: number; terminalSha256: string;
  artifactSha256: string; approvalSha256: string; recordedAt: string;
}
export type SourceSelectionReason = 'pending-suffix' | 'invalid-evidence' | 'greatest-terminal'
  | 'older-terminal' | 'void-bound' | 'open-work' | 'outside-scope' | 'source-drift';
export interface SourceTerminalSelector {
  testId: string; cycleId: string; terminalKind: SourceTarget['kind']; terminalOrder: number;
  terminalSha256: string; oldFingerprint: string; requirementId: string; command: string;
  changeId: string | null; generation: number | null; selectionReason: SourceSelectionReason; cliArgs: string[];
}
export interface SourceSupersessionSummary {
  operationId: string; scope: SourceScope; mode: SourceReview['mode']; target: SourceTarget;
  cycleId: string; newFingerprint: string; journalOrder: number; order: number | null;
  state: 'pending' | 'completed' | 'invalid'; selectionReason: SourceSelectionReason;
  terminalSelector: SourceTerminalSelector | null; requestSha256: string | null;
  artifactSha256: string | null; approvalSha256: string | null; resumeArgs: string[] | null;
}
