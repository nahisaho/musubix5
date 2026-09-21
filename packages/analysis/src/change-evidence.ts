import { exists, readText, within } from './files.js';
import type { TddEvidence } from './tdd.js';
import { selectCurrentTddCycle } from './tdd-cycle-resolver.js';

// Shared change-chronology data model and pure accessors used by both
// change.ts (recording/validation) and change-waiver.ts (waiver evidence).
// Kept in its own module, with no dependency on either, to avoid a
// module-dependency cycle between them.

export const changePhases = ['impact', 'requirements', 'design', 'red', 'implementation', 'green', 'quality'] as const;
export type ChangePhase = typeof changePhases[number];

export interface ChangeFingerprints {
  impact: string;
  requirements: string;
  design: string;
  implementation: string;
  tests: string;
  tdd: string;
  requirementImplementations?: Record<string, {
    paths: string[];
    fingerprints: Record<string, string>;
  }>;
}

export interface ChangePhaseEvidence {
  phase: ChangePhase;
  order?: number;
  recordedAt: string;
  fingerprints: ChangeFingerprints;
  allowUnchanged?: boolean;
}

export interface ChangeTddBatch {
  scopeId?: string;
  requirementIds: string[];
  red?: ChangePhaseEvidence;
  implementation?: ChangePhaseEvidence;
  green?: ChangePhaseEvidence;
}

export interface ChangeRecord {
  changeId: string;
  requirementIds: string[];
  phases: Partial<Record<ChangePhase, ChangePhaseEvidence>>;
  tddBatches?: ChangeTddBatch[];
}

export interface ChangeEvidence {
  schemaVersion: 1;
  changes: ChangeRecord[];
}

export interface ChangeCompleteness {
  changeId: string;
  functionalRequirements: number;
  nonFunctionalRequirements: number;
  requirements: number;
  completeRequirements: number;
  valid: boolean;
}

export async function loadChangeEvidence(root: string): Promise<ChangeEvidence | null> {
  const path = '.musubix/evidence/changes.json';
  if (!await exists(within(root, path))) return null;
  const value = JSON.parse(await readText(root, path)) as ChangeEvidence;
  if (value.schemaVersion !== 1 || !Array.isArray(value.changes)) throw new Error('Invalid change chronology evidence.');
  return value;
}

export function effectiveBatches(change: ChangeRecord): ChangeTddBatch[] {
  const batches = change.tddBatches ?? [];
  if (change.phases.red || change.phases.implementation || change.phases.green) {
    const legacyBatch: ChangeTddBatch = { requirementIds: [...change.requirementIds] };
    if (change.phases.red) legacyBatch.red = change.phases.red;
    if (change.phases.implementation) legacyBatch.implementation = change.phases.implementation;
    if (change.phases.green) legacyBatch.green = change.phases.green;
    return [legacyBatch, ...batches];
  }
  return batches;
}

export function batchFor(batches: ChangeTddBatch[], requirementId: string): ChangeTddBatch | undefined {
  return batches.find((batch) => batch.requirementIds.includes(requirementId));
}

export function batchKey(requirementIds: string[]): string {
  return [...new Set(requirementIds)].sort().join(',');
}

export function nextBatchScopeId(batches: ChangeTddBatch[], requirementIds: string[]): string {
  const key = batchKey(requirementIds);
  const count = batches.filter((batch) => batchKey(batch.requirementIds) === key).length;
  return count === 0 ? key : `${key}#${count + 1}`;
}

export function batchForRecording(
  batches: ChangeTddBatch[],
  requirementIds: string[],
  phase: 'red' | 'implementation' | 'green',
): ChangeTddBatch | undefined {
  const key = batchKey(requirementIds);
  const matching = batches.filter((batch) => batchKey(batch.requirementIds) === key);
  if (phase === 'red') {
    const latest = matching.at(-1);
    return latest && !latest.green ? latest : undefined;
  }
  for (let index = matching.length - 1; index >= 0; index -= 1) {
    const batch = matching[index]!;
    if (phase === 'implementation' && batch.red && !batch.implementation) return batch;
    if (phase === 'green' && batch.implementation && !batch.green) return batch;
  }
  return undefined;
}

export function batchForKey(batches: ChangeTddBatch[], key: string): ChangeTddBatch | undefined {
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const batch = batches[index]!;
    if (batch.scopeId === key || batchKey(batch.requirementIds) === key) return batch;
  }
  return undefined;
}

// Pure, side-effect-free re-derivations of the exact "would this diagnostic
// currently fire" conditions used by change.ts's validators. Kept here (with
// no dependency on change.ts or change-waiver.ts) so change-waiver.ts can
// check for a currently-reported diagnostic without importing change.ts,
// which would otherwise create a module dependency cycle.

