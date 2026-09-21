import { recordBudgetUsage, reserveBudget, validateBudgetLimits } from './budget-ledger.js';
import { appendJournalRecord, verifyJournal, type JournalRecord } from './journal.js';
import { producerRepairIdentity } from './planner-output.js';

export interface ReviewerFinding {
  code: string;
  path: string;
}

export interface BoundaryResult {
  status: 'accepted' | 'repair-scheduled' | 'terminal';
  terminalReason: 'duplicate-rejected-manifest' | 'repair-limit-exceeded'
    | 'budget-exhausted' | 'invalid-budget-configuration' | 'reviewer-rejected' | null;
  repairIdentity: string | null;
  findings: ReviewerFinding[];
  attemptsConsumed: number;
  repairsConsumed: number;
  noncesConsumed: number;
  order: number | null;
}

interface BoundaryPayload {
  boundaryKey: string;
  manifestDigest: string;
  reviewerPolicyId: string;
  status: BoundaryResult['status'];
  terminalReason: BoundaryResult['terminalReason'];
  repairIdentity: string | null;
  findings: ReviewerFinding[];
}

interface ReviewCheckpoint {
  boundaryKey: string;
  manifestDigest: string;
  reviewerPolicyId: string;
  rejectedOutputOrdinal: number;
  disposition: 'accepted' | 'repairable' | 'rejected';
  findings: ReviewerFinding[];
  actualUsage: number;
}

function boundaryPayload(record: JournalRecord): BoundaryPayload | null {
  return record.kind === 'approval-boundary'
    && record.payload !== null
    && typeof record.payload === 'object'
    && !Array.isArray(record.payload)
    ? record.payload as BoundaryPayload
    : null;
}

function reviewCheckpoint(record: JournalRecord): ReviewCheckpoint | null {
  return record.kind === 'approval-boundary-review'
    && record.payload !== null
    && typeof record.payload === 'object'
    && !Array.isArray(record.payload)
    ? record.payload as ReviewCheckpoint
    : null;
}

async function persistBoundary(root: string, input: {
  changeId: string;
  idempotencyKey: string;
  payload: BoundaryPayload;
}): Promise<number> {
  return (await appendJournalRecord(root, {
    stream: 'normal',
    changeId: input.changeId,
    kind: 'approval-boundary',
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  })).order;
}

/** @id CODE-M5-APPROVAL-003
 * @implements REQ-M5-APPROVAL-003 REQ-M5-APPROVAL-004 REQ-M5-APPROVAL-005 REQ-M5-APPROVAL-006 REQ-M5-BUDGET-005
 * @design DES-M5-008
 */
