import { error, ids, validateDesign, validateRequirements, type Diagnostic, type Requirement } from '../../domain/src/index.js';
import { digest, exists, files, snapshot, within, writeJson, readText } from './files.js';
import { loadTddEvidence } from './tdd.js';
import { buildTrace } from './trace.js';
import { indexGraph } from './graph.js';
import { validatePerformanceEvidence } from './performance.js';
import {
  appendEvidenceOrder, evidenceOrderRecord, inspectEvidenceOrder,
  type EvidenceOrderRecord,
} from './order.js';
import { loadChangeWaiverEvidence, buildWaiverContext, diagnosticDetail, errorFor, reportWaiverEvidenceDiagnostics, waivedDiagnostic } from './change-waiver.js';
import {
  abandonChangeGeneration, activeChangeGeneration, batchFor, batchForRecording, batchKey, changePhases, effectiveBatches,
  generationOrderPhase,
  loadChangeEvidence, nextBatchScopeId, nextQualityOrdinal, qualityFingerprintPreviouslyRecorded,
  reopenChangeGeneration, supersedeQualityPhase,
  type ChangeCompleteness, type ChangeEvidence, type ChangeFingerprints, type ChangePhase,
  type ChangePhaseEvidence, type ChangeRecord, type ChangeTddBatch,
} from './change-evidence.js';
import { selectCurrentTddCycle } from './tdd-cycle-resolver.js';
import { acquireChangeLease, assertChangeLeaseCurrent, releaseChangeLease } from './journal.js';

export * from './change-evidence.js';

const MEASURABLE_KEYWORD_RE = /(?:\d|test|check|verif|assert|given|when|then|return|status|pass|fail|report|error|reject|contain|unaffected|unchanged|invalid|missing|stale|silently|substring|naming|configur|exit|omit|affect|raise|cannot|preserve|every|duplicate|same|separate|identical|exact|record|without|only|each|テスト|確認|検証|以下|以上)/i;

const PLACEHOLDER_PREFIX_RE = /^(?:TODO|TBD|N\/A|none|未定)(?:\s*[:\-—].*)?$/i;

export function hasMeasurableAcceptance(acceptance: string): boolean {
  const trimmed = acceptance.trim();
  return trimmed.length >= 8
    && !PLACEHOLDER_PREFIX_RE.test(trimmed)
    && MEASURABLE_KEYWORD_RE.test(trimmed);
}

async function fingerprint(root: string, paths: string[]): Promise<string> {
  return digest(JSON.stringify(await snapshot(root, [...new Set(paths)].sort())));
}

async function requirementImplementationFingerprints(
  root: string,
  requirementIds: string[],
  trace: Awaited<ReturnType<typeof buildTrace>>,
): Promise<NonNullable<ChangeFingerprints['requirementImplementations']>> {
  const graph = await indexGraph(root, false);
  const nodes = new Map(trace.nodes.map((node) => [node.id, node]));
  const testPaths = new Set(trace.nodes.filter((node) => node.kind === 'test').map((node) => node.path));
  const result: NonNullable<ChangeFingerprints['requirementImplementations']> = {};
  for (const requirementId of requirementIds) {
    const designs = trace.edges
      .filter((edge) => edge.relation === 'satisfies' && edge.to === requirementId && nodes.get(edge.from)?.kind === 'design')
      .map((edge) => edge.from);
    const direct = new Set(trace.edges
      .filter((edge) => edge.relation === 'implements'
        && (edge.to === requirementId || designs.includes(edge.to))
        && nodes.get(edge.from)?.kind === 'code')
      .map((edge) => nodes.get(edge.from)!.path));
    const relevant = new Set([...direct].filter((path) => graph.files.includes(path) && !testPaths.has(path)));
    const queue = [...relevant];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      for (const edge of graph.imports.filter((entry) => !entry.external && entry.from === current)) {
        if (testPaths.has(edge.to) || relevant.has(edge.to)) continue;
        relevant.add(edge.to);
        queue.push(edge.to);
      }
    }
    const paths = [...relevant].sort();
    result[requirementId] = { paths, fingerprints: await snapshot(root, paths) };
  }
  return result;
}

async function currentFingerprints(root: string, changeId: string, requirementIds: string[]): Promise<ChangeFingerprints> {
  const paths = await files(root);
  const trace = await buildTrace(root);
  const codePaths = trace.nodes.filter((node) => node.kind === 'code').map((node) => node.path);
  const testPaths = trace.nodes.filter((node) => node.kind === 'test').map((node) => node.path);
  const tddPath = '.musubix/evidence/tdd.json';
  return {
    impact: await fingerprint(root, paths.filter((path) => path === `.musubix/changes/${changeId}.md`)),
    requirements: await fingerprint(root, paths.filter((path) => /^\.musubix\/features\/[^/]+\/requirements\.md$/.test(path))),
    design: await fingerprint(root, paths.filter((path) =>
      /^\.musubix\/features\/[^/]+\/design\.md$/.test(path) || /^\.musubix\/decisions\/ADR-\d+\.md$/.test(path))),
    implementation: await fingerprint(root, codePaths),
    tests: await fingerprint(root, testPaths),
    tdd: await fingerprint(root, await exists(within(root, tddPath)) ? [tddPath] : []),
    requirementImplementations: await requirementImplementationFingerprints(root, requirementIds, trace),
  };
}

