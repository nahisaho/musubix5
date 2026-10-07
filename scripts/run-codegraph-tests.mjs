import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { launchCountedProcess } from './test-runtime/counted-launcher.mjs';
import { writePartitionManifest } from './test-runtime/partition-scheduler.mjs';
import { performance } from 'node:perf_hooks';

const testIds = [
  'TEST-M5-CI-CODEGRAPH-MIXED-REPORT-001',
  'TEST-M5-CI-CODEGRAPH-BATCHING-001',
  'TEST-M5-CI-SLOT-TRANSACTION-001',
  'TEST-M5-CI-NATIVE-LEDGER-CHAIN-001',
  'TEST-M5-CI-STABILITY-ARTIFACT-001',
  'TEST-M5-CI-COUNTED-NATIVE-001',
  'TEST-M5-CI-COUNTED-FIXTURE-001',
  'TEST-M5-CI-CALIBRATION-INTEGRATION-001',
  'TEST-M5-LINUX-CALIBRATION-PARTITION-BUDGET-001',
  'TEST-M5-LINUX-CALIBRATION-MODE-BINDING-001',
  'TEST-M5-LINUX-CALIBRATION-SCHEDULER-TIMEOUT-001',
  'TEST-M5-LINUX-CALIBRATION-POSTCONDITION-BUDGET-001',
  'TEST-M5-LINUX-CALIBRATION-POSTCONDITION-HEADROOM-001',
  'TEST-M5-LINUX-CALIBRATION-REMAINING-BUDGET-001',
  'TEST-M5-LINUX-CALIBRATION-BUDGET-REALLOCATION-001',
  'TEST-M5-LINUX-CALIBRATION-CODEGRAPH-BUDGET-001',
  'TEST-M5-LINUX-CALIBRATION-CODEGRAPH-LANES-001',
  'TEST-M5-LINUX-CALIBRATION-NATIVE-REPORT-DIAGNOSTIC-001',
  'TEST-M5-LINUX-CALIBRATION-NATIVE-SELECTION-DIAGNOSTIC-001',
  'TEST-M5-LINUX-CALIBRATION-SLOT-RELEASE-DIAGNOSTIC-001',
  'TEST-M5-LINUX-CALIBRATION-PARAMETERIZED-MERGE-001',
  'TEST-M5-LINUX-CALIBRATION-WORKER-PACKET-ATOMICITY-001',
  'TEST-M5-LINUX-CALIBRATION-NATIVE-DESCRIPTOR-ATOMICITY-001',
  'TEST-M5-LINUX-CALIBRATION-TIMEOUT-DIAGNOSTIC-001',
  'TEST-M5-LINUX-CALIBRATION-POSTCONDITION-STAGE-001',
  'TEST-M5-LINUX-CALIBRATION-WRAPPER-DIAGNOSTIC-001',
  'TEST-M5-LINUX-CALIBRATION-SIGNER-DIAGNOSTIC-001',
  'TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-001',
  'TEST-M5-LINUX-SIGNER-CONTEXT-BOUNDARY-002',
  'TEST-M5-LINUX-CANDIDATE-WORKFLOW-001',
  'TEST-M5-LINUX-CALIBRATION-001',
  'TEST-M5-CI-CALIBRATION-SOURCE-FINAL-001',
  'TEST-M5-CI-CALIBRATION-INPUT-CLOSURE-001',
  'TEST-M5-CI-PORTABLE-EXECUTION-001',
  'TEST-M5-CI-STABILITY-PROOF-001',
  'TEST-M5-LINUX-STABILITY-001',
  'TEST-M5-LINUX-RELEASE-001',
  'TEST-M5-LINUX-RUN-OWNERSHIP-001',
  'TEST-M5-LINUX-CALIBRATION-OWNERSHIP-001',
  'TEST-M5-LINUX-STABILITY-OWNERSHIP-001',
  'TEST-M5-LINUX-RELEASE-OWNERSHIP-001',
  'TEST-M5-CI-COUNTED-SCHEDULER-001',
  'TEST-M5-CI-RESOURCE-PLAN-001',
  'TEST-M5-LINUX-CALIBRATION-ISOLATED-WORKERS-001',
  'TEST-M5-CI-EFFICIENT-ORCHESTRATION-TIMEOUT-001',
  'TEST-M5-CI-FIRST-FAILURE-LEDGER-001',
  'TEST-M5-TEST-RUNTIME-INCOMPLETE-COMMAND-001',
  'TEST-M5-LFS-APPROVAL-BINDING-001',
  'TEST-M5-LFS-WORKFLOW-INPUT-001',
  'TEST-M5-LFS-GRAPH-OWNERSHIP-001',
  'TEST-M5-LFS-MIGRATION-WORKSPACE-001',
  'TEST-M5-TDD-SOURCE-LFS-001',
  'TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001',
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
const reusableTestIds = new Set([
  'TEST-M5-TDD-SOURCE-LFS-001',
  'TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001',
]);
const reusedAssertions = new Map();
const reusedReportPath = process.env.MUSUBIX5_REUSED_TEST_REPORT;
const reusedReportSha256 = process.env.MUSUBIX5_REUSED_TEST_REPORT_SHA256;
if (!targetTestId && (reusedReportPath || reusedReportSha256)) {
  if (!reusedReportPath || !/^[a-f0-9]{64}$/.test(reusedReportSha256 ?? '')) {
    throw new Error('CODEGRAPH_REUSED_TEST_REPORT_INVALID: binding');
  }
  const bytes = await readFile(resolve(reusedReportPath));
  if (createHash('sha256').update(bytes).digest('hex') !== reusedReportSha256) {
    throw new Error('CODEGRAPH_REUSED_TEST_REPORT_INVALID: digest');
  }
  const report = JSON.parse(bytes.toString('utf8'));
  const assertions = Array.isArray(report.tests)
    ? report.tests.map(test => ({ title: test.id, status: test.status, failureMessages: [] }))
    : (report.testResults ?? []).flatMap(file => file.assertionResults ?? []);
  for (const testId of reusableTestIds) {
    const matching = assertions.filter(test => test.title === testId || test.title?.startsWith(`${testId} `));
    if (matching.length !== 1 || matching[0].status !== 'passed') {
      throw new Error(`CODEGRAPH_REUSED_TEST_REPORT_INVALID: ${testId}`);
    }
    reusedAssertions.set(testId, matching[0]);
  }
}
const testFiles = [
  'tests/candidate-codegraph-mixed-report.test.ts',
  'tests/candidate-codegraph-batching.test.ts',
  'tests/candidate-slot-transaction.test.ts',
  'tests/candidate-native-ledger-chain.test.ts',
  'tests/candidate-stability-artifact.test.ts',
  'tests/candidate-counted-native.test.ts',
  'tests/candidate-counted-fixture.test.ts',
  'tests/candidate-calibration-integration.test.ts',
  'tests/candidate-calibration-source-final.test.ts',
  'tests/candidate-calibration-input-closure.test.ts',
  'tests/candidate-portable-execution.test.ts',
  'tests/candidate-stability.test.ts',
  'tests/candidate-counted-scheduler.test.ts',
  'tests/candidate-execution-plan.test.ts',
  'tests/candidate-gate-efficient-timeout.test.ts',
  'tests/candidate-first-failure-ledger.test.ts',
  'tests/test-runtime-incomplete-command.test.ts',
  'tests/git-lfs-generation14-coverage.test.ts',
  'tests/git-lfs-distribution.test.ts',
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
const nonCounterIds = selected.filter(id => !id.startsWith('TEST-M5-GRAPH-'));
const matrixPlan = process.env.MUSUBIX5_CANDIDATE_ROOT === process.cwd() && !targetTestId
  ? (await (await import('../dist/packages/analysis/src/candidate-execution-plan.js')).loadCandidateExecutionPlan(process.cwd())).plan.commands.find(command => command.name === 'codegraph-tests') : null;
const groups = targetTestId ? [[targetTestId]] : matrixPlan ? matrixPlan.partitions.flatMap(partition => {
  const regular = partition.testIds.filter(id => !id.startsWith('TEST-M5-GRAPH-'));
  return [...(regular.length ? [regular] : []),
    ...partition.testIds.filter(id => id.startsWith('TEST-M5-GRAPH-')).map(id => [id])];
}) : [
  ...(nonCounterIds.length ? [nonCounterIds] : []),
  ...selected.filter((id) => id.startsWith('TEST-M5-GRAPH-')).map((id) => [id]),
];

const groupWorkerCount = group => {
  if (reusedAssertions.size) return 2;
  if (targetTestId || group.some(id => id.startsWith('TEST-M5-GRAPH-'))) return 1;
  if (!matrixPlan) return 3;
  const partition = matrixPlan.partitions.find(value => group.every(id => value.testIds.includes(id)));
  if (!partition) throw new Error('CANDIDATE_PARTITION_DISPATCH_INVALID: Code Graph workers');
  return Math.max(1, partition.maxWorkers - 1);
};
const runtimeGroups = groups.map((group, ordinal) => {
  const executed = group.filter(id => !reusedAssertions.has(id));
  if (!executed.length) throw new Error('CODEGRAPH_REUSED_TEST_REPORT_INVALID: empty group');
  return {
    ordinal, testIds: executed, testFiles: [...new Set(executed.map((id) => filesByTestId.get(id)))],
    command: process.execPath,
    args: [
      resolve('node_modules/vitest/vitest.mjs'), 'run',
      ...new Set(executed.map((id) => filesByTestId.get(id))),
      '-t', executed.map((id) => `${id}(?: |$)`).join('|'),
      `--maxWorkers=${groupWorkerCount(group)}`,
      '--pool=forks', '--reporter=json',
      `--outputFile=${resolve(dirname(reportPath), `.vitest-${group[0]}.json`)}`,
    ],
  };
});
const ownershipGroups = runtimeGroups.map((group, ordinal) => ({ ...group, testIds: groups[ordinal] }));
const describedGroups = process.argv.includes('--describe-groups')
  && !process.argv.includes('--runtime-selection') ? ownershipGroups : runtimeGroups;
const partitionFor = group => matrixPlan?.partitions.find(partition =>
  group.testIds.every(id => partition.testIds.includes(id)) && group.testFiles.every(file => partition.files.includes(file)));
if (matrixPlan && describedGroups.some(group => !partitionFor(group))) throw new Error('CANDIDATE_PARTITION_DISPATCH_INVALID: Code Graph ownership');
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
for (const { ordinal } of describedGroups) {
  const supplied = runtimeDispatch?.groups[ordinal];
  if (supplied && (Object.keys(supplied).sort().join(',') !== 'args,command,env,ordinal,resultPath'
    || supplied.ordinal !== ordinal || supplied.command !== process.execPath
    || !Array.isArray(supplied.args) || !supplied.args.every((arg) => typeof arg === 'string')
    || !supplied.env || typeof supplied.env !== 'object' || Array.isArray(supplied.env)
    || Object.values(supplied.env).some((value) => typeof value !== 'string')
    || typeof supplied.resultPath !== 'string')) {
    throw new Error('TEST_RUNTIME_BOOTSTRAP_INVALID: augmentation-binding: supplied group');
  }
}

/** @id CODE-M5-CI-CODEGRAPH-SCHEDULER-001
 * @implements REQ-M5-CI-004 REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-004 DES-M5-CI-EFFICIENCY-002
 */
const activeChildren = new Set();
const groupResults = new Array(describedGroups.length);
let schedulerError;
function stopChildren(cause) {
  schedulerError ??= cause;
  for (const child of activeChildren) child.kill('SIGTERM');
}
const interrupt = (signal) => stopChildren(new Error(`CodeGraph scheduler interrupted by ${signal}.`));
const onSigint = () => interrupt('SIGINT');
const onSigterm = () => interrupt('SIGTERM');

async function runGroup({ ordinal, testIds: group, args }) {
  const supplied = runtimeDispatch?.groups[ordinal];
  const operationsPath = resolve(dirname(reportPath), `.operations-${group[0]}.json`);
  const vitestReportPath = resolve(dirname(reportPath), `.vitest-${group[0]}.json`);
  await mkdir(dirname(operationsPath), { recursive: true });
  await rm(operationsPath, { force: true });
  await rm(vitestReportPath, { force: true });
  if (schedulerError) return;
  const started = performance.now();
  const startedAt = Number(process.hrtime.bigint()) / 1_000_000;
  const partition = matrixPlan && partitionFor(describedGroups[ordinal]);
  const timeoutMs = partition ? partitionDeadlines.get(partition.id) - Date.now() : 120_000;
  if (timeoutMs <= 0) throw new Error(`CANDIDATE_PARTITION_DEADLINE: ${partition.id}`);
  const env = { ...supplied?.env ?? process.env };
  if (group.length === 1 && group[0].startsWith('TEST-M5-GRAPH-')
    || group.includes('TEST-M5-CI-RESOURCE-PLAN-001')) env.MUSUBIX_OPERATION_REPORT = operationsPath;
  else delete env.MUSUBIX_OPERATION_REPORT;
  const result = await launchCountedProcess(process.execPath, supplied?.args ?? args, {
    env,
    partition: partition?.id ?? `codegraph-${ordinal}`, timeoutMs,
    maxWorkers: Number(args.find(arg => arg.startsWith('--maxWorkers=')).split('=')[1]),
    onChild: child => { activeChildren.add(child); child.once('close', () => activeChildren.delete(child)); },
  });
  if (schedulerError) return;
  let assertions = [];
  let nativeReportBase64 = null;
  try {
    const bytes = await readFile(vitestReportPath);
    nativeReportBase64 = bytes.toString('base64');
    const vitestReport = JSON.parse(bytes.toString('utf8'));
    assertions = (vitestReport.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    console.error(`CodeGraph group ${ordinal}: missing native report ${vitestReportPath}.`);
  }
  assertions.push(...group.flatMap(testId => reusedAssertions.has(testId) ? [reusedAssertions.get(testId)] : []));
  if (supplied) await writeFile(supplied.resultPath, `${JSON.stringify({
    status: result.status,
    exitCode: result.exitCode, durationMs: Math.max(0, Math.round(performance.now() - started)),
    stdout: result.stdout?.slice(-32_768) ?? '', stderr: result.stderr?.slice(-32_768) ?? '', nativeReportBase64,
    ...(matrixPlan ? { startedAt, completedAt: Number(process.hrtime.bigint()) / 1_000_000 } : {}),
  })}\n`, { flag: 'wx', mode: 0o600 });
  if (result.error) throw result.error;
  if (result.exitCode !== 0) console.error(`CodeGraph group ${ordinal} exited with ${result.signal ?? result.exitCode}.`);
  let operations;
  try {
    const value = JSON.parse(await readFile(operationsPath, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) operations = value;
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
  const operationOwners = operations
    ? group.filter(id => id.startsWith('TEST-M5-GRAPH-') || id === 'TEST-M5-CI-RESOURCE-PLAN-001') : [];
  if (operations && operationOwners.length !== 1) throw new Error('Operation counters require one authoritative owner.');
  const results = [];
  for (const testId of group) {
    const matching = assertions.filter((test) => test.title === testId || test.title?.startsWith(`${testId} `));
    let status = matching.length === 1 && ['passed', 'failed', 'skipped'].includes(matching[0].status)
      ? matching[0].status : 'error';
    if (status === 'failed') console.error(`${testId}: ${(matching[0].failureMessages ?? []).join('\n')}`);
    if (status === 'error') console.error(`${testId}: expected one native assertion with a supported status; received ${matching.length}.`);
    if (result.exitCode !== 0 && status === 'passed' && !assertions.some(test => test.status === 'failed')) status = 'error';
    failed ||= status !== 'passed';
    results.push({ id: testId, status, ...(operations && operationOwners[0] === testId ? { operations } : {}) });
  }
  groupResults[ordinal] = results;
}

/** @id CODE-M5-LINUX-CALIBRATION-CODEGRAPH-LANES-001
 * @implements REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
async function executeGroups(selected) {
  const sequences = [
    selected.filter(group => !group.testIds.some(id => id.startsWith('TEST-M5-GRAPH-'))),
    selected.filter(group => group.testIds.some(id => id.startsWith('TEST-M5-GRAPH-'))),
  ];
  async function runBounded(sequence, concurrency) {
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, sequence.length) }, async () => {
      while (next < sequence.length) {
        const group = sequence[next++];
        if (schedulerError) return;
        await runGroup(group);
      }
    });
    await Promise.all(workers);
  }
  await Promise.all(sequences.map(async (sequence, index) => {
    try {
      const concurrency = index === 1 && matrixPlan ? 2 : 1;
      await runBounded(sequence, concurrency);
    } catch (cause) { stopChildren(cause); }
  }));
}

process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);
const partitionDeadlines = new Map();
try {
  if (matrixPlan) {
    for (const wave of [...new Set(matrixPlan.partitions.map(partition => partition.wave))].sort((a,b) => a-b)) {
      const partitions = matrixPlan.partitions.filter(partition => partition.wave === wave);
      for (const partition of partitions) partitionDeadlines.set(partition.id, Date.now() + partition.timeoutMs);
      await Promise.all(partitions.map(async partition => {
        const selected = describedGroups.filter(group => partitionFor(group)?.id === partition.id);
        await executeGroups(selected);
      }));
    }
  } else await executeGroups(describedGroups);
} finally {
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
  await Promise.all(describedGroups.flatMap(({ testIds: group }) => [
    rm(resolve(dirname(reportPath), `.operations-${group[0]}.json`), { force: true }),
    rm(resolve(dirname(reportPath), `.vitest-${group[0]}.json`), { force: true }),
  ]));
}
if (schedulerError) throw schedulerError;
if (runtimeDispatch && process.env.MUSUBIX5_CANDIDATE_PARTITION_MANIFEST) {
  await writePartitionManifest(runtimeDispatch.groups, process.env.MUSUBIX5_CANDIDATE_PARTITION_MANIFEST);
}
tests.push(...groupResults.flat());
await writeFile(reportPath, `${JSON.stringify({ schemaVersion: 1, tests }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
