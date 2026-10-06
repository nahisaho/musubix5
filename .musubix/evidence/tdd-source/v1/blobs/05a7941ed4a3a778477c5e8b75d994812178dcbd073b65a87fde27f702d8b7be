import { canonicalBytes, sha256 } from './canonical.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateExecutionPolicyProjection, calibrateCandidateTimeouts, type CandidateExecutionPlan } from './candidate-execution-plan.js';
import { runProcess, type Runner } from './process.js';
import type { CandidateCompletedRegion } from './candidate-execution-plan.js';

export interface CandidateCalibrationManifest {
  schemaVersion: 1; mode: 'calibration'; noCredit: true; runId: string; runAttempt: 1;
  sourceCommit: string; sourceTree: string; policyDigest: string; observationsDigest: string;
  apiTimingDigest: string; envelopeDigests: string[];
  approval: { artifactSha256: string; approver: string; approved: true };
}
export interface CandidateCalibrationContext {
  sourceCommit: string; sourceTree: string; policyDigest: string; observationsDigest: string;
  apiTimingDigest: string; approvalSha256: string;
}
function fail(reason: string): never { throw new Error(`CANDIDATE_CALIBRATION_INVALID: ${reason}`); }
export const candidateCalibrationDigest = (value: unknown) => sha256(canonicalBytes(value));

export function candidateRegionsWithApiTiming(result: Record<string, unknown>, job: Record<string, unknown>): Record<string, CandidateCompletedRegion> {
  if (!result.regions || typeof result.regions !== 'object' || Array.isArray(result.regions)
    || !Array.isArray(job.steps)) fail('completed region observations unavailable');
  const regions = structuredClone(result.regions) as Record<string, CandidateCompletedRegion>;
  for (const [name, pattern] of [
    ['bootstrap', /^Bootstrap exact /], ['preparation', /^Prepare (?:source|candidate) within absolute deadline$/],
    ['signing', /^Independently sign /], ['upload', /^Upload .*envelope$|^Upload no-credit signed diagnostic$/],
  ] as const) {
    const matching = job.steps.filter(step => step && typeof step === 'object' && pattern.test(String(step.name)));
    if (matching.length !== 1) fail(`authoritative ${name} step`);
    const step = matching[0], start = Date.parse(step.started_at), end = Date.parse(step.completed_at);
    if (step.status !== 'completed' || step.conclusion !== 'success' || !Number.isFinite(start)
      || !Number.isFinite(end) || end < start) fail(`incomplete ${name} step`);
    regions[name] = { durationMs: end - start, status: 'completed', exitCode: 0, reportComplete: true, acknowledgmentComplete: true };
  }
  return regions;
}

/** @id CODE-M5-CI-CALIBRATION-MANIFEST-001
 * @implements REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-004
 */
export function validateCandidateCalibrationManifest(value: unknown, context: CandidateCalibrationContext): CandidateCalibrationManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema');
  const manifest = value as CandidateCalibrationManifest;
  const keys = ['schemaVersion', 'mode', 'noCredit', 'runId', 'runAttempt', 'sourceCommit', 'sourceTree',
    'policyDigest', 'observationsDigest', 'apiTimingDigest', 'envelopeDigests', 'approval'];
  if (Object.keys(manifest).sort().join() !== keys.sort().join() || manifest.schemaVersion !== 1
    || manifest.mode !== 'calibration' || manifest.noCredit !== true || manifest.runAttempt !== 1
    || !/^[1-9][0-9]*$/.test(manifest.runId)) fail('first-attempt diagnostic mode');
  for (const key of ['sourceCommit', 'sourceTree', 'policyDigest', 'observationsDigest', 'apiTimingDigest'] as const) {
    const pattern = key === 'sourceCommit' || key === 'sourceTree' ? /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/ : /^[a-f0-9]{64}$/;
    if (manifest[key] !== context[key] || !pattern.test(manifest[key])) fail(key);
  }
  if (!manifest.approval || Object.keys(manifest.approval).sort().join() !== ['artifactSha256', 'approver', 'approved'].sort().join()
    || manifest.approval.approved !== true || !manifest.approval.approver
    || !/^[a-f0-9]{64}$/.test(context.approvalSha256) || manifest.approval.artifactSha256 !== context.approvalSha256
    || !Array.isArray(manifest.envelopeDigests) || manifest.envelopeDigests.length !== 3
    || new Set(manifest.envelopeDigests).size !== 3 || manifest.envelopeDigests.some((digest) => !/^[a-f0-9]{64}$/.test(digest))) fail('approval or envelope inventory');
  return structuredClone(manifest);
}

/** @id CODE-M5-CI-ABSOLUTE-DEADLINE-001
 * @implements REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-004
 */
export function validateCandidateDeadline(input: {
  mode: 'candidate' | 'calibration'; jobStartedAt: number; now: number; signingReserveMs: number;
}) {
  if (!['candidate', 'calibration'].includes(input.mode) || !Number.isSafeInteger(input.jobStartedAt)
    || !Number.isSafeInteger(input.now) || input.now < input.jobStartedAt
    || input.signingReserveMs !== 120_000) fail('job timing');
  const jobBudgetMs = input.mode === 'candidate' ? 1_200_000 : 2_100_000;
  if (input.jobStartedAt > Number.MAX_SAFE_INTEGER - jobBudgetMs) fail('job timing');
  const deadline = input.jobStartedAt + jobBudgetMs;
  const remaining = deadline - input.now - input.signingReserveMs;
  if (remaining <= 0) fail('absolute deadline expired');
  return { artifactDeadline: deadline, gateDeadline: deadline - input.signingReserveMs,
    gateRemainingMs: Math.min(remaining, input.mode === 'candidate' ? 840_000 : 1_665_000) };
}