const tddBatchPhases = ['red', 'implementation', 'green'] as const;
type TddBatchPhase = typeof tddBatchPhases[number];
const singularPhases = ['impact', 'requirements', 'design', 'quality'] as const;

async function changeDocumentRequirementIds(root: string, changeId: string): Promise<string[]> {
  const source = await readText(root, `.musubix/changes/${changeId}.md`);
  const match = /^Requirements:\s+(.+)$/m.exec(source);
  if (!match) throw new Error('CHANGE_GENERATION_REQUIREMENTS: CHANGE document is missing Requirements:.');
  const requirementIds = [...new Set(match[1]!.trim().split(/\s+/))].sort();
  if (!requirementIds.length || requirementIds.some((id) => !ids.requirement.test(id))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: CHANGE document contains invalid requirement IDs.');
  }
  return requirementIds;
}

function sameRequirementSet(left: string[], right: string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function orderPhaseFor(change: ChangeRecord, phase: string, scopeId?: string): string {
  return generationOrderPhase(activeChangeGeneration(change) ?? change.generation ?? 1, phase, scopeId);
}

function generationEvidenceOrderRecord(
  records: Map<string, EvidenceOrderRecord>,
  change: ChangeRecord,
  phase: string,
): ReturnType<typeof evidenceOrderRecord> {
  const generation = activeChangeGeneration(change) ?? change.generation ?? 1;
  const qualified = evidenceOrderRecord(records, 'change', change.changeId, generationOrderPhase(generation, phase));
  return qualified ?? (generation === 1
    ? evidenceOrderRecord(records, 'change', change.changeId, phase)
    : undefined);
}

// Returns null when nothing is unchanged, or a rejection message embedding
// one of the five stable *_AT_RECORD codes otherwise.
function unchangedRejection(
  changeId: string,
  phase: ChangePhase,
  requirementIds: string[],
  current: ChangeFingerprints,
  baseline: ChangeFingerprints | undefined,
): string | null {
  if (!baseline) return null;
  if (phase === 'requirements' && current.requirements === baseline.requirements) {
    return `CHANGE_REQUIREMENTS_UNCHANGED_AT_RECORD: ${changeId} did not change requirements since impact.`;
  }
  if (phase === 'design' && current.design === baseline.design) {
    return `CHANGE_DESIGN_UNCHANGED_AT_RECORD: ${changeId} did not change design since requirements.`;
  }
  if (phase === 'red' && current.tests === baseline.tests) {
    return `CHANGE_TESTS_UNCHANGED_AT_RECORD: ${changeId} did not add or change tests since design.`;
  }
  if (phase === 'implementation') {
    if (current.implementation === baseline.implementation) {
      return `CHANGE_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation since red.`;
    }
    const unchanged = requirementIds.filter((requirementId) => {
      const before = baseline.requirementImplementations?.[requirementId];
      const after = current.requirementImplementations?.[requirementId];
      return before && after && JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints);
    });
    if (unchanged.length) {
      return `CHANGE_RELEVANT_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation related to ${unchanged.join(', ')} since red.`;
    }
  }
  return null;
}

