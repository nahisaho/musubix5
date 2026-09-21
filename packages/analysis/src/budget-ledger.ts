import { canonicalBytes, sha256 } from './canonical.js';
import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  loadJournalRecordByIdempotencyKey,
  releaseChangeLease,
  verifyJournal,
  type JournalRecord,
} from './journal.js';

export type BudgetRole = 'reviewer' | 'repair-planner';

export interface BudgetReservation {
  reservationId: string;
  changeId: string;
  budgetKey: string;
  role: BudgetRole;
  limit: number;
  requested: number;
  invocationKey: string;
  status: 'reserved' | 'budget-exhausted';
  order: number;
  attemptConsumed: false;
  repairConsumed: false;
  nonceConsumed: false;
}

export interface BudgetUsage {
  reservationId: string;
  invocationKey: string;
  reserved: number;
  actual: number;
  overrun: number;
  terminalStatus: string;
  classification: 'within-reservation' | 'reservation-overrun';
  order: number;
}

function payload(record: JournalRecord): Record<string, unknown> | null {
  return record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload as Record<string, unknown>
    : null;
}

function reservationFrom(record: JournalRecord): BudgetReservation {
  const value = payload(record);
  if (!value) throw new Error('BUDGET_RESERVATION_SCHEMA: malformed reservation journal record.');
  return {
    reservationId: String(value.reservationId),
    changeId: record.changeId,
    budgetKey: String(value.budgetKey),
    role: value.role as BudgetRole,
    limit: Number(value.limit),
    requested: Number(value.requested),
    invocationKey: String(value.invocationKey),
    status: value.status as BudgetReservation['status'],
    order: record.order,
    attemptConsumed: false,
    repairConsumed: false,
    nonceConsumed: false,
  };
}

function usageFrom(record: JournalRecord): BudgetUsage {
  const value = payload(record);
  if (!value) throw new Error('BUDGET_USAGE_SCHEMA: malformed usage journal record.');
  return {
    reservationId: String(value.reservationId),
    invocationKey: String(value.invocationKey),
    reserved: Number(value.reserved),
    actual: Number(value.actual),
    overrun: Number(value.overrun),
    terminalStatus: String(value.terminalStatus),
    classification: value.classification as BudgetUsage['classification'],
    order: record.order,
  };
}

/** @id CODE-M5-BUDGET-005
 * @implements REQ-M5-BUDGET-005
 * @design DES-M5-009
 */
export function validateBudgetLimits(value: {
  reviewer?: number;
  repairPlanner?: number;
  producerRepairs?: number;
}): { valid: boolean; terminalReason: 'invalid-budget-configuration' | null } {
  const limits = [value.reviewer, value.repairPlanner, value.producerRepairs];
  const valid = limits.every((limit) => typeof limit === 'number'
    && Number.isFinite(limit) && Number.isInteger(limit) && limit > 0);
  return {
    valid,
    terminalReason: valid ? null : 'invalid-budget-configuration',
  };
}

/** @id CODE-M5-BUDGET-001
 * @implements REQ-M5-BUDGET-001 REQ-M5-BUDGET-002 REQ-M5-BUDGET-004
 * @design DES-M5-009
 */
export async function reserveBudget(root: string, input: {
  changeId: string;
  budgetKey: string;
  role: BudgetRole;
  limit: number;
  requested: number;
  invocationKey: string;
  idempotencyKey: string;
}): Promise<BudgetReservation> {
  if (![input.limit, input.requested].every((value) =>
    Number.isFinite(value) && Number.isInteger(value) && value > 0)) {
    throw new Error('BUDGET_LIMIT_INVALID: limit and requested budget must be positive integers.');
  }
  const lease = await acquireChangeLease(root, input.changeId);
  try {
    const existing = await loadJournalRecordByIdempotencyKey(root, input.idempotencyKey);
    if (existing) {
      if (existing.kind !== 'budget-reservation') {
        throw new Error(`BUDGET_IDEMPOTENCY_CONFLICT: ${input.idempotencyKey} is not a reservation.`);
      }
      return reservationFrom(existing);
    }
    const records = await verifyJournal(root);
    const consumed = records
      .filter((record) => record.changeId === input.changeId && record.kind === 'budget-reservation')
      .map(payload)
      .filter((value): value is Record<string, unknown> => value !== null)
      .filter((value) => value.budgetKey === input.budgetKey && value.status === 'reserved')
      .reduce((sum, value) => sum + Number(value.requested), 0);
    const status = consumed + input.requested <= input.limit ? 'reserved' : 'budget-exhausted';
    const reservationId = sha256(canonicalBytes({
      changeId: input.changeId,
      budgetKey: input.budgetKey,
      role: input.role,
      invocationKey: input.invocationKey,
    }));
    await assertChangeLeaseCurrent(lease);
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: input.changeId,
      kind: 'budget-reservation',
      idempotencyKey: input.idempotencyKey,
      payload: {
        reservationId,
        budgetKey: input.budgetKey,
        role: input.role,
        limit: input.limit,
        requested: input.requested,
        invocationKey: input.invocationKey,
        status,
      },
    });
    return reservationFrom(record);
  } finally {
    await releaseChangeLease(lease);
  }
}

/** @id CODE-M5-BUDGET-003
 * @implements REQ-M5-BUDGET-003
 * @design DES-M5-009
 */
export async function recordBudgetUsage(root: string, input: {
  changeId: string;
  reservationId: string;
  invocationKey: string;
  actual: number;
  terminalStatus: string;
  idempotencyKey: string;
}): Promise<BudgetUsage> {
  if (!Number.isFinite(input.actual) || input.actual < 0) {
    throw new Error('BUDGET_USAGE_INVALID: actual usage must be a finite non-negative number.');
  }
  const lease = await acquireChangeLease(root, input.changeId);
  try {
    const existing = await loadJournalRecordByIdempotencyKey(root, input.idempotencyKey);
    if (existing) {
      if (existing.kind !== 'budget-usage') {
        throw new Error(`BUDGET_IDEMPOTENCY_CONFLICT: ${input.idempotencyKey} is not usage.`);
      }
      return usageFrom(existing);
    }
    const records = await verifyJournal(root);
    const reservationRecord = records.find((record) =>
      record.changeId === input.changeId
      && record.kind === 'budget-reservation'
      && payload(record)?.reservationId === input.reservationId);
    if (!reservationRecord) throw new Error('BUDGET_RESERVATION_MISSING: usage has no reservation.');
    const reservation = reservationFrom(reservationRecord);
    if (reservation.status !== 'reserved' || reservation.invocationKey !== input.invocationKey) {
      throw new Error('BUDGET_RESERVATION_BINDING_MISMATCH: usage does not match an accepted reservation.');
    }
    const duplicate = records.find((record) =>
      record.changeId === input.changeId
      && record.kind === 'budget-usage'
      && payload(record)?.reservationId === input.reservationId);
    if (duplicate) throw new Error('BUDGET_USAGE_ALREADY_RECORDED: reservation already has terminal usage.');
    const overrun = Math.max(0, input.actual - reservation.requested);
    await assertChangeLeaseCurrent(lease);
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: input.changeId,
      kind: 'budget-usage',
      idempotencyKey: input.idempotencyKey,
      payload: {
        reservationId: input.reservationId,
        invocationKey: input.invocationKey,
        reserved: reservation.requested,
        actual: input.actual,
        overrun,
        terminalStatus: input.terminalStatus,
        classification: overrun > 0 ? 'reservation-overrun' : 'within-reservation',
      },
    });
    return usageFrom(record);
  } finally {
    await releaseChangeLease(lease);
  }
}
