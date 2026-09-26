import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { error, type Diagnostic } from '../../domain/src/index.js';
import { loadConfig, commandCwd } from './config.js';
import { digest, evidenceInputs, exists, files, isSource, readText, safePath, snapshot, within, writeJson } from './files.js';
import { runProcess, type Runner } from './process.js';
import { buildTrace, type TraceNode } from './trace.js';
import { adapterInvocation, clearAdapterOutput, mergeAdapterArgs, normalizeAdapterReport, readAdapterOutput } from './adapters.js';
import {
  appendEvidenceOrder,
  evidenceOrderRecord,
  inspectEvidenceOrder,
  loadEvidenceOrder,
  type validateEvidenceOrderLog,
} from './order.js';
import { requireApproval, resolveRequirementDomain, validateApprovalStage } from './approval.js';
import { activeChangeContext, resolveChangeContext, type ActiveChangeContext } from './change-generation.js';
import {
  classifyParallelTddEvidence,
  supersededParallelTddCycles,
} from './parallel-tdd-evidence.js';
import { appendJournalRecord, loadJournalRecords, type JournalRecord } from './journal.js';
import { canonicalBytes, sha256 } from './canonical.js';
import { parseMusubixTestReport, type MusubixTestReport } from './test-report.js';
import { indexGraph, prepareGraphAdjacency } from './graph.js';
import {
  activeChangeGeneration,
  batchForRecording,
  batchKey,
  generationOrderPhase,
  loadChangeEvidence,
  nextBatchScopeId,
  type ChangeEvidence,
  type ChangeFingerprints,
  type ChangePhaseEvidence,
} from './change-evidence.js';
import {
  candidateEvidenceBinding,
  validateCandidateBinding,
  type CandidateEvidenceContext,
  type IntegrationEvidenceContext,
} from './approval.js';
import type {
  TddChainPhase,
  TddChainRecord,
  TddCycle,
  TddEvidence,
  TddMigrationEvidence,
  TddPhase,
  TddPhaseEvidence,
  TddRepairAbandonmentRecord,
  TddRepairFailureCause,
  TddRepairJournalPayload,
  TddRepairRecord,
  TddRepairRequest,
  TddVoidEvidence,
} from './tdd-types.js';
export { parseMusubixTestReport, type MusubixTestReport } from './test-report.js';
export type {
  TddChainPhase,
  TddChainRecord,
  TddCycle,
  TddEvidence,
  TddMigrationEvidence,
  TddPhase,
  TddPhaseEvidence,
  TddRepairAbandonmentRecord,
  TddRepairFailureCause,
  TddRepairJournalPayload,
  TddRepairRecord,
  TddRepairRequest,
  TddVoidEvidence,
} from './tdd-types.js';

export interface WorkspaceChangePhaseDependencies {
  verifyRepository(controlRoot: string, sourceRoot: string): Promise<void>;
  loadChangeEvidence(root: string): Promise<ChangeEvidence | null>;
  currentFingerprints(
    controlRoot: string,
    sourceRoot: string,
    changeId: string,
    requirementIds: string[],
  ): Promise<ChangeFingerprints>;
  appendEvidenceOrder(
    root: string,
    input: { kind: 'change'; entityId: string; phase: string },
  ): Promise<{ sequence: number }>;
  writeJson(root: string, path: string, value: unknown): Promise<void>;
}

async function fingerprintPaths(root: string, paths: string[]): Promise<string> {
  return digest(JSON.stringify(await snapshot(root, [...new Set(paths)].sort())));
}

async function verifyWorkspaceRepository(controlRoot: string, sourceRoot: string): Promise<void> {
  const commonDirectory = async (root: string): Promise<string> => {
    const result = await runProcess(
      'git',
      ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: root, timeoutMs: 30_000 },
    );
    if (result.status !== 'completed' || result.exitCode !== 0) {
      throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: unable to resolve Git common directory.');
    }
    return resolve(result.stdout.trim());
  };
  if (await commonDirectory(controlRoot) !== await commonDirectory(sourceRoot)) {
    throw new Error('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH: source and control roots belong to different repositories.');
  }
}

/** @id CODE-M5-WORKSPACE-CHANGE-FINGERPRINTS-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
 * @design DES-M5-MULTI-CHANGE-005
 */
export async function workspaceChangeFingerprints(
  controlRoot: string,
  sourceRoot: string,
  changeId: string,
  requirementIds: string[],
): Promise<ChangeFingerprints> {
  const paths = await files(sourceRoot);
  const trace = await buildTrace(sourceRoot, false);
  const codePaths = trace.nodes.filter((node) => node.kind === 'code').map((node) => node.path);
  const testPaths = new Set(trace.nodes.filter((node) => node.kind === 'test').map((node) => node.path));
  const { graph } = await indexGraph(sourceRoot, { persist: false, refresh: false });
  const adjacency = prepareGraphAdjacency(graph);
  const nodes = new Map(trace.nodes.map((node) => [node.id, node]));
  const requirementImplementations: NonNullable<ChangeFingerprints['requirementImplementations']> = {};
  for (const requirementId of requirementIds) {
    const designs = trace.edges
      .filter((edge) => edge.relation === 'satisfies'
        && edge.to === requirementId
        && nodes.get(edge.from)?.kind === 'design')
      .map((edge) => edge.from);
    const relevant = new Set(trace.edges
      .filter((edge) => edge.relation === 'implements'
        && (edge.to === requirementId || designs.includes(edge.to))
        && nodes.get(edge.from)?.kind === 'code')
      .map((edge) => nodes.get(edge.from)!.path)
      .filter((path) => graph.files.includes(path) && !testPaths.has(path)));
    const queue = [...relevant];
    for (let index = 0; index < queue.length; index += 1) {
      for (const dependency of adjacency.forward.get(queue[index]!) ?? []) {
        if (testPaths.has(dependency) || relevant.has(dependency)) continue;
        relevant.add(dependency);
        queue.push(dependency);
      }
    }
    const implementationPaths = [...relevant].sort();
    requirementImplementations[requirementId] = {
      paths: implementationPaths,
      fingerprints: await snapshot(sourceRoot, implementationPaths),
    };
  }
  const tddPath = '.musubix/evidence/tdd.json';
  return {
    impact: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      path === `.musubix/changes/${changeId}.md`)),
    requirements: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      /^\.musubix\/features\/[^/]+\/requirements\.md$/.test(path))),
    design: await fingerprintPaths(sourceRoot, paths.filter((path) =>
      /^\.musubix\/features\/[^/]+\/design\.md$/.test(path)
      || /^\.musubix\/decisions\/ADR-\d+\.md$/.test(path))),
    implementation: await fingerprintPaths(sourceRoot, codePaths),
    tests: await fingerprintPaths(sourceRoot, [...testPaths]),
    tdd: await fingerprintPaths(controlRoot, await exists(within(controlRoot, tddPath)) ? [tddPath] : []),
    requirementImplementations,
  };
}

const workspaceChangePhaseDefaults: WorkspaceChangePhaseDependencies = {
  verifyRepository: verifyWorkspaceRepository,
  loadChangeEvidence,
  currentFingerprints: workspaceChangeFingerprints,
  appendEvidenceOrder,
  writeJson,
};

/** @id CODE-M5-WORKSPACE-CHANGE-CHECKPOINT-001
 * @implements REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
 * @design DES-M5-MULTI-CHANGE-005
 */
export async function recordChangePhaseFromWorkspace(
  controlRoot: string,
  sourceRoot: string,
  changeId: string,
  phase: 'red' | 'implementation' | 'green',
  requirementIds: string[],
  dependencies: WorkspaceChangePhaseDependencies = workspaceChangePhaseDefaults,
): Promise<ChangeEvidence> {
  if (!/^CHANGE-\d+$/.test(changeId)
    || !requirementIds.length
    || requirementIds.some((requirementId) => !/^REQ-[A-Z0-9][A-Z0-9-]*$/.test(requirementId))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: a valid non-empty requirement batch is required.');
  }
  const control = resolve(controlRoot);
  const source = resolve(sourceRoot);
  await dependencies.verifyRepository(control, source);
  const evidence = await dependencies.loadChangeEvidence(control);
  const change = evidence?.changes.find((entry) => entry.changeId === changeId);
  const generation = change ? activeChangeGeneration(change) : null;
  if (!evidence || !change || generation === null) {
    throw new Error('CHANGE_GENERATION_PHASE: workspace checkpoint requires an active CHANGE generation.');
  }
  const normalizedRequirementIds = [...new Set(requirementIds)].sort();
  if (!normalizedRequirementIds.every((requirementId) =>
    change.requirementIds.includes(requirementId))) {
    throw new Error('CHANGE_GENERATION_REQUIREMENTS: phase requirement IDs must belong to the CHANGE.');
  }
  const fullSet = normalizedRequirementIds.length === change.requirementIds.length
    && normalizedRequirementIds.every((requirementId) => change.requirementIds.includes(requirementId));
  change.tddBatches ??= [];
  let batch = fullSet
    ? undefined
    : batchForRecording(change.tddBatches, normalizedRequirementIds, phase);
  if (!fullSet && phase === 'red') {
    if (batch?.red) {
      throw new Error(`${changeId}:red is already recorded for the pending requirement batch ${normalizedRequirementIds.join(', ')}.`);
    }
    batch = {
      scopeId: nextBatchScopeId(change.tddBatches, normalizedRequirementIds),
      requirementIds: normalizedRequirementIds,
    };
    change.tddBatches.push(batch);
  }
  const precedingPhase = phase === 'red'
    ? 'design'
    : phase === 'implementation'
      ? 'red'
      : 'implementation';
  const previous = phase === 'red'
    ? change.phases.design
    : phase === 'implementation'
      ? fullSet ? change.phases.red : batch?.red
      : fullSet ? change.phases.implementation : batch?.implementation;
  if (!previous) {
    throw new Error(`${phase} requires the preceding ${precedingPhase} phase for requirement batch ${normalizedRequirementIds.join(', ')}.`);
  }
  if (fullSet ? change.phases[phase] !== undefined : batch?.[phase] !== undefined) {
    throw new Error(`${changeId}:${phase} is already recorded for requirement batch ${normalizedRequirementIds.join(', ')}.`);
  }
  const fingerprints = await dependencies.currentFingerprints(
    control,
    source,
    changeId,
    normalizedRequirementIds,
  );
  if (phase === 'red' && fingerprints.tests === previous.fingerprints.tests) {
    throw new Error(`CHANGE_TESTS_UNCHANGED_AT_RECORD: ${changeId} did not add or change tests since design.`);
  }
  if (phase === 'implementation') {
    if (fingerprints.implementation === previous.fingerprints.implementation) {
      throw new Error(`CHANGE_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation since red.`);
    }
    const unchanged = normalizedRequirementIds.filter((requirementId) => {
      const before = previous.fingerprints.requirementImplementations?.[requirementId];
      const after = fingerprints.requirementImplementations?.[requirementId];
      return before && after
        && JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints);
    });
    if (unchanged.length) {
      throw new Error(`CHANGE_RELEVANT_IMPLEMENTATION_UNCHANGED_AT_RECORD: ${changeId} did not change implementation related to ${unchanged.join(', ')} since red.`);
    }
  }
  const checkpoint: ChangePhaseEvidence = {
    phase,
    recordedAt: new Date().toISOString(),
    fingerprints,
  };
  const scopeId = fullSet ? undefined : batch?.scopeId ?? batchKey(normalizedRequirementIds);
  checkpoint.order = (await dependencies.appendEvidenceOrder(control, {
    kind: 'change',
    entityId: changeId,
    phase: generationOrderPhase(generation, phase, scopeId),
  })).sequence;
  if (fullSet) change.phases[phase] = checkpoint;
  else batch![phase] = checkpoint;
  await dependencies.writeJson(control, '.musubix/evidence/changes.json', evidence);
  return evidence;
}

