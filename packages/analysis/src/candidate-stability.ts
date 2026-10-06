import { canonicalBytes, sha256 } from './canonical.js';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { verifyDetachedEvidenceAttestation, type EvidenceAttestation } from './attestation.js';
import type { AttestationConfig } from './config.js';
import { appendEvidence } from './evidence-registry.js';
import { candidateCalibrationDigest, verifyCandidateCalibrationSourceFinal, loadApprovedCandidateCalibration,
  candidateRegionsWithApiTiming } from './candidate-calibration.js';
import { candidateExecutionPlanDigest, loadCandidateExecutionPlan } from './candidate-execution-plan.js';
import { verifyCandidateLfsClosureManifest } from './candidate-portability.js';
import { runProcess } from './process.js';
import { LINUX_DELIVERY_PROFILE, validateSingleUbuntuRunInventory } from './candidate-delivery-profile.js';

export interface GitHubCandidateRun {
  id: number; workflow_id: number; path: string; head_sha: string; run_attempt: number;
  event: string; status: string; conclusion: string; created_at: string;
}
export interface CandidateStabilityContext {
  repository: string; candidateCommit: string; generation: number; repositoryId: string;
  planDigest: string; calibrationDigest: string; gateInputFingerprint: string;
  authoritativeGateDigest: string; calibrationRunId: number; calibrationSourceCommit: string;
}
export interface CandidateStabilityGateState {
  candidate: Pick<CandidateStabilityContext, 'repositoryId' | 'generation' | 'candidateCommit' | 'gateInputFingerprint'>;
  fingerprint: Record<string, unknown>;
  results: unknown[];
}
type ApiObject = Record<string, unknown>;
export interface CandidateStabilityOptions {
  token: string;
  fetch?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  verifyEnvelope(runId: number, artifact: ApiObject, binding: ApiObject): Promise<unknown>;
  verifySourceFinal?(source: string, final: string): Promise<void>;
}
export interface CandidateRunTiming { os: string; jobId: number; artifactId: number; startedAt: string; createdAt: string; durationMs: number }
export interface CandidateStabilityEvidence {
  schemaVersion: 2; deliveryProfile: 'linux-only-v1'; context: CandidateStabilityContext; runIds: [number, number];
  workflow: ApiObject; adjacencyCursor: number[]; apiDigest: string; envelopeDigest: string;
  projections: unknown[]; envelopes: unknown[]; verifiedAt: string;
}
const candidatePath = '.github/workflows/candidate-gate.yml';
const calibrationPath = '.github/workflows/candidate-calibration.yml';
const platforms = ['ubuntu'];
function fail(reason: string): never { throw new Error(`LINUX_DELIVERY_EVIDENCE_INVALID: ${reason}`); }
function object(value: unknown): ApiObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('API schema');
  return value as ApiObject;
}
function digest(value: unknown) { return sha256(canonicalBytes(value)); }
function base(repository: string) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository');
  return `https://api.github.com/repos/${repository}/actions`;
}
async function request(repository: string, path: string, options: CandidateStabilityOptions): Promise<ApiObject> {
  if (!options.token) fail('API token unavailable');
  const response = await (options.fetch ?? fetch)(`${base(repository)}${path}`, {
    headers: { authorization: `Bearer ${options.token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`API response ${response.status}`);
  return object(await response.json());
}
async function list(repository: string, path: string, key: string, options: CandidateStabilityOptions): Promise<ApiObject[]> {
  const values: ApiObject[] = [];
  for (let page = 1; page <= 10_000; page++) {
    const value = await request(repository, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, options);
    if (!Array.isArray(value[key])) fail('API pagination');
    const items = (value[key] as unknown[]).map(object);
    values.push(...items);
    if (items.length < 100) return values;
  }
  return fail('API pagination limit');
}
export const fetchCandidateRun = (repository: string, id: number, options: CandidateStabilityOptions) =>
  request(repository, `/runs/${id}`, options);
export const fetchCandidateRunAttempt = (repository: string, id: number, options: CandidateStabilityOptions) =>
  request(repository, `/runs/${id}/attempts/1`, options);
export const fetchCandidateJobs = (repository: string, id: number, options: CandidateStabilityOptions) =>
  list(repository, `/runs/${id}/attempts/1/jobs`, 'jobs', options);
export const fetchCandidateArtifacts = (repository: string, id: number, options: CandidateStabilityOptions) =>
  list(repository, `/runs/${id}/artifacts`, 'artifacts', options);

/** @id CODE-M5-CI-STABILITY-TIMING-001
 * @implements REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-005
 */
export function verifyCandidateRunTiming(
  jobs: ApiObject[],
  artifacts: ApiObject[],
  mode: 'candidate' | 'calibration',
  runId: number,
): CandidateRunTiming[] {
  validateSingleUbuntuRunInventory(jobs, artifacts, mode, runId);
  return platforms.map((os) => {
    const matchingJobs = jobs.filter((job) => job.name === `${os}-node24`);
    const matchingArtifacts = artifacts.filter((artifact) => artifact.name === `candidate-${mode === 'candidate' ? 'gate' : 'calibration'}-${os}-node24`);
    if (matchingJobs.length !== 1 || matchingArtifacts.length !== 1) fail(`missing or duplicate platform ${os}`);
    const job = matchingJobs[0]!, artifact = matchingArtifacts[0]!;
    if (job.status !== 'completed' || job.conclusion !== 'success' || artifact.expired !== false
      || !Number.isSafeInteger(job.id) || !Number.isSafeInteger(artifact.id)) fail(`unsuccessful platform ${os}`);
    const startedAt = String(job.started_at), createdAt = String(artifact.created_at);
    const durationMs = Date.parse(createdAt) - Date.parse(startedAt);
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > (mode === 'candidate' ? 1_200_000 : 2_100_000)) fail(`duration ${os}`);
    return { os, jobId: job.id as number, artifactId: artifact.id as number, startedAt, createdAt, durationMs };
  });
}
function validateRun(run: ApiObject, id: number, workflow: ApiObject, sha: string) {
  if (run.id !== id || run.workflow_id !== workflow.id || String(run.path).split('@')[0] !== workflow.path
    || run.head_sha !== sha || run.run_attempt !== 1 || run.event !== 'workflow_dispatch'
    || run.status !== 'completed' || run.conclusion !== 'success') fail(`run ${id} context or first attempt`);
}

/** @id CODE-M5-CI-STABILITY-PROOF-001
 * @implements REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-005
 */
export async function verifyCandidateStabilityPair(
  first: number, second: number, context: CandidateStabilityContext, options: CandidateStabilityOptions,
): Promise<CandidateStabilityEvidence> {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first <= 0 || second <= 0
    || first === second || [first, second].includes(context.calibrationRunId)) fail('two distinct candidate runs');
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(context.candidateCommit)
    || !Number.isSafeInteger(context.generation) || context.generation < 1 || !context.repositoryId
    || !Number.isSafeInteger(context.calibrationRunId) || context.calibrationRunId <= 0
    || ['planDigest', 'calibrationDigest', 'gateInputFingerprint', 'authoritativeGateDigest'].some((key) =>
      !/^[a-f0-9]{64}$/.test(context[key as 'planDigest']))) fail('context');
  const workflow = await request(context.repository, '/workflows/candidate-gate.yml', options);
  if (workflow.path !== candidatePath || !Number.isSafeInteger(workflow.id)) fail('workflow path identity');
  const sequence = await list(context.repository,
    `/workflows/candidate-gate.yml/runs?event=workflow_dispatch&head_sha=${context.candidateCommit}`, 'workflow_runs', options);
  if (sequence.some((run) => run.workflow_id !== workflow.id || run.head_sha !== context.candidateCommit
    || run.event !== 'workflow_dispatch' || String(run.path).split('@')[0] !== candidatePath)
    || new Set(sequence.map((run) => run.id)).size !== sequence.length) fail('candidate sequence context');
  const times = sequence.map((run) => Date.parse(String(run.created_at)));
  if (times.some((time) => !Number.isFinite(time))
    || !(times.every((time, i) => !i || time >= times[i - 1]!) || times.every((time, i) => !i || time <= times[i - 1]!))) fail('adjacency creation order');
  const ordered = [...sequence].sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at))
    || Number(a.id) - Number(b.id));
  const index = ordered.findIndex((run) => run.id === first);
  if (index < 0 || ordered[index + 1]?.id !== second) fail('adjacency');
  const projections: unknown[] = [workflow, sequence], envelopes: unknown[] = [];
  for (const id of [first, second, context.calibrationRunId]) {
    const calibration = id === context.calibrationRunId;
    const runWorkflow = calibration ? await request(context.repository, '/workflows/candidate-calibration.yml', options) : workflow;
    if (runWorkflow.path !== (calibration ? calibrationPath : candidatePath)) fail('calibration workflow identity');
    const [run, attempt, jobs, artifacts] = await Promise.all([
      fetchCandidateRun(context.repository, id, options), fetchCandidateRunAttempt(context.repository, id, options),
      fetchCandidateJobs(context.repository, id, options), fetchCandidateArtifacts(context.repository, id, options),
    ]);
    const source = calibration ? context.calibrationSourceCommit : context.candidateCommit;
    validateRun(run, id, runWorkflow, source);
    validateRun(attempt, id, runWorkflow, source);
    const timing = verifyCandidateRunTiming(jobs, artifacts, calibration ? 'calibration' : 'candidate', id);
    projections.push({ workflow: runWorkflow, run, attempt, jobs, artifacts, timing });
    for (const artifact of artifacts) {
      const os = platforms.find((os) => String(artifact.name).includes(`-${os}-node24`))!;
      const binding = { ...context, runId: id, runAttempt: 1, os, nodeMajor: 24,
        mode: calibration ? 'calibration' : 'candidate', noCredit: calibration, candidateCommit: source,
        timing: timing.find((item) => item.os === os), workflowPath: runWorkflow.path,
        apiJob: jobs.find(job => job.name === `${os}-node24`) };
      const envelope = await options.verifyEnvelope(id, artifact, binding);
      if (!envelope) fail('OIDC envelope verification');
      envelopes.push(envelope);
    }
  }
  if (context.calibrationSourceCommit !== context.candidateCommit) {
    if (!options.verifySourceFinal) fail('source/final verification unavailable');
    await options.verifySourceFinal(context.calibrationSourceCommit, context.candidateCommit);
  }
  return { schemaVersion: 2, deliveryProfile: LINUX_DELIVERY_PROFILE.profile,
    context: structuredClone(context), runIds: [first, second],
    workflow, adjacencyCursor: ordered.map((run) => Number(run.id)), apiDigest: digest(projections),
    envelopeDigest: digest(envelopes), projections, envelopes, verifiedAt: new Date().toISOString() };
}

export async function revalidateCandidateStability(evidence: CandidateStabilityEvidence, context: CandidateStabilityContext, options: CandidateStabilityOptions) {
  if (evidence.schemaVersion !== 2 || evidence.deliveryProfile !== LINUX_DELIVERY_PROFILE.profile
    || digest(evidence.context) !== digest(context)
    || evidence.apiDigest !== digest(evidence.projections) || evidence.envelopeDigest !== digest(evidence.envelopes)) fail('stale evidence');
  const current = await verifyCandidateStabilityPair(...evidence.runIds, context, options);
  if (current.apiDigest !== evidence.apiDigest || current.envelopeDigest !== evidence.envelopeDigest
    || digest(current.adjacencyCursor) !== digest(evidence.adjacencyCursor)) fail('stale API or envelopes');
  return current;
}

export async function recordCandidateStability(root: string, evidence: CandidateStabilityEvidence): Promise<void> {
  const { activeChangeContext } = await import('./change-generation.js');
  const active = await activeChangeContext(root);
  if (!active || active.generation !== evidence.context.generation) fail('active generation');
  await appendEvidence(root, {
    kind: 'candidate-gate-stability', producerId: 'github-actions',
    repositoryId: evidence.context.repositoryId, candidateId: `candidate:${evidence.context.candidateCommit}`,
    changeId: active.changeId,
    inputDigest: digest(evidence), status: 'pass',
    idempotencyKey: `stability:${digest(evidence)}`,
    dependencyHeads: { candidateGate: evidence.context.authoritativeGateDigest },
    payload: evidence,
  });
  const path = join(root, '.musubix/evidence/candidate-gate-stability.json');
  await mkdir(dirname(path), { recursive: true });
  const staging = `${path}.${process.pid}.new`;
  await writeFile(staging, canonicalBytes(evidence), { flag: 'wx', mode: 0o600 });
  await rename(staging, path);
}
export async function loadCandidateStability(root: string): Promise<CandidateStabilityEvidence> {
  return JSON.parse(await readFile(join(root, '.musubix/evidence/candidate-gate-stability.json'), 'utf8')) as CandidateStabilityEvidence;
}

export async function requireCandidateStability(root: string, candidate: {
  repositoryId: string; generation: number; candidateCommit: string; gateInputFingerprint: string;
}, gateState: CandidateStabilityGateState): Promise<void> {
  const saved = await loadCandidateStability(root);
  const { loadCandidateExecutionPlan } = await import('./candidate-execution-plan.js');
  const { loadApprovedCandidateCalibration } = await import('./candidate-calibration.js');
  const { plan } = await loadCandidateExecutionPlan(root);
  const { manifest } = await loadApprovedCandidateCalibration(root, plan);
  const context = { ...saved.context, ...candidate, planDigest: candidateExecutionPlanDigest(plan),
    calibrationDigest: candidateCalibrationDigest(manifest), calibrationRunId: Number(manifest.runId),
    calibrationSourceCommit: manifest.sourceCommit, authoritativeGateDigest: digest(gateState.results) };
  await revalidateCandidateStability(saved, context,
    await createGitHubCandidateStabilityOptions(root, context, process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '', gateState));
}

export function decodeCandidateStabilityArtifact(bytes: Buffer, mode: 'candidate' | 'calibration'): ApiObject {
  if (bytes.length > 16_000_000 || bytes.length < 22) fail('artifact size');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50
    || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
    || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0
    || bytes.readUInt16LE(end + 8) !== 1 || bytes.readUInt16LE(end + 10) !== 1) fail('artifact inventory');
  const central = bytes.readUInt32LE(end + 16);
  if (central + 46 > end || bytes.readUInt32LE(central) !== 0x02014b50) fail('artifact ZIP');
  const compressed = bytes.readUInt32LE(central + 20), size = bytes.readUInt32LE(central + 24);
  const local = bytes.readUInt32LE(central + 42), nameLength = bytes.readUInt16LE(central + 28);
  const name = bytes.subarray(central + 46, central + 46 + nameLength).toString('utf8');
  if (name !== `candidate-${mode === 'candidate' ? 'gate' : 'calibration'}-envelope.json` || size > 8_000_000
    || central + 46 + nameLength > end
    || local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50
    || bytes.readUInt16LE(local + 6) & 1) fail('artifact file');
  const offset = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  if (offset + compressed > central || bytes.readUInt16LE(local + 8) !== bytes.readUInt16LE(central + 10)
    || bytes.subarray(local + 30, local + 30 + bytes.readUInt16LE(local + 26)).toString('utf8') !== name) fail('artifact ZIP bounds');
  const method = bytes.readUInt16LE(local + 8), payload = bytes.subarray(offset, offset + compressed);
  const decoded = method === 8 ? inflateRawSync(payload, { maxOutputLength: 8_000_000 }) : method === 0 ? payload : fail('artifact compression');
  if (decoded.length !== size) fail('artifact decoded size');
  let crc = 0xffffffff;
  for (const byte of decoded) {
    crc ^= byte;
    for (let bit = 0; bit < 8; ++bit) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32LE(central + 16)
    || !(bytes.readUInt16LE(local + 6) & 8) && bytes.readUInt32LE(local + 14) !== bytes.readUInt32LE(central + 16)) fail('artifact checksum');
  return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded)));
}

/** @id CODE-M5-CI-GITHUB-REST-STABILITY-001
 * @implements REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-005
 */
export async function createGitHubCandidateStabilityOptions(root: string, context: CandidateStabilityContext, token: string, gateState: CandidateStabilityGateState): Promise<CandidateStabilityOptions> {
  const { activeChangeContext } = await import('./change-generation.js');
  const active = await activeChangeContext(root);
  if (!active || active.generation !== context.generation) fail('active generation');
  const current = gateState.candidate;
  if (current.repositoryId !== context.repositoryId || current.gateInputFingerprint !== context.gateInputFingerprint
    || current.candidateCommit !== context.candidateCommit || current.generation !== context.generation) fail('active candidate context');
  const projection = gateState.fingerprint;
  if (context.authoritativeGateDigest !== digest(gateState.results)) fail('authoritative gate evidence changed');
  const policy = (projection.candidateGate as { attestation: AttestationConfig }).attestation;
  if (policy.repository !== context.repository) fail('repository policy');
  const calibration = JSON.parse(await readFile(join(root, '.musubix/candidate-timeout-calibration.json'), 'utf8'));
  const { plan } = await loadCandidateExecutionPlan(root);
  const { budgets, manifest } = await loadApprovedCandidateCalibration(root, plan);
  if (candidateCalibrationDigest(manifest) !== context.calibrationDigest
    || candidateExecutionPlanDigest(plan) !== context.planDigest || Number(manifest.runId) !== context.calibrationRunId
    || manifest.sourceCommit !== context.calibrationSourceCommit) fail('approved calibration context');
  const sourcePlanResult = await runProcess('git', ['show', `${context.calibrationSourceCommit}:.musubix/candidate-execution-plan.json`], { cwd: root, timeoutMs: 10_000 });
  if (sourcePlanResult.status !== 'completed' || sourcePlanResult.exitCode !== 0) fail('calibration source plan unavailable');
  const sourcePlanDigest = candidateExecutionPlanDigest(JSON.parse(sourcePlanResult.stdout));
  return {
    token,
    verifySourceFinal: async (_source, final) => verifyCandidateCalibrationSourceFinal(root, calibration.manifest, final),
    verifyEnvelope: async (runId, artifact, binding) => {
      const response = await fetch(`${base(context.repository)}/artifacts/${artifact.id}/zip`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) fail('artifact download');
      const mode = binding.mode as 'candidate' | 'calibration';
      const envelope = decodeCandidateStabilityArtifact(Buffer.from(await response.arrayBuffer()), mode);
      const result = object(envelope.result), attestation = object(envelope.attestation) as unknown as EvidenceAttestation;
      const calibrationMode = mode === 'calibration';
      const timing = object(binding.timing), execution = object(result.execution);
      const apiJob = object(binding.apiJob);
      const regions = candidateRegionsWithApiTiming(result, apiJob);
      if (calibrationMode) {
        const observation = calibration.observations.find((value: { os: string }) => value.os === binding.os);
        const approvedJob = calibration.apiTiming.find((value: { name: string }) => value.name === `${binding.os}-node24`);
        if (!observation || digest(observation.regions) !== digest(regions) || !approvedJob
          || digest(approvedJob) !== digest(apiJob)) fail('approved observations or Jobs API timing changed');
      } else {
        if (Object.keys(regions).sort().join() !== Object.keys(budgets.timeouts).sort().join()
          || Object.entries(regions).some(([name, region]) => region.durationMs > budgets.timeouts[name]!)) fail('calibrated region deadline exceeded');
      }
      const jobTiming = object(result.jobTiming);
      if (digest(jobTiming) !== result.jobTimingDigest || jobTiming.jobId !== timing.jobId
        || jobTiming.runId !== String(runId) || jobTiming.runAttempt !== 1
        || jobTiming.name !== `${binding.os}-node24` || jobTiming.startedAt !== timing.startedAt
        || !Number.isSafeInteger(jobTiming.observedAt) || Number(jobTiming.observedAt) < Date.parse(String(timing.startedAt))) fail('authoritative job timing projection');
      if (envelope.schemaVersion !== 2 || result.schemaVersion !== 2
        || result.deliveryProfile !== LINUX_DELIVERY_PROFILE.profile
        || result.status !== 'pass' || result.producer !== 'github-actions'
        || result.commandsPassed !== true || result.preTreeMatchesCandidate !== true || result.postTreeMatchesCandidate !== true
        || result.repositoryId !== context.repositoryId || result.generation !== context.generation
        || result.candidateCommit !== binding.candidateCommit || result.runId !== String(runId) || result.runAttempt !== 1
        || result.mode !== mode || result.noCredit !== calibrationMode || object(result.job).os !== binding.os
        || object(result.job).nodeMajor !== 24 || result.planDigest !== (calibrationMode ? sourcePlanDigest : context.planDigest)
        || !calibrationMode && (result.calibrationDigest !== context.calibrationDigest || result.gateInputFingerprint !== context.gateInputFingerprint)
        || execution.jobStartedAt !== Date.parse(String(timing.startedAt))
        || !Number.isSafeInteger(result.preSigningElapsedMs) || Number(result.preSigningElapsedMs) < 0
        || Date.parse(String(result.preSigningCompletedAt)) - Number(execution.jobStartedAt) !== result.preSigningElapsedMs
        || Date.parse(String(result.preSigningCompletedAt)) > Date.parse(String(timing.createdAt))) fail('signed envelope binding');
      if (!Array.isArray(result.commands) || result.commands.length !== 7
        || result.commands.some(command => object(command).status !== 'pass')) fail('signed command set');
      const manifest = object(result.lfsClosureManifest);
      verifyCandidateLfsClosureManifest(manifest, {
        nonce: String(manifest.nonce), runId: String(runId), runAttempt: 1, repositoryId: context.repositoryId,
        candidateCommit: String(binding.candidateCommit), jobTimingDigest: String(result.jobTimingDigest),
        scriptDigest: String(manifest.scriptDigest), configDigest: String(manifest.configDigest), digest: String(result.lfsManifestDigest),
      });
      const diagnostics = await verifyDetachedEvidenceAttestation(attestation, {
        ...policy, githubOidc: { ...policy.githubOidc!, workflow: String(binding.workflowPath) },
      }, {
        repository: context.repository, commitSha: String(binding.candidateCommit), ci: { provider: 'github', runId: String(runId) },
        evidenceHeads: { candidateGate: digest(result) },
      }, { expectedWorkflowSha: String(binding.candidateCommit) });
      if (diagnostics.length) fail(`OIDC envelope: ${diagnostics[0]!.code}`);
      if (calibrationMode && !calibration.manifest.envelopeDigests.includes(digest(envelope))) fail('approved calibration envelope changed');
      return envelope;
    },
  };
}
