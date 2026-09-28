import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const files = [
  'tests/parallel-final-findings-generation5.test.ts',
  'tests/workspace-batch-checkpoint.test.ts',
  'tests/change-lease.test.ts',
  'tests/candidate-integration-orchestration.test.ts',
  'tests/concurrency-lease-contract.test.ts',
];
const ids = [
  'TEST-M5-PARALLEL-RUNTIME-EIGHT-WRITERS-001',
  'TEST-M5-CHECKPOINT-WORKSPACE-CONCURRENCY-001',
  'TEST-M5-CHECKPOINT-SESSION-001',
  'TEST-M5-FINALIZATION-CONCURRENCY-SAME-001',
  'TEST-M5-FINALIZATION-CONCURRENCY-DISJOINT-001',
  'TEST-M5-CONCURRENCY-LEASE-CONTRACT-001',
];
const directory = resolve(process.argv[2] ?? '.musubix/cache/impl-concurrency/load');
await mkdir(directory, { recursive: true });
const sources = [...files, 'tests/concurrency-load.config.ts', 'tests/helpers/concurrency-wall-setup.ts',
  'tests/helpers/concurrency-runner-clock.mjs',
  'packages/analysis/src/journal.ts', 'packages/analysis/src/candidate-state.ts',
  'packages/analysis/src/candidate-integration.ts', 'packages/analysis/src/tdd.ts',
  'packages/analysis/src/parallel-runtime.ts'];
const sourceSha256 = Object.fromEntries(await Promise.all(sources.map(async (path) =>
  [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const runs = [];
for (let iteration = 1; iteration <= 10; iteration += 1) {
  const reportPath = resolve(directory, `run-${iteration}.json`);
  await rm(reportPath, { force: true });
  const args = [
    '--import', resolve('tests/helpers/concurrency-runner-clock.mjs'),
    resolve('node_modules/vitest/vitest.mjs'), 'run', ...files,
    '--config=tests/concurrency-load.config.ts', '-t', ids.join('|'),
    '--reporter=json', `--outputFile=${reportPath}`,
  ];
  const start = performance.now();
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000 });
  const elapsedMs = performance.now() - start;
  await writeFile(resolve(directory, `run-${iteration}.log`),
    `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`);
  const tests = [];
  let reportError;
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const assertions = (report.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
    for (const id of ids) {
      const matches = assertions.filter((test) => test.title === id || test.title?.startsWith(`${id} `));
      const test = matches.length === 1 ? matches[0] : undefined;
      const injection = test?.meta?.clockInjection;
      const injected = injection?.offsetsMs?.includes(6_000) && injection?.offsetsMs?.includes(-6_000);
      tests.push({
        id, status: test?.status === 'passed' && injected ? 'passed' : 'failed',
        durationMs: test?.duration, clockInjection: injection,
        acquisitionTimings: test?.meta?.acquisitionTimings, failureMessages: test?.failureMessages,
      });
    }
  } catch (cause) {
    reportError = cause instanceof Error ? cause.message : String(cause);
  }
  const failedTests = tests.filter((test) => test.status !== 'passed').length;
  const failures = failedTests + (reportError ? ids.length : 0)
    + (result.status !== 0 && failedTests === 0 && !reportError ? 1 : 0);
  runs.push({ iteration, exitCode: result.status, elapsedMs, failures, reportPath, reportError, tests });
  console.log(`iteration ${iteration}: ${tests.length - failures}/${ids.length} passed (${elapsedMs.toFixed(1)} ms)`);
}
const scenarios = ids.map((id) => {
  const observations = runs.flatMap((run) => run.tests.filter((test) => test.id === id));
  return {
    id, repetitions: observations.length,
    failures: observations.filter((test) => test.status !== 'passed').length,
    maxDurationMs: Math.max(...observations.map((test) => test.durationMs ?? 0)),
  };
});
const summary = {
  schemaVersion: 1, clock: 'performance.now', wallClockOffsetsMs: [6_000, -6_000],
  sourceSha256, scenarios, runs, failures: runs.reduce((total, run) => total + run.failures, 0),
};
await writeFile(resolve(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.table(scenarios);
process.exitCode = summary.failures || scenarios.some((scenario) => scenario.repetitions !== 10) ? 1 : 0;
