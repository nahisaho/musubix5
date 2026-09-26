import { exists, readText, within } from './files.js';
import type { TddEvidence } from './tdd-types.js';
import { selectCurrentTddCycle } from './tdd-cycle-resolver.js';
import { canonicalBytes } from './canonical.js';
import { classifyParallelTddEvidence } from './parallel-tdd-evidence.js';

export { classifyParallelTddEvidence } from './parallel-tdd-evidence.js';

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
  qualityOrdinal?: number;
  requirementsOrdinal?: number;
  designOrdinal?: number;
  operationId?: string;
  approvalManifestSha256?: string;
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

export interface ChangeGenerationAbandonment {
  reason: string;
  approver: string;
  abandonedAt: string;
}

export interface ChangeGenerationHistory {
  generation: number;
  status: 'superseded' | 'abandoned';
  requirementIds: string[];
  phases: Partial<Record<ChangePhase, ChangePhaseEvidence>>;
  requirementsHistory?: ChangePhaseEvidence[];
  designHistory?: ChangePhaseEvidence[];
  qualityHistory?: ChangePhaseEvidence[];
  tddBatches?: ChangeTddBatch[];
  abandonment?: ChangeGenerationAbandonment;
}

export interface ChangeRecord {
  changeId: string;
  generation?: number;
  activeGeneration?: number | null;
  requirementIds: string[];
  phases: Partial<Record<ChangePhase, ChangePhaseEvidence>>;
  requirementsHistory?: ChangePhaseEvidence[];
  designHistory?: ChangePhaseEvidence[];
  qualityHistory?: ChangePhaseEvidence[];
  tddBatches?: ChangeTddBatch[];
  generationHistory?: ChangeGenerationHistory[];
  abandonment?: ChangeGenerationAbandonment;
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

export interface ChangeGenerationSummary {
  changeId: string;
  activeGeneration: number | null;
  generations: Array<{
    generation: number;
    status: 'active' | 'superseded' | 'abandoned';
    unprojectedPhaseCheckpoints: Array<{
      generation: number;
      phase: 'requirements' | 'design';
      operationId: string;
      ordinal: number;
      journalOrder: number;
    }>;
  }>;
}

/** @id CODE-M5-LIFECYCLE-005
 * @implements REQ-M5-LIFECYCLE-005
 * @design DES-M5-004 DES-M5-005
 */
export function activeChangeGeneration(change: ChangeRecord): number | null {
  if (change.activeGeneration === null) return null;
  return change.activeGeneration ?? change.generation ?? 1;
}

export function generationOrderPhase(generation: number, phase: string, scopeId?: string): string {
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error('CHANGE_GENERATION_PHASE: generation must be a positive integer.');
  }
  if (!phase.trim()) {
    throw new Error('CHANGE_GENERATION_PHASE: phase must be nonblank.');
  }
  return `g${generation}:${phase}${scopeId ? `:${scopeId}` : ''}`;
}

function normalizedRequirementIds(requirementIds: string[]): string[] {
  return [...new Set(requirementIds)].sort();
}

function sameRequirementIds(left: string[], right: string[]): boolean {
  return JSON.stringify(normalizedRequirementIds(left)) === JSON.stringify(normalizedRequirementIds(right));
}

function snapshotGeneration(
  change: ChangeRecord,
  generation: number,
  status: ChangeGenerationHistory['status'],
): ChangeGenerationHistory {
  return {
    generation,
    status,
    requirementIds: [...change.requirementIds],
    phases: change.phases,
    ...(change.requirementsHistory ? { requirementsHistory: change.requirementsHistory } : {}),
    ...(change.designHistory ? { designHistory: change.designHistory } : {}),
    ...(change.qualityHistory ? { qualityHistory: change.qualityHistory } : {}),
    ...(change.tddBatches ? { tddBatches: change.tddBatches } : {}),
    ...(change.abandonment ? { abandonment: change.abandonment } : {}),
  };
}