export async function loadApprovedCandidateCalibration(root: string, plan: CandidateExecutionPlan) {
  const record = JSON.parse(await readFile(join(root, '.musubix/candidate-timeout-calibration.json'), 'utf8'));
  const policyDigest = candidateCalibrationDigest(candidateExecutionPolicyProjection(plan));
  const observationsDigest = candidateCalibrationDigest(record.observations);
  const approval = record.approval;
  const approvedAt = typeof approval?.approvedAt === 'string' ? Date.parse(approval.approvedAt) : Number.NaN;
  const approvalArtifact = { sourceCommit: record.sourceCommit, sourceTree: record.sourceTree, policyDigest,
    observationsDigest, apiTimingDigest: candidateCalibrationDigest(record.apiTiming), envelopeDigests: record.manifest.envelopeDigests };
  if (!approval || approval.phase !== 'candidate-calibration' || approval.approved !== true
    || typeof approval.approver !== 'string' || !approval.approver || approval.approver.trim() !== approval.approver
    || approval.approver !== record.manifest.approval.approver
    || !Number.isFinite(approvedAt) || approvedAt > Date.now() + 120_000
    || approval.artifactSha256 !== candidateCalibrationDigest(approvalArtifact)) fail('explicit calibration approval');
  const manifest = validateCandidateCalibrationManifest(record.manifest, {
    sourceCommit: record.sourceCommit, sourceTree: record.sourceTree, policyDigest, observationsDigest,
    apiTimingDigest: candidateCalibrationDigest(record.apiTiming), approvalSha256: approval.artifactSha256,
  });
  if (candidateCalibrationDigest(manifest) !== plan.calibrationDigest) fail('plan calibration digest');
  const budgets = calibrateCandidateTimeouts(record.observations);
  for (const command of plan.commands) {
    if (command.timeoutMs !== budgets.timeouts[command.name]) fail('command timeout');
    if (command.partitions.length) {
      if (command.mergeAllowanceMs !== budgets.timeouts[`merge:${command.name}:merge`]
        || command.terminationAllowanceMs !== budgets.timeouts[`termination:${command.name}:termination`]) fail('merge/termination timeout');
      for (const partition of command.partitions) {
        if (partition.timeoutMs !== budgets.timeouts[`partition:${command.name}:${partition.id}`]
          || !budgets.timeouts[`wave:${command.name}:wave-${partition.wave}`]) fail('partition/wave timeout');
      }
    }
  }
  if (plan.formalTimeoutMs !== budgets.timeouts.formal) fail('formal timeout');
  return { manifest, budgets };
}

/** @id CODE-M5-CI-CALIBRATION-SOURCE-FINAL-001
 * @implements REQ-M5-CI-EFFICIENCY-005 REQ-M5-CI-EFFICIENCY-006
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-005
 */
export async function verifyCandidateCalibrationSourceFinal(
  root: string, manifest: CandidateCalibrationManifest, finalCommit: string, runner: Runner = runProcess,
) {
  const git = async (args: string[]) => {
    const result = await runner('git', args, { cwd: root, timeoutMs: 10_000 });
    if (result.status !== 'completed' || result.exitCode !== 0) fail('source/final Git unavailable');
    return result.stdout;
  };
  const sourceTree = (await git(['rev-parse', '--verify', `${manifest.sourceCommit}^{tree}`])).trim();
  if (sourceTree !== manifest.sourceTree) fail('source tree');
  const parents = (await git(['rev-list', '--parents', '-n', '1', finalCommit])).trim().split(/\s+/);
  if (finalCommit === manifest.sourceCommit || parents.length !== 2
    || parents[0] !== finalCommit || parents[1] !== manifest.sourceCommit) fail('final candidate requires one direct source parent');
  const changes = (await git(['diff-tree', '--no-commit-id', '--name-only', '-r', manifest.sourceCommit, finalCommit])).trim().split('\n').filter(Boolean);
  const allowed = ['.musubix/config.json', '.musubix/candidate-execution-plan.json', '.musubix/candidate-timeout-calibration.json'];
  if (changes.some(path => !allowed.includes(path))) fail('source/final changed execution shape');
  for (const path of changes.filter(path => path !== '.musubix/candidate-timeout-calibration.json')) {
    const source = JSON.parse(await git(['show', `${manifest.sourceCommit}:${path}`]));
    const final = JSON.parse(await git(['show', `${finalCommit}:${path}`]));
    const projection = (value: Record<string, unknown>) => {
      if (path.endsWith('candidate-execution-plan.json')) return candidateExecutionPolicyProjection(value as unknown as CandidateExecutionPlan);
      const copy = structuredClone(value);
      for (const command of copy.commands as Array<Record<string, unknown>>) delete command.timeoutMs;
      if (copy.formal && typeof copy.formal === 'object') delete (copy.formal as Record<string, unknown>).timeoutMs;
      return copy;
    };
    if (candidateCalibrationDigest(projection(source)) !== candidateCalibrationDigest(projection(final))) fail('source/final semantic projection');
  }
}
