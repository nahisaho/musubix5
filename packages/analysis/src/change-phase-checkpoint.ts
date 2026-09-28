import { ids } from '../../domain/src/index.js';
import { canonicalBytes } from './canonical.js';
import { appendEvidenceOrder, evidenceOrderRecord, inspectEvidenceOrder, type EvidenceOrderRecord } from './order.js';
import { assertLeaseSetCurrent, loadJournalRecords, withOrderLease, writeChangeProjection, type ChangeProjectionAppendLeaseSet, type JournalRecord } from './journal.js';
import { activeChangeGeneration, generationOrderPhase, loadChangeEvidence, supersedeApprovedPhase, type ChangeEvidence, type ChangeRecord, type ChangeFingerprints, type ChangePhaseEvidence, type SupersedingPhase } from './change-evidence.js';

export const phaseCheckpointOperationId = /^[a-z0-9][a-z0-9-]{0,63}$/;


export interface PhaseCheckpointPayload {
  schemaVersion: 1;
  changeId: string;
  generation: number;
  phase: SupersedingPhase;
  operationId: string;
  ordinal: number;
  approvalManifestSha256: string;
  requirementIds: string[];
  fingerprints: ChangeFingerprints;
  semanticPhaseKey: string;
  orderPhaseKey: string;
  recordedAt: string;
  fencingToken: number;
}


interface PhaseCheckpointRecord extends JournalRecord {
  kind: 'change-phase-checkpoint';
  payload: PhaseCheckpointPayload;
}


export function phaseCheckpointIdempotencyKey(
  changeId: string,
  generation: number,
  phase: SupersedingPhase,
  operationId: string,
): string {
  return `change-phase-checkpoint:${changeId}:g${generation}:${phase}:${operationId}`;
}


export function checkpointSemanticPhaseKey(changeId: string, generation: number, phase: SupersedingPhase): string {
  return `change:${changeId}:g${generation}:${phase}`;
}


function validFingerprints(value: unknown): value is ChangeFingerprints {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fingerprints = value as Partial<ChangeFingerprints>;
  return ['impact', 'requirements', 'design', 'implementation', 'tests', 'tdd']
    .every((field) => typeof fingerprints[field as keyof ChangeFingerprints] === 'string');
}


function invalidCheckpointJournal(message: string): never {
  throw new Error(`CHANGE_CHECKPOINT_JOURNAL_INVALID: ${message}`);
}


