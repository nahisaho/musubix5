/** @id CODE-M5-CI-CANDIDATE-WRAPPER-001
 * @implements REQ-M5-CI-008 REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-CI-008 DES-M5-LINUX-DELIVERY-002
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeCandidateGateRunnerFailure } from './write-candidate-gate-runner-failure.mjs';

/**
 * @typedef {import('../../packages/analysis/src/candidate-gate-runner.js').CandidateGateRunnerDependencies} RunnerDependencies
 * @typedef {{
 *   importRunner?: () => Promise<object>,
 *   validateInput?: (input: object) => object | Promise<object>,
 *   runner?: RunnerDependencies,
 *   fallbackObserver?: (cause: string) => void,
 *   writeFailure?: typeof writeCandidateGateRunnerFailure
 * }} WrapperDependencies
 */
function failureKind(cause) {
  try {
    const value = cause instanceof Error ? cause.name : typeof cause;
    return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value) ? value : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, config?: unknown, dependencies?: WrapperDependencies}} options
 * @returns {Promise<import('../../packages/analysis/src/candidate-gate-runner.js').CandidateGateRunnerResult>}
 */
export async function runCandidateGateWrapper({
  cwd = process.cwd(), env = process.env, config, dependencies = {},
} = {}) {
  const fallback = cause => {
    dependencies.fallbackObserver?.(cause);
    // A persistence failure deliberately escapes: no diagnostic envelope is claimed.
    return (dependencies.writeFailure ?? writeCandidateGateRunnerFailure)(cause, env);
  };
  let runner;
  try {
    runner = await (dependencies.importRunner ?? (() =>
      import(pathToFileURL(resolve(cwd, 'dist/packages/analysis/src/candidate-gate-runner.js')).href)))();
  } catch {
    return fallback('runner-import-failure');
  }
  let input;
  try {
    if (typeof runner.CandidateGateStartupError !== 'function')
      throw new Error('Candidate gate runner processing failed.');
    if (typeof runner.validateCandidateGateWrapperInput !== 'function'
      || typeof runner.candidateGateOrchestrationTimeout !== 'function'
      || typeof runner.runCandidateGateWorkflow !== 'function')
      throw new runner.CandidateGateStartupError();
    let parsed = config;
    if (parsed === undefined) {
      try { parsed = JSON.parse(readFileSync(join(cwd, '.musubix/config.json'), 'utf8')); }
      catch { throw new runner.CandidateGateStartupError(); }
    }
    const validated = await (dependencies.validateInput ?? runner.validateCandidateGateWrapperInput)({
      cwd, env, config: parsed,
    });
    const timeoutMs = validated.orchestrationTimeoutMs ?? runner.candidateGateOrchestrationTimeout(
      validated.commands, validated.formalTimeout, dependencies.runner,
    );
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < (validated.execution ? 45_107 : 75107) || timeoutMs > (validated.execution ? 1_785_000 : 2475000))
      throw new runner.CandidateGateStartupError();
    input = {
      command: process.execPath, args: ['dist/packages/cli/src/main.js', 'gate', '--matrix', '--json'],
      cwd, env: validated.execution ? { ...env, MUSUBIX5_CANDIDATE_ROOT: resolve(cwd) } : env,
      temporaryDirectory: validated.temporaryDirectory, timeoutMs, secrets: [],
      context: validated.context, resultPath: join(validated.temporaryDirectory, 'candidate-gate-result.json'),
      dependencies: dependencies.runner,
      ...(validated.execution ? { execution: validated.execution } : {}),
    };
  } catch (cause) {
    let startup = false;
    try {
      startup = cause instanceof runner.CandidateGateStartupError && cause.code === 'GATE_RUNNER_UNAVAILABLE';
    } catch { /* Hostile thrown values are processing faults, never startup by code alone. */ }
    return fallback(startup ? 'runner-startup-failure' : 'runner-processing-failure');
  }
  try {
    const result = await runner.runCandidateGateWorkflow(input);
    if (result.status !== 'pass') process.exitCode = 1;
    return result;
  } catch (cause) {
    console.error(`candidate-gate-wrapper:${failureKind(cause)}`);
    return fallback('runner-processing-failure');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCandidateGateWrapper();
}
