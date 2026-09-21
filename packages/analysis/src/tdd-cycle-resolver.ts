import type { TddCycle, TddEvidence, TddPhaseEvidence } from './tdd.js';

interface ResolverPhaseEvidence {
  order?: number;
}

interface ResolverBatch {
  scopeId?: string;
  requirementIds: string[];
  red?: ResolverPhaseEvidence;
  implementation?: ResolverPhaseEvidence;
  green?: ResolverPhaseEvidence;
}

interface ResolverChangeRecord {
  changeId: string;
  generation?: number;
  activeGeneration?: number | null;
  requirementIds: string[];
  phases: {
    requirements?: ResolverPhaseEvidence;
    red?: ResolverPhaseEvidence;
    implementation?: ResolverPhaseEvidence;
    green?: ResolverPhaseEvidence;
  };
  tddBatches?: ResolverBatch[];
}

export type TddBatchScope =
  | { kind: 'legacy-full-set'; identity: string }
  | { kind: 'requirement-batch'; identity: string };

export interface TddCycleExclusion {
  subject: string;
  reason: 'legacy-full-set-separated' | 'incomplete-batch' | 'invalid-phase-order'
    | 'older-complete-batch' | 'red-status-not-failed' | 'green-status-not-passed'
    | 'command-changed' | 'cycle-outside-batch' | 'older-cycle' | 'ambiguous-terminal-order'
    | 'superseded-generation';
}

export interface CurrentTddCycle {
  scope: TddBatchScope;
  batchTerminalOrder: number;
  lineageId: string;
  batch: ResolverBatch;
  cycle: TddCycle;
  refactorCurrent: boolean;
}

export interface TddCycleResolution {
  selected: CurrentTddCycle | null;
  excluded: TddCycleExclusion[];
}

interface BatchCandidate {
  scope: TddBatchScope;
  batch: ResolverBatch;
  terminalOrder: number;
}

function scopeKey(requirementIds: string[]): string {
  return [...new Set(requirementIds)].sort().join(',');
}

function authoritativePhase(
  phase: TddPhaseEvidence | undefined,
  expectedStatus: 'failed' | 'passed',
): boolean {
  return phase?.valid === true
    && phase.scoped === true
    && phase.resultObserved === true
    && phase.testStatus === expectedStatus
    && typeof phase.reportSha256 === 'string'
    && typeof phase.sourceFingerprint === 'string'
    && typeof phase.executionId === 'string'
    && Number.isInteger(phase.order);
}

function completeBatch(batch: ResolverBatch): { complete: boolean; ordered: boolean; terminalOrder: number } {
  const red = batch.red?.order;
  const implementation = batch.implementation?.order;
  const green = batch.green?.order;
  const complete = Number.isInteger(red) && Number.isInteger(implementation) && Number.isInteger(green);
  return {
    complete,
    ordered: complete && red! < implementation! && implementation! < green!,
    terminalOrder: complete ? green! : -1,
  };
}

function batchSubject(scope: TddBatchScope): string {
  return `batch:${scope.identity}`;
}

/** @id CODE-M5-TDD-001
 * @implements REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004
 * @design DES-M5-011
 */