export async function phaseCheckpointRecords(root: string): Promise<PhaseCheckpointRecord[]> {
  let records: JournalRecord[];
  try {
    records = await loadJournalRecords(root);
  } catch (cause) {
    invalidCheckpointJournal(cause instanceof Error ? cause.message : String(cause));
  }
  const result: PhaseCheckpointRecord[] = [];
  const keys = new Set<string>();
  const operations = new Map<string, PhaseCheckpointPayload>();
  const ordinals = new Set<string>();
  for (const record of records) {
    if (record.kind !== 'change-phase-checkpoint') continue;
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
      invalidCheckpointJournal(`journal record ${record.order} has a malformed phase-checkpoint payload.`);
    }
    const payload = record.payload as Partial<PhaseCheckpointPayload>;
    const payloadFields = ['schemaVersion', 'changeId', 'generation', 'phase', 'operationId', 'ordinal',
      'approvalManifestSha256', 'requirementIds', 'fingerprints', 'semanticPhaseKey', 'orderPhaseKey',
      'recordedAt', 'fencingToken'];
    const envelopeFields = ['schemaVersion', 'order', 'stream', 'changeId', 'kind', 'idempotencyKey',
      'payload', 'previousSha256', 'recordSha256'];
    if (record.stream !== 'normal'
      || Object.keys(record).some((key) => !envelopeFields.includes(key))
      || Object.keys(payload).some((key) => !payloadFields.includes(key))
      || record.schemaVersion !== 1
      || payload.schemaVersion !== 1
      || typeof payload.changeId !== 'string'
      || payload.changeId !== record.changeId
      || !Number.isInteger(payload.generation) || Number(payload.generation) < 1
      || !['requirements', 'design'].includes(String(payload.phase))
      || typeof payload.operationId !== 'string' || !phaseCheckpointOperationId.test(payload.operationId)
      || !Number.isInteger(payload.ordinal) || Number(payload.ordinal) < 2
      || typeof payload.approvalManifestSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(payload.approvalManifestSha256)
      || !Array.isArray(payload.requirementIds)
      || payload.requirementIds.length === 0
      || payload.requirementIds.some((id) => typeof id !== 'string' || !ids.requirement.test(id))
      || JSON.stringify(payload.requirementIds) !== JSON.stringify([...new Set(payload.requirementIds)].sort())
      || !validFingerprints(payload.fingerprints)
      || typeof payload.semanticPhaseKey !== 'string'
      || typeof payload.orderPhaseKey !== 'string'
      || typeof payload.recordedAt !== 'string'
      || !Number.isFinite(Date.parse(payload.recordedAt))
      || new Date(payload.recordedAt).toISOString() !== payload.recordedAt
      || !Number.isInteger(payload.fencingToken) || Number(payload.fencingToken) < 1) {
      invalidCheckpointJournal(`journal record ${record.order} has a malformed phase-checkpoint payload.`);
    }
    const typed = payload as PhaseCheckpointPayload;
    const expectedKey = phaseCheckpointIdempotencyKey(
      typed.changeId, typed.generation, typed.phase, typed.operationId,
    );
    if (record.idempotencyKey !== expectedKey
      || typed.semanticPhaseKey !== checkpointSemanticPhaseKey(typed.changeId, typed.generation, typed.phase)
      || typed.orderPhaseKey !== `${typed.phase}:${typed.ordinal}`) {
      invalidCheckpointJournal(`journal record ${record.order} has inconsistent derived phase-checkpoint fields.`);
    }
    if (keys.has(record.idempotencyKey)) {
      invalidCheckpointJournal(`derived idempotency key ${record.idempotencyKey} appears more than once.`);
    }
    keys.add(record.idempotencyKey);
    const operationScope = `${typed.changeId}\0${typed.generation}\0${typed.phase}\0${typed.operationId}`;
    const priorOperation = operations.get(operationScope);
    if (priorOperation && !canonicalBytes(priorOperation).equals(canonicalBytes(typed))) {
      invalidCheckpointJournal(`scoped operation ${typed.operationId} has divergent persisted payloads.`);
    }
    operations.set(operationScope, typed);
    const ordinalScope = `${typed.changeId}\0${typed.generation}\0${typed.phase}\0${typed.ordinal}`;
    if (ordinals.has(ordinalScope)) {
      invalidCheckpointJournal(`phase ordinal ${typed.ordinal} appears more than once.`);
    }
    ordinals.add(ordinalScope);
    result.push(record as PhaseCheckpointRecord);
  }
  return result;
}


function phaseCheckpointProjected(
  change: ChangeRecord,
  phase: SupersedingPhase,
  operationId: string,
): boolean {
  const history = phase === 'requirements' ? change.requirementsHistory : change.designHistory;
  return change.phases[phase]?.operationId === operationId
    || (history ?? []).some((entry) => entry.operationId === operationId);
}


function historicalPhaseCheckpointProjected(
  change: ChangeRecord,
  generation: number,
  phase: SupersedingPhase,
  operationId: string,
): boolean {
  if (generation === (change.generation ?? 1)) {
    return phaseCheckpointProjected(change, phase, operationId);
  }
  const historical = change.generationHistory?.find((entry) => entry.generation === generation);
  if (!historical) return false;
  const history = phase === 'requirements'
    ? historical.requirementsHistory
    : historical.designHistory;
  return historical.phases[phase]?.operationId === operationId
    || (history ?? []).some((entry) => entry.operationId === operationId);
}