function render(value: string, testId: string, testPath: string, reportPath: string): string {
  return value.replaceAll('{testId}', testId).replaceAll('{testPath}', testPath).replaceAll('{reportPath}', reportPath);
}

function chainRecordSha256(record: Omit<TddChainRecord, 'recordSha256'>): string {
  return digest(JSON.stringify(record));
}

function appendChainRecord(evidence: TddEvidence, cycle: TddCycle, phase: TddChainPhase, phaseEvidence: unknown): void {
  if (!cycle.cycleId) throw new Error('TDD cycle ID is required for append-only evidence.');
  if (!evidence.chain) {
    if (evidence.cycles.some((entry) => entry !== cycle)) {
      throw new Error('Existing TDD evidence lacks an append-only hash chain; regenerate it before recording new phases.');
    }
    evidence.chain = [];
  }
  const previous = evidence.chain.at(-1);
  const payload: Omit<TddChainRecord, 'recordSha256'> = {
    sequence: evidence.chain.length + 1,
    cycleId: cycle.cycleId,
    ...(cycle.changeId ? { changeId: cycle.changeId, generation: cycle.generation } : {}),
    ...(cycle.binding ? { binding: cycle.binding } : {}),
    requirementId: cycle.requirementId,
    testId: cycle.testId,
    testPath: cycle.testPath,
    commandName: cycle.commandName,
    ...(cycle.parallel ? { parallel: cycle.parallel } : {}),
    phase,
    phaseEvidenceSha256: digest(JSON.stringify(phaseEvidence)),
    previousSha256: previous?.recordSha256 ?? null,
  };
  evidence.chain.push({ ...payload, recordSha256: chainRecordSha256(payload) });
}

async function sourceFingerprint(root: string, testPath: string, excludedPaths: string[] = []): Promise<string> {
  const excluded = new Set(excludedPaths);
  const paths = (await evidenceInputs(root)).filter((path) =>
    path !== testPath && !excluded.has(path));
  return digest(JSON.stringify(await snapshot(root, paths)));
}

// Collect every statement in the file, at any nesting depth (not just the
// top level), in source order. A test's leading `@id TEST-*` comment is only
// ever attached as leading trivia of its own statement (e.g. the `it(...)`
// expression statement), so scanning the full tree — rather than only
// `source.statements` — finds that statement even when it is nested inside a
// shared `describe(...)` block, without ever matching a sibling test's
// statement (each sibling's own leading comment differs).
function collectStatements(node: ts.Node, out: ts.Statement[]): void {
  if (ts.isStatement(node)) out.push(node);
  ts.forEachChild(node, (child) => collectStatements(child, out));
}

export function sourceLineStartOffset(text: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const newline = text.indexOf('\n', offset);
    if (newline < 0) return text.length;
    offset = newline + 1;
  }
  return offset;
}

/** @id CODE-M5-TDD-EOL-FINGERPRINT-001
 * @implements REQ-M5-TDD-003 REQ-M5-PARALLEL-010
 * @design DES-M5-PARALLEL-006
 */
export function canonicalTestFingerprintText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function testFingerprintFromText(test: TraceNode, text: string): string {
  const start = sourceLineStartOffset(text, test.line);
  if (isSource(test.path)) {
    const source = ts.createSourceFile(test.path, text, ts.ScriptTarget.Latest, true);
    const statements: ts.Statement[] = [];
    collectStatements(source, statements);
    const declaration = statements.find((statement) => statement.getStart(source) >= start);
    if (declaration) {
      return digest(canonicalTestFingerprintText(text.slice(start, declaration.end)).trim());
    }
  }
  const lineEnd = text.indexOf('\n', start);
  const searchFrom = lineEnd < 0 ? text.length : lineEnd + 1;
  const next = text.slice(searchFrom).search(/^[ \t]*(?:\/\*+|\/\/|#).*?@id\s+TEST-/m);
  return digest(canonicalTestFingerprintText(
    text.slice(start, next < 0 ? text.length : searchFrom + next),
  ).trim());
}

async function testFingerprint(root: string, test: TraceNode): Promise<string> {
  return testFingerprintFromText(test, await readText(root, test.path));
}

// The pre-REQ-TDD-FINGERPRINT-SCOPING-001 algorithm (top-level statements
// only). Retained solely so `migrateTddFingerprint` can prove a stored
// fingerprint still matches what this superseded algorithm computes from
// current source text, before moving a cycle onto the corrected algorithm
// above. Must never be used for any other (live) fingerprint computation.
export async function legacyTestFingerprint(root: string, test: TraceNode): Promise<string> {
  const text = await readText(root, test.path);
  const lines = text.split(/\r?\n/);
  const start = lines.slice(0, Math.max(0, test.line - 1)).join('\n').length + (test.line > 1 ? 1 : 0);
  if (isSource(test.path)) {
    const source = ts.createSourceFile(test.path, text, ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find((statement) => statement.getStart(source) >= start);
    if (declaration) return digest(text.slice(start, declaration.end).trim());
  }
  const lineEnd = text.indexOf('\n', start);
  const searchFrom = lineEnd < 0 ? text.length : lineEnd + 1;
  const next = text.slice(searchFrom).search(/^[ \t]*(?:\/\*+|\/\/|#).*?@id\s+TEST-/m);
  return digest(text.slice(start, next < 0 ? text.length : searchFrom + next).trim());
}

export interface TddMigrationResult {
  migrated: boolean;
  testId: string;
  fromFingerprint?: string;
  toFingerprint?: string;
  reason?: string;
}

/** @id CODE-M5-TDD-EFFECTIVE-LATEST-001
 * @implements REQ-M5-TDD-003
 * @design DES-M5-TDD-005
 */
type TddCycleScopePredicate = (cycle: TddCycle) => boolean;

interface EffectiveTddCurrencySelection {
  readonly cycle: TddCycle;
  readonly order: number;
  readonly fingerprint: string;
}

interface TddEventScope {
  terminalScope?: TddCycleScopePredicate;
  voidScope?: TddCycleScopePredicate;
  workScope?: TddCycleScopePredicate;
}

interface TddVerifiedEvent {
  cycle: TddCycle;
  order: number;
  kind: 'terminal' | 'void' | 'work';
}

interface TddCurrencyIndex {
  evidence: TddEvidence;
  order: ReturnType<typeof validateEvidenceOrderLog>;
  validlyVoidedCycles: Set<TddCycle>;
  cyclesByTest: Map<string, TddCycle[]>;
  chainIndex: TddChainIndex;
}

interface TddChainIndexEntry {
  record: TddChainRecord;
  position: number;
}

type TddChainIndex = Map<string, TddChainIndexEntry[]>;

const allCycles: TddCycleScopePredicate = () => true;

function tddChainKey(cycleId: string, testId: string, phase: TddChainPhase): string {
  return JSON.stringify([cycleId, testId, phase]);
}

function buildTddChainIndex(chain: TddChainRecord[] | undefined): TddChainIndex {
  const index: TddChainIndex = new Map();
  for (const [position, record] of (chain ?? []).entries()) {
    const key = tddChainKey(record.cycleId, record.testId, record.phase);
    const entries = index.get(key);
    const entry = { record, position };
    if (entries) entries.push(entry);
    else index.set(key, [entry]);
  }
  return index;
}

async function maintenanceChangeContext(root: string): Promise<ActiveChangeContext | null> {
  const selected = await resolveChangeContext(root, { maintenance: true });
  if (!selected || selected.generation === null) return null;
  return {
    changeId: selected.changeId,
    generation: selected.generation,
    requirementIds: selected.requirementIds,
  };
}

function activeScope(activeChange: ActiveChangeContext | null): TddCycleScopePredicate {
  if (!activeChange) return allCycles;
  return (cycle) => (cycle.generation ?? 1) === activeChange.generation
    && (cycle.changeId === undefined || cycle.changeId === activeChange.changeId);
}

function buildTddCurrencyIndex(
  evidence: TddEvidence,
  order: ReturnType<typeof validateEvidenceOrderLog>,
  validlyVoidedCycles: Set<TddCycle>,
  chainIndex: TddChainIndex = buildTddChainIndex(evidence.chain),
): TddCurrencyIndex {
  const cyclesByTest = new Map<string, TddCycle[]>();
  for (const cycle of evidence.cycles) {
    const cycles = cyclesByTest.get(cycle.testId);
    if (cycles) cycles.push(cycle);
    else cyclesByTest.set(cycle.testId, [cycle]);
  }
  return {
    evidence,
    order,
    validlyVoidedCycles,
    cyclesByTest,
    chainIndex,
  };
}

function terminalFingerprintEvidence(
  index: TddCurrencyIndex,
  cycle: TddCycle,
): Readonly<EffectiveTddCurrencySelection> | undefined {
  if (!cycle.red?.valid || !cycle.green?.valid || index.validlyVoidedCycles.has(cycle)) return undefined;
  if (!phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'red', cycle.red)
    || !phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'green', cycle.green)) return undefined;
  if (cycle.red.order! >= cycle.green.order!) return undefined;
  const candidates: Array<{ order: number; fingerprint: string }> = [{
    order: cycle.green.order!,
    fingerprint: cycle.green.testFingerprint,
  }];
  if (cycle.refactor?.valid
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'refactor', cycle.refactor)) {
    candidates.push({ order: cycle.refactor.order!, fingerprint: cycle.refactor.testFingerprint });
  }
  if (cycle.migrate?.approver?.trim()
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'migrate', cycle.migrate)) {
    candidates.push({ order: cycle.migrate.order!, fingerprint: cycle.migrate.toFingerprint });
  }
  const latest = candidates.sort((left, right) => right.order - left.order)[0]!;
  return { cycle, order: latest.order, fingerprint: latest.fingerprint };
}

/** @id CODE-M5-TDD-CURRENCY-REPAIR-001
 * @implements REQ-M5-TDD-CURRENCY-001
 * @design DES-M5-TDD-CURRENCY-001
 */
function effectiveLatestCycle(
  index: TddCurrencyIndex,
  testId: string,
  upperBoundExclusive?: number,
  scopePredicate: TddCycleScopePredicate = allCycles,
): Readonly<EffectiveTddCurrencySelection> | undefined {
  let best: Readonly<EffectiveTddCurrencySelection> | undefined;
  for (const cycle of index.cyclesByTest.get(testId) ?? []) {
    if (!scopePredicate(cycle)) continue;
    const selection = terminalFingerprintEvidence(index, cycle);
    if (!selection || (upperBoundExclusive !== undefined && selection.order >= upperBoundExclusive)) continue;
    if (!best || selection.order > best.order) best = selection;
  }
  return best;
}

function workEventOrder(index: TddCurrencyIndex, cycle: TddCycle): number | undefined {
  if (cycle.green?.valid) return undefined;
  if (cycle.green
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'green', cycle.green)) {
    return cycle.green.order;
  }
  if (cycle.red?.valid
    && phaseLinkageValid(index.order, index.evidence.chain, index.chainIndex, cycle, 'red', cycle.red)) {
    return cycle.red.order;
  }
  return undefined;
}