export async function recordChangePhase(
  root: string,
  changeId: string,
  phase: ChangePhase,
  requirementIds: string[],
  options: { allowUnchanged?: boolean; dryRun?: boolean; reopen?: boolean } = {},
): Promise<ChangeEvidence> {
  if (!/^CHANGE-\d+$/.test(changeId)) throw new Error('Change ID must match CHANGE-<digits>.');
  if (!changePhases.includes(phase)) throw new Error('Unknown change phase.');
  if ((!options.reopen && !requirementIds.length) || requirementIds.some((id) => !ids.requirement.test(id))) {
    throw new Error('At least one valid REQ-* ID is required.');
  }
  if (phase === 'impact' && !await exists(within(root, `.musubix/changes/${changeId}.md`))) {
    throw new Error(`Missing staged change document: .musubix/changes/${changeId}.md`);
  }
  if (options.reopen && phase !== 'impact') {
    throw new Error('CLI_ERROR: --reopen is accepted only for impact.');
  }
  if (options.reopen) {
    const lease = await acquireChangeLease(root, changeId);
    try {
      const evidence = await loadChangeEvidence(root);
      const change = evidence?.changes.find((entry) => entry.changeId === changeId);
      if (!evidence || !change) {
        throw new Error('CHANGE_GENERATION_PHASE: reopen requires an existing CHANGE generation.');
      }
      const documentRequirementIds = await changeDocumentRequirementIds(root, changeId);
      const requestedRequirementIds = requirementIds.length ? [...new Set(requirementIds)].sort() : documentRequirementIds;
      if (!sameRequirementSet(requestedRequirementIds, documentRequirementIds)) {
        throw new Error('CHANGE_GENERATION_REQUIREMENTS: requirement IDs must exactly match the CHANGE document.');
      }
      const reopened = reopenChangeGeneration(change, documentRequirementIds);
      if (reopened.resumed) return evidence;
      const fingerprints = await currentFingerprints(root, changeId, documentRequirementIds);
      const candidate: ChangePhaseEvidence = {
        phase: 'impact',
        recordedAt: new Date().toISOString(),
        fingerprints,
      };
      if (options.dryRun) {
        change.phases.impact = candidate;
        return evidence;
      }
      await assertChangeLeaseCurrent(lease);
      const order = await appendEvidenceOrder(root, {
        kind: 'change',
        entityId: changeId,
        phase: generationOrderPhase(reopened.generation, 'impact'),
      });
      candidate.order = order.sequence;
      change.phases.impact = candidate;
      await writeJson(root, '.musubix/evidence/changes.json', evidence);
      return evidence;
    } finally {
      await releaseChangeLease(lease);
    }
  }
  const evidence = await loadChangeEvidence(root) ?? { schemaVersion: 1, changes: [] };
  if (evidence.changes.some((entry) =>
    changePhases.some((entryPhase) => entry.phases[entryPhase] && !Number.isInteger(entry.phases[entryPhase]!.order))
    || (entry.tddBatches ?? []).some((batch) =>
      tddBatchPhases.some((batchPhase) => batch[batchPhase] && !Number.isInteger(batch[batchPhase]!.order))))) {
    throw new Error('Existing change evidence lacks monotonic order; regenerate it before recording new phases.');
  }
  let change = evidence.changes.find((entry) => entry.changeId === changeId);
  if (!change) {
    if (phase !== 'impact') throw new Error('The first recorded change phase must be impact.');
    change = {
      changeId,
      generation: 1,
      activeGeneration: 1,
      requirementIds: [...new Set(requirementIds)].sort(),
      phases: {},
    };
    evidence.changes.push(change);
  }
  if (activeChangeGeneration(change) === null) {
    throw new Error('CHANGE_GENERATION_PHASE: no active generation; reopen impact is required.');
  }
  const documentRequirementIds = await changeDocumentRequirementIds(root, changeId);
  const suppliedRequirementIds = [...new Set(requirementIds)].sort();
  const isRequestedBatchPhase = (tddBatchPhases as readonly string[]).includes(phase);
  if (!sameRequirementSet(change.requirementIds, documentRequirementIds)
    || (!isRequestedBatchPhase && !sameRequirementSet(suppliedRequirementIds, documentRequirementIds))
    || (isRequestedBatchPhase && !suppliedRequirementIds.every((id) => documentRequirementIds.includes(id)))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: phase requirement IDs must exactly match the CHANGE document.');
  }
  const normalizedRequirementIds = [...new Set(requirementIds)].sort();
  const isFullSet = JSON.stringify(normalizedRequirementIds) === JSON.stringify([...change.requirementIds].sort());
  const isBatchPhase = (tddBatchPhases as readonly string[]).includes(phase);

  if (!isBatchPhase || isFullSet) {
    // impact/requirements/design/quality (always), and red/implementation/green
    // recorded with the change's exact full requirement ID set: identical,
    // unchanged, once-per-change behavior (REQ-CHANGE-REQUIREMENT-BATCHES-002).
    if (change.phases[phase] && phase !== 'quality') throw new Error(`${changeId}:${phase} is already recorded.`);
    if (phase === 'requirements' && !change.phases.impact) throw new Error('requirements requires the preceding impact phase.');
    if (phase === 'design' && !change.phases.requirements) throw new Error('design requires the preceding requirements phase.');
    if (phase === 'red' && !change.phases.design) throw new Error('red requires the preceding design phase.');
    if (phase === 'implementation' && !change.phases.red) throw new Error('implementation requires the preceding red phase.');
    if (phase === 'green' && !change.phases.implementation) throw new Error('green requires the preceding implementation phase.');
    if (phase === 'quality') {
      const covered = new Set(effectiveBatches(change).filter((batch) => batch.green).flatMap((batch) => batch.requirementIds));
      const missing = change.requirementIds.filter((id) => !covered.has(id));
      if (missing.length) throw new Error(`quality requires Green evidence covering all change requirement IDs; missing ${missing.join(', ')}.`);
    }
    if (!isFullSet) {
      throw new Error(!isBatchPhase
        ? 'Every phase must use the same requirement IDs.'
        : 'Every phase must use requirement IDs declared on the change.');
    }
    const fingerprints = await currentFingerprints(root, changeId, change.requirementIds);
    const baseline = phase === 'requirements' ? change.phases.impact?.fingerprints
      : phase === 'design' && (change.generation ?? 1) === 1 ? change.phases.requirements?.fingerprints
      : phase === 'red' ? change.phases.design?.fingerprints
      : phase === 'implementation' ? change.phases.red?.fingerprints
      : undefined;
    const allowUnchanged = phase === 'requirements' && options.allowUnchanged === true;
    if (!allowUnchanged) {
      const rejection = unchangedRejection(changeId, phase, change.requirementIds, fingerprints, baseline);
      if (rejection) throw new Error(rejection);
    }
    const candidate: ChangePhaseEvidence = {
      phase,
      recordedAt: new Date().toISOString(),
      fingerprints,
      ...(phase === 'requirements' && options.allowUnchanged ? { allowUnchanged: true } : {}),
    };
    if (phase === 'quality' && qualityFingerprintPreviouslyRecorded(change, candidate.fingerprints)) {
      throw new Error(`CHANGE_QUALITY_UNCHANGED: ${changeId}:quality has no changed fingerprint to supersede.`);
    }
    if (options.dryRun) {
      return { schemaVersion: evidence.schemaVersion, changes: evidence.changes.map((entry) =>
        entry.changeId === changeId ? { ...entry, phases: { ...entry.phases, [phase]: candidate } } : entry) };
    }
    const qualityOrdinal: number | undefined = phase === 'quality'
      ? nextQualityOrdinal(change)
      : undefined;
    const orderPhase = qualityOrdinal !== undefined && qualityOrdinal > 1
      ? `quality:${qualityOrdinal}`
      : phase;
    const order = await appendEvidenceOrder(root, {
      kind: 'change',
      entityId: changeId,
      phase: orderPhaseFor(change, orderPhase),
    });
    candidate.order = order.sequence;
    if (phase === 'quality') supersedeQualityPhase(change, candidate);
    else change.phases[phase] = candidate;
  } else {
    // red/implementation/green recorded with a proper, non-empty subset of the
    // change's requirement IDs: an independent requirement batch
    // (REQ-CHANGE-REQUIREMENT-BATCHES-001, -003).
    if (!normalizedRequirementIds.length || !normalizedRequirementIds.every((id) => change.requirementIds.includes(id))) {
      throw new Error('A requirement batch must use a non-empty subset of the change requirement IDs.');
    }
    const batchPhase = phase as TddBatchPhase;
    change.tddBatches ??= [];
    const key = batchKey(normalizedRequirementIds);
    let batch = batchForRecording(change.tddBatches, normalizedRequirementIds, batchPhase);
    if (batchPhase === 'red') {
      if (batch?.red) throw new Error(`${changeId}:red is already recorded for the pending requirement batch ${normalizedRequirementIds.join(', ')}.`);
      if (!change.phases.design) throw new Error('red requires the preceding design phase.');
      batch = {
        scopeId: nextBatchScopeId(change.tddBatches, normalizedRequirementIds),
        requirementIds: normalizedRequirementIds,
      };
      change.tddBatches.push(batch);
    } else if (batchPhase === 'implementation') {
      if (!batch?.red) throw new Error(`implementation requires the preceding red phase for requirement batch ${normalizedRequirementIds.join(', ')}.`);
      if (batch.implementation) throw new Error(`${changeId}:implementation is already recorded for requirement batch ${normalizedRequirementIds.join(', ')}.`);
    } else {
      if (!batch?.implementation) throw new Error(`green requires the preceding implementation phase for requirement batch ${normalizedRequirementIds.join(', ')}.`);
      if (batch.green) throw new Error(`${changeId}:green is already recorded for requirement batch ${normalizedRequirementIds.join(', ')}.`);
    }
    const fingerprints = await currentFingerprints(root, changeId, normalizedRequirementIds);
    const baseline = batchPhase === 'red' ? change.phases.design?.fingerprints
      : batchPhase === 'implementation' ? batch?.red?.fingerprints
      : undefined;
    const rejection = unchangedRejection(changeId, phase, normalizedRequirementIds, fingerprints, baseline);
    if (rejection) throw new Error(rejection);
    const candidate: ChangePhaseEvidence = {
      phase,
      recordedAt: new Date().toISOString(),
      fingerprints,
    };
    if (options.dryRun) {
      const previewBatch: ChangeTddBatch = { ...(batch ?? { requirementIds: normalizedRequirementIds }), [batchPhase]: candidate };
      const previewBatches = (change.tddBatches ?? []).includes(batch)
        ? (change.tddBatches ?? []).map((entry) => (entry === batch ? previewBatch : entry))
        : [...(change.tddBatches ?? []), previewBatch];
      return { schemaVersion: evidence.schemaVersion, changes: evidence.changes.map((entry) =>
        entry.changeId === changeId ? { ...entry, tddBatches: previewBatches } : entry) };
    }
    const order = await appendEvidenceOrder(root, {
      kind: 'change',
      entityId: changeId,
      phase: orderPhaseFor(change, phase, batch.scopeId ?? key),
    });
    candidate.order = order.sequence;
    batch[batchPhase] = candidate;
  }
  await writeJson(root, '.musubix/evidence/changes.json', evidence);
  return evidence;
}

