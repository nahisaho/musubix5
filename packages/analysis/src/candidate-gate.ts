import { error, type Diagnostic } from '../../domain/src/index.js';
import { canonicalBytes, sha256 } from './canonical.js';
import { loadConfig, materializeExecutionPolicy, type AttestationConfig } from './config.js';
import type { EvidenceAttestation, AttestationVerificationOptions } from './attestation.js';
import { verifyDetachedEvidenceAttestation } from './attestation.js';
import { activeChangeContext } from './change-generation.js';
import { appendEvidence } from './evidence-registry.js';
import { files, readText, writeJson } from './files.js';
import { verifyJournal } from './journal.js';
import { resolveCandidateSnapshot } from './workspace-manager.js';

export const candidateMatrixJobs = [
  { os: 'ubuntu', nodeMajor: 24 },
  { os: 'windows', nodeMajor: 24 },
  { os: 'macos', nodeMajor: 24 },
] as const;

// The workflow runs verification under runner.temp so macOS Unix socket paths stay within platform limits.
export const historicalCandidateMatrixJobs = [
  { os: 'ubuntu', nodeMajor: 20 },
  { os: 'ubuntu', nodeMajor: 22 },
  { os: 'windows', nodeMajor: 22 },
  { os: 'macos', nodeMajor: 22 },
] as const;

export type CandidateGateJob =
  | typeof candidateMatrixJobs[number]
  | typeof historicalCandidateMatrixJobs[number];

const persistedCandidateMatrixJobs: readonly CandidateGateJob[] = [
  ...candidateMatrixJobs,
  ...historicalCandidateMatrixJobs,
];

export const requiredCandidateGateCommands = [
  'typecheck',
  'build',
  'test',
  'codegraph-tests',
  'compatibility',
  'pack-check',
  'pack-smoke',
] as const;

const legacyCandidateGateCommands = requiredCandidateGateCommands.filter(
  (command) => command !== 'codegraph-tests',
);

export interface CandidateGateContext {
  repositoryId: string;
  changeId: string;
  generation: number;
  candidateCommit: string;
  gateInputFingerprint: string;
}

export interface CandidateGateJobResult extends CandidateGateContext {
  schemaVersion: 1;
  job: CandidateGateJob;
  producer: string;
  runtime: { os: string; nodeMajor: number };
  commands?: Array<{ name: string; digest: string; status: 'pass' | 'fail' }>;
  commandsPassed: boolean;
  preTreeMatchesCandidate: boolean;
  postTreeMatchesCandidate: boolean;
  status: 'pass' | 'fail';
}

export interface CandidateGateEnvelope {
  schemaVersion: 1;
  result: CandidateGateJobResult;
  attestation: EvidenceAttestation | null;
}

const approvalAutomationDefault = {
  design: {
    mode: 'manual',
    producerRepairLimit: 3,
    repairPlannerBudgetUnits: 1000,
    reviewerBudgetUnits: 1000,
  },
  release: { mode: 'manual' },
  requirements: {
    mode: 'manual',
    producerRepairLimit: 3,
    repairPlannerBudgetUnits: 1000,
    reviewerBudgetUnits: 1000,
  },
} as const;

interface ApprovalAutomationPolicy {
  design: {
    mode: 'manual' | 'verified-auto';
    producerRepairLimit: number;
    repairPlannerBudgetUnits: number;
    reviewerBudgetUnits: number;
  };
  release: { mode: 'manual' };
  requirements: {
    mode: 'manual' | 'verified-auto';
    producerRepairLimit: number;
    repairPlannerBudgetUnits: number;
    reviewerBudgetUnits: number;
  };
}

const candidateGateDefault: { attestation: AttestationConfig } = {
  attestation: {
    githubOidc: {
      audience: 'https://github.com/nahisaho/musubix5/actions/musubix5-gate',
      issuer: 'https://token.actions.githubusercontent.com',
      keyBinding: 'public-key',
      mode: 'strict',
      repository: 'nahisaho/musubix5',
      workflow: '.github/workflows/candidate-gate.yml',
    },
    maxAgeSeconds: 86_400,
    maxFutureSkewSeconds: 60,
    mode: 'ci-required',
    repository: 'nahisaho/musubix5',
    trustedPublicKeys: [],
  },
};