function greatestVerifiedEvent(
  index: TddCurrencyIndex,
  testId: string,
  eventScope: TddEventScope,
): TddVerifiedEvent | undefined {
  const terminalScope = eventScope.terminalScope ?? allCycles;
  const voidScope = eventScope.voidScope ?? allCycles;
  const workScope = eventScope.workScope ?? allCycles;
  let greatest: TddVerifiedEvent | undefined;
  const consider = (event: TddVerifiedEvent): void => {
    if (!greatest || event.order > greatest.order) greatest = event;
  };
  for (const cycle of index.cyclesByTest.get(testId) ?? []) {
    if (terminalScope(cycle)) {
      const terminal = terminalFingerprintEvidence(index, cycle);
      if (terminal) consider({ cycle, order: terminal.order, kind: 'terminal' });
    }
    if (voidScope(cycle) && index.validlyVoidedCycles.has(cycle) && cycle.void?.order !== undefined) {
      consider({ cycle, order: cycle.void.order, kind: 'void' });
    }
    if (workScope(cycle)) {
      const order = workEventOrder(index, cycle);
      if (order !== undefined) consider({ cycle, order, kind: 'work' });
    }
  }
  return greatest;
}

function noActiveWorkScope(
  unbounded: EffectiveTddCurrencySelection,
): TddCycleScopePredicate {
  return (cycle) => cycle.changeId === undefined
    || (cycle.changeId === unbounded.cycle.changeId
      && (cycle.generation ?? 1) === (unbounded.cycle.generation ?? 1));
}

function eventScopeForSelection(
  activeChange: ActiveChangeContext | null,
  operationScope: TddCycleScopePredicate,
  unbounded: EffectiveTddCurrencySelection | undefined,
): TddEventScope | undefined {
  if (activeChange) {
    return {
      terminalScope: operationScope,
      voidScope: operationScope,
      workScope: operationScope,
    };
  }
  if (!unbounded) return undefined;
  return {
    terminalScope: allCycles,
    voidScope: allCycles,
    workScope: noActiveWorkScope(unbounded),
  };
}

export async function migrateTddFingerprint(root: string, testId: string, approver: string): Promise<TddMigrationResult> {
  if (!approver.trim()) throw new Error('An approver is required to migrate TDD fingerprint evidence.');
  const evidence = await loadTddEvidence(root);
  if (!evidence) throw new Error('No TDD evidence found.');
  await requireNoPendingTddRepair(root, evidence);
  if (!evidence.cycles.some((entry) => entry.testId === testId)) {
    throw new Error(`No TDD cycle found for ${testId}.`);
  }
  const order = await inspectEvidenceOrder(root);
  const chainIndex = buildTddChainIndex(evidence.chain);
  const validlyVoided = new Set(evidence.cycles.filter((entry) =>
    voidLinkage(evidence, order, entry, chainIndex).valid));
  const index = buildTddCurrencyIndex(evidence, order, validlyVoided, chainIndex);
  const activeChange = await maintenanceChangeContext(root);
  const operationScope = activeScope(activeChange);
  const unbounded = effectiveLatestCycle(index, testId, undefined, operationScope);
  const eventScope = eventScopeForSelection(activeChange, operationScope, unbounded);
  if (!unbounded || !eventScope) throw new Error(`${testId} has no valid Green phase to migrate.`);
  const event = greatestVerifiedEvent(index, testId, eventScope);
  if (event?.kind === 'work') throw new Error(`${testId} has no valid Green phase to migrate.`);
  const selection = effectiveLatestCycle(
    index,
    testId,
    event?.kind === 'void' ? event.order : undefined,
    operationScope,
  );
  if (!selection) throw new Error(`${testId} has no valid Green phase to migrate.`);
  const cycle = selection.cycle;
  if (cycle.migrate) throw new Error(`${testId} has already been migrated.`);
  const trace = await buildTrace(root);
  const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
  if (!test) throw new Error(`Annotated test ID not found: ${testId}`);
  const storedFingerprint = selection.fingerprint;
  const legacyCurrent = await legacyTestFingerprint(root, test);
  if (legacyCurrent !== storedFingerprint) {
    return {
      migrated: false,
      testId,
      reason: `${testId}'s recorded fingerprint does not match its current source under the superseded algorithm; this is real drift, not an algorithm-only change. Run a genuine Red/Green cycle instead.`,
    };
  }
  const toFingerprint = await testFingerprint(root, test);
  const record: TddMigrationEvidence = {
    phase: 'migrate',
    fromFingerprint: storedFingerprint,
    toFingerprint,
    approver: approver.trim(),
    recordedAt: new Date().toISOString(),
  };
  record.order = (await appendEvidenceOrder(root, {
    kind: 'tdd',
    entityId: cycle.cycleId!,
    phase: 'migrate',
  })).sequence;
  cycle.migrate = record;
  appendChainRecord(evidence, cycle, 'migrate', record);
  await writeJson(root, '.musubix/evidence/tdd.json', evidence);
  return { migrated: true, testId, fromFingerprint: storedFingerprint, toFingerprint };
}

export async function loadTddEvidence(root: string): Promise<TddEvidence | null> {
  const path = '.musubix/evidence/tdd.json';
  if (!await exists(within(root, path))) return null;
  const value = JSON.parse(await readText(root, path)) as TddEvidence;
  if (value.schemaVersion !== 1 || !Array.isArray(value.cycles)) throw new Error('Invalid TDD evidence.');
  return value;
}

export interface TddRepairIdentity {
  operationId: string;
  requestSha256: string;
  request: TddRepairRequest;
}

export interface TddRepairResult {
  repaired: true;
  replayed: boolean;
  resumed: boolean;
  operationId: string;
  testId: string;
  targetCycleId: string;
  disposition: 'replacement' | 'retirement';
  replacementCycleId?: string;
  fallbackCycleId?: string;
  approver: string;
  reason: string;
  order: number;
}

export interface TddRepairAbandonmentResult {
  abandoned: true;
  replayed: boolean;
  operationId: string;
  testId: string;
  targetCycleId: string;
  failureCause: TddRepairFailureCause;
  approver: string;
  reason: string;
  order: number;
}