export async function abandonPersistedChangeGeneration(
  root: string,
  changeId: string,
  authority: { reason: string; approver: string; confirm: boolean },
): Promise<ChangeEvidence> {
  const lease = await acquireChangeLease(root, changeId);
  try {
    const evidence = await loadChangeEvidence(root);
    const change = evidence?.changes.find((entry) => entry.changeId === changeId);
    if (!evidence || !change) {
      throw new Error('CHANGE_GENERATION_PHASE: generation abandon requires an existing CHANGE.');
    }
    abandonChangeGeneration(change, authority);
    await assertChangeLeaseCurrent(lease);
    await writeJson(root, '.musubix/evidence/changes.json', evidence);
    return evidence;
  } finally {
    await releaseChangeLease(lease);
  }
}

function isCanonicalIsoRecordedAt(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function collectRecordedAtEntries(change: ChangeRecord): { label: string; order: number; recordedAt: string }[] {
  const candidates: { label: string; order: number | undefined; recordedAt: string }[] = [];
  for (const singularPhase of singularPhases) {
    const item = change.phases[singularPhase];
    if (item) {
      candidates.push({
        label: singularPhase === 'quality' ? `quality:${item.qualityOrdinal ?? 1}` : singularPhase,
        order: item.order,
        recordedAt: item.recordedAt,
      });
    }
  }
  for (const quality of change.qualityHistory ?? []) {
    if (quality) {
      candidates.push({
        label: `quality:${quality.qualityOrdinal ?? 1}`,
        order: quality.order,
        recordedAt: quality.recordedAt,
      });
    }
  }
  const fullSetKey = batchKey(change.requirementIds);
  for (const batch of effectiveBatches(change)) {
    const key = batchKey(batch.requirementIds);
    const isFullSet = key === fullSetKey;
    for (const batchPhase of tddBatchPhases) {
      const item = batch[batchPhase];
      if (!item) continue;
      candidates.push({ label: isFullSet ? batchPhase : `${batchPhase}:${key}`, order: item.order, recordedAt: item.recordedAt });
    }
  }
  const orderCounts = new Map<number, number>();
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.order)) continue;
    orderCounts.set(candidate.order!, (orderCounts.get(candidate.order!) ?? 0) + 1);
  }
  return candidates
    .filter((candidate): candidate is { label: string; order: number; recordedAt: string } =>
      Number.isInteger(candidate.order) && orderCounts.get(candidate.order!) === 1 && isCanonicalIsoRecordedAt(candidate.recordedAt))
    .sort((a, b) => a.order - b.order);
}