export async function unprojectedPhaseCheckpointSummaries(
  root: string,
  change: ChangeRecord,
): Promise<Array<{
  generation: number;
  phase: SupersedingPhase;
  operationId: string;
  ordinal: number;
  journalOrder: number;
}>> {
  const records = await phaseCheckpointRecords(root);
  return records
    .filter((record) => record.payload.changeId === change.changeId
      && !historicalPhaseCheckpointProjected(
        change,
        record.payload.generation,
        record.payload.phase,
        record.payload.operationId,
      ))
    .map((record) => ({
      generation: record.payload.generation,
      phase: record.payload.phase,
      operationId: record.payload.operationId,
      ordinal: record.payload.ordinal,
      journalOrder: record.order,
    }));
}


export async function recoverPhaseCheckpoints(
  root: string,
  evidence: ChangeEvidence,
  change: ChangeRecord,
  generation: number,
  records: PhaseCheckpointRecord[],
  leases: ChangeProjectionAppendLeaseSet,
): Promise<number> {
  await assertLeaseSetCurrent(leases, change.changeId);
  let recovered = 0;
  for (const record of records.filter((entry) =>
    entry.payload.changeId === change.changeId && entry.payload.generation === generation)) {
    const payload = record.payload;
    if (phaseCheckpointProjected(change, payload.phase, payload.operationId)) continue;
    const orderPhase = generationOrderPhase(generation, payload.orderPhaseKey);
    const inspected = await inspectEvidenceOrder(root);
    if (!inspected.valid) invalidCheckpointJournal('monotonic evidence order is invalid.');
    let order = evidenceOrderRecord(inspected.records, 'change', change.changeId, orderPhase);
    if (!order) {
      order = await appendLeasedChangeOrder(root, leases, {
        kind: 'change',
        entityId: change.changeId,
        phase: orderPhase,
      });
    }
    const candidate: ChangePhaseEvidence = {
      phase: payload.phase,
      order: order.sequence,
      recordedAt: payload.recordedAt,
      fingerprints: payload.fingerprints,
      approvalManifestSha256: payload.approvalManifestSha256,
      operationId: payload.operationId,
    };
    supersedeApprovedPhase(change, payload.phase, candidate, payload.ordinal);
    recovered += 1;
  }
  if (recovered) await writeChangeProjection(root, leases, evidence);
  return recovered;
}


/** @id CODE-M5-CHECKPOINT-PHASE-RECOVERY-001
 * @implements REQ-M5-LIFECYCLE-006
 * @design DES-M5-004
 */
export async function reconcilePendingPhaseCheckpoints(
  root: string, changeId: string, expectedLeases: ChangeProjectionAppendLeaseSet,
): Promise<{ recoveredPhaseCheckpoints: number }> {
  await assertLeaseSetCurrent(expectedLeases, changeId);
  const evidence = await loadChangeEvidence(root);
  const change = evidence?.changes.find((entry) => entry.changeId === changeId);
  const generation = change ? activeChangeGeneration(change) : null;
  if (!evidence || !change || generation === null) return { recoveredPhaseCheckpoints: 0 };
  return { recoveredPhaseCheckpoints: await recoverPhaseCheckpoints(
    root, evidence, change, generation, await phaseCheckpointRecords(root), expectedLeases,
  ) };
}


export async function appendLeasedChangeOrder(
  root: string, leases: ChangeProjectionAppendLeaseSet,
  input: Parameters<typeof appendEvidenceOrder>[1],
): Promise<EvidenceOrderRecord> {
  await assertLeaseSetCurrent(leases, input.entityId);
  if (leases.appendSession) return appendEvidenceOrder(root, input, leases.appendSession);
  return withOrderLease(root, (session) => appendEvidenceOrder(root, input, session), leases);
}
