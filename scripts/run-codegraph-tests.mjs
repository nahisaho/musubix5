import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const testIds = [
  'TEST-M5-CONCURRENCY-LEASE-CONTRACT-001',
  'TEST-M5-FINALIZATION-CONCURRENCY-SAME-001',
  'TEST-M5-FINALIZATION-CONCURRENCY-DISJOINT-001',
  'TEST-M5-FINALIZATION-TAIL-PREFIX-001',
  'TEST-M5-FINALIZATION-PLATFORM-001',
  'TEST-M5-FINALIZATION-TAIL-PUBLIC-001',
  'TEST-M5-FINALIZATION-TAIL-RECOVERY-001',
  'TEST-M5-FINALIZATION-DURABILITY-001',
  'TEST-M5-FINALIZATION-PRECAS-DRIFT-001',
  'TEST-M5-FINALIZATION-AUTHORITY-001',
  'TEST-M5-FINALIZATION-DRIFT-001',
  'TEST-M5-FINALIZATION-GENERATION-001',
  'TEST-M5-FINALIZATION-TAIL-001',
  'TEST-M5-FINALIZATION-FENCED-001',
  'TEST-M5-FINALIZATION-JOURNAL-001',
  'TEST-M5-FINALIZATION-RESUME-001',
  'TEST-M5-FINALIZATION-SCOPE-001',
  'TEST-M5-FINALIZATION-MATERIALIZE-001',
  'TEST-M5-FINALIZATION-MARKER-001',
  'TEST-M5-CHECKPOINT-MONOTONIC-WAIT-001',
  'TEST-M5-CHECKPOINT-RECOVERY-ORDER-001',
  'TEST-M5-CHECKPOINT-RELEVANT-PATHS-001',
  'TEST-M5-CHECKPOINT-PREFLIGHT-READONLY-001',
  'TEST-M5-CHECKPOINT-PHASE-BEFORE-DRIFT-001',
  'TEST-M5-CHECKPOINT-WORKSPACE-CONCURRENCY-001',
  'TEST-M5-CHECKPOINT-NONGIT-ORDER-001',
  'TEST-M5-CHECKPOINT-REPLAY-PREPARATION-001',
  'TEST-M5-CHECKPOINT-CLI-DIAGNOSTICS-001',
  'TEST-M5-CHECKPOINT-PHASE-INVALID-001',
  'TEST-M5-CHECKPOINT-WORKSPACE-REPLAY-001',
  'TEST-M5-CHECKPOINT-WORKSPACE-SCOPE-001',
  'TEST-M5-CHECKPOINT-WORKSPACE-DRIFT-001',
  'TEST-M5-CHECKPOINT-STATUS-BATCH-002',
  'TEST-M5-CHECKPOINT-LEASE-001',
  'TEST-M5-CHECKPOINT-SESSION-001',
  'TEST-M5-CHECKPOINT-REGISTRY-001',
  'TEST-M5-CHECKPOINT-ORDER-001',
  'TEST-M5-CHECKPOINT-RECOVERY-001',
  'TEST-M5-CHECKPOINT-LIFECYCLE-001',
  'TEST-M5-CHECKPOINT-STATUS-001',
  'TEST-M5-GRAPH-INCREMENTAL-001',
  'TEST-M5-GRAPH-INCREMENTAL-NOCHANGE-001',
  'TEST-M5-GRAPH-INCREMENTAL-FALLBACK-001',
  'TEST-M5-GRAPH-INCREMENTAL-GIT-001',
  'TEST-M5-GRAPH-CACHE-WRITE-001',
  'TEST-M5-GRAPH-TRAVERSAL-001',
  'TEST-M5-GRAPH-CYCLES-001',
  'TEST-M5-GRAPH-GATE-SCAN-001',
  'TEST-M5-GRAPH-GATE-ORDER-001',
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const reportArgument = option('--report');
const targetTestId = option('--test-id');
if (!reportArgument) throw new Error('--report is required.');
if (targetTestId && !testIds.includes(targetTestId)) throw new Error(`Unknown CodeGraph test ID: ${targetTestId}`);

const selected = targetTestId ? [targetTestId] : testIds;
const testFiles = [
  'tests/concurrency-lease-contract.test.ts',
  'tests/codegraph-performance.test.ts',
  'tests/codegraph-incremental-regressions.test.ts',
  'tests/change-lease.test.ts',
  'tests/checkpoint-clock.test.ts',
  'tests/candidate-finalization-contract.test.ts',
  'tests/candidate-finalization-state.test.ts',
  'tests/candidate-finalization-durability.test.ts',
  'tests/candidate-integration-orchestration.test.ts',
  'tests/tdd-batch-recording.test.ts',
  'tests/workspace-batch-checkpoint.test.ts',
];
const filesByTestId = new Map();
for (const path of testFiles) {
  const source = await readFile(path, 'utf8');
  for (const [, testId] of source.matchAll(/@id\s+(TEST-[A-Z0-9-]+)/g)) {
    if (!testIds.includes(testId)) continue;
    if (filesByTestId.has(testId)) throw new Error(`Duplicate authoritative test ID: ${testId}`);
    filesByTestId.set(testId, path);
  }
}
for (const testId of selected) {
  if (!filesByTestId.has(testId)) throw new Error(`Missing authoritative test file: ${testId}`);
}
const reportPath = resolve(reportArgument);
const tests = [];
let failed = false;
const groups = targetTestId ? [[targetTestId]] : [
  selected.filter((id) => !id.startsWith('TEST-M5-GRAPH-')),
  ...selected.filter((id) => id.startsWith('TEST-M5-GRAPH-')).map((id) => [id]),
];

const describedGroups = groups.map((group, ordinal) => ({
  ordinal, testIds: group, testFiles: [...new Set(group.map((id) => filesByTestId.get(id)))],
  command: process.execPath,
  args: [
    resolve('node_modules/vitest/vitest.mjs'), 'run',
    ...new Set(group.map((id) => filesByTestId.get(id))),
    '-t', group.map((id) => `${id}(?: |$)`).join('|'),
    '--maxWorkers=1', '--reporter=json',
    `--outputFile=${resolve(dirname(reportPath), `.vitest-${group[0]}.json`)}`,
  ],
}));
if (process.argv.includes('--describe-groups')) {
  console.log(JSON.stringify({ schemaVersion: 1, groups: describedGroups }));
  process.exit(0);
}
const runtimeDispatchPath = option('--runtime-dispatch');
const runtimeDispatch = runtimeDispatchPath
  ? JSON.parse(await readFile(runtimeDispatchPath, 'utf8')) : null;
if (runtimeDispatch && (runtimeDispatch.schemaVersion !== 1
  || Object.keys(runtimeDispatch).sort().join(',') !== 'groups,schemaVersion'
  || !Array.isArray(runtimeDispatch.groups) || runtimeDispatch.groups.length !== describedGroups.length)) {
  throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: augmentation-binding: group dispatch');
}
await mkdir(dirname(reportPath), { recursive: true });
for (const { ordinal, testIds: group, args } of describedGroups) {
  const supplied = runtimeDispatch?.groups[ordinal];
  if (supplied && (Object.keys(supplied).sort().join(',') !== 'args,command,env,ordinal,resultPath'
    || supplied.ordinal !== ordinal || supplied.command !== process.execPath
    || !Array.isArray(supplied.args) || !supplied.args.every((arg) => typeof arg === 'string')
    || !supplied.env || typeof supplied.env !== 'object' || Array.isArray(supplied.env)
    || Object.values(supplied.env).some((value) => typeof value !== 'string')
    || typeof supplied.resultPath !== 'string')) {
    throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: augmentation-binding: supplied group');
  }
  const operationsPath = resolve(dirname(reportPath), `.operations-${group[0]}.json`);
  const vitestReportPath = resolve(dirname(reportPath), `.vitest-${group[0]}.json`);
  await mkdir(dirname(operationsPath), { recursive: true });
  await rm(operationsPath, { force: true });
  await rm(vitestReportPath, { force: true });
  const started = performance.now();
  const result = spawnSync(process.execPath, supplied?.args ?? args, {
    cwd: process.cwd(),
    env: { ...supplied?.env ?? process.env, MUSUBIX_OPERATION_REPORT: operationsPath },
    stdio: 'inherit',
  });
  let assertions = [];
  let nativeReportBase64 = null;
  try {
    const bytes = await readFile(vitestReportPath);
    nativeReportBase64 = bytes.toString('base64');
    const vitestReport = JSON.parse(bytes.toString('utf8'));
    assertions = (vitestReport.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
  if (supplied) await writeFile(supplied.resultPath, `${JSON.stringify({
    status: result.error ? 'error' : result.signal ? 'timeout' : 'completed',
    exitCode: result.status, durationMs: Math.max(0, Math.round(performance.now() - started)),
    nativeReportBase64,
  })}\n`, { flag: 'wx', mode: 0o600 });
  let operations;
  try {
    const value = JSON.parse(await readFile(operationsPath, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) operations = value;
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  } finally {
    await rm(operationsPath, { force: true });
    await rm(vitestReportPath, { force: true });
  }
  if (operations && group.length !== 1) throw new Error('Operation counters require an isolated test invocation.');
  for (const testId of group) {
    const matching = assertions.filter((test) => test.title === testId || test.title?.startsWith(`${testId} `));
    let status = matching.length === 1 && ['passed', 'failed', 'skipped'].includes(matching[0].status)
      ? matching[0].status : 'error';
    if (status === 'failed') console.error(`${testId}: ${(matching[0].failureMessages ?? []).join('\n')}`);
    if (result.status !== 0 && status === 'passed') status = 'error';
    failed ||= status !== 'passed';
    tests.push({ id: testId, status, ...(operations ? { operations } : {}) });
  }
}

await writeFile(reportPath, `${JSON.stringify({ schemaVersion: 1, tests }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