function repairError(code: string, message: string, details?: object): never {
  throw new Error(`${code}: ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

export function tddRepairOperationIdentity(input: {
  testId: string;
  targetCycleId: string;
  disposition: 'replacement' | 'retirement';
  replacementCycleId?: string;
  approver: string;
  reason: string;
}): TddRepairIdentity {
  const request: TddRepairRequest = {
    schemaVersion: 1,
    testId: input.testId,
    targetCycleId: input.targetCycleId,
    disposition: input.disposition,
    replacementCycleId: input.disposition === 'replacement' ? input.replacementCycleId ?? null : null,
    approver: input.approver.trim(),
    reason: input.reason.trim(),
  };
  const requestSha256 = sha256(canonicalBytes(request));
  return { operationId: `tdd-repair:${requestSha256}`, requestSha256, request };
}

function repairRecordResult(
  repair: TddRepairRecord,
  replayed: boolean,
  resumed: boolean,
): TddRepairResult {
  return {
    repaired: true,
    replayed,
    resumed,
    operationId: repair.operationId,
    testId: repair.testId,
    targetCycleId: repair.targetCycleId,
    disposition: repair.retired ? 'retirement' : 'replacement',
    ...(repair.replacementCycleId ? { replacementCycleId: repair.replacementCycleId } : {}),
    ...(repair.fallbackCycleId ? { fallbackCycleId: repair.fallbackCycleId } : {}),
    approver: repair.approver,
    reason: repair.reason,
    order: repair.order,
  };
}

function repairJournalPayload(record: JournalRecord): TddRepairJournalPayload | null {
  if (record.kind !== 'tdd-repair-v1' || !record.payload || typeof record.payload !== 'object') return null;
  return record.payload as TddRepairJournalPayload;
}

export function validateTddRepairLedger(evidence: TddEvidence): {
  valid: boolean;
  repairs: TddRepairRecord[];
} {
  const repairs: TddRepairRecord[] = [];
  const operations = new Set<string>();
  const targets = new Set<string>();
  const replacements = new Set<string>();
  for (const repair of evidence.repairs ?? []) {
    const identity = tddRepairOperationIdentity({
      testId: repair.testId,
      targetCycleId: repair.targetCycleId,
      disposition: repair.retired ? 'retirement' : 'replacement',
      ...(repair.replacementCycleId ? { replacementCycleId: repair.replacementCycleId } : {}),
      approver: repair.approver,
      reason: repair.reason,
    });
    const dispositionValid = repair.retired === true
      ? !repair.replacementCycleId && typeof repair.fallbackCycleId === 'string'
      : typeof repair.replacementCycleId === 'string' && repair.retired === undefined
        && repair.fallbackCycleId === undefined;
    if (!dispositionValid
      || repair.operationId !== identity.operationId
      || repair.requestSha256 !== identity.requestSha256
      || operations.has(repair.operationId)
      || targets.has(repair.targetCycleId)
      || (repair.replacementCycleId !== undefined && replacements.has(repair.replacementCycleId))) {
      return { valid: false, repairs: [] };
    }
    operations.add(repair.operationId);
    targets.add(repair.targetCycleId);
    if (repair.replacementCycleId) replacements.add(repair.replacementCycleId);
    repairs.push(repair);
  }
  return { valid: true, repairs };
}

export function repairAwareCycles(evidence: TddEvidence): TddCycle[] {
  const ledger = validateTddRepairLedger(evidence);
  if (!ledger.valid) return evidence.cycles;
  const suppressed = new Set(ledger.repairs.map((repair) => repair.targetCycleId));
  return evidence.cycles.filter((cycle) => !cycle.cycleId || !suppressed.has(cycle.cycleId));
}

export function pendingTddRepair(
  journal: JournalRecord[],
  evidence: TddEvidence,
): { operationId: string; testId: string; targetCycleId: string } | null {
  const completed = new Set([
    ...(evidence.repairs ?? []).map((repair) => repair.operationId),
    ...(evidence.repairAbandonments ?? []).map((repair) => repair.operationId),
  ]);
  for (const record of journal) {
    const payload = repairJournalPayload(record);
    if (!payload || completed.has(record.idempotencyKey)) continue;
    const testId = payload.record?.testId ?? payload.request?.testId;
    const targetCycleId = payload.record?.targetCycleId ?? payload.request?.targetCycleId;
    if (typeof testId === 'string' && typeof targetCycleId === 'string') {
      return { operationId: record.idempotencyKey, testId, targetCycleId };
    }
  }
  return null;
}

async function requireNoPendingTddRepair(root: string, evidence?: TddEvidence): Promise<void> {
  const current = evidence ?? await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const pending = pendingTddRepair(await loadJournalRecords(root), current);
  if (pending) {
    repairError(
      'TDD_REPAIR_PENDING',
      `pending repair ${pending.operationId} for ${pending.testId}:${pending.targetCycleId} must be resumed or abandoned before TDD evidence can change.`,
      pending,
    );
  }
}

function completeRepairChainValid(evidence: TddEvidence): boolean {
  if (!evidence.chain) return evidence.cycles.length <= 1 && !(evidence.repairs?.length);
  for (const [index, record] of evidence.chain.entries()) {
    const expectedPrevious = index === 0 ? null : evidence.chain[index - 1]!.recordSha256;
    const { recordSha256, ...payload } = record;
    if (record.sequence !== index + 1
      || record.previousSha256 !== expectedPrevious
      || recordSha256 !== chainRecordSha256(payload)) return false;
  }
  return validateTddRepairLedger(evidence).valid;
}

function appendRepairChainRecord(evidence: TddEvidence, target: TddCycle, repair: TddRepairRecord): void {
  if (!target.cycleId) repairError('TDD_REPAIR_BINDING_MISMATCH', 'Target cycle lacks a stable identity.');
  evidence.chain ??= [];
  const previous = evidence.chain.at(-1);
  const payload: Omit<TddChainRecord, 'recordSha256'> = {
    sequence: evidence.chain.length + 1,
    cycleId: target.cycleId,
    changeId: repair.changeId,
    generation: repair.generation,
    ...(repair.binding ? { binding: repair.binding } : {}),
    requirementId: repair.requirementId,
    testId: repair.testId,
    testPath: target.testPath,
    commandName: target.commandName,
    parallel: repair.parallel,
    phase: 'repair',
    phaseEvidenceSha256: digest(JSON.stringify(repair)),
    previousSha256: previous?.recordSha256 ?? null,
  };
  evidence.chain.push({ ...payload, recordSha256: chainRecordSha256(payload) });
}

async function requireRepairAuthorization(
  root: string,
  target: TddCycle,
): Promise<void> {
  const config = await loadConfig(root);
  let domain;
  try {
    domain = await resolveRequirementDomain(root, config.approval, target.requirementId);
  } catch {
    repairError(
      'TDD_REPAIR_AUTHORIZATION_INVALID',
      `Design approval is not authorized for ${target.requirementId}.`,
      { requirementId: target.requirementId, domain: null, status: 'domain-mismatch' },
    );
  }
  const validation = await validateApprovalStage(root, 'design', config.approval, domain);
  if (validation.status !== 'approved') {
    repairError(
      'TDD_REPAIR_AUTHORIZATION_INVALID',
      `Design approval is ${validation.status} for ${target.requirementId}.`,
      {
        requirementId: target.requirementId,
        domain: domain?.name ?? null,
        status: validation.status === 'missing' ? 'missing' : 'stale',
      },
    );
  }
}

function targetInvalid(
  cause: 'cycle-not-found' | 'cycle-id-ambiguous' | 'foreign-operation-scope'
    | 'target-not-parallel-bound' | 'target-parallel-binding-not-stale'
    | 'retirement-fallback-missing' | 'retirement-fallback-ambiguous',
  testId: string,
  targetCycleId: string,
): never {
  repairError(
    'TDD_REPAIR_TARGET_INVALID',
    `${testId}:${targetCycleId} is not an eligible TDD repair target (${cause}).`,
    { cause, testId, targetCycleId },
  );
}

function resolveRepairCycle(evidence: TddEvidence, cycleId: string, testId: string): TddCycle {
  const matches = evidence.cycles.filter((cycle) => cycle.cycleId === cycleId);
  if (matches.length === 0) targetInvalid('cycle-not-found', testId, cycleId);
  if (matches.length > 1) targetInvalid('cycle-id-ambiguous', testId, cycleId);
  const target = matches[0]!;
  if (target.testId !== testId) {
    repairError('TDD_REPAIR_BINDING_MISMATCH', `${testId}:${cycleId} does not match the recorded test binding.`);
  }
  return target;
}

function authoritativeRepairCycle(cycle: TddCycle): boolean {
  return cycle.red.valid === true
    && cycle.green?.valid === true
    && cycle.red.testStatus === 'failed'
    && cycle.green.testStatus === 'passed'
    && Number.isInteger(cycle.red.order)
    && Number.isInteger(cycle.green.order)
    && cycle.red.order! < cycle.green.order!
    && cycle.red.commandSha256 === cycle.green.commandSha256;
}

async function repairCycleSourceCurrent(root: string, cycle: TddCycle): Promise<boolean> {
  const trace = await buildTrace(root, false);
  const test = trace.nodes.find((node) =>
    node.kind === 'test' && node.id === cycle.testId && node.path === cycle.testPath);
  if (!test) return false;
  const fingerprint = await testFingerprint(root, test);
  return cycle.red.testFingerprint === fingerprint
    && cycle.green?.testFingerprint === fingerprint;
}

async function persistRepairProjection(
  root: string,
  payload: TddRepairJournalPayload,
  evidence: TddEvidence,
  resumed: boolean,
): Promise<TddRepairResult> {
  const repair = payload.record;
  const existing = (evidence.repairs ?? []).find((entry) => entry.operationId === repair.operationId);
  if (existing) return repairRecordResult(existing, !resumed, resumed);
  const order = await inspectEvidenceOrder(root);
  if (!order.valid) repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  const orderEntry = evidenceOrderRecord(order.records, 'tdd', repair.targetCycleId, `repair:${repair.operationId}`);
  if (orderEntry && orderEntry.sequence !== repair.order) {
    repairError('TDD_REPAIR_RESUME_INVALID', `${repair.operationId} cannot be resumed.`, {
      operationId: repair.operationId,
      cause: 'partial-projection-mismatch',
    });
  }
  if (!orderEntry) {
    const appended = await appendEvidenceOrder(root, {
      kind: 'tdd',
      entityId: repair.targetCycleId,
      phase: `repair:${repair.operationId}`,
      testId: repair.testId,
    });
    if (appended.sequence !== repair.order) {
      repairError('TDD_REPAIR_RESUME_INVALID', `${repair.operationId} cannot be resumed.`, {
        operationId: repair.operationId,
        cause: 'partial-projection-mismatch',
      });
    }
  }
  const target = resolveRepairCycle(evidence, repair.targetCycleId, repair.testId);
  evidence.repairs ??= [];
  evidence.repairs.push(repair);
  appendRepairChainRecord(evidence, target, repair);
  await writeJson(root, '.musubix/evidence/tdd.json', evidence);
  return repairRecordResult(repair, false, resumed);
}

/** @id CODE-M5-WAVE1-TDD-REPAIR-001
 * @implements REQ-M5-COMPAT-013 REQ-M5-WAVE1-TDD-001 REQ-M5-WAVE1-TDD-002
 * @design DES-M5-TDD-REPAIR-001 DES-M5-TDD-REPAIR-002 DES-M5-TDD-REPAIR-004
 */
export async function appendTddRepair(root: string, input: {
  testId: string;
  targetCycleId: string;
  replacementCycleId?: string;
  retire?: boolean;
  approver: string;
  reason: string;
}): Promise<TddRepairResult> {
  const evidence = await loadTddEvidence(root);
  if (!evidence) repairError('TDD_REPAIR_TARGET_INVALID', 'No TDD evidence found.', {
    cause: 'cycle-not-found',
    testId: input.testId,
    targetCycleId: input.targetCycleId,
  });
  await requireNoPendingTddRepair(root, evidence);
  if (!completeRepairChainValid(evidence)) {
    repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  }
  const operationIdentity = tddRepairOperationIdentity({
    testId: input.testId,
    targetCycleId: input.targetCycleId,
    disposition: input.retire ? 'retirement' : 'replacement',
    ...(input.replacementCycleId ? { replacementCycleId: input.replacementCycleId } : {}),
    approver: input.approver,
    reason: input.reason,
  });
  const replay = (evidence.repairs ?? []).find((repair) => repair.operationId === operationIdentity.operationId);
  if (replay) return repairRecordResult(replay, true, false);
  const target = resolveRepairCycle(evidence, input.targetCycleId, input.testId);
  if ((evidence.repairs ?? []).some((repair) => repair.targetCycleId === input.targetCycleId)) {
    repairError('TDD_REPAIR_ALREADY_RECORDED', `${input.testId}:${input.targetCycleId} already has a TDD repair.`);
  }
  await requireRepairAuthorization(root, target);
  const context = await maintenanceChangeContext(root);
  if (!context || target.changeId !== context.changeId || (target.generation ?? 1) !== context.generation) {
    targetInvalid('foreign-operation-scope', input.testId, input.targetCycleId);
  }
  if (!target.parallel) targetInvalid('target-not-parallel-bound', input.testId, input.targetCycleId);
  if (!await repairCycleSourceCurrent(root, target)) {
    repairError('TDD_REPAIR_BINDING_MISMATCH', `${input.testId}:${input.targetCycleId} does not match current authoritative test source.`);
  }
  const provenance = await classifyParallelTddEvidence(root, {
    changeId: context.changeId,
    generation: context.generation,
    requirementId: target.requirementId,
    cycleId: target.cycleId ?? null,
    purpose: 'tdd-repair',
  });
  if (provenance !== 'PARALLEL_TDD_UNCONSUMED') {
    targetInvalid('target-parallel-binding-not-stale', input.testId, input.targetCycleId);
  }
  let replacement: TddCycle | undefined;
  let fallback: TddCycle | undefined;
  if (input.retire) {
    const candidates = repairAwareCycles(evidence).filter((cycle) =>
      cycle !== target
      && cycle.testId === target.testId
      && cycle.requirementId === target.requirementId
      && authoritativeRepairCycle(cycle));
    if (candidates.length === 0) targetInvalid('retirement-fallback-missing', input.testId, input.targetCycleId);
    if (candidates.length > 1) targetInvalid('retirement-fallback-ambiguous', input.testId, input.targetCycleId);
    fallback = candidates[0]!;
  } else {
    replacement = resolveRepairCycle(evidence, input.replacementCycleId!, input.testId);
    if (replacement === target
      || replacement.requirementId !== target.requirementId
      || replacement.changeId !== target.changeId
      || replacement.generation !== target.generation
      || JSON.stringify(replacement.binding ?? null) !== JSON.stringify(target.binding ?? null)
      || !authoritativeRepairCycle(replacement)
      || !await repairCycleSourceCurrent(root, replacement)
      || (evidence.repairs ?? []).some((repair) =>
        repair.targetCycleId === replacement!.cycleId || repair.replacementCycleId === replacement!.cycleId)) {
      repairError('TDD_REPAIR_REPLACEMENT_INVALID', `${input.replacementCycleId} is not the current authoritative replacement cycle.`);
    }
    if (replacement.parallel) {
      const replacementProvenance = await classifyParallelTddEvidence(root, {
        changeId: context.changeId,
        generation: context.generation,
        requirementId: target.requirementId,
        cycleId: replacement.cycleId ?? null,
        purpose: 'tdd-repair',
      });
      if (replacementProvenance !== 'pass') {
        repairError('TDD_REPAIR_REPLACEMENT_INVALID', `${input.replacementCycleId} is not the current authoritative replacement cycle.`);
      }
    }
  }
  const order = await inspectEvidenceOrder(root);
  if (!order.valid) repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  const recordedAt = new Date().toISOString();
  const record: TddRepairRecord = {
    operationId: operationIdentity.operationId,
    requestSha256: operationIdentity.requestSha256,
    targetCycleId: target.cycleId!,
    testId: target.testId,
    requirementId: target.requirementId,
    changeId: target.changeId ?? context.changeId,
    generation: target.generation ?? context.generation,
    ...(target.binding ? { binding: target.binding } : {}),
    parallel: target.parallel,
    ...(replacement ? { replacementCycleId: replacement.cycleId! } : {
      retired: true as const,
      fallbackCycleId: fallback!.cycleId!,
    }),
    approver: operationIdentity.request.approver,
    reason: operationIdentity.request.reason,
    order: order.records.size + 1,
    recordedAt,
  };
  const payload: TddRepairJournalPayload = {
    schemaVersion: 'tdd-repair-v1',
    operationId: operationIdentity.operationId,
    requestSha256: operationIdentity.requestSha256,
    request: operationIdentity.request,
    record,
  };
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: record.changeId,
    kind: 'tdd-repair-v1',
    idempotencyKey: operationIdentity.operationId,
    payload,
  });
  return persistRepairProjection(root, payload, evidence, false);
}

export async function resumeTddRepair(root: string, operationId: string): Promise<TddRepairResult> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  const completed = (evidence.repairs ?? []).find((repair) => repair.operationId === operationId);
  if (completed) repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
    operationId,
    cause: 'already-completed',
  });
  const journal = await loadJournalRecords(root);
  const record = journal.find((entry) => entry.idempotencyKey === operationId);
  if (!record) repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
    operationId,
    cause: 'not-found',
  });
  const payload = repairJournalPayload(record);
  if (!payload || payload.schemaVersion !== 'tdd-repair-v1') {
    repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
      operationId,
      cause: 'journal-invalid',
    });
  }
  const identity = tddRepairOperationIdentity({
    testId: payload.request.testId,
    targetCycleId: payload.request.targetCycleId,
    disposition: payload.request.disposition,
    ...(payload.request.replacementCycleId
      ? { replacementCycleId: payload.request.replacementCycleId }
      : {}),
    approver: payload.request.approver,
    reason: payload.request.reason,
  });
  if (payload.operationId !== operationId
    || record.idempotencyKey !== operationId
    || payload.requestSha256 !== identity.requestSha256
    || identity.operationId !== operationId
    || payload.record.operationId !== operationId) {
    repairError('TDD_REPAIR_RESUME_INVALID', `${operationId} cannot be resumed.`, {
      operationId,
      cause: 'identity-mismatch',
    });
  }
  return persistRepairProjection(root, payload, evidence, true);
}

function abandonmentResult(
  record: TddRepairAbandonmentRecord,
  replayed: boolean,
): TddRepairAbandonmentResult {
  return {
    abandoned: true,
    replayed,
    operationId: record.operationId,
    testId: record.testId,
    targetCycleId: record.targetCycleId,
    failureCause: record.failureCause,
    approver: record.approver,
    reason: record.reason,
    order: record.order,
  };
}

export async function abandonPendingTddRepair(
  root: string,
  operationId: string,
  approver: string,
  reason: string,
): Promise<TddRepairAbandonmentResult> {
  const evidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [] };
  if ((evidence.repairs ?? []).some((repair) => repair.operationId === operationId)) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'already-completed',
    });
  }
  const existing = (evidence.repairAbandonments ?? []).find((entry) => entry.operationId === operationId);
  if (existing) {
    if (existing.approver === approver.trim() && existing.reason === reason.trim()) {
      return abandonmentResult(existing, true);
    }
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'already-abandoned',
    });
  }
  const journal = await loadJournalRecords(root);
  const pendingRecord = journal.find((entry) =>
    entry.kind === 'tdd-repair-v1' && entry.idempotencyKey === operationId);
  if (!pendingRecord) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'not-found',
    });
  }
  const payload = repairJournalPayload(pendingRecord);
  if (!payload
    || typeof payload.record?.testId !== 'string'
    || typeof payload.record?.targetCycleId !== 'string') {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'journal-envelope-invalid',
    });
  }
  const identity = tddRepairOperationIdentity({
    testId: payload.request.testId,
    targetCycleId: payload.request.targetCycleId,
    disposition: payload.request.disposition,
    ...(payload.request.replacementCycleId
      ? { replacementCycleId: payload.request.replacementCycleId }
      : {}),
    approver: payload.request.approver,
    reason: payload.request.reason,
  });
  let failureCause: TddRepairFailureCause | null = null;
  if (payload.operationId !== operationId
    || payload.requestSha256 !== identity.requestSha256
    || identity.operationId !== operationId
    || payload.record.operationId !== operationId) {
    failureCause = 'identity-mismatch';
  }
  const orderLog = await loadEvidenceOrder(root);
  const partialFragments: TddRepairAbandonmentRecord['partialFragments'] = [];
  for (const [index, record] of (orderLog?.records ?? []).entries()) {
    if (record.kind === 'tdd'
      && record.entityId === payload.record.targetCycleId
      && record.phase === `repair:${operationId}`) {
      partialFragments.push({ kind: 'order', index, sha256: sha256(canonicalBytes(record)) });
    }
  }
  for (const [index, repair] of (evidence.repairs ?? []).entries()) {
    if (repair.operationId === operationId) {
      partialFragments.push({ kind: 'repair-projection', index, sha256: sha256(canonicalBytes(repair)) });
    }
  }
  for (const [index, chain] of (evidence.chain ?? []).entries()) {
    if (chain.phase === 'repair'
      && chain.cycleId === payload.record.targetCycleId
      && chain.phaseEvidenceSha256 === digest(JSON.stringify(payload.record))) {
      partialFragments.push({ kind: 'repair-chain', index, sha256: sha256(canonicalBytes(chain)) });
    }
  }
  if (!failureCause && partialFragments.length > 0) failureCause = 'partial-projection-mismatch';
  if (!failureCause) {
    repairError('TDD_REPAIR_ABANDON_INVALID', `${operationId} is not one abandonable pending TDD repair.`, {
      operationId,
      cause: 'resumable',
    });
  }
  const precedence = new Map([['order', 0], ['repair-projection', 1], ['repair-chain', 2]]);
  partialFragments.sort((left, right) =>
    precedence.get(left.kind)! - precedence.get(right.kind)! || left.index - right.index);
  const inspected = await inspectEvidenceOrder(root);
  if (!inspected.valid || !completeRepairChainValid(evidence)) {
    repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  }
  const recordedAt = new Date().toISOString();
  const abandonment: TddRepairAbandonmentRecord = {
    operationId,
    testId: payload.record.testId,
    targetCycleId: payload.record.targetCycleId,
    failureCause,
    pendingJournalSha256: sha256(canonicalBytes(pendingRecord)),
    partialFragments,
    approver: approver.trim(),
    reason: reason.trim(),
    order: inspected.records.size + 1,
    recordedAt,
  };
  const abandonmentKey = `${operationId}:abandon:${sha256(canonicalBytes({
    approver: abandonment.approver,
    reason: abandonment.reason,
  }))}`;
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: payload.record.changeId,
    kind: 'tdd-repair-abandonment-v1',
    idempotencyKey: abandonmentKey,
    payload: {
      schemaVersion: 'tdd-repair-abandonment-v1',
      record: abandonment,
    },
  });
  const order = await appendEvidenceOrder(root, {
    kind: 'tdd',
    entityId: operationId,
    phase: `repair-abandonment:${operationId}`,
    testId: abandonment.testId,
  });
  if (order.sequence !== abandonment.order) {
    repairError('TDD_REPAIR_CHAIN_INVALID', 'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.');
  }
  evidence.repairAbandonments ??= [];
  evidence.repairAbandonments.push(abandonment);
  await writeJson(root, '.musubix/evidence/tdd.json', evidence);
  return abandonmentResult(abandonment, false);
}

/** Answers "is this cycle's recorded phase evidence genuinely intact" against
 * both the monotonic order log and the append-only hash chain, reused for
 * void-linkage validation (REQ-TDD-CYCLE-VOID-005..007) and for Green-candidate
 * verification when resolving an effective latest cycle (REQ-TDD-CYCLE-VOID-010).
 */
function phaseLinkageValid(
  order: ReturnType<typeof validateEvidenceOrderLog>,
  chain: TddChainRecord[] | undefined,
  chainIndex: TddChainIndex,
  cycle: TddCycle,
  phase: TddChainPhase,
  phaseEvidence: unknown,
): boolean {
  if (!order.valid || !cycle.cycleId || !chain) return false;
  if (phase === 'repair') return false;
  const phaseOrder = phase === 'void'
    ? cycle.void?.order
    : phase === 'migrate'
      ? cycle.migrate?.order
      : cycle[phase]?.order;
  if (phaseOrder === undefined) return false;
  const orderRecord = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, phase);
  if (!orderRecord || orderRecord.sequence !== phaseOrder) return false;
  if (phase === 'void' && orderRecord.testId !== cycle.testId) return false;
  const matches = chainIndex.get(tddChainKey(cycle.cycleId, cycle.testId, phase)) ?? [];
  if (matches.length !== 1) return false;
  const { record, position } = matches[0]!;
  const expectedPrevious = position === 0 ? null : chain[position - 1]!.recordSha256;
  const { recordSha256, ...payload } = record;
  return recordSha256 === chainRecordSha256(payload)
    && record.previousSha256 === expectedPrevious
    && record.phaseEvidenceSha256 === digest(JSON.stringify(phaseEvidence));
}

function voidLinkage(
  evidence: TddEvidence,
  order: ReturnType<typeof validateEvidenceOrderLog>,
  cycle: TddCycle,
  chainIndex: TddChainIndex = buildTddChainIndex(evidence.chain),
): { valid: boolean; reason?: string } {
  if (!cycle.void) return { valid: false };
  if (phaseLinkageValid(order, evidence.chain, chainIndex, cycle, 'void', cycle.void)) return { valid: true };
  let reason = 'an invalid monotonic evidence order log';
  if (order.valid) {
    if (!cycle.cycleId || cycle.void.order === undefined) {
      reason = 'a missing order record reference';
    } else {
      const orderRecord = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, 'void');
      if (!orderRecord || orderRecord.sequence !== cycle.void.order) reason = 'a missing or mismatched order record';
      else if (orderRecord.testId !== cycle.testId) reason = 'an order record testId mismatch';
      else if (!evidence.chain) reason = 'a missing hash chain';
      else {
        const matches = evidence.chain.filter((record) =>
          record.phase === 'void' && record.cycleId === cycle.cycleId && record.testId === cycle.testId);
        reason = matches.length === 0
          ? 'a missing chain record'
          : matches.length > 1
            ? 'a duplicate chain record'
            : 'a broken predecessor or payload hash link';
      }
    }
  }
  return { valid: false, reason: `${cycle.testId}'s void evidence is malformed: ${reason}.` };
}

export interface TddVoidResult {
  voided: boolean;
  testId: string;
  cycleId?: string;
  reason?: string;
}

export async function voidTddCycle(root: string, testId: string, approver: string, reason: string): Promise<TddVoidResult> {
  if (!approver?.trim()) throw new Error('An approver is required to void a TDD cycle.');
  if (!reason?.trim()) throw new Error('A reason is required to void a TDD cycle.');
  const evidence = await loadTddEvidence(root);
  if (!evidence) throw new Error('No TDD evidence found.');
  await requireNoPendingTddRepair(root, evidence);
  const testCycles = evidence.cycles.filter((entry) => entry.testId === testId);
  if (!testCycles.length) throw new Error(`No TDD cycle found for ${testId}.`);
  const activeChange = await maintenanceChangeContext(root);
  const operationScope = activeScope(activeChange);
  const operationCycles = testCycles.filter(operationScope);
  if (!operationCycles.length) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  const structuralCycle = operationCycles.at(-1)!;
  if (!structuralCycle.cycleId) {
    throw new Error(`${testId} lacks a cycle ID; regenerate its evidence before voiding.`);
  }
  if (!evidence.chain && operationCycles.some((entry) => entry !== structuralCycle)) {
    throw new Error('Existing TDD evidence lacks an append-only hash chain; regenerate it before recording new phases.');
  }
  const order = await inspectEvidenceOrder(root);
  const chainIndex = buildTddChainIndex(evidence.chain);
  const validlyVoided = new Set(evidence.cycles.filter((entry) =>
    voidLinkage(evidence, order, entry, chainIndex).valid));
  const index = buildTddCurrencyIndex(evidence, order, validlyVoided, chainIndex);
  const event = greatestVerifiedEvent(index, testId, {
    terminalScope: operationScope,
    voidScope: operationScope,
    workScope: operationScope,
  });
  if (!event) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  if (event.cycle.void && !validlyVoided.has(event.cycle)) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  if (event.kind === 'terminal') {
    throw new Error(`${testId}'s latest cycle has a valid Green phase; only a dangling cycle can be voided.`);
  }
  if (event.kind === 'void') throw new Error(`${testId}'s latest cycle is already voided.`);
  const cycle = event.cycle;
  if (cycle.void || cycle.green?.valid) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no verifiable dangling TDD cycle in the current operation scope.`,
    };
  }
  const eligibleFallback = effectiveLatestCycle(index, testId, event.order, operationScope);
  if (!eligibleFallback) {
    return {
      voided: false,
      testId,
      reason: `${testId} has no earlier valid, non-voided Red-Green cycle to fall back on; voiding would leave it with no coverage.`,
    };
  }
  const record: TddVoidEvidence = { phase: 'void', approver, reason, recordedAt: new Date().toISOString() };
  record.order = (await appendEvidenceOrder(root, {
    kind: 'tdd',
    entityId: cycle.cycleId!,
    phase: 'void',
    testId: cycle.testId,
  })).sequence;
  cycle.void = record;
  appendChainRecord(evidence, cycle, 'void', record);
  await writeJson(root, '.musubix/evidence/tdd.json', evidence);
  return { voided: true, testId, cycleId: cycle.cycleId! };
}

export async function runTddPhase(
  root: string,
  phase: TddPhase,
  testId: string,
  requirementId: string,
  commandName: string,
  runner: Runner = runProcess,
  workspace = root,
  parallel?: {
    planId: string;
    assignmentId: string;
    attempt: number;
    worktree: string;
    startCommit: string;
  },
  evidenceContext?: CandidateEvidenceContext,
): Promise<TddPhaseEvidence> {
  if (parallel) {
    if (!/^parallel-plan:[a-f0-9]{64}$/.test(parallel.planId)
      || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(parallel.assignmentId)
      || !Number.isInteger(parallel.attempt) || parallel.attempt < 1
      || !/^[a-f0-9]{40,64}$/.test(parallel.startCommit)
      || resolve(parallel.worktree) !== resolve(workspace)) {
      throw new Error('PARALLEL_TDD_UNCONSUMED: invalid parallel TDD recording identity.');
    }
  }
  await requireNoPendingTddRepair(root);
  const config = await loadConfig(root);
  if (phase === 'red') {
    const domain = await resolveRequirementDomain(root, config.approval, requirementId);
    await requireApproval(root, 'design', config.approval, domain);
  }
  const command = config.commands.find((entry) => entry.name === commandName);
  if (!command) throw new Error(`Configured command not found: ${commandName}`);
  if ((!command.tddArgs?.length || !command.tddReport) && !command.adapter) {
    throw new Error(`Configured command ${commandName} needs tddArgs and a structured tddReport.`);
  }
  if (phase === 'red') {
    for (const name of config.tdd.redPreflightCommands) {
      const preflight = config.commands.find((entry) => entry.name === name)!;
      const execution = await runner(preflight.command, preflight.args, {
        cwd: commandCwd(workspace, preflight),
        timeoutMs: preflight.timeoutMs,
      });
      if (execution.status !== 'completed' || execution.exitCode !== 0) {
        throw new Error(`TDD Red preflight command ${name} failed with status ${execution.status} and exit code ${execution.exitCode ?? 'none'}.`);
      }
    }
  }
  const trace = await buildTrace(workspace, resolve(workspace) === resolve(root));
  const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
  if (!test) throw new Error(`Annotated test ID not found: ${testId}`);
  if (!trace.edges.some((edge) => edge.from === testId && edge.to === requirementId && edge.relation === 'verifies')) {
    throw new Error(`${testId} does not verify ${requirementId}.`);
  }
  const currentFingerprint = await testFingerprint(workspace, test);
  const activeChange = await activeChangeContext(root);
  const binding = evidenceContext
    ? candidateEvidenceBinding(evidenceContext, evidenceContext.candidateCommit)
    : undefined;
  const evidence: TddEvidence = await loadTddEvidence(root) ?? { schemaVersion: 1, cycles: [], chain: [] };
  if (evidence.cycles.some((cycle) =>
    [cycle.red, cycle.green, cycle.refactor].some((item) => item && !Number.isInteger(item.order)))) {
    throw new Error('Existing TDD evidence lacks monotonic order; regenerate it before recording new phases.');
  }
  // Match a non-Red phase to the pending cycle for this exact (testId,
  // requirementId) pair, not merely the latest cycle for testId: one test ID
  // can have more than one independently pending cycle for different
  // requirement IDs. All validation for the phase runs here, before the test
  // command executes and before appendEvidenceOrder is called below, so a
  // rejection never leaks an order-log entry that could block a later,
  // correctly-matched recording for the same cycle.
  const previous = evidence.cycles
    .filter((cycle) => cycle.testId === testId && cycle.requirementId === requirementId)
    .at(-1);
  if (phase !== 'red') {
    if (!previous) throw new Error(`${phase} must use the same requirement and command as Red.`);
    if (previous.commandName !== commandName) throw new Error(`${phase} must use the same requirement and command as Red.`);
    if (!previous.red.valid) throw new Error(`A valid Red phase is required before ${phase}.`);
    if (previous.red.testFingerprint !== currentFingerprint) throw new Error('The test changed after Red; run the Red phase again.');
    if (phase === 'refactor' && !previous.green?.valid) throw new Error('A valid Green phase is required before Refactor.');
    if (activeChange && previous.changeId !== undefined
      && (previous.changeId !== activeChange.changeId || previous.generation !== activeChange.generation)) {
      throw new Error('CHANGE_GENERATION_MIXED: TDD phases cannot cross CHANGE generations.');
    }
    if (JSON.stringify(previous.parallel ?? null) !== JSON.stringify(parallel ?? null)) {
      throw new Error('PARALLEL_TDD_UNCONSUMED: TDD phases must use the same parallel assignment identity.');
    }
    if (binding && !validateCandidateBinding(previous, evidenceContext!).valid) {
      throw new Error('CANDIDATE_EVIDENCE_MISMATCH: TDD phases cannot cross candidate contexts.');
    }
  }
  const adapter = command.adapter ? adapterInvocation(command.adapter, command.name, testId, test.path) : null;
  const reportPath = command.tddReport
    ? render(command.tddReport.path, testId, test.path, '')
    : adapter!.reportPath;
  const reportAbsolute = await safePath(workspace, reportPath);
  if (adapter) await clearAdapterOutput(adapter, reportAbsolute);
  else if (await exists(reportAbsolute)) await unlink(reportAbsolute);
  const targetedArgs = command.tddArgs
    ? command.tddArgs.map((arg) => render(arg, testId, test.path, reportPath))
    : adapter!.args;
  const configuredArgs = command.args.map((arg) => render(arg, testId, test.path, reportPath));
  const args = command.adapter
    ? mergeAdapterArgs(command.adapter, configuredArgs, targetedArgs)
    : [...configuredArgs, ...targetedArgs];
  const execution = await runner(command.command, args, {
    cwd: commandCwd(workspace, command),
    timeoutMs: command.timeoutMs,
  });
  const output = `${execution.stdout}\n${execution.stderr}`;
  const diagnostics: Diagnostic[] = [];
  let reportText: string | null = null;
  let testStatus: TddPhaseEvidence['testStatus'];
  if (adapter) {
    reportText = await readAdapterOutput(adapter, reportAbsolute, execution.stdout);
  } else if (await exists(reportAbsolute)) {
    reportText = await readText(workspace, reportPath);
  }
  if (reportText === null) {
    diagnostics.push(error('TDD_REPORT_MISSING', `${testId} did not produce a fresh structured TDD report.`, reportPath));
  }
  if (reportText !== null) {
    try {
      const report = command.tddReport
        ? parseMusubixTestReport(reportText)
        : normalizeAdapterReport(command.adapter!, reportText, testId);
      if (report.tests.length !== 1 || report.tests[0]?.id !== testId) {
        diagnostics.push(error('TDD_REPORT_NOT_SCOPED', `${testId} must be the only test result in the structured report.`, reportPath));
      } else {
        testStatus = report.tests[0].status;
        const expectedStatus = phase === 'red' ? 'failed' : 'passed';
        if (testStatus !== expectedStatus) {
          diagnostics.push(error('TDD_TARGET_RESULT', `${phase} requires ${testId} to report ${expectedStatus}, observed ${testStatus}.`, reportPath));
        }
      }
    } catch (cause) {
      diagnostics.push(error('TDD_REPORT_INVALID', cause instanceof Error ? cause.message : String(cause), reportPath));
    }
  }
  const expectedExit = phase === 'red' ? 'nonzero' : 'zero';
  const exitValid = execution.status === 'completed' && (phase === 'red' ? execution.exitCode !== 0 : execution.exitCode === 0);
  if (!exitValid) diagnostics.push(error('TDD_PHASE_RESULT', `${phase} requires a completed command with ${expectedExit} exit status.`));
  if (!Number.isSafeInteger(execution.durationMs) || execution.durationMs < 0) {
    diagnostics.push(error('TDD_DURATION_INVALID', `${phase} produced an invalid execution duration; archive the invalid evidence and regenerate this cycle from a clean Red baseline.`));
  }
  const currentSourceFingerprint = await sourceFingerprint(workspace, test.path, [reportPath]);
  if (phase === 'green' && previous?.red.sourceFingerprint === currentSourceFingerprint) {
    diagnostics.push(error('TDD_GREEN_WITHOUT_SOURCE_CHANGE', `${testId} has no non-test project change between Red and Green.`, test.path));
  }
  const cycleId = phase === 'red' ? crypto.randomUUID() : previous?.cycleId;
  if (!cycleId) throw new Error(`A cycle ID is required before recording ${phase}.`);
  // Fires only on the call that persists the project's very first cycle
  // (evidence.cycles.length === 0 immediately before this call's push, and
  // only on 'red'), regardless of whether that Red is itself valid. The
  // causality clause mirrors gate.ts's `required('tdd') || tdd.present ||
  // hasChangeDocuments` formula (excluding tdd.present, which this call is
  // about to make true) without importing gate.ts, to avoid a circular
  // module dependency (gate.ts already imports from tdd.ts).
  let warnings: Diagnostic[] | undefined;
  if (phase === 'red' && evidence.cycles.length === 0) {
    const otherMandatoryRequirements = trace.nodes.filter((node) =>
      node.kind === 'requirement' && node.mandatory && node.id !== requirementId);
    const uncoveredIds = otherMandatoryRequirements
      .filter((requirement) => {
        const verifiedTests = trace.edges
          .filter((edge) => edge.relation === 'verifies' && edge.to === requirement.id)
          .map((edge) => edge.from);
        return !evidence.cycles.some((cycle) =>
          cycle.requirementId === requirement.id
          && verifiedTests.includes(cycle.testId)
          && cycle.red.valid
          && cycle.green?.valid);
      })
      .map((requirement) => requirement.id);
    const hasChangeDocuments = (await files(root)).some((path) => /^\.musubix\/changes\/CHANGE-\d+\.md$/.test(path));
    const alreadyRequired = config.requiredChecks.includes('tdd') || hasChangeDocuments;
    const uncoveredText = uncoveredIds.length
      ? `Other uncovered mandatory requirements: ${uncoveredIds.join(', ')}.`
      : 'There are zero other uncovered mandatory requirements.';
    const activationText = alreadyRequired
      ? "gate's tdd check was already required; this call activates its project-wide coverage evaluation for the first time."
      : "this call is what makes gate's tdd check required for the entire project.";
    warnings = [{
      code: 'TDD_ADOPTION_PROJECT_WIDE',
      severity: 'warning',
      message: `Recording this Red cycle persists the project's first TDD evidence. ${activationText} ${uncoveredText} ${requirementId} itself remains uncovered until it also has a valid Green phase.`,
    }];
  }
  const result: TddPhaseEvidence = {
    phase,
    valid: !diagnostics.length,
    scoped: true,
    resultObserved: testStatus === (phase === 'red' ? 'failed' : 'passed'),
    ...(testStatus ? { testStatus } : {}),
    ...(reportText === null ? {} : { reportSha256: digest(reportText) }),
    commandSha256: digest(JSON.stringify([command.command, args])),
    outputSha256: digest(output),
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    testFingerprint: currentFingerprint,
    sourceFingerprint: currentSourceFingerprint,
    executionId: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    diagnostics,
    ...(warnings ? { warnings } : {}),
  };
  result.order = (await appendEvidenceOrder(root, {
    kind: 'tdd',
    entityId: cycleId,
    phase,
  })).sequence;
  if (phase === 'red') {
    const cycle: TddCycle = {
      cycleId,
      ...(activeChange ? { changeId: activeChange.changeId, generation: activeChange.generation } : {}),
      ...(binding ? { binding } : {}),
      requirementId,
      testId,
      testPath: test.path,
      commandName,
      ...(parallel ? { parallel } : {}),
      red: result,
    };
    evidence.cycles.push(cycle);
    appendChainRecord(evidence, cycle, phase, result);
  } else {
    if (activeChange && previous!.changeId === undefined) {
      previous!.changeId = activeChange.changeId;
      previous!.generation = activeChange.generation;
    }
    previous![phase] = result;
    appendChainRecord(evidence, previous!, phase, result);
  }
  await writeJson(root, '.musubix/evidence/tdd.json', evidence);
  return result;
}

export async function validateTddEvidence(
  root: string,
  purpose = 'readiness',
  evidenceContext?: CandidateEvidenceContext | IntegrationEvidenceContext,
  evidenceRoot = root,
): Promise<{
  present: boolean; valid: boolean; diagnostics: Diagnostic[]; cycles: number;
  voided: Array<{ testId: string; cycleId: string; void: { approver: string; reason: string; recordedAt: string } }>;
}> {
  const evidence = await loadTddEvidence(evidenceRoot);
  if (!evidence?.cycles.length) return { present: false, valid: false, diagnostics: [], cycles: 0, voided: [] };
  const diagnostics: Diagnostic[] = [];
  const order = await inspectEvidenceOrder(evidenceRoot);
  const repairLedger = validateTddRepairLedger(evidence);
  if (!repairLedger.valid) {
    diagnostics.push(error(
      'TDD_REPAIR_CHAIN_INVALID',
      'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.',
    ));
  }
  const repairedCycleIds = new Set(repairLedger.repairs.map((repair) => repair.targetCycleId));
  const effectiveCycles = repairAwareCycles(evidence);
  const activeChange = evidenceContext ? null : await activeChangeContext(evidenceRoot);
  const selectedCandidates = evidenceContext
    ? 'integrationId' in evidenceContext ? evidenceContext.candidates : [evidenceContext]
    : [];
  const activeCycle: TddCycleScopePredicate = evidenceContext
    ? (cycle) => selectedCandidates.some((candidate) =>
      cycle.changeId === candidate.changeId
      && (cycle.generation ?? 1) === candidate.generation
      && validateCandidateBinding(cycle, candidate).valid)
    : activeScope(activeChange);
  diagnostics.push(...order.diagnostics);
  if (evidenceContext) {
    for (const cycle of evidence.cycles) {
      const candidate = selectedCandidates.find((entry) =>
        cycle.changeId === entry.changeId && (cycle.generation ?? 1) === entry.generation);
      if (candidate) diagnostics.push(...validateCandidateBinding(cycle, candidate).diagnostics);
    }
  }
  if (!evidence.chain) {
    diagnostics.push(error('TDD_CHAIN_MISSING', 'TDD evidence lacks the append-only hash chain.'));
  } else {
    const records = new Map<string, TddChainRecord>();
    for (const [index, record] of evidence.chain.entries()) {
      const expectedSequence = index + 1;
      const expectedPrevious = index === 0 ? null : evidence.chain[index - 1]!.recordSha256;
      const { recordSha256, ...payload } = record;
      if (record.sequence !== expectedSequence) {
        diagnostics.push(error('TDD_CHAIN_SEQUENCE', `TDD chain record ${record.sequence} is out of order; expected ${expectedSequence}.`));
      }
      if (record.previousSha256 !== expectedPrevious) {
        diagnostics.push(error('TDD_CHAIN_LINK', `TDD chain record ${record.sequence} does not link to the preceding record.`));
      }
      if (recordSha256 !== chainRecordSha256(payload)) {
        diagnostics.push(error('TDD_CHAIN_HASH_MISMATCH', `TDD chain record ${record.sequence} has an invalid SHA-256.`));
      }
      const key = `${record.cycleId}:${record.phase}`;
      if (records.has(key)) diagnostics.push(error('TDD_CHAIN_PHASE_DUPLICATE', `${key} appears more than once in the TDD chain.`));
      records.set(key, record);
    }
    for (const cycle of evidence.cycles) {
      for (const phase of ['red', 'green', 'refactor', 'migrate', 'void'] as const) {
        const phaseEvidence = cycle[phase];
        if (!phaseEvidence) continue;
        const key = `${cycle.cycleId ?? 'missing'}:${phase}`;
        const record = records.get(key);
        if (!record) {
          diagnostics.push(error('TDD_CHAIN_PHASE_MISSING', `${cycle.testId}:${phase} is absent from the TDD hash chain.`, cycle.testPath));
          continue;
        }
        if (record.requirementId !== cycle.requirementId
          || record.testId !== cycle.testId
          || record.testPath !== cycle.testPath
          || record.commandName !== cycle.commandName
          || JSON.stringify(record.parallel ?? null) !== JSON.stringify(cycle.parallel ?? null)
          || JSON.stringify(record.binding ?? null) !== JSON.stringify(cycle.binding ?? null)
          || record.phaseEvidenceSha256 !== digest(JSON.stringify(phaseEvidence))) {
          diagnostics.push(error('TDD_CHAIN_PAYLOAD_MISMATCH', `${cycle.testId}:${phase} does not match its immutable TDD chain record.`, cycle.testPath));
        }
        records.delete(key);
      }
    }
    for (const repair of repairLedger.repairs) {
      const target = evidence.cycles.find((cycle) => cycle.cycleId === repair.targetCycleId);
      const key = `${repair.targetCycleId}:repair`;
      const record = records.get(key);
      if (!target || !record
        || record.requirementId !== repair.requirementId
        || record.testId !== repair.testId
        || record.phaseEvidenceSha256 !== digest(JSON.stringify(repair))) {
        diagnostics.push(error(
          'TDD_REPAIR_CHAIN_INVALID',
          'TDD repair evidence has invalid order, hash-chain, operation, or disposition linkage.',
        ));
      }
      records.delete(key);
    }
    for (const record of records.values()) {
      diagnostics.push(error('TDD_CHAIN_ORPHAN', `TDD chain record ${record.sequence} has no matching cycle phase.`));
    }
  }
  const supersededCycles = new Set<TddCycle>();
  for (const cycle of evidence.cycles.filter((entry) => !activeCycle(entry))) supersededCycles.add(cycle);
  for (const cycle of evidence.cycles.filter((entry) =>
    entry.cycleId !== undefined && repairedCycleIds.has(entry.cycleId))) supersededCycles.add(cycle);
  const authoritativeParallelCycleIds = new Set<string>();
  for (const cycle of effectiveCycles.filter((entry) =>
    activeCycle(entry) && entry.parallel && entry.cycleId && entry.red.valid && entry.green?.valid)) {
    const provenance = await classifyParallelTddEvidence(root, {
      changeId: cycle.changeId ?? activeChange?.changeId ?? '',
      generation: cycle.generation ?? activeChange?.generation ?? 1,
      requirementId: cycle.requirementId,
      cycleId: cycle.cycleId ?? null,
      purpose,
      evidenceRoot,
    });
    if (provenance === 'pass') authoritativeParallelCycleIds.add(cycle.cycleId!);
  }
  const provenanceSupersededIds = supersededParallelTddCycles(
    effectiveCycles.filter(activeCycle),
    authoritativeParallelCycleIds,
  );
  for (const cycle of evidence.cycles) {
    if (cycle.cycleId && provenanceSupersededIds.has(cycle.cycleId)) supersededCycles.add(cycle);
  }
  {
    const cyclesByTest = new Map<string, TddCycle[]>();
    for (const cycle of evidence.cycles) {
      const list = cyclesByTest.get(cycle.testId);
      if (list) list.push(cycle); else cyclesByTest.set(cycle.testId, [cycle]);
    }
    for (const cycles of cyclesByTest.values()) {
      for (let index = 0; index < cycles.length; index++) {
        if (cycles.slice(index + 1).some((later) => later.red.valid && later.green?.valid)) {
          supersededCycles.add(cycles[index]!);
        }
      }
    }
  }
  const validlyVoidedCycles = new Set<TddCycle>();
  const currencyChainIndex = buildTddChainIndex(evidence.chain);
  const voided: Array<{ testId: string; cycleId: string; void: { approver: string; reason: string; recordedAt: string } }> = [];
  for (const cycle of evidence.cycles) {
    if (!cycle.void) continue;
    const linkage = voidLinkage(evidence, order, cycle, currencyChainIndex);
    if (linkage.valid) {
      validlyVoidedCycles.add(cycle);
      voided.push({
        testId: cycle.testId,
        cycleId: cycle.cycleId!,
        void: { approver: cycle.void.approver, reason: cycle.void.reason, recordedAt: cycle.void.recordedAt },
      });
    } else {
      diagnostics.push(error('TDD_VOID_EVIDENCE_MALFORMED', linkage.reason!, cycle.testPath));
    }
  }
  const currencyIndex = buildTddCurrencyIndex(
    {
      ...evidence,
      cycles: effectiveCycles.filter((cycle) =>
        !cycle.cycleId || !provenanceSupersededIds.has(cycle.cycleId)),
    },
    order,
    validlyVoidedCycles,
    currencyChainIndex,
  );
  const trace = await buildTrace(root, false);
  const selectedChangeIds = new Set(selectedCandidates.map((candidate) => candidate.changeId));
  const selectedChangeEvidence = evidenceContext ? await loadChangeEvidence(evidenceRoot) : null;
  const activeRequirementIds = evidenceContext
    ? new Set(selectedChangeEvidence?.changes
      .filter((change) => selectedChangeIds.has(change.changeId)
        && selectedCandidates.some((candidate) =>
          candidate.changeId === change.changeId
          && candidate.generation === activeChangeGeneration(change)))
      .flatMap((change) => change.requirementIds) ?? [])
    : activeChange ? new Set(activeChange.requirementIds) : null;
  for (const requirement of trace.nodes.filter((node) =>
    node.kind === 'requirement'
    && node.mandatory
    && (activeRequirementIds === null || activeRequirementIds.has(node.id)))) {
    const verifiedTests = trace.edges
      .filter((edge) => edge.relation === 'verifies' && edge.to === requirement.id)
      .map((edge) => edge.from);
    let covered = false;
    for (const cycle of effectiveCycles.filter((entry) =>
      !entry.cycleId || !provenanceSupersededIds.has(entry.cycleId))) {
      if (!activeCycle(cycle)
        || cycle.requirementId !== requirement.id
        || !verifiedTests.includes(cycle.testId)
        || !cycle.red.valid
        || !cycle.green?.valid) continue;
      const provenance = await classifyParallelTddEvidence(root, {
        changeId: cycle.changeId ?? activeChange?.changeId ?? '',
        generation: cycle.generation ?? activeChange?.generation ?? 1,
        requirementId: requirement.id,
        cycleId: cycle.cycleId ?? null,
        purpose,
        evidenceRoot,
      });
      if (provenance !== 'PARALLEL_TDD_UNCONSUMED') {
        covered = true;
        break;
      }
    }
    if (!covered) {
      diagnostics.push(error(
        'TDD_REQUIREMENT_UNCOVERED',
        `${requirement.id} has no valid Red-Green cycle from an authoritative verifying test.`,
        requirement.path,
        requirement.line,
      ));
    }
  }
  const sourceTextCache = new Map<string, Promise<string>>();
  const fingerprintCache = new Map<string, Promise<string>>();
  const currencyTargets = new Set(
    effectiveCycles
      .filter((cycle) =>
        (!cycle.cycleId || !provenanceSupersededIds.has(cycle.cycleId))
        && cycle.green?.valid && (!activeChange || activeCycle(cycle)))
      .map((cycle) => cycle.testId),
  );
  for (const testId of currencyTargets) {
    const unbounded = effectiveLatestCycle(currencyIndex, testId);
    if (!unbounded) continue;
    const eventScope: TddEventScope = activeChange
      ? {
          terminalScope: allCycles,
          voidScope: allCycles,
          workScope: activeCycle,
        }
      : {
          terminalScope: allCycles,
          voidScope: allCycles,
          workScope: noActiveWorkScope(unbounded),
        };
    const event = greatestVerifiedEvent(currencyIndex, testId, eventScope);
    if (event?.kind === 'work') continue;
    const selection = event?.kind === 'void'
      ? effectiveLatestCycle(currencyIndex, testId, event.order)
      : unbounded;
    if (!selection) continue;
    const test = trace.nodes.find((node) => node.kind === 'test' && node.id === testId);
    if (!test) continue;
    let current = fingerprintCache.get(testId);
    if (!current) {
      let sourceText = sourceTextCache.get(test.path);
      if (!sourceText) {
        sourceText = readText(root, test.path);
        sourceTextCache.set(test.path, sourceText);
      }
      current = sourceText.then((text) => testFingerprintFromText(test, text));
      fingerprintCache.set(testId, current);
    }
    if (await current !== selection.fingerprint) {
      diagnostics.push(error(
        'TDD_TEST_STALE',
        `${testId} changed after its latest passing TDD phase.`,
        test.path,
      ));
    }
  }
  for (const cycle of effectiveCycles.filter(activeCycle)) {
    for (const phase of ['red', 'green', 'refactor'] as const) {
      const item = cycle[phase];
      if (!item) continue;
      if (!Number.isSafeInteger(item.durationMs) || item.durationMs < 0) {
        diagnostics.push(error('TDD_DURATION_INVALID', `${cycle.testId}:${phase} has an invalid execution duration; archive the invalid evidence and regenerate this cycle from a clean Red baseline.`, cycle.testPath));
      }
      if (!cycle.cycleId || !Number.isInteger(item.order)) {
        diagnostics.push(error('TDD_ORDER_MIGRATION_REQUIRED', `${cycle.testId}:${phase} lacks monotonic order evidence; archive legacy evidence and regenerate the complete cycle instead of editing append-only records.`, cycle.testPath));
        continue;
      }
      const record = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, phase);
      if (!record || record.sequence !== item.order) {
        diagnostics.push(error('TDD_ORDER_MISMATCH', `${cycle.testId}:${phase} does not match the monotonic evidence order log.`, cycle.testPath));
      }
    }
    if (cycle.green?.order !== undefined && cycle.red.order !== undefined && cycle.green.order <= cycle.red.order) {
      diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:green is not after Red in monotonic evidence order.`, cycle.testPath));
    }
    if (cycle.refactor?.order !== undefined && cycle.green?.order !== undefined && cycle.refactor.order <= cycle.green.order) {
      diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:refactor is not after Green in monotonic evidence order.`, cycle.testPath));
    }
    if (cycle.migrate) {
      if (!cycle.cycleId || !Number.isInteger(cycle.migrate.order)) {
        diagnostics.push(error('TDD_ORDER_MIGRATION_REQUIRED', `${cycle.testId}:migrate lacks monotonic order evidence; archive legacy evidence and regenerate the complete cycle instead of editing append-only records.`, cycle.testPath));
      } else {
        const record = evidenceOrderRecord(order.records, 'tdd', cycle.cycleId, 'migrate');
        if (!record || record.sequence !== cycle.migrate.order) {
          diagnostics.push(error('TDD_ORDER_MISMATCH', `${cycle.testId}:migrate does not match the monotonic evidence order log.`, cycle.testPath));
        }
      }
      const latestNonMigrateOrder = cycle.refactor?.valid ? cycle.refactor.order : cycle.green?.order;
      if (cycle.migrate.order !== undefined && latestNonMigrateOrder !== undefined && cycle.migrate.order <= latestNonMigrateOrder) {
        diagnostics.push(error('TDD_ORDER_SEQUENCE', `${cycle.testId}:migrate is not after Green/Refactor in monotonic evidence order.`, cycle.testPath));
      }
      if (!cycle.migrate.approver?.trim()) {
        diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId}:migrate lacks a recorded human approver.`, cycle.testPath));
      }
    }
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle)
      && (!cycle.red.scoped || !cycle.red.resultObserved || cycle.red.testStatus !== 'failed' || !cycle.red.reportSha256 || !cycle.red.sourceFingerprint || !cycle.red.executionId)) {
      diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} lacks test-scoped execution provenance; archive the legacy cycle and regenerate it from a clean Red baseline: move .musubix/evidence/tdd.json aside and re-record every cycle with tdd red/green/refactor. There is no partial prune command; hand-editing the evidence is not supported.`, cycle.testPath));
    }
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle) && !cycle.red.valid) diagnostics.push(error('TDD_RED_MISSING', `${cycle.testId} has no valid failing Red phase; archive it and regenerate the complete cycle by moving .musubix/evidence/tdd.json aside and re-recording every cycle.`, cycle.testPath));
    if (!supersededCycles.has(cycle) && !validlyVoidedCycles.has(cycle) && !cycle.green?.valid) diagnostics.push(error('TDD_GREEN_MISSING', `${cycle.testId} has no valid passing Green phase; archive it and regenerate the complete cycle by moving .musubix/evidence/tdd.json aside and re-recording every cycle.`, cycle.testPath));
    if (cycle.green?.valid) {
      if (!cycle.green.scoped || !cycle.green.resultObserved || cycle.green.testStatus !== 'passed' || !cycle.green.reportSha256 || !cycle.green.sourceFingerprint || !cycle.green.executionId) {
        diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} Green lacks test-scoped execution provenance.`, cycle.testPath));
      }
      if (cycle.red.sourceFingerprint === cycle.green.sourceFingerprint) {
        diagnostics.push(error('TDD_GREEN_WITHOUT_SOURCE_CHANGE', `${cycle.testId} has no non-test project change between Red and Green.`, cycle.testPath));
      }
    }
    if (cycle.green && cycle.green.commandSha256 !== cycle.red.commandSha256) {
      diagnostics.push(error('TDD_COMMAND_CHANGED', `${cycle.testId} used a different command between Red and Green.`, cycle.testPath));
    }
    if (cycle.refactor && cycle.refactor.commandSha256 !== cycle.red.commandSha256) {
      diagnostics.push(error('TDD_COMMAND_CHANGED', `${cycle.testId} used a different command during Refactor.`, cycle.testPath));
    }
    if (cycle.refactor?.valid && (!cycle.refactor.scoped || !cycle.refactor.resultObserved || cycle.refactor.testStatus !== 'passed' || !cycle.refactor.reportSha256 || !cycle.refactor.sourceFingerprint || !cycle.refactor.executionId)) {
      diagnostics.push(error('TDD_LEGACY_OR_UNSCOPED_EVIDENCE', `${cycle.testId} Refactor lacks test-scoped execution provenance.`, cycle.testPath));
    }
  }
  for (const phase of ['red', 'green', 'refactor'] as const) {
    const hashes = new Map<string, TddCycle>();
    for (const cycle of effectiveCycles.filter(activeCycle)) {
      const item = cycle[phase];
      if (!item) continue;
      // The structured report names the selected test, so it is the authoritative
      // reuse signal; console output alone collides for quiet runners.
      const key = item.reportSha256 ? `report:${item.reportSha256}` : `output:${item.outputSha256}`;
      const previous = hashes.get(key);
      if (previous && previous.testId !== cycle.testId) {
        diagnostics.push(error(
          'TDD_EVIDENCE_REUSED',
          `${previous.testId} and ${cycle.testId} reuse identical ${phase} ${item.reportSha256 ? 'report' : 'output'} evidence.`,
          cycle.testPath,
        ));
      } else hashes.set(key, cycle);
    }
  }
  return { present: true, valid: !diagnostics.length, diagnostics, cycles: evidence.cycles.length, voided };
}