function recordedAtOutOfOrderDiagnostics(change: ChangeRecord): Diagnostic[] {
  const entries = collectRecordedAtEntries(change);
  const diagnostics: Diagnostic[] = [];
  for (let i = 1; i < entries.length; i += 1) {
    const previous = entries[i - 1]!;
    const current = entries[i]!;
    if (current.recordedAt < previous.recordedAt) {
      diagnostics.push({
        code: 'CHANGE_RECORDEDAT_OUT_OF_ORDER',
        severity: 'warning',
        changeId: change.changeId,
        message: `${change.changeId}: recordedAt for ${current.label} (order ${current.order}) is earlier than ${previous.label} (order ${previous.order}).`,
      });
    }
  }
  return diagnostics;
}

/** @id CODE-M5-CHANGE-CURRENT-001
 * @implements REQ-M5-EVIDENCE-005 REQ-M5-TDD-001 REQ-M5-TDD-002 REQ-M5-TDD-003 REQ-M5-TDD-004 REQ-M5-BOOTSTRAP-001 REQ-M5-BOOTSTRAP-002 REQ-M5-BOOTSTRAP-003 REQ-M5-BOOTSTRAP-004 REQ-M5-COMPAT-001 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-011 DES-M5-013
 */
export async function validateChangeEvidence(root: string): Promise<{
  present: boolean;
  valid: boolean;
  changes: number;
  diagnostics: Diagnostic[];
}> {
  const evidence = await loadChangeEvidence(root);
  const tdd = await loadTddEvidence(root);
  const waiverContext = await buildWaiverContext(root, evidence, tdd);
  const waiverDiagnostics = reportWaiverEvidenceDiagnostics(waiverContext, evidence, tdd);
  const documents = (await files(root))
    .filter((path) => /^\.musubix\/changes\/CHANGE-\d+\.md$/.test(path))
    .map((path) => path.split('/').at(-1)!.replace(/\.md$/, ''));
  if (!evidence?.changes.length) {
    const missingDiagnostics = [
      ...documents.map((changeId) => waivedDiagnostic(waiverContext, 'CHANGE_RECORD_MISSING',
        `${changeId} has a change document but no chronology record.`, changeId, undefined, undefined)),
      ...waiverDiagnostics,
    ];
    return {
      present: documents.length > 0,
      valid: !missingDiagnostics.some((d) => d.severity === 'error'),
      changes: 0,
      diagnostics: missingDiagnostics,
    };
  }
  const diagnostics: Diagnostic[] = [...waiverDiagnostics];
  const order = waiverContext.order;
  diagnostics.push(...order.diagnostics);
  for (const changeId of documents) {
    if (!evidence.changes.some((change) => change.changeId === changeId)) {
      diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_RECORD_MISSING',
        `${changeId} has a change document but no chronology record.`, changeId, undefined, undefined));
    }
  }
  for (const change of evidence.changes) {
    if (!documents.includes(change.changeId)) {
      diagnostics.push(error('CHANGE_DOCUMENT_MISSING', `${change.changeId} has chronology evidence but no change document.`));
    }
  }
  for (const change of evidence.changes) {
    const activeGeneration = activeChangeGeneration(change);
    if (activeGeneration === null) {
      diagnostics.push(error(
        'CHANGE_GENERATION_PHASE',
        `${change.changeId} has no active generation; reopen impact is required.`,
      ));
    } else if (change.generation !== undefined && !change.phases.quality) {
      diagnostics.push(error(
        'CHANGE_GENERATION_INCOMPLETE',
        `${change.changeId}:generation ${activeGeneration} has not reached quality.`,
      ));
    }
    const batches = effectiveBatches(change);
    const fullSetKey = batchKey(change.requirementIds);
    for (const singularPhase of singularPhases) {
      const item = change.phases[singularPhase];
      if (!item) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_PHASE_MISSING',
          `${change.changeId} is missing ${singularPhase}.`, change.changeId, undefined, diagnosticDetail('CHANGE_PHASE_MISSING', { phaseName: singularPhase })));
      }
      if (item && !Number.isInteger(item.order)) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_ORDER_MIGRATION_REQUIRED',
          `${change.changeId}:${singularPhase} lacks monotonic order evidence; regenerate this change chronology.`,
          change.changeId, undefined, diagnosticDetail('CHANGE_ORDER_MIGRATION_REQUIRED', { phaseName: singularPhase })));
      } else if (item) {
        const phaseKey = singularPhase === 'quality' && (item.qualityOrdinal ?? 1) > 1
          ? `quality:${item.qualityOrdinal}`
          : singularPhase;
        const record = generationEvidenceOrderRecord(order.records, change, phaseKey);
        if (!record || record.sequence !== item.order) {
          diagnostics.push(error('CHANGE_ORDER_MISMATCH', `${change.changeId}:${singularPhase} does not match the monotonic evidence order log.`));
        }
      }
    }
    for (const [index, item] of (change.qualityHistory ?? []).entries()) {
      const qualityOrdinal = item.qualityOrdinal ?? index + 1;
      if (!Number.isInteger(item.order)) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_ORDER_MIGRATION_REQUIRED',
          `${change.changeId}:quality:${qualityOrdinal} lacks monotonic order evidence; regenerate this change chronology.`,
          change.changeId, undefined, diagnosticDetail('CHANGE_ORDER_MIGRATION_REQUIRED', { phaseName: 'quality' })));
        continue;
      }
      const phaseKey = qualityOrdinal === 1 ? 'quality' : `quality:${qualityOrdinal}`;
      const record = generationEvidenceOrderRecord(order.records, change, phaseKey);
      if (!record || record.sequence !== item.order) {
        diagnostics.push(error(
          'CHANGE_ORDER_MISMATCH',
          `${change.changeId}:${phaseKey} does not match the monotonic evidence order log.`,
        ));
      }
    }
    if (change.phases.requirements?.order !== undefined && change.phases.impact?.order !== undefined
      && change.phases.requirements.order <= change.phases.impact.order) {
      diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:requirements is not after impact.`));
    }
    if (change.phases.design?.order !== undefined && change.phases.requirements?.order !== undefined
      && change.phases.design.order <= change.phases.requirements.order) {
      diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:design is not after requirements.`));
    }
    for (const batchPhase of tddBatchPhases) {
      const covered = new Set(batches.filter((batch) => batch[batchPhase]).flatMap((batch) => batch.requirementIds));
      const missing = change.requirementIds.filter((id) => !covered.has(id));
      if (missing.length) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_PHASE_MISSING',
          `${change.changeId} is missing ${batchPhase} for ${missing.join(', ')}.`,
          change.changeId, undefined, diagnosticDetail('CHANGE_PHASE_MISSING', { phaseName: batchPhase })));
      }
    }
    for (const batch of batches) {
      const key = batchKey(batch.requirementIds);
      const isFullSet = key === fullSetKey;
      for (const batchPhase of tddBatchPhases) {
        const item = batch[batchPhase];
        if (!item) continue;
        if (!Number.isInteger(item.order)) {
          diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_ORDER_MIGRATION_REQUIRED',
            `${change.changeId}:${batchPhase} lacks monotonic order evidence; regenerate this change chronology.`,
            change.changeId, undefined, diagnosticDetail('CHANGE_ORDER_MIGRATION_REQUIRED', { batchPhaseName: batchPhase, batch })));
          continue;
        }
        const orderPhaseKey = isFullSet ? batchPhase : `${batchPhase}:${batch.scopeId ?? key}`;
        const record = generationEvidenceOrderRecord(order.records, change, orderPhaseKey);
        if (!record || record.sequence !== item.order) {
          diagnostics.push(error('CHANGE_ORDER_MISMATCH', `${change.changeId}:${batchPhase} does not match the monotonic evidence order log.`));
        }
      }
      if (batch.red?.order !== undefined && change.phases.design?.order !== undefined
        && batch.red.order <= change.phases.design.order) {
        diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:red is not after design.`));
      }
      if (batch.implementation?.order !== undefined && batch.red?.order !== undefined
        && batch.implementation.order <= batch.red.order) {
        diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:implementation is not after red.`));
      }
      if (batch.green?.order !== undefined && batch.implementation?.order !== undefined
        && batch.green.order <= batch.implementation.order) {
        diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:green is not after implementation.`));
      }
      if (change.phases.quality?.order !== undefined && batch.green?.order !== undefined
        && change.phases.quality.order <= batch.green.order) {
        diagnostics.push(error('CHANGE_PHASE_ORDER', `${change.changeId}:quality is not after green.`));
      }
    }
    const impact = change.phases.impact;
    const requirements = change.phases.requirements;
    const design = change.phases.design;
    if (impact && requirements && !requirements.allowUnchanged
      && impact.fingerprints.requirements === requirements.fingerprints.requirements) {
      diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_REQUIREMENTS_UNCHANGED',
        `${change.changeId} did not change requirements after impact analysis.`, change.changeId, undefined, undefined));
    }
    if ((change.generation ?? 1) === 1
      && requirements && design && requirements.fingerprints.design === design.fingerprints.design) {
      diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_DESIGN_UNCHANGED',
        `${change.changeId} did not change design after requirements.`, change.changeId, undefined, undefined));
    }
    const selectedBatchScopes = new Set(change.requirementIds.flatMap((requirementId) => {
      if (!tdd) return [];
      const selected = selectCurrentTddCycle(change, requirementId, tdd).selected?.batch;
      return selected ? [selected.scopeId ?? batchKey(selected.requirementIds)] : [];
    }));
    for (const batch of batches) {
      if (!selectedBatchScopes.has(batch.scopeId ?? batchKey(batch.requirementIds))) continue;
      const red = batch.red;
      const implementation = batch.implementation;
      const green = batch.green;
      if (design && red && design.fingerprints.tests === red.fingerprints.tests) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_TESTS_UNCHANGED',
          `${change.changeId} did not add or change tests before Red.`, change.changeId, undefined, diagnosticDetail('CHANGE_TESTS_UNCHANGED', { batch })));
      }
      if (red && implementation && red.fingerprints.implementation === implementation.fingerprints.implementation) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_IMPLEMENTATION_UNCHANGED',
          `${change.changeId} did not change implementation after Red.`, change.changeId, undefined, diagnosticDetail('CHANGE_IMPLEMENTATION_UNCHANGED', { batch })));
      }
      if (red && implementation) {
        for (const requirementId of batch.requirementIds) {
          const before = red.fingerprints.requirementImplementations?.[requirementId];
          const after = implementation.fingerprints.requirementImplementations?.[requirementId];
          if (!before || !after || (!before.paths.length && !after.paths.length)) {
            diagnostics.push(error(
              'CHANGE_IMPLEMENTATION_SCOPE_MISSING',
              `${change.changeId} has no Code Graph implementation scope for ${requirementId}.`,
            ));
          } else if (JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints)) {
            diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_RELEVANT_IMPLEMENTATION_UNCHANGED',
              `${change.changeId} did not change implementation related to ${requirementId} after Red.`,
              change.changeId, requirementId, diagnosticDetail('CHANGE_RELEVANT_IMPLEMENTATION_UNCHANGED', { batch })));
          }
        }
      }
    }
    diagnostics.push(...recordedAtOutOfOrderDiagnostics(change));
    for (const requirementId of change.requirementIds) {
      const resolution = tdd
        ? selectCurrentTddCycle(change, requirementId, tdd)
        : { selected: null };
      const batch = resolution.selected?.batch ?? batchFor(batches, requirementId);
      const red = batch?.red;
      const green = batch?.green;
      const validCycle = resolution.selected?.cycle;
      if (red && validCycle
        && (!Number.isInteger(validCycle.red.order) || !Number.isInteger(validCycle.green?.order))) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_ORDER_MIGRATION_REQUIRED',
          `${change.changeId}:${requirementId} references TDD evidence without monotonic order; regenerate the cycle.`,
          change.changeId, undefined, diagnosticDetail('CHANGE_ORDER_MIGRATION_REQUIRED', { requirementId })));
      }
      if (red && !validCycle) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_RED_UNPROVEN',
          `${change.changeId} has no valid Red evidence for ${requirementId} before its Red phase.`, change.changeId, requirementId, undefined));
      }
      if (green && !validCycle) {
        diagnostics.push(waivedDiagnostic(waiverContext, 'CHANGE_GREEN_UNPROVEN',
          `${change.changeId} has no valid Green evidence for ${requirementId} before its Green phase.`, change.changeId, requirementId, undefined));
      }
    }
  }
  return { present: true, valid: !diagnostics.some((d) => d.severity === 'error'), changes: evidence.changes.length, diagnostics };
}

/** @id CODE-M5-QUALITY-COMPLETENESS-001
 * @implements REQ-M5-EVIDENCE-004 REQ-M5-TDD-004 REQ-M5-QUALITY-001
 * @design DES-M5-007 DES-M5-011 DES-M5-015
 */
export async function validateChangeCompleteness(root: string): Promise<{
  present: boolean;
  valid: boolean;
  changes: ChangeCompleteness[];
  diagnostics: Diagnostic[];
}> {
  const evidence = await loadChangeEvidence(root);
  const tdd = await loadTddEvidence(root);
  const waiverContext = await buildWaiverContext(root, evidence, tdd);
  const waiverDiagnostics = reportWaiverEvidenceDiagnostics(waiverContext, evidence, tdd);
  if (!evidence?.changes.length) {
    return {
      present: false,
      valid: !waiverDiagnostics.some((d) => d.severity === 'error'),
      changes: [],
      diagnostics: waiverDiagnostics,
    };
  }
  const diagnostics: Diagnostic[] = [...waiverDiagnostics];
  const trace = await buildTrace(root, false);
  const nodes = new Map(trace.nodes.map((node) => [node.id, node]));
  const requirementsById = new Map<string, Requirement>();
  for (const path of (await files(root)).filter((entry) => /^\.musubix\/features\/[^/]+\/requirements\.md$/.test(entry))) {
    for (const requirement of validateRequirements(await readText(root, path), path).value) {
      requirementsById.set(requirement.id, requirement);
    }
  }
  const designsById = new Map<string, ReturnType<typeof validateDesign>['value'][number]>();
  for (const path of (await files(root)).filter((entry) => /^\.musubix\/features\/[^/]+\/design\.md$/.test(entry))) {
    for (const component of validateDesign(await readText(root, path), path).value) designsById.set(component.id, component);
  }
  const performance = await validatePerformanceEvidence(root);
  const changes: ChangeCompleteness[] = [];
  for (const change of evidence.changes) {
    const diagnosticStart = diagnostics.length;
    const changePath = `.musubix/changes/${change.changeId}.md`;
    const declaredRequirements = await exists(within(root, changePath))
      ? [...new Set((/^Requirements\s*:\s*(.+)$/im.exec(await readText(root, changePath))?.[1] ?? '').match(/\bREQ-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,}\b/g) ?? [])].sort()
      : [];
    if (JSON.stringify(declaredRequirements) !== JSON.stringify([...change.requirementIds].sort())) {
      diagnostics.push(error('CHANGE_REQUIREMENTS_MISMATCH', `${change.changeId} must explicitly enumerate exactly ${change.requirementIds.join(', ')} in its Requirements field.`, changePath));
    }
    let completeRequirements = 0;
    let functionalRequirements = 0;
    let nonFunctionalRequirements = 0;
    for (const requirementId of change.requirementIds) {
      const requirementNode = nodes.get(requirementId);
      const requirement = requirementsById.get(requirementId);
      const type = requirement?.type;
      if (type === 'non-functional') nonFunctionalRequirements++;
      else if (type === 'functional') functionalRequirements++;
      const designs = trace.edges
        .filter((edge) => edge.relation === 'satisfies' && edge.to === requirementId && nodes.get(edge.from)?.kind === 'design')
        .map((edge) => edge.from);
      const hasAdr = trace.edges.some((edge) =>
        edge.relation === 'decides' && designs.includes(edge.to) && nodes.get(edge.from)?.kind === 'adr');
      const hasCode = trace.edges.some((edge) =>
        edge.relation === 'implements'
        && (edge.to === requirementId || designs.includes(edge.to))
        && nodes.get(edge.from)?.kind === 'code');
      const hasTest = trace.edges.some((edge) =>
        edge.relation === 'verifies' && edge.to === requirementId && nodes.get(edge.from)?.kind === 'test');
      const designConcrete = designs.some((id) => {
        const component = designsById.get(id);
        return component
          && component.requirements.includes(requirementId)
          && [component.responsibility, component.interfaces, component.constraints]
            .every((value) => value.trim().length >= 8 && !/^(TODO|TBD|N\/A|none|未定)$/i.test(value.trim()));
      });
      let authoritativeTest = false;
      for (const node of trace.nodes.filter((candidate) => candidate.kind === 'test')) {
        if (!trace.edges.some((edge) => edge.from === node.id && edge.to === requirementId && edge.relation === 'verifies')) continue;
        const source = await readText(root, node.path);
        if (new RegExp(`@id\\s+${node.id}\\b`).test(source)
          && new RegExp(`@verifies[^\\r\\n]*\\b${requirementId}\\b`).test(source)) {
          authoritativeTest = true;
          break;
        }
      }
      const measurableAcceptance = hasMeasurableAcceptance(requirement?.acceptance ?? '');
      const resolution = tdd
        ? selectCurrentTddCycle(change, requirementId, tdd)
        : { selected: null };
      const hasTdd = resolution.selected !== null;
      const checks = [
        [!!requirementNode && !!requirement && !!type, 'CHANGE_COMPLETENESS_REQUIREMENT', 'requirement'],
        [measurableAcceptance, 'CHANGE_COMPLETENESS_ACCEPTANCE', 'nonempty measurable Acceptance criteria'],
        [designs.length > 0 && designConcrete, 'CHANGE_COMPLETENESS_DESIGN', 'concrete design responsibilities, interfaces, and constraints'],
        [hasAdr, 'CHANGE_COMPLETENESS_ADR', 'ADR'],
        [hasCode, 'CHANGE_COMPLETENESS_CODE', 'implementation'],
        [hasTest && authoritativeTest, 'CHANGE_COMPLETENESS_TEST', 'authoritative annotated test declaration'],
        [!requirement?.performance || (performance.valid && performance.validRequirements.includes(requirementId)), 'CHANGE_COMPLETENESS_PERFORMANCE', 'provenance-bound deterministic operation-budget evidence'],
      ] as const;
      let tddSatisfied = hasTdd;
      if (!hasTdd) {
        const diagnostic = waivedDiagnostic(waiverContext, 'CHANGE_COMPLETENESS_TDD',
          `${change.changeId}:${requirementId} lacks bounded Red-Green TDD evidence.`, change.changeId, requirementId, undefined);
        diagnostics.push(diagnostic);
        if (diagnostic.severity === 'warning') tddSatisfied = true;
      }
      for (const [present, code, artifact] of checks) {
        if (!present) diagnostics.push(error(code, `${change.changeId}:${requirementId} lacks ${artifact} evidence.`));
      }
      if (tddSatisfied && checks.every(([present]) => present)) completeRequirements++;
    }
    changes.push({
      changeId: change.changeId,
      functionalRequirements,
      nonFunctionalRequirements,
      requirements: change.requirementIds.length,
      completeRequirements,
      valid: completeRequirements === change.requirementIds.length
        && !diagnostics.slice(diagnosticStart).some((d) => d.severity === 'error'),
    });
  }
  return { present: true, valid: !diagnostics.some((d) => d.severity === 'error'), changes, diagnostics };
}