function boundedInteger(value: unknown, location: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`CONFIG_INVALID: ${location} must be an integer in ${minimum}..${maximum}.`);
  }
  return value;
}

function candidateGatePolicy(value: unknown): { attestation: AttestationConfig } {
  if (value === undefined) return candidateGateDefault;
  if (!isRecord(value)
    || Object.keys(value).some((key) => key !== 'attestation')
    || !isRecord(value.attestation)) {
    throw new Error('CONFIG_INVALID: candidateGate must contain only attestation.');
  }
  const attestation = value.attestation;
  const allowedAttestation = new Set([
    'mode', 'repository', 'maxAgeSeconds', 'maxFutureSkewSeconds', 'trustedPublicKeys', 'githubOidc',
  ]);
  if (Object.keys(attestation).some((key) => !allowedAttestation.has(key))
    || attestation.mode !== 'ci-required'
    || typeof attestation.repository !== 'string'
    || !attestation.repository
    || !Array.isArray(attestation.trustedPublicKeys)
    || attestation.trustedPublicKeys.length !== 0
    || !isRecord(attestation.githubOidc)) {
    throw new Error('CONFIG_INVALID: candidateGate.attestation must define strict CI OIDC policy.');
  }
  const oidc = attestation.githubOidc;
  const allowedOidc = new Set([
    'mode', 'issuer', 'audience', 'repository', 'workflow', 'keyBinding',
  ]);
  if (Object.keys(oidc).some((key) => !allowedOidc.has(key))
    || oidc.mode !== 'strict'
    || oidc.issuer !== 'https://token.actions.githubusercontent.com'
    || typeof oidc.audience !== 'string'
    || !oidc.audience
    || oidc.repository !== attestation.repository
    || typeof oidc.workflow !== 'string'
    || !oidc.workflow.startsWith('.github/workflows/')
    || oidc.keyBinding !== 'public-key') {
    throw new Error('CONFIG_INVALID: candidateGate.attestation.githubOidc is invalid.');
  }
  return {
    attestation: {
      mode: 'ci-required',
      repository: attestation.repository,
      maxAgeSeconds: boundedInteger(
        attestation.maxAgeSeconds,
        'candidateGate.attestation.maxAgeSeconds',
        1,
        604_800,
      ),
      maxFutureSkewSeconds: boundedInteger(
        attestation.maxFutureSkewSeconds,
        'candidateGate.attestation.maxFutureSkewSeconds',
        0,
        600,
      ),
      trustedPublicKeys: [],
      githubOidc: {
        mode: 'strict',
        issuer: 'https://token.actions.githubusercontent.com',
        audience: oidc.audience,
        repository: oidc.repository,
        workflow: oidc.workflow,
        keyBinding: 'public-key',
      },
    },
  };
}

function approvalAutomationPolicy(value: unknown): ApprovalAutomationPolicy {
  if (value === undefined) return approvalAutomationDefault;
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'design,release,requirements'
    || !isRecord(value.design)
    || !isRecord(value.requirements)
    || !isRecord(value.release)
    || value.release.mode !== 'manual'
    || Object.keys(value.release).some((key) => key !== 'mode')) {
    throw new Error('CONFIG_INVALID: approvalAutomation schema is invalid.');
  }
  const boundary = (entry: Record<string, unknown>, location: string) => {
    const allowed = new Set([
      'mode', 'producerRepairLimit', 'repairPlannerBudgetUnits', 'reviewerBudgetUnits',
    ]);
    if (Object.keys(entry).some((key) => !allowed.has(key))
      || !['manual', 'verified-auto'].includes(String(entry.mode))) {
      throw new Error(`CONFIG_INVALID: ${location} schema is invalid.`);
    }
    return {
      mode: entry.mode as 'manual' | 'verified-auto',
      producerRepairLimit: boundedInteger(entry.producerRepairLimit, `${location}.producerRepairLimit`, 1, 100),
      repairPlannerBudgetUnits: boundedInteger(
        entry.repairPlannerBudgetUnits,
        `${location}.repairPlannerBudgetUnits`,
        1,
        1_000_000,
      ),
      reviewerBudgetUnits: boundedInteger(
        entry.reviewerBudgetUnits,
        `${location}.reviewerBudgetUnits`,
        1,
        1_000_000,
      ),
    };
  };
  return {
    design: boundary(value.design, 'approvalAutomation.design'),
    release: { mode: 'manual' },
    requirements: boundary(value.requirements, 'approvalAutomation.requirements'),
  };
}

