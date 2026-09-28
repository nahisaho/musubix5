import { readFile } from 'node:fs/promises';
import { error, type Diagnostic } from '../../domain/src/index.js';
import { canonicalBytes, sha256 } from './canonical.js';
import { activeChangeContext } from './change-generation.js';
import { defaultConfig, loadConfig, type WorkflowConfig } from './config.js';
import { digest, exists, safePath, writeJson } from './files.js';
import {
  acquireChangeLease, appendJournalRecord, assertChangeLeaseCurrent, loadJournalRecords, releaseChangeLease,
  type JournalRecord,
} from './journal.js';
import {
  authoritativeIndex, buildWorkflowWaiverContext, loadWorkflowWaiverEvidence, nonStale,
  type WorkflowWaiverRecord,
} from './workflow-waiver.js';
import {
  loadWorkflow, workflowEvidenceHead,
  type WorkflowEvent, type WorkflowManifest,
} from './workflow-types.js';

export const WORKFLOW_CORRECTION_PATH = '.musubix/evidence/workflow-declaration-corrections.json';
const CORRECTION_KIND = 'workflow-declaration-correction';
const SHA256 = /^[a-f0-9]{64}$/;
const GENESIS_SHA256 = '0'.repeat(64);

interface DeclarationSelector {
  position: number;
  declarationSha256: string;
}

interface CanonicalInvocation {
  skill: string;
  toolCallId: string;
  invokedAt: string;
  completedAt: string;
  status: 'completed';
}

interface WorkflowDeclarationCorrection {
  schemaVersion: 1;
  correctionId: string;
  target: DeclarationSelector;
  canonical: DeclarationSelector;
  duplicateIdentitySha256: string;
  changeId: string;
  generation: number;
  requirementIds: string[];
  skill: string;
  phase: string;
  declarationRecordedAt: string;
  diagnostic: 'WORKFLOW_INVOCATION_REUSED';
  canonicalInvocation: CanonicalInvocation;
  recordingVerificationHead: string;
  recordingVerificationMode: 'compatible' | 'strict';
  approver: string;
  reason: string;
  correctedAt: string;
  order: number;
  idempotencyKey: string;
  previousSha256: string;
}

interface WorkflowDeclarationCorrectionEvidence {
  schemaVersion: 1;
  corrections: WorkflowDeclarationCorrection[];
}

interface JournalCorrectionPayload {
  schemaVersion: 1;
  correction: Omit<WorkflowDeclarationCorrection, 'order'>;
  fencingToken: number;
}

export interface WorkflowDeclarationCorrectionRequest {
  skill: string;
  phase: string;
  recordedAt: string;
  index?: number;
  approver: string;
  reason: string;
  confirm: boolean;
}

export interface WorkflowDeclarationCorrectionResult {
  schemaVersion: 1;
  recorded: boolean;
  correctionId: string;
  target: DeclarationSelector;
  canonical: DeclarationSelector;
  targetIndex: number;
  canonicalIndex: number;
  duplicateIdentitySha256: string;
  canonicalInvocation: CanonicalInvocation;
  recordingVerificationHead: string;
  recordingVerificationMode: 'compatible' | 'strict';
  changeId: string;
  generation: number;
  skill: string;
  phase: string;
  declarationRecordedAt: string;
  diagnostic: 'WORKFLOW_INVOCATION_REUSED';
  approver: string;
  reason: string;
  order: number;
  idempotentReplay: boolean;
  correctionEvidenceHead: string;
}

export interface WorkflowDeclarationCorrectionContext {
  correctedIndices: Set<number>;
  diagnostics: Diagnostic[];
}

function workflowEventsSha256(events: WorkflowEvent[]): string {
  return digest(JSON.stringify(events));
}

function correctionEvidenceHead(corrections: WorkflowDeclarationCorrection[]): string {
  return sha256(canonicalBytes(corrections));
}

function eventSha256(event: WorkflowEvent): string {
  return sha256(canonicalBytes(event));
}

function explicitOwnership(event: WorkflowEvent): event is WorkflowEvent & {
  changeId: string;
  generation: number;
  requirementIds: string[];
} {
  return typeof event.changeId === 'string'
    && Number.isInteger(event.generation)
    && Number(event.generation) > 0
    && Array.isArray(event.requirementIds)
    && event.requirementIds.length > 0
    && event.requirementIds.every((entry) => typeof entry === 'string');
}