export async function evaluateApprovalBoundary(root: string, input: {
  changeId: string;
  boundaryKey: string;
  stage: 'requirements' | 'design' | 'release';
  reviewerPolicyId: string;
  manifestDigest: string;
  rejectedOutputOrdinal: number;
  reviewerBudget: number;
  repairBudget: number;
  reviewerCost: number;
  repairCost: number;
  producerRepairLimit: number;
  reviewer: () => Promise<{
    disposition: 'accepted' | 'repairable' | 'rejected';
    findings: ReviewerFinding[];
    actualUsage: number;
  }>;
  producer: (findings: ReviewerFinding[], repairIdentity: string) => Promise<{ actualUsage: number }>;
}): Promise<BoundaryResult> {
  if (input.stage === 'release') {
    throw new Error('APPROVAL_BOUNDARY_MANUAL_ONLY: release approval cannot use verified-auto.');
  }
  const limits = validateBudgetLimits({
    reviewer: input.reviewerBudget,
    repairPlanner: input.repairBudget,
    producerRepairs: input.producerRepairLimit,
  });
  const validInvocationCosts = [input.reviewerCost, input.repairCost].every((value) =>
    Number.isFinite(value) && Number.isInteger(value) && value > 0);
  if (!limits.valid || !validInvocationCosts) {
    return {
      status: 'terminal',
      terminalReason: 'invalid-budget-configuration',
      repairIdentity: null,
      findings: [],
      attemptsConsumed: 0,
      repairsConsumed: 0,
      noncesConsumed: 0,
      order: null,
    };
  }
  const records = await verifyJournal(root);
  const prior = records.map((record) => ({ record, payload: boundaryPayload(record) }))
    .find(({ record, payload }) => record.changeId === input.changeId
      && payload?.boundaryKey === input.boundaryKey
      && payload.reviewerPolicyId === input.reviewerPolicyId
      && payload.manifestDigest === input.manifestDigest
      && payload.status !== 'accepted');
  if (prior?.payload) {
    return {
      status: 'terminal',
      terminalReason: 'duplicate-rejected-manifest',
      repairIdentity: prior.payload.repairIdentity,
      findings: prior.payload.findings,
      attemptsConsumed: 0,
      repairsConsumed: 0,
      noncesConsumed: 0,
      order: prior.record.order,
    };
  }
  const repairCount = records.map(boundaryPayload)
    .filter((payload): payload is BoundaryPayload => payload !== null)
    .filter((payload) => payload.boundaryKey === input.boundaryKey
      && payload.status === 'repair-scheduled').length;
  const savedReview = records.map(reviewCheckpoint)
    .filter((checkpoint): checkpoint is ReviewCheckpoint => checkpoint !== null)
    .find((checkpoint) => checkpoint.boundaryKey === input.boundaryKey
      && checkpoint.reviewerPolicyId === input.reviewerPolicyId
      && checkpoint.manifestDigest === input.manifestDigest
      && checkpoint.rejectedOutputOrdinal === input.rejectedOutputOrdinal);
  const reviewerReservation = await reserveBudget(root, {
    changeId: input.changeId,
    budgetKey: `${input.boundaryKey}:reviewer`,
    role: 'reviewer',
    limit: input.reviewerBudget,
    requested: input.reviewerCost,
    invocationKey: `${input.boundaryKey}:reviewer:${input.rejectedOutputOrdinal}`,
    idempotencyKey: `${input.boundaryKey}:reviewer-reservation:${input.rejectedOutputOrdinal}`,
  });
  if (reviewerReservation.status === 'budget-exhausted') {
    return {
      status: 'terminal',
      terminalReason: 'budget-exhausted',
      repairIdentity: null,
      findings: [],
      attemptsConsumed: 0,
      repairsConsumed: 0,
      noncesConsumed: 0,
      order: reviewerReservation.order,
    };
  }
  const review = savedReview ?? await input.reviewer();
  if (!savedReview) {
    await appendJournalRecord(root, {
      stream: 'normal',
      changeId: input.changeId,
      kind: 'approval-boundary-review',
      idempotencyKey: `${input.boundaryKey}:review-result:${input.manifestDigest}`,
      payload: {
        boundaryKey: input.boundaryKey,
        manifestDigest: input.manifestDigest,
        reviewerPolicyId: input.reviewerPolicyId,
        rejectedOutputOrdinal: input.rejectedOutputOrdinal,
        disposition: review.disposition,
        findings: review.findings,
        actualUsage: review.actualUsage,
      } satisfies ReviewCheckpoint,
    });
  }
  await recordBudgetUsage(root, {
    changeId: input.changeId,
    reservationId: reviewerReservation.reservationId,
    invocationKey: reviewerReservation.invocationKey,
    actual: review.actualUsage,
    terminalStatus: review.disposition,
    idempotencyKey: `${input.boundaryKey}:reviewer-usage:${input.rejectedOutputOrdinal}`,
  });
  if (review.disposition === 'accepted') {
    const order = await persistBoundary(root, {
      changeId: input.changeId,
      idempotencyKey: `${input.boundaryKey}:accepted:${input.manifestDigest}`,
      payload: {
        boundaryKey: input.boundaryKey,
        manifestDigest: input.manifestDigest,
        reviewerPolicyId: input.reviewerPolicyId,
        status: 'accepted',
        terminalReason: null,
        repairIdentity: null,
        findings: [],
      },
    });
    return {
      status: 'accepted', terminalReason: null, repairIdentity: null, findings: [],
      attemptsConsumed: 1, repairsConsumed: 0, noncesConsumed: 1, order,
    };
  }
  if (review.disposition === 'rejected' || repairCount >= input.producerRepairLimit) {
    const terminalReason = review.disposition === 'rejected'
      ? 'reviewer-rejected' : 'repair-limit-exceeded';
    const order = await persistBoundary(root, {
      changeId: input.changeId,
      idempotencyKey: `${input.boundaryKey}:terminal:${input.manifestDigest}`,
      payload: {
        boundaryKey: input.boundaryKey,
        manifestDigest: input.manifestDigest,
        reviewerPolicyId: input.reviewerPolicyId,
        status: 'terminal',
        terminalReason,
        repairIdentity: null,
        findings: review.findings,
      },
    });
    return {
      status: 'terminal', terminalReason, repairIdentity: null, findings: review.findings,
      attemptsConsumed: 1, repairsConsumed: 0, noncesConsumed: 1, order,
    };
  }
  const repairIdentity = producerRepairIdentity(input.boundaryKey, input.rejectedOutputOrdinal);
  const repairReservation = await reserveBudget(root, {
    changeId: input.changeId,
    budgetKey: `${input.boundaryKey}:repair`,
    role: 'repair-planner',
    limit: input.repairBudget,
    requested: input.repairCost,
    invocationKey: repairIdentity,
    idempotencyKey: `${input.boundaryKey}:repair-reservation:${input.rejectedOutputOrdinal}`,
  });
  if (repairReservation.status === 'budget-exhausted') {
    return {
      status: 'terminal', terminalReason: 'budget-exhausted', repairIdentity,
      findings: review.findings, attemptsConsumed: 1, repairsConsumed: 0,
      noncesConsumed: 1, order: repairReservation.order,
    };
  }
  const repair = await input.producer(review.findings, repairIdentity);
  await recordBudgetUsage(root, {
    changeId: input.changeId,
    reservationId: repairReservation.reservationId,
    invocationKey: repairReservation.invocationKey,
    actual: repair.actualUsage,
    terminalStatus: 'completed',
    idempotencyKey: `${input.boundaryKey}:repair-usage:${input.rejectedOutputOrdinal}`,
  });
  const order = await persistBoundary(root, {
    changeId: input.changeId,
    idempotencyKey: `${input.boundaryKey}:repair:${input.manifestDigest}`,
    payload: {
      boundaryKey: input.boundaryKey,
      manifestDigest: input.manifestDigest,
      reviewerPolicyId: input.reviewerPolicyId,
      status: 'repair-scheduled',
      terminalReason: null,
      repairIdentity,
      findings: review.findings,
    },
  });
  return {
    status: 'repair-scheduled', terminalReason: null, repairIdentity,
    findings: review.findings, attemptsConsumed: 1, repairsConsumed: 1,
    noncesConsumed: 1, order,
  };
}