interface PersistedCandidateGate {
  order: number;
  artifactDigest: string;
  result: CandidateGateJobResult;
  attestation: EvidenceAttestation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCandidateGateJobShape(value: unknown): value is { os: string; nodeMajor: number } {
  return isRecord(value)
    && typeof value.os === 'string'
    && value.os.length > 0
    && Number.isInteger(value.nodeMajor)
    && Number(value.nodeMajor) > 0;
}

function isAcceptedJob(
  value: { os: string; nodeMajor: number },
  acceptedJobs: readonly CandidateGateJob[],
): value is CandidateGateJob {
  return acceptedJobs.some((job) => job.os === value.os && job.nodeMajor === value.nodeMajor);
}

function isCurrentJob(value: CandidateGateJob): value is typeof candidateMatrixJobs[number] {
  return candidateMatrixJobs.some((job) =>
    job.os === value.os && job.nodeMajor === value.nodeMajor);
}

function parseCandidateGateResult(
  value: unknown,
  acceptedJobs: readonly CandidateGateJob[],
  acceptedCommandSets: readonly (readonly string[])[],
  acceptedJobDescription: string,
): CandidateGateJobResult {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.repositoryId !== 'string'
    || !value.repositoryId
    || typeof value.changeId !== 'string'
    || !/^CHANGE-\d+$/.test(value.changeId)
    || !Number.isInteger(value.generation)
    || Number(value.generation) < 1
    || typeof value.candidateCommit !== 'string'
    || !/^[0-9a-f]{40,64}$/.test(value.candidateCommit)
    || typeof value.gateInputFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/i.test(value.gateInputFingerprint)
    || !isCandidateGateJobShape(value.job)
    || value.producer !== 'github-actions'
    || !isRecord(value.runtime)
    || value.runtime.os !== value.job.os
    || value.runtime.nodeMajor !== value.job.nodeMajor
    || typeof value.commandsPassed !== 'boolean'
    || typeof value.preTreeMatchesCandidate !== 'boolean'
    || typeof value.postTreeMatchesCandidate !== 'boolean'
    || !['pass', 'fail'].includes(String(value.status))) {
    throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate result schema is invalid.');
  }
  if (!isAcceptedJob(value.job, acceptedJobs)) {
    throw new Error(
      `RELEASE_GATE_EVIDENCE_STALE: candidate gate ${value.job.os}-node${value.job.nodeMajor} is outside ${acceptedJobDescription}.`,
    );
  }
  if (!Array.isArray(value.commands)
    || value.commands.length === 0
    || value.commands.some((command) => !isRecord(command)
      || typeof command.name !== 'string'
      || !command.name
      || typeof command.digest !== 'string'
      || !/^[0-9a-f]{64}$/i.test(command.digest)
      || !['pass', 'fail'].includes(String(command.status)))
    || new Set(value.commands.map((command) => (command as Record<string, unknown>).name)).size
      !== value.commands.length) {
    throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate command evidence is invalid.');
  }
  const commandNames = value.commands.map((command) => String((command as Record<string, unknown>).name)).sort();
  if (!acceptedCommandSets.some((commands) =>
    commandNames.join('\n') === [...commands].sort().join('\n'))) {
    throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate command set is incomplete.');
  }
  const commandsPass = value.commands.every((command) =>
    (command as Record<string, unknown>).status === 'pass');
  const expectedPass = commandsPass && value.preTreeMatchesCandidate && value.postTreeMatchesCandidate;
  if (value.commandsPassed !== commandsPass || value.status !== (expectedPass ? 'pass' : 'fail')) {
    throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate terminal status is inconsistent.');
  }
  return value as unknown as CandidateGateJobResult;
}