function duplicateIdentitySha256(event: WorkflowEvent): string {
  return sha256(canonicalBytes({
    skill: event.skill,
    version: event.version,
    provenance: event.provenance ?? null,
    changeId: event.changeId ?? null,
    generation: event.generation ?? null,
    requirementIds: [...(event.requirementIds ?? [])].sort(),
    phase: event.phase,
    status: event.status,
    reason: event.reason ?? null,
    commandSha256: event.commandSha256 ?? null,
  }));
}

function selector(event: WorkflowEvent, position: number): DeclarationSelector {
  return { position, declarationSha256: eventSha256(event) };
}

async function loadProjection(root: string): Promise<WorkflowDeclarationCorrectionEvidence> {
  const path = await safePath(root, WORKFLOW_CORRECTION_PATH);
  if (!await exists(path)) return { schemaVersion: 1, corrections: [] };
  return JSON.parse(await readFile(path, 'utf8')) as WorkflowDeclarationCorrectionEvidence;
}

function resolveTarget(workflow: WorkflowManifest, request: WorkflowDeclarationCorrectionRequest): number {
  const matches = workflow.events.flatMap((event, position) =>
    event.status === 'completed'
    && event.skill === request.skill
    && event.phase === request.phase
    && event.recordedAt === request.recordedAt
      ? [position]
      : []);
  if (request.index !== undefined) {
    if (!matches.includes(request.index)) {
      throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: --index does not select the target declaration.');
    }
    return request.index;
  }
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? 'WORKFLOW_DECLARATION_CORRECTION_INVALID: target declaration does not exist.'
      : 'WORKFLOW_DECLARATION_CORRECTION_INVALID: colliding target declarations require --index.');
  }
  return matches[0]!;
}

function boundInvocationByEvent(
  workflow: WorkflowManifest,
  owner: { changeId: string; generation: number },
  correctedIndices: Set<number>,
): Map<number, CanonicalInvocation> {
  const bound = new Map<number, CanonicalInvocation>();
  const used = new Set<string>();
  const previousIndexBySkill = new Map<string, number>();
  for (const [eventIndex, event] of workflow.events.entries()) {
    if (event.status !== 'completed'
      || event.changeId !== owner.changeId
      || (event.generation ?? 1) !== owner.generation
      || correctedIndices.has(eventIndex)) continue;
    const previousIndex = previousIndexBySkill.get(event.skill) ?? -1;
    const eligible = (workflow.verification?.invocations ?? [])
      .map((invocation, index) => ({ invocation, index }))
      .filter(({ invocation }) =>
        invocation.skill === event.skill
        && Date.parse(invocation.invokedAt) <= Date.parse(event.recordedAt));
    const match = eligible.find(({ invocation, index }) =>
      !used.has(invocation.toolCallId)
      && index > previousIndex
      && invocation.status === 'completed'
      && !!invocation.completedAt
      && Date.parse(invocation.completedAt) <= Date.parse(event.recordedAt));
    if (match?.invocation.completedAt) {
      used.add(match.invocation.toolCallId);
      previousIndexBySkill.set(event.skill, match.index);
      bound.set(eventIndex, {
        skill: match.invocation.skill,
        toolCallId: match.invocation.toolCallId,
        invokedAt: match.invocation.invokedAt,
        completedAt: match.invocation.completedAt,
        status: 'completed',
      });
    }
  }
  return bound;
}

async function hasCurrentTargetWaiver(
  root: string,
  workflow: WorkflowManifest,
  target: WorkflowEvent,
  targetIndex: number,
): Promise<boolean> {
  const loaded = await loadWorkflowWaiverEvidence(root);
  const collisions = workflow.events.filter((event) =>
    event.status === 'completed'
    && event.skill === target.skill
    && event.phase === target.phase
    && event.recordedAt === target.recordedAt).length;
  const scopeIndex = collisions >= 2 ? targetIndex : undefined;
  const reused: Diagnostic = {
    code: 'WORKFLOW_INVOCATION_REUSED',
    severity: 'error',
    message: `${target.skill}:${target.phase} would reuse an invocation already bound to another declaration.`,
    skill: target.skill,
    phase: target.phase,
    declarationRecordedAt: target.recordedAt,
    ...(scopeIndex === undefined ? {} : { index: scopeIndex }),
  };
  const context = buildWorkflowWaiverContext(loaded, workflow, [reused]);
  const waiverIndex = authoritativeIndex(
    context,
    target.skill,
    target.phase,
    target.recordedAt,
    scopeIndex,
  );
  return waiverIndex >= 0
    && nonStale((loaded!.waivers[waiverIndex] as WorkflowWaiverRecord), waiverIndex, context);
}