export function reopenChangeGeneration(
  change: ChangeRecord,
  requirementIds: string[],
): { generation: number; resumed: boolean } {
  const active = activeChangeGeneration(change);
  if (active !== null && !change.phases.quality) {
    if (!sameRequirementIds(change.requirementIds, requirementIds)) {
      throw new Error('CHANGE_GENERATION_REQUIREMENTS: requirement IDs must exactly match the CHANGE document.');
    }
    const phaseNames = Object.keys(change.phases);
    if (change.phases.impact && phaseNames.length === 1) {
      return { generation: active, resumed: true };
    }
    throw new Error('CHANGE_GENERATION_PHASE: an incomplete generation must be abandoned before reopen.');
  }
  const history = change.generationHistory ??= [];
  const priorGeneration = active ?? change.generation ?? 1;
  history.push(snapshotGeneration(change, priorGeneration, active === null ? 'abandoned' : 'superseded'));
  const generation = Math.max(priorGeneration, ...history.map((entry) => entry.generation)) + 1;
  change.generation = generation;
  change.activeGeneration = generation;
  change.requirementIds = normalizedRequirementIds(requirementIds);
  change.phases = {};
  delete change.requirementsHistory;
  delete change.designHistory;
  delete change.qualityHistory;
  delete change.tddBatches;
  delete change.abandonment;
  return { generation, resumed: false };
}

export function abandonChangeGeneration(
  change: ChangeRecord,
  authority: { reason: string; approver: string; confirm: boolean },
): void {
  if (!authority.confirm || !authority.reason.trim() || !authority.approver.trim()) {
    throw new Error('CLI_ERROR: generation abandon requires nonblank --reason, --approver, and --confirm.');
  }
  if (activeChangeGeneration(change) === null || change.phases.quality) {
    throw new Error('CHANGE_GENERATION_PHASE: only an incomplete active generation can be abandoned.');
  }
  change.abandonment = {
    reason: authority.reason.trim(),
    approver: authority.approver.trim(),
    abandonedAt: new Date().toISOString(),
  };
  change.activeGeneration = null;
}

export function summarizeChangeGeneration(change: ChangeRecord): ChangeGenerationSummary {
  const active = activeChangeGeneration(change);
  const generations: ChangeGenerationSummary['generations'] = (change.generationHistory ?? [])
    .map((entry) => ({
      generation: entry.generation,
      status: entry.status,
      unprojectedPhaseCheckpoints: [],
    }));
  const currentGeneration = change.generation ?? 1;
  if (!generations.some((entry) => entry.generation === currentGeneration)) {
    generations.push({
      generation: currentGeneration,
      status: active === null ? 'abandoned' : 'active',
      unprojectedPhaseCheckpoints: [],
    });
  }

  generations.sort((left, right) => left.generation - right.generation);
  return {
    changeId: change.changeId,
    activeGeneration: active,
    generations,
  };
}

export type SupersedingPhase = 'requirements' | 'design';

function phaseOrdinalField(phase: SupersedingPhase): 'requirementsOrdinal' | 'designOrdinal' {
  return phase === 'requirements' ? 'requirementsOrdinal' : 'designOrdinal';
}

function phaseHistory(change: ChangeRecord, phase: SupersedingPhase): ChangePhaseEvidence[] {
  if (phase === 'requirements') return change.requirementsHistory ??= [];
  return change.designHistory ??= [];
}

export function phaseCheckpointEntries(
  change: ChangeRecord,
  phase: SupersedingPhase,
): ChangePhaseEvidence[] {
  return [
    ...phaseHistory(change, phase),
    ...(change.phases[phase] ? [change.phases[phase]!] : []),
  ];
}

export function nextPhaseCheckpointOrdinal(change: ChangeRecord, phase: SupersedingPhase): number {
  const field = phaseOrdinalField(phase);
  return Math.max(0, ...phaseCheckpointEntries(change, phase).map((entry, index) =>
    entry[field] ?? index + 1)) + 1;
}

