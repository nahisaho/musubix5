import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const testIds = [
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
const reportPath = resolve(reportArgument);
await mkdir(dirname(reportPath), { recursive: true });
const tests = [];
let failed = false;

for (const testId of selected) {
  const operationsPath = resolve(dirname(reportPath), `.operations-${testId}.json`);
  const vitestReportPath = resolve(dirname(reportPath), `.vitest-${testId}.json`);
  await mkdir(dirname(operationsPath), { recursive: true });
  await rm(operationsPath, { force: true });
  await rm(vitestReportPath, { force: true });
  const result = spawnSync(process.execPath, [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    'tests/codegraph-performance.test.ts',
    'tests/codegraph-incremental-regressions.test.ts',
    '-t',
    testId,
    '--maxWorkers=1',
    '--reporter=json',
    `--outputFile=${vitestReportPath}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, MUSUBIX_OPERATION_REPORT: operationsPath },
    stdio: 'inherit',
  });
  let status = 'error';
  try {
    const vitestReport = JSON.parse(await readFile(vitestReportPath, 'utf8'));
    const matching = (vitestReport.testResults ?? [])
      .flatMap((file) => file.assertionResults ?? [])
      .filter((test) => test.title === testId || test.title?.startsWith(`${testId} `));
    if (matching.length === 1 && ['passed', 'failed', 'skipped'].includes(matching[0].status)) {
      status = matching[0].status;
    }
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
  if (result.status !== 0 && status === 'passed') status = 'error';
  failed ||= status !== 'passed';
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
  tests.push({ id: testId, status, ...(operations ? { operations } : {}) });
}

await writeFile(reportPath, `${JSON.stringify({ schemaVersion: 1, tests }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
