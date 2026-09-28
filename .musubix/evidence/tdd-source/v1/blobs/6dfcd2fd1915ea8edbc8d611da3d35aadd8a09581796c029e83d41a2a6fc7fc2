import {
  acquireChangeLease,
  appendJournalRecord,
  assertChangeLeaseCurrent,
  loadJournalRecordByIdempotencyKey,
  releaseChangeLease,
  verifyJournal,
  type JournalRecord,
} from './journal.js';

export type LifecycleState =
  | 'initialized'
  | 'requirements-valid'
  | 'requirements-review-clean'
  | 'requirements-approved'
  | 'design-valid'
  | 'design-review-clean'
  | 'design-approved'
  | 'red-recorded'
  | 'implementation-recorded'
  | 'green-recorded'
  | 'refactored'
  | 'integrated'
  | 'trace-formal-complete'
  | 'quality-pass'
  | 'release-review-clean'
  | 'release-approved'
  | 'stale';

export type LifecycleEvent =
  | 'requirements-validated'
  | 'requirements-reviewed'
  | 'requirements-approved'
  | 'design-validated'
  | 'design-reviewed'
  | 'design-approved'
  | 'red-recorded'
  | 'implementation-recorded'
  | 'green-recorded'
  | 'refactor-recorded'
  | 'integration-completed'
  | 'trace-formal-evaluated'
  | 'quality-completed'
  | 'release-reviewed'
  | 'release-approved'
  | 'upstream-changed'
  | 'revalidated';

export interface LifecycleTransition {
  order: number;
  event: LifecycleEvent;
  from: LifecycleState;
  to: LifecycleState;
  evidenceHeads: string[];
}

export interface LifecycleTransitionInput {
  changeId: string;
  event: LifecycleEvent;
  evidenceHeads: string[];
  idempotencyKey?: string;
  resumeState?: Exclude<LifecycleState, 'stale' | 'release-approved'>;
}

const transitions: Record<Exclude<LifecycleEvent, 'upstream-changed' | 'revalidated'>, {
  from: LifecycleState[];
  to: LifecycleState;
}> = {
  'requirements-validated': { from: ['initialized'], to: 'requirements-valid' },
  'requirements-reviewed': { from: ['requirements-valid'], to: 'requirements-review-clean' },
  'requirements-approved': { from: ['requirements-review-clean'], to: 'requirements-approved' },
  'design-validated': { from: ['requirements-approved'], to: 'design-valid' },
  'design-reviewed': { from: ['design-valid'], to: 'design-review-clean' },
  'design-approved': { from: ['design-review-clean'], to: 'design-approved' },
  'red-recorded': { from: ['design-approved'], to: 'red-recorded' },
  'implementation-recorded': { from: ['red-recorded'], to: 'implementation-recorded' },
  'green-recorded': { from: ['implementation-recorded'], to: 'green-recorded' },
  'refactor-recorded': { from: ['green-recorded'], to: 'refactored' },
  'integration-completed': { from: ['green-recorded', 'refactored'], to: 'integrated' },
  'trace-formal-evaluated': { from: ['integrated'], to: 'trace-formal-complete' },
  'quality-completed': { from: ['trace-formal-complete'], to: 'quality-pass' },
  'release-reviewed': { from: ['quality-pass'], to: 'release-review-clean' },
  'release-approved': { from: ['release-review-clean'], to: 'release-approved' },
};

const staleEligible = new Set<LifecycleState>([
  'requirements-approved',
  'design-valid',
  'design-review-clean',
  'design-approved',
  'red-recorded',
  'implementation-recorded',
  'green-recorded',
  'refactored',
  'integrated',
  'trace-formal-complete',
  'quality-pass',
  'release-review-clean',
  'release-approved',
]);

function lifecycleTransition(record: JournalRecord): LifecycleTransition | null {
  if (record.kind !== 'lifecycle-transition' || !record.payload || typeof record.payload !== 'object') return null;
  const payload = record.payload as Omit<LifecycleTransition, 'order'>;
  if (!Array.isArray(payload.evidenceHeads)) return null;
  return { ...payload, order: record.order };
}

export async function lifecycleStatus(root: string, changeId: string): Promise<{
  state: LifecycleState;
  transitions: LifecycleTransition[];
}> {
  const records = await verifyJournal(root);
  const history = records
    .filter((record) => record.changeId === changeId)
    .map(lifecycleTransition)
    .filter((record): record is LifecycleTransition => record !== null);
  return {
    state: history.at(-1)?.to ?? 'initialized',
    transitions: history,
  };
}

/** @id CODE-M5-LIFECYCLE-001
 * @implements REQ-M5-LIFECYCLE-001 REQ-M5-LIFECYCLE-003
 * @design DES-M5-005
 */
export async function transitionLifecycle(
  root: string,
  input: LifecycleTransitionInput,
): Promise<LifecycleTransition> {
  const lease = await acquireChangeLease(root, input.changeId);
  try {
    if (input.idempotencyKey) {
      const existing = await loadJournalRecordByIdempotencyKey(root, input.idempotencyKey);
      const transition = existing && lifecycleTransition(existing);
      if (existing && existing.changeId === input.changeId && transition) return transition;
      if (existing) {
        throw new Error(`LIFECYCLE_IDEMPOTENCY_CONFLICT: ${input.idempotencyKey} is bound to another operation.`);
      }
    }
    const status = await lifecycleStatus(root, input.changeId);
    let to: LifecycleState;
    if (input.event === 'upstream-changed') {
      if (!staleEligible.has(status.state)) {
        throw new Error(`LIFECYCLE_INVALID_TRANSITION: ${status.state} cannot accept ${input.event}.`);
      }
      to = 'stale';
    } else if (input.event === 'revalidated') {
      if (status.state !== 'stale' || input.resumeState === undefined) {
        throw new Error(`LIFECYCLE_INVALID_TRANSITION: ${status.state} cannot accept ${input.event}.`);
      }
      to = input.resumeState;
    } else {
      const transition = transitions[input.event];
      if (!transition.from.includes(status.state)) {
        throw new Error(`LIFECYCLE_INVALID_TRANSITION: ${status.state} cannot accept ${input.event}.`);
      }
      to = transition.to;
    }
    if (!input.evidenceHeads.length) {
      throw new Error('LIFECYCLE_EVIDENCE_MISSING: a protected transition requires current evidence heads.');
    }
    await assertChangeLeaseCurrent(lease);
    const record = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: input.changeId,
      kind: 'lifecycle-transition',
      idempotencyKey: input.idempotencyKey
        ?? `${input.changeId}:lifecycle:${status.transitions.length}:${input.event}`,
      payload: {
        event: input.event,
        from: status.state,
        to,
        evidenceHeads: [...input.evidenceHeads].sort(),
      },
    });
    return {
      order: record.order,
      event: input.event,
      from: status.state,
      to,
      evidenceHeads: [...input.evidenceHeads].sort(),
    };
  } finally {
    await releaseChangeLease(lease);
  }
}