/** @id CODE-M5-PHASE-CHECKPOINT-PROJECTION-001
 * @implements REQ-M5-LIFECYCLE-005 REQ-M5-COMPAT-013
 * @design DES-M5-005
 */
export function supersedeApprovedPhase(
  change: ChangeRecord,
  phase: SupersedingPhase,
  candidate: ChangePhaseEvidence,
  ordinal: number,
): void {
  const field = phaseOrdinalField(phase);
  const current = change.phases[phase];
  const history = phaseHistory(change, phase);
  for (const [index, historical] of history.entries()) historical[field] ??= index + 1;
  if (current) {
    current[field] ??= history.length + 1;
    history.push(current);
  }
  candidate[field] = ordinal;
  change.phases[phase] = candidate;
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
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const batch = batches[index]!;
    if (batch.requirementIds.includes(requirementId)) return batch;
  }
  return undefined;
}

export function batchKey(requirementIds: string[]): string {
  return [...new Set(requirementIds)].sort().join(',');
}

/** @id CODE-M5-QUALITY-SUPERSESSION-001
 * @implements REQ-M5-LIFECYCLE-003 REQ-M5-EVIDENCE-005 REQ-M5-QUALITY-001 REQ-M5-QUALITY-003
 * @design DES-M5-004 DES-M5-007 DES-M5-015
 */
export function supersedeQualityPhase(
  change: ChangeRecord,
  candidate: ChangePhaseEvidence,
): { phaseKey: string; qualityOrdinal: number } {
  const current = change.phases.quality;
  const qualityOrdinal = nextQualityOrdinal(change);
  if (current) {
    change.qualityHistory ??= [];
    for (const [index, historical] of change.qualityHistory.entries()) {
      historical.qualityOrdinal ??= index + 1;
    }
    current.qualityOrdinal ??= change.qualityHistory.length + 1;
    change.qualityHistory.push(current);
  }
  candidate.qualityOrdinal = qualityOrdinal;
  change.phases.quality = candidate;
  return {
    phaseKey: qualityOrdinal === 1 ? 'quality' : `quality:${qualityOrdinal}`,
    qualityOrdinal,
  };
}

export function nextQualityOrdinal(change: ChangeRecord): number {
  const current = change.phases.quality;
  return current
    ? (current.qualityOrdinal ?? (change.qualityHistory?.length ?? 0) + 1) + 1
    : 1;
}

export function qualityFingerprintsEqual(
  left: ChangeFingerprints,
  right: ChangeFingerprints,
): boolean {
  return Buffer.compare(canonicalBytes(left), canonicalBytes(right)) === 0;
}

export function qualityFingerprintPreviouslyRecorded(
  change: ChangeRecord,
  candidate: ChangeFingerprints,
): boolean {
  return [change.phases.quality, ...(change.qualityHistory ?? [])]
    .some((entry) => entry !== undefined && qualityFingerprintsEqual(entry.fingerprints, candidate));
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
  if ((change.generation ?? 1) > 1) return false;
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

export async function selectCurrentChangeTddCycle(
  root: string,
  change: ChangeRecord,
  requirementId: string,
  tdd: TddEvidence,
  purpose: string,
): Promise<ReturnType<typeof selectCurrentTddCycle> & {
  parallelStatus: 'pass' | 'PARALLEL_TDD_UNCONSUMED' | null;
}> {
  const resolution = selectCurrentTddCycle(change, requirementId, tdd);
  if (!resolution.selected) return { ...resolution, parallelStatus: null };
  const parallelStatus = await classifyParallelTddEvidence(root, {
    changeId: change.changeId,
    generation: change.activeGeneration ?? change.generation ?? 1,
    requirementId,
    cycleId: resolution.selected.cycle.cycleId ?? null,
    purpose,
  });
  return parallelStatus === 'PARALLEL_TDD_UNCONSUMED'
    ? { ...resolution, selected: null, parallelStatus }
    : { ...resolution, parallelStatus };
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