export function requirementsUnchangedCondition(change: ChangeRecord): boolean {
  const impact = change.phases.impact;
  const requirements = change.phases.requirements;
  return !!impact && !!requirements && !requirements.allowUnchanged
    && impact.fingerprints.requirements === requirements.fingerprints.requirements;
}

export function designUnchangedCondition(change: ChangeRecord): boolean {
  const requirements = change.phases.requirements;
  const design = change.phases.design;
  return !!requirements && !!design && requirements.fingerprints.design === design.fingerprints.design;
}

export function hasValidTddCycle(change: ChangeRecord, requirementId: string, tdd: TddEvidence | null): boolean {
  return tdd !== null && selectCurrentTddCycle(change, requirementId, tdd).selected !== null;
}

export function redUnprovenCondition(change: ChangeRecord, requirementId: string, tdd: TddEvidence | null): boolean {
  const batch = batchFor(effectiveBatches(change), requirementId);
  return !!batch?.red && !hasValidTddCycle(change, requirementId, tdd);
}

export function greenUnprovenCondition(change: ChangeRecord, requirementId: string, tdd: TddEvidence | null): boolean {
  const batch = batchFor(effectiveBatches(change), requirementId);
  return !!batch?.green && !hasValidTddCycle(change, requirementId, tdd);
}

export function completenessTddUnsatisfiedCondition(change: ChangeRecord, requirementId: string, tdd: TddEvidence | null): boolean {
  return !hasValidTddCycle(change, requirementId, tdd);
}

const tddBatchPhaseNames = ['red', 'implementation', 'green'] as const;
type TddBatchPhaseName = typeof tddBatchPhaseNames[number];

export async function recordMissingCondition(root: string, evidence: ChangeEvidence | null, changeId: string): Promise<boolean> {
  if (!await exists(within(root, `.musubix/changes/${changeId}.md`))) return false;
  return evidence === null || !evidence.changes.some((entry) => entry.changeId === changeId);
}

export function phaseMissingCondition(change: ChangeRecord, phaseName: string): boolean {
  if ((tddBatchPhaseNames as readonly string[]).includes(phaseName)) {
    const covered = new Set(effectiveBatches(change)
      .filter((batch) => batch[phaseName as TddBatchPhaseName])
      .flatMap((batch) => batch.requirementIds));
    return change.requirementIds.some((id) => !covered.has(id));
  }
  return !change.phases[phaseName as ChangePhase];
}

export function orderMigrationRequiredPhaseCondition(change: ChangeRecord, phaseName: string): boolean {
  const item = change.phases[phaseName as ChangePhase];
  return !!item && !Number.isInteger(item.order);
}

export function orderMigrationRequiredBatchCondition(change: ChangeRecord, batchPhaseName: string, key: string): boolean {
  const batch = batchForKey(effectiveBatches(change), key);
  const item = batch?.[batchPhaseName as TddBatchPhaseName];
  return !!item && !Number.isInteger(item.order);
}

export function orderMigrationRequiredRequirementCondition(change: ChangeRecord, requirementId: string, tdd: TddEvidence | null): boolean {
  const batch = batchFor(effectiveBatches(change), requirementId);
  if (!batch?.red) return false;
  const cycles = (tdd?.cycles ?? []).filter((cycle) => cycle.requirementId === requirementId);
  return cycles.some((cycle) => !Number.isInteger(cycle.red.order) || !Number.isInteger(cycle.green?.order));
}

export function testsUnchangedCondition(change: ChangeRecord, batch: ChangeTddBatch): boolean {
  const design = change.phases.design;
  const red = batch.red;
  return !!design && !!red && design.fingerprints.tests === red.fingerprints.tests;
}

export function implementationUnchangedCondition(batch: ChangeTddBatch): boolean {
  const red = batch.red;
  const implementation = batch.implementation;
  return !!red && !!implementation && red.fingerprints.implementation === implementation.fingerprints.implementation;
}

export function relevantImplementationUnchangedCondition(batch: ChangeTddBatch, requirementId: string): boolean {
  const red = batch.red;
  const implementation = batch.implementation;
  if (!red || !implementation) return false;
  const before = red.fingerprints.requirementImplementations?.[requirementId];
  const after = implementation.fingerprints.requirementImplementations?.[requirementId];
  if (!before || !after || (!before.paths.length && !after.paths.length)) return false;
  return JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints);
}

export function testChangedAfterRedCondition(batch: ChangeTddBatch): boolean {
  const red = batch.red;
  const green = batch.green;
  return !!red && !!green && red.fingerprints.tests !== green.fingerprints.tests;
}