function verificationPolicyValid(
  workflow: WorkflowManifest,
  config: WorkflowConfig,
  now = Date.now(),
): boolean {
  const verification = workflow.verification;
  if (!verification) return false;
  if (config.mode !== 'strict') return true;
  if (verification.mode !== 'strict'
    || !verification.transcriptSha256 || !SHA256.test(verification.transcriptSha256)
    || !verification.sessionId
    || verification.exitCode !== 0
    || !verification.terminalAt || Number.isNaN(Date.parse(verification.terminalAt))
    || !Number.isInteger(verification.eventCount) || verification.eventCount! < 1
    || !Number.isSafeInteger(verification.sourceBytes) || verification.sourceBytes! < 1
    || !Number.isSafeInteger(verification.maxTranscriptBytes) || verification.maxTranscriptBytes! < 1
    || !Number.isSafeInteger(verification.maximumLineBytes) || verification.maximumLineBytes! < 1
    || !Number.isSafeInteger(verification.maxTranscriptLineBytes) || verification.maxTranscriptLineBytes! < 1) {
    return false;
  }
  if (verification.sourceBytes! > verification.maxTranscriptBytes!
    || verification.sourceBytes! > (config.maxTranscriptBytes ?? defaultConfig.workflow.maxTranscriptBytes!)
    || verification.maxTranscriptBytes! > (config.maxTranscriptBytes ?? defaultConfig.workflow.maxTranscriptBytes!)
    || verification.maximumLineBytes! > verification.maxTranscriptLineBytes!
    || verification.maximumLineBytes! > (config.maxTranscriptLineBytes ?? defaultConfig.workflow.maxTranscriptLineBytes!)
    || verification.maxTranscriptLineBytes! > (config.maxTranscriptLineBytes ?? defaultConfig.workflow.maxTranscriptLineBytes!)) {
    return false;
  }
  if (config.expectedSessionId
    && verification.sessionId.toLowerCase() !== config.expectedSessionId.toLowerCase()) {
    return false;
  }
  const terminalTime = Date.parse(verification.terminalAt);
  return !(config.maxFutureSkewSeconds !== undefined
      && terminalTime > now + config.maxFutureSkewSeconds * 1000)
    && !(config.maxAgeSeconds !== undefined
      && now - terminalTime > config.maxAgeSeconds * 1000);
}

function idempotencyKeyFor(
  changeId: string,
  generation: number,
  target: DeclarationSelector,
  canonical: DeclarationSelector,
): string {
  return sha256(canonicalBytes({
    changeId,
    generation,
    target,
    canonical,
    diagnostic: 'WORKFLOW_INVOCATION_REUSED',
  }));
}

function semanticReplayEqual(
  existing: Omit<WorkflowDeclarationCorrection, 'order'>,
  requested: Omit<WorkflowDeclarationCorrection, 'correctionId' | 'correctedAt' | 'order' | 'previousSha256'>,
): boolean {
  const {
    correctionId: _correctionId,
    correctedAt: _correctedAt,
    previousSha256: _previousSha256,
    ...semanticExisting
  } = existing;
  return canonicalBytes(semanticExisting).equals(canonicalBytes(requested));
}

function resultFor(
  correction: WorkflowDeclarationCorrection,
  projection: WorkflowDeclarationCorrectionEvidence,
  idempotentReplay: boolean,
): WorkflowDeclarationCorrectionResult {
  return {
    schemaVersion: 1,
    recorded: !idempotentReplay,
    correctionId: correction.correctionId,
    target: correction.target,
    canonical: correction.canonical,
    targetIndex: correction.target.position,
    canonicalIndex: correction.canonical.position,
    duplicateIdentitySha256: correction.duplicateIdentitySha256,
    canonicalInvocation: correction.canonicalInvocation,
    recordingVerificationHead: correction.recordingVerificationHead,
    recordingVerificationMode: correction.recordingVerificationMode,
    changeId: correction.changeId,
    generation: correction.generation,
    skill: correction.skill,
    phase: correction.phase,
    declarationRecordedAt: correction.declarationRecordedAt,
    diagnostic: correction.diagnostic,
    approver: correction.approver,
    reason: correction.reason,
    order: correction.order,
    idempotentReplay,
    correctionEvidenceHead: correctionEvidenceHead(projection.corrections),
  };
}