export function selectCurrentTddCycle(
  change: ResolverChangeRecord,
  requirementId: string,
  evidence: TddEvidence,
  context: { currentSourceFingerprint?: string } = {},
): TddCycleResolution {
  const excluded: TddCycleExclusion[] = [];
  const scoped = (change.tddBatches ?? [])
    .filter((batch) => batch.requirementIds.includes(requirementId))
    .map((batch, index) => ({
      scope: {
        kind: 'requirement-batch' as const,
        identity: `${change.changeId}:${batch.scopeId ?? `${scopeKey(batch.requirementIds)}:${batch.red?.order ?? `unrecorded-${index}`}`}`,
      },
      batch,
    }));
  const legacyBatch: ResolverBatch = {
    requirementIds: [...change.requirementIds],
    ...(change.phases.red ? { red: change.phases.red } : {}),
    ...(change.phases.implementation ? { implementation: change.phases.implementation } : {}),
    ...(change.phases.green ? { green: change.phases.green } : {}),
  };
  const legacy = change.requirementIds.includes(requirementId)
    && (legacyBatch.red || legacyBatch.implementation || legacyBatch.green)
    ? [{
        scope: {
          kind: 'legacy-full-set' as const,
          identity: `${change.changeId}:legacy-full-set`,
        },
        batch: legacyBatch,
      }]
    : [];
  if (scoped.length > 0) {
    for (const candidate of legacy) {
      excluded.push({
        subject: batchSubject(candidate.scope),
        reason: 'legacy-full-set-separated',
      });
    }
  }
  const eligibleSource = scoped.length > 0 ? scoped : legacy;
  const complete: BatchCandidate[] = [];
  for (const candidate of eligibleSource) {
    const state = completeBatch(candidate.batch);
    if (!state.complete) {
      excluded.push({ subject: batchSubject(candidate.scope), reason: 'incomplete-batch' });
    } else if (!state.ordered) {
      excluded.push({ subject: batchSubject(candidate.scope), reason: 'invalid-phase-order' });
    } else {
      complete.push({ ...candidate, terminalOrder: state.terminalOrder });
    }
  }
  if (complete.length === 0) return { selected: null, excluded };
  const greatestOrder = Math.max(...complete.map((candidate) => candidate.terminalOrder));
  const newest = complete.filter((candidate) => candidate.terminalOrder === greatestOrder);
  if (newest.length !== 1) {
    for (const candidate of newest) {
      excluded.push({ subject: batchSubject(candidate.scope), reason: 'ambiguous-terminal-order' });
    }
    return { selected: null, excluded };
  }
  const selectedBatch = newest[0]!;
  for (const candidate of complete) {
    if (candidate !== selectedBatch) {
      excluded.push({ subject: batchSubject(candidate.scope), reason: 'older-complete-batch' });
    }
  }
  const redOrder = selectedBatch.batch.red!.order!;
  const implementationOrder = selectedBatch.batch.implementation!.order!;
  const greenOrder = selectedBatch.batch.green!.order!;
  const requirementsOrder = change.phases.requirements?.order;
  const cycles: TddCycle[] = [];
  const activeGeneration = change.activeGeneration ?? change.generation ?? 1;
  for (const cycle of evidence.cycles.filter((entry) => entry.requirementId === requirementId)) {
    if ((cycle.generation ?? 1) !== activeGeneration || (cycle.changeId !== undefined && cycle.changeId !== change.changeId)) {
      excluded.push({ subject: `cycle:${cycle.cycleId ?? cycle.testId}`, reason: 'superseded-generation' });
      continue;
    }
    if (!authoritativePhase(cycle.red, 'failed')) {
      excluded.push({ subject: `cycle:${cycle.cycleId ?? cycle.testId}`, reason: 'red-status-not-failed' });
      continue;
    }
    if (!authoritativePhase(cycle.green, 'passed')) {
      excluded.push({ subject: `cycle:${cycle.cycleId ?? cycle.testId}`, reason: 'green-status-not-passed' });
      continue;
    }
    if (cycle.red.commandSha256 !== cycle.green!.commandSha256) {
      excluded.push({ subject: `cycle:${cycle.cycleId ?? cycle.testId}`, reason: 'command-changed' });
      continue;
    }
    if (!(Number.isInteger(requirementsOrder)
      && cycle.red.order! > requirementsOrder!
      && cycle.red.order! <= redOrder
      && cycle.green!.order! > implementationOrder
      && cycle.green!.order! <= greenOrder
      && cycle.red.order! < cycle.green!.order!)) {
      excluded.push({ subject: `cycle:${cycle.cycleId ?? cycle.testId}`, reason: 'cycle-outside-batch' });
      continue;
    }
    cycles.push(cycle);
  }
  if (cycles.length === 0) return { selected: null, excluded };
  cycles.sort((left, right) =>
    right.green!.order! - left.green!.order!
    || (left.cycleId ?? '').localeCompare(right.cycleId ?? ''));
  const cycle = cycles[0]!;
  for (const older of cycles.slice(1)) {
    excluded.push({ subject: `cycle:${older.cycleId ?? older.testId}`, reason: 'older-cycle' });
  }
  const refactorCurrent = authoritativePhase(cycle.refactor, 'passed')
    && cycle.refactor!.order! > cycle.green!.order!
    && (context.currentSourceFingerprint === undefined
      || cycle.refactor!.sourceFingerprint === context.currentSourceFingerprint);
  return {
    selected: {
      scope: selectedBatch.scope,
      batchTerminalOrder: selectedBatch.terminalOrder,
      lineageId: `${change.changeId}:${selectedBatch.scope.identity}:${cycle.testId}:${cycle.commandName}`,
      batch: selectedBatch.batch,
      cycle,
      refactorCurrent,
    },
    excluded,
  };
}
