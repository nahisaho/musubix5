/** @id CODE-M5-CI-CANDIDATE-RUNNER-FALLBACK-001
 * @implements REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
import { createHash } from 'node:crypto';
import { constants, closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function writeCandidateGateRunnerFailure(cause, env = process.env) {
  if (!['runner-import-failure', 'runner-startup-failure', 'runner-processing-failure'].includes(cause)) {
    throw new Error('GATE_RUNNER_UNAVAILABLE: invalid fallback cause.');
  }
  const directory = env.RUNNER_TEMP;
  if (!directory) throw new Error('GATE_RUNNER_UNAVAILABLE: missing runner temporary directory.');
  mkdirSync(directory, { recursive: true });
  const emptyDigest = createHash('sha256').update('').digest('hex');
  const identifier = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
  const generation = Number(env.GENERATION);
  const job = {
    os: identifier(env.MATRIX_OS, /^(?:ubuntu|windows|macos)$/),
    nodeMajor: Number(env.MATRIX_NODE) === 24 ? 24 : null,
  };
  const result = {
    schemaVersion: 1,
    repositoryId: identifier(env.REPOSITORY_ID, /^repository:[a-f0-9]{64}$/),
    changeId: identifier(env.CHANGE_ID, /^CHANGE-\d+$/),
    generation: Number.isSafeInteger(generation) && generation > 0 ? generation : null,
    candidateCommit: identifier(env.CANDIDATE_COMMIT, /^[a-f0-9]{40}$/),
    gateInputFingerprint: identifier(env.GATE_INPUT_FINGERPRINT, /^[a-f0-9]{64}$/),
    job, producer: 'github-actions', runtime: job,
    status: 'fail', commands: [], commandsPassed: false,
    preTreeMatchesCandidate: false, postTreeMatchesCandidate: false,
    gateReportDigest: emptyDigest, stdoutSha256: emptyDigest, stderrSha256: emptyDigest,
    exitCode: null, signal: null, timedOut: false, drainTruncated: false,
    tailsDropped: false, resultTextDropped: false, matchedCauses: [cause],
    childErrorMessage: null,
    originalDomainCode: cause === 'runner-processing-failure' ? 'GATE_RUNNER_PROCESSING_FAILED' : 'GATE_RUNNER_UNAVAILABLE',
    originalDomainMessage: cause === 'runner-import-failure'
      ? 'Candidate gate runner module unavailable.' : cause === 'runner-startup-failure'
        ? 'Candidate gate runner unavailable.' : 'Candidate gate runner processing failed.',
    error: { code: 'CANDIDATE_GATE_REPORT_INVALID', case: cause },
  };
  process.exitCode = 1;
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Candidate gate fallback persistence failed.');
  const staging = mkdtempSync(join(directory, '.candidate-fallback-'));
  const paths = [join(directory, 'candidate-gate-result.json'), join(directory, 'candidate-gate-envelope.json')];
  try {
    for (const [index, data] of [result, { schemaVersion: 1, result, attestation: null }].entries()) {
      const path = join(staging, String(index));
      const file = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      try { writeFileSync(file, JSON.stringify(data) + '\n'); fsyncSync(file); }
      finally { closeSync(file); }
      renameSync(path, paths[index]);
    }
  } catch (cause) {
    for (const path of paths) rmSync(path, { force: true });
    throw cause;
  } finally { rmSync(staging, { recursive: true, force: true }); }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeCandidateGateRunnerFailure(process.argv[2] ?? 'runner-startup-failure');
}