function journalPayload(record: JournalRecord): JournalCorrectionPayload | null {
  if (record.kind !== CORRECTION_KIND || !record.payload || typeof record.payload !== 'object') return null;
  const payload = record.payload as JournalCorrectionPayload;
  return payload.schemaVersion === 1 && payload.correction && Number.isInteger(payload.fencingToken)
    ? payload
    : null;
}

function projectionFromJournal(records: JournalRecord[]): WorkflowDeclarationCorrectionEvidence {
  return {
    schemaVersion: 1,
    corrections: records.flatMap((record) => {
      const payload = journalPayload(record);
      return payload ? [{ ...payload.correction, order: record.order }] : [];
    }),
  };
}

function projectionPrefix(
  projection: WorkflowDeclarationCorrectionEvidence,
  authoritative: WorkflowDeclarationCorrectionEvidence,
): boolean {
  return projection.corrections.length <= authoritative.corrections.length
    && projection.corrections.every((entry, index) =>
      canonicalBytes(entry).equals(canonicalBytes(authoritative.corrections[index])));
}

/** @id CODE-M5-WORKFLOW-DECLARATION-CORRECTION-001
 * @implements REQ-M5-EVIDENCE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-018
 */
export async function recordWorkflowDeclarationCorrection(
  root: string,
  request: WorkflowDeclarationCorrectionRequest,
): Promise<WorkflowDeclarationCorrectionResult> {
  if (!request.confirm) throw new Error('CLI_ERROR: explicit confirmation is required.');
  if (!request.approver.trim() || !request.reason.trim()) {
    throw new Error('CLI_ERROR: approver and nonblank reason are required.');
  }
  const workflow = await loadWorkflow(root);
  const change = await activeChangeContext(root);
  if (!workflow?.verification || !change) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: current workflow verification and CHANGE ownership are required.');
  }
  if (workflow.verification.eventsSha256 !== workflowEventsSha256(workflow.events)) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: workflow verification is stale.');
  }
  const config = await loadConfig(root).catch(() => defaultConfig);
  if (!verificationPolicyValid(workflow, config.workflow)) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: workflow verification fails the current policy.');
  }
  const targetIndex = resolveTarget(workflow, request);
  const targetEvent = workflow.events[targetIndex]!;
  if (!explicitOwnership(targetEvent)
    || targetEvent.changeId !== change.changeId
    || targetEvent.generation !== change.generation) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: target requires explicit current CHANGE ownership.');
  }
  const identity = duplicateIdentitySha256(targetEvent);
  const initialRecords = await loadJournalRecords(root);
  const initialProjection = await loadProjection(root);
  const authoritativeProjection = projectionFromJournal(initialRecords);
  if (!projectionPrefix(initialProjection, authoritativeProjection)) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: correction projection diverges from the journal.');
  }
  const corrected = new Set(authoritativeProjection.corrections.map((entry) => entry.target.position));
  const canonicalIndex = workflow.events.findIndex((event, position) =>
    position < targetIndex
    && !corrected.has(position)
    && duplicateIdentitySha256(event) === identity);
  if (canonicalIndex < 0) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: target is not a later duplicate declaration.');
  }
  const canonicalEvent = workflow.events[canonicalIndex]!;
  if (!explicitOwnership(canonicalEvent)
    || canonicalEvent.changeId !== targetEvent.changeId
    || canonicalEvent.generation !== targetEvent.generation
    || canonicalBytes([...canonicalEvent.requirementIds].sort())
      .compare(canonicalBytes([...targetEvent.requirementIds].sort())) !== 0) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: duplicate declarations have different ownership.');
  }
  const bindings = boundInvocationByEvent(workflow, change, corrected);
  const canonicalInvocation = bindings.get(canonicalIndex);
  if (!canonicalInvocation || bindings.has(targetIndex)) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: target does not have declaration-scoped invocation reuse.');
  }
  if (await hasCurrentTargetWaiver(root, workflow, targetEvent, targetIndex)) {
    throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: target declaration has a current workflow waiver.');
  }
  const target = selector(targetEvent, targetIndex);
  const canonical = selector(canonicalEvent, canonicalIndex);
  const idempotencyKey = idempotencyKeyFor(change.changeId, change.generation, target, canonical);
  const recordingVerificationHead = workflowEvidenceHead(workflow)!;
  const recordingVerificationMode = workflow.verification.mode ?? 'compatible';
  const requestedSemantic = {
    schemaVersion: 1 as const,
    target,
    canonical,
    duplicateIdentitySha256: identity,
    changeId: change.changeId,
    generation: change.generation,
    requirementIds: [...targetEvent.requirementIds].sort(),
    skill: targetEvent.skill,
    phase: targetEvent.phase,
    declarationRecordedAt: targetEvent.recordedAt,
    diagnostic: 'WORKFLOW_INVOCATION_REUSED' as const,
    canonicalInvocation,
    recordingVerificationHead,
    recordingVerificationMode,
    approver: request.approver,
    reason: request.reason,
    idempotencyKey,
  };
  const lease = await acquireChangeLease(root, change.changeId);
  try {
    await assertChangeLeaseCurrent(lease);
    const currentRecords = await loadJournalRecords(root);
    const storedProjection = await loadProjection(root);
    const currentProjection = projectionFromJournal(currentRecords);
    if (!projectionPrefix(storedProjection, currentProjection)) {
      throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: correction projection diverges from the journal.');
    }
    if (storedProjection.corrections.length !== currentProjection.corrections.length) {
      await writeJson(root, WORKFLOW_CORRECTION_PATH, currentProjection);
    }
    const persisted = currentRecords.find((record) => record.idempotencyKey === idempotencyKey);
    if (persisted) {
      const payload = journalPayload(persisted);
      if (!payload || !semanticReplayEqual(payload.correction, requestedSemantic)) {
        throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: divergent correction replay.');
      }
      const existing = currentProjection.corrections.find((entry) => entry.idempotencyKey === idempotencyKey);
      if (!existing) {
        throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: correction journal is not projected.');
      }
      return resultFor(existing, currentProjection, true);
    }
    if (currentProjection.corrections.some((entry) => entry.target.position === target.position)) {
      throw new Error('WORKFLOW_DECLARATION_CORRECTION_INVALID: target already has a divergent correction.');
    }
    const previous = currentProjection.corrections.at(-1);
    const previousSha256 = previous ? sha256(canonicalBytes(previous)) : GENESIS_SHA256;
    const correctedAt = new Date().toISOString();
    const correctionId = `WDC-${idempotencyKey.slice(0, 24).toUpperCase()}`;
    const correctionWithoutOrder: Omit<WorkflowDeclarationCorrection, 'order'> = {
      ...requestedSemantic,
      correctionId,
      correctedAt,
      previousSha256,
    };
    const journal = await appendJournalRecord(root, {
      stream: 'normal',
      changeId: change.changeId,
      kind: CORRECTION_KIND,
      idempotencyKey,
      payload: {
        schemaVersion: 1,
        correction: correctionWithoutOrder,
        fencingToken: lease.fencingToken,
      } satisfies JournalCorrectionPayload,
    });
    await assertChangeLeaseCurrent(lease);
    const correction: WorkflowDeclarationCorrection = {
      ...correctionWithoutOrder,
      order: journal.order,
    };
    const next: WorkflowDeclarationCorrectionEvidence = {
      schemaVersion: 1 as const,
      corrections: [...currentProjection.corrections, correction],
    };
    await writeJson(root, WORKFLOW_CORRECTION_PATH, next);
    return resultFor(correction, next, false);
  } finally {
    await releaseChangeLease(lease);
  }
}