function jobId(job: CandidateGateJobResult['job']): string {
  return `${job.os}-node${job.nodeMajor}`;
}

function sameContext(left: CandidateGateContext, right: CandidateGateContext): boolean {
  return left.repositoryId === right.repositoryId
    && left.changeId === right.changeId
    && left.generation === right.generation
    && left.candidateCommit === right.candidateCommit
    && left.gateInputFingerprint === right.gateInputFingerprint;
}

/** @id CODE-M5-CANDIDATE-GATE-001
 * @implements REQ-M5-RELEASE-002 REQ-M5-CI-001
 * @design DES-M5-019 DES-M5-CI-001
 */
export function validateCandidateGateSet(
  context: CandidateGateContext,
  records: CandidateGateJobResult[],
): { valid: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const current = new Map<string, CandidateGateJobResult>();
  const observed = new Set<string>();
  for (const record of records.filter((entry) => isCurrentJob(entry.job))) {
    const id = jobId(record.job);
    observed.add(id);
    if (!sameContext(context, record)) {
      diagnostics.push(error(
        record.candidateCommit !== context.candidateCommit
          ? 'RELEASE_GATE_CANDIDATE_MISMATCH'
          : 'RELEASE_GATE_EVIDENCE_STALE',
        `Candidate gate ${jobId(record.job)} is bound to another candidate context.`,
      ));
      continue;
    }
    const commandNames = record.commands?.map((command) => command.name).sort();
    if (commandNames
      && commandNames.join('\n') !== [...requiredCandidateGateCommands].sort().join('\n')) {
      diagnostics.push(error(
        'RELEASE_GATE_EVIDENCE_STALE',
        `Candidate gate ${jobId(record.job)} does not contain the current required command set.`,
      ));
      continue;
    }

    if (current.has(id)) {
      diagnostics.push(error('RELEASE_GATE_EVIDENCE_STALE', `Candidate gate ${id} is duplicated.`));
      continue;
    }
    current.set(id, record);
    if (!record.preTreeMatchesCandidate || !record.postTreeMatchesCandidate) {
      diagnostics.push(error('RELEASE_CANDIDATE_TREE_MISMATCH', `Candidate gate ${id} did not preserve the candidate tree.`));
    } else if (record.status !== 'pass' || !record.commandsPassed) {
      diagnostics.push(error('RELEASE_GATE_EVIDENCE_STALE', `Candidate gate ${id} is not passing.`));
    }
  }
  for (const job of candidateMatrixJobs) {
    const id = jobId(job);
    if (!observed.has(id)) {
      diagnostics.push(error('RELEASE_GATE_EVIDENCE_MISSING', `Candidate gate ${id} is missing.`));
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export async function candidateGateFingerprintConfig(root: string): Promise<Record<string, unknown>> {
  const config = await loadConfig(root);
  const path = '.musubix/config.json';
  const raw = JSON.parse(await readText(root, path)) as Record<string, unknown>;
  const materialized = materializeExecutionPolicy(config);
  const {
    language: _language,
    qualityProfile: _qualityProfile,
    approval,
    ...executionConfig
  } = materialized;
  return {
    approval,
    approvalAutomation: approvalAutomationPolicy(raw.approvalAutomation),
    candidateGate: candidateGatePolicy(raw.candidateGate),
    executionPolicy: executionConfig,
  };
}

export async function candidateGateContext(
  root: string,
  changeId: string,
  generation: number,
  expectedCommit?: string,
): Promise<CandidateGateContext> {
  const snapshot = await resolveCandidateSnapshot(root, changeId);
  if (expectedCommit && snapshot.commit !== expectedCommit) {
    throw new Error('RELEASE_GATE_CANDIDATE_MISMATCH: persisted candidate commit changed.');
  }
  const config = await candidateGateFingerprintConfig(root);
  const identity = {
    schemaVersion: 'gate-input-fingerprint-v1',
    repositoryId: snapshot.repositoryId,
    changeId,
    generation,
    candidateCommit: snapshot.commit,
    config,
  };
  return {
    repositoryId: snapshot.repositoryId,
    changeId,
    generation,
    candidateCommit: snapshot.commit,
    gateInputFingerprint: sha256(canonicalBytes(identity)),
  };
}

async function loadPersistedCandidateGates(root: string): Promise<PersistedCandidateGate[]> {
  const records = await verifyJournal(root);
  return records.flatMap((record) => {
    if (record.kind !== 'evidence' || !record.payload || typeof record.payload !== 'object') return [];
    const evidence = record.payload as Record<string, unknown>;
    if (evidence.kind !== 'release' || !evidence.payload || typeof evidence.payload !== 'object') return [];
    const payload = evidence.payload as Record<string, unknown>;
    if (payload.candidateGate !== true) return [];
    if (!isRecord(payload.attestation)
      || typeof payload.artifactDigest !== 'string'
      || !/^[0-9a-f]{64}$/i.test(payload.artifactDigest)) {
      throw new Error('RELEASE_GATE_EVIDENCE_STALE: persisted candidate gate evidence is malformed.');
    }
    return [{
      order: record.order,
      artifactDigest: payload.artifactDigest,
      result: parseCandidateGateResult(
        payload.result,
        persistedCandidateMatrixJobs,
        [legacyCandidateGateCommands, requiredCandidateGateCommands],
        'the supported candidate gate history',
      ),
      attestation: payload.attestation as unknown as EvidenceAttestation,
    }];
  });
}

export async function loadCandidateGateResults(root: string): Promise<CandidateGateJobResult[]> {
  const latest = new Map<string, PersistedCandidateGate>();
  for (const record of await loadPersistedCandidateGates(root)) {
    const id = jobId(record.result.job);
    const current = latest.get(id);
    if (!current || record.order > current.order) latest.set(id, record);
  }
  return [...latest.values()]
    .sort((left, right) => left.order - right.order)
    .map((record) => record.result);
}

export async function ingestCandidateGateEnvelopes(
  root: string,
  envelopes: CandidateGateEnvelope[],
  options: AttestationVerificationOptions = {},
): Promise<CandidateGateJobResult[]> {
  if (envelopes.some((envelope) =>
    !isRecord(envelope)
    || envelope.schemaVersion !== 1
    || !isRecord(envelope.attestation)
    || !isRecord(envelope.attestation.ci)
    || typeof envelope.attestation.ci.provider !== 'string'
    || typeof envelope.attestation.ci.runId !== 'string')) {
    throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate artifact is not attested.');
  }
  const active = await activeChangeContext(root);
  if (!active) {
    throw new Error('CHANGE_GENERATION_INCOMPLETE: candidate gate ingestion requires an active CHANGE generation.');
  }
  const context = await candidateGateContext(root, active.changeId, active.generation);
  const gatePolicy = (await candidateGateFingerprintConfig(root)).candidateGate as {
    attestation: AttestationConfig;
  };
  const persisted = await loadPersistedCandidateGates(root);
  const persistedRuns = new Map<string, string>();
  for (const record of persisted) {
    persistedRuns.set(
      `${record.attestation.ci.provider}:${record.attestation.ci.runId}:${jobId(record.result.job)}`,
      record.artifactDigest,
    );
  }
  const seenRuns = new Map<string, string>();
  const seenJobs = new Set<string>();
  const validated: Array<{
    result: CandidateGateJobResult;
    attestation: EvidenceAttestation;
    artifactDigest: string;
    resultJobId: string;
    existing: PersistedCandidateGate | undefined;
  }> = [];
  for (const envelope of envelopes) {
    const attestation = envelope.attestation!;
    const artifactDigest = sha256(canonicalBytes(envelope.result));
    const result = parseCandidateGateResult(
      envelope.result,
      candidateMatrixJobs,
      [requiredCandidateGateCommands],
      'the current candidate matrix',
    );
    const diagnostics = await verifyDetachedEvidenceAttestation(
      attestation,
      gatePolicy.attestation,
      {
        repository: gatePolicy.attestation.repository
          ?? gatePolicy.attestation.githubOidc?.repository
          ?? '',
        commitSha: context.candidateCommit,
        ci: attestation.ci,
        evidenceHeads: { candidateGate: artifactDigest },
      },
      { ...options, expectedWorkflowSha: context.candidateCommit },
      '.musubix/evidence/release/gates/',
    );
    if (diagnostics.length) {
      throw new Error(`RELEASE_GATE_EVIDENCE_STALE: ${diagnostics[0]!.message}`);
    }
    const resultJobId = jobId(result.job);
    if (seenJobs.has(resultJobId)) {
      throw new Error(`RELEASE_GATE_EVIDENCE_STALE: candidate gate ${resultJobId} is duplicated.`);
    }
    seenJobs.add(resultJobId);
    const runIdentity = `${attestation.ci.provider}:${attestation.ci.runId}:${resultJobId}`;
    const priorDigest = seenRuns.get(runIdentity) ?? persistedRuns.get(runIdentity);
    if (priorDigest && priorDigest !== artifactDigest) {
      throw new Error('RELEASE_GATE_EVIDENCE_STALE: CI run identity was reused for another artifact.');
    }
    seenRuns.set(runIdentity, artifactDigest);
    if (!sameContext(context, result)) {
      throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate context mismatch');
    }
    const existing = persisted.find((record) =>
      record.artifactDigest === artifactDigest
      && jobId(record.result.job) === resultJobId
      && sameContext(record.result, result));
    const latest = persisted
      .filter((record) => jobId(record.result.job) === resultJobId && sameContext(record.result, result))
      .sort((left, right) => left.order - right.order)
      .at(-1);
    if (!existing && latest
      && Date.parse(attestation.issuedAt) <= Date.parse(latest.attestation.issuedAt)) {
      throw new Error('RELEASE_GATE_EVIDENCE_STALE: candidate gate result is not newer than current evidence.');
    }
    validated.push({ result, attestation, artifactDigest, resultJobId, existing });
  }

  const ingested: CandidateGateJobResult[] = [];
  for (const item of validated) {
    const {
      result, attestation, artifactDigest, resultJobId, existing,
    } = item;
    if (existing) {
      ingested.push(existing.result);
      continue;
    }
    await appendEvidence(root, {
      kind: 'release',
      producerId: result.producer,
      repositoryId: result.repositoryId,
      candidateId: `candidate:${result.candidateCommit}`,
      changeId: result.changeId,
      inputDigest: artifactDigest,
      dependencyHeads: { candidateGate: result.gateInputFingerprint },
      status: result.status === 'pass' ? 'pass' : 'failed',
      idempotencyKey: `change:${result.changeId}:g${result.generation}:gate:${result.candidateCommit}:${result.gateInputFingerprint}:${resultJobId}:${artifactDigest}`,
      payload: {
        candidateGate: true,
        artifactDigest,
        attestationDigest: sha256(canonicalBytes(attestation)),
        ci: attestation.ci,
        result,
        attestation,
      },
    });
    await writeJson(root, `.musubix/evidence/release/gates/${resultJobId}.json`, {
      schemaVersion: 1,
      artifactDigest,
      attestationDigest: sha256(canonicalBytes(attestation)),
      ci: attestation.ci,
      result,
    });
    ingested.push(result);
  }
  return ingested;
}

export async function requireCandidateGateSet(
  root: string,
  changeId: string,
  generation: number,
  candidateCommit: string,
): Promise<CandidateGateContext> {
  const records = await loadCandidateGateResults(root);
  if (!records.length) {
    throw new Error('RELEASE_GATE_EVIDENCE_MISSING: candidate matrix gate evidence is missing.');
  }
  const context = await candidateGateContext(root, changeId, generation, candidateCommit);
  const validation = validateCandidateGateSet(context, records);
  if (!validation.valid) {
    const first = validation.diagnostics[0]!;
    throw new Error(`${first.code}: ${first.message}`);
  }
  return context;
}