export async function loadWorkflowDeclarationCorrectionContext(
  root: string,
  workflow: WorkflowManifest | null,
): Promise<WorkflowDeclarationCorrectionContext> {
  const correctedIndices = new Set<number>();
  const diagnostics: Diagnostic[] = [];
  let projection: WorkflowDeclarationCorrectionEvidence;
  let records: JournalRecord[];
  try {
    [projection, records] = await Promise.all([loadProjection(root), loadJournalRecords(root)]);
  } catch {
    return {
      correctedIndices,
      diagnostics: [error('WORKFLOW_DECLARATION_CORRECTION_INVALID', 'Workflow declaration correction evidence is malformed.')],
    };
  }
  if (projection.schemaVersion !== 1 || !Array.isArray(projection.corrections)) {
    return {
      correctedIndices,
      diagnostics: [error('WORKFLOW_DECLARATION_CORRECTION_INVALID', 'Workflow declaration correction evidence has an invalid envelope.')],
    };
  }
  let previous: WorkflowDeclarationCorrection | undefined;
  const targets = new Set<number>();
  const journalCorrections = records.filter((record) => journalPayload(record) !== null);
  if (journalCorrections.length !== projection.corrections.length) {
    diagnostics.push(error(
      'WORKFLOW_DECLARATION_CORRECTION_INVALID',
      'Workflow declaration correction journal and projection counts differ.',
    ));
  }
  for (const correction of projection.corrections) {
    const canonical = workflow?.events[correction.canonical?.position];
    const target = workflow?.events[correction.target?.position];
    const journal = records.find((record) =>
      record.order === correction.order
      && record.idempotencyKey === correction.idempotencyKey
      && record.kind === CORRECTION_KIND);
    const payload = journal ? journalPayload(journal) : null;
    const expectedPrevious = previous ? sha256(canonicalBytes(previous)) : GENESIS_SHA256;
    const lowestCanonicalPosition = workflow && target
      ? workflow.events.findIndex((event, position) =>
        position < correction.target.position
        && !targets.has(position)
        && duplicateIdentitySha256(event) === duplicateIdentitySha256(target))
      : -1;
    const waiverConflict = workflow && target
      ? await hasCurrentTargetWaiver(root, workflow, target, correction.target.position)
      : true;
    const valid = correction.schemaVersion === 1
      && SHA256.test(correction.idempotencyKey)
      && correction.previousSha256 === expectedPrevious
      && correction.order > (previous?.order ?? 0)
      && !targets.has(correction.target.position)
      && !!canonical
      && !!target
      && explicitOwnership(canonical)
      && explicitOwnership(target)
      && correction.canonical.declarationSha256 === eventSha256(canonical)
      && correction.target.declarationSha256 === eventSha256(target)
      && correction.canonical.position < correction.target.position
      && correction.canonical.position === lowestCanonicalPosition
      && correction.duplicateIdentitySha256 === duplicateIdentitySha256(canonical)
      && correction.duplicateIdentitySha256 === duplicateIdentitySha256(target)
      && correction.changeId === target.changeId
      && correction.generation === target.generation
      && correction.skill === target.skill
      && correction.phase === target.phase
      && correction.declarationRecordedAt === target.recordedAt
      && canonicalBytes(correction.requirementIds)
        .equals(canonicalBytes([...target.requirementIds].sort()))
      && canonical.changeId === target.changeId
      && canonical.generation === target.generation
      && canonicalBytes([...canonical.requirementIds].sort())
        .equals(canonicalBytes([...target.requirementIds].sort()))
      && correction.canonicalInvocation.status === 'completed'
      && correction.canonicalInvocation.skill === canonical.skill
      && correction.canonicalInvocation.toolCallId.length > 0
      && !waiverConflict
      && correction.idempotencyKey === idempotencyKeyFor(
        correction.changeId,
        correction.generation,
        correction.target,
        correction.canonical,
      )
      && payload !== null
      && payload.fencingToken > 0
      && canonicalBytes(payload.correction).equals(canonicalBytes((({ order: _order, ...entry }) => entry)(correction)));
    if (!valid) {
      diagnostics.push(error(
        'WORKFLOW_DECLARATION_CORRECTION_INVALID',
        `Workflow declaration correction ${correction.correctionId ?? '<unknown>'} is invalid.`,
      ));
      continue;
    }
    previous = correction;
    targets.add(correction.target.position);
    correctedIndices.add(correction.target.position);
    diagnostics.push({
      code: 'WORKFLOW_DECLARATION_SUPERSEDED',
      severity: 'warning',
      message: `${target.skill}:${target.phase} is superseded by correction ${correction.correctionId}.`,
      skill: target.skill,
      phase: target.phase,
      declarationRecordedAt: target.recordedAt,
      index: correction.target.position,
      detail: correction.correctionId,
    });
  }
  return { correctedIndices, diagnostics };
}
