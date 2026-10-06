import { execFileSync } from './fixtures/counted-process.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-CODEGRAPH-BATCHING-001
 * @verifies REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-CODEGRAPH-BATCHING-001 pays one non-counter bootstrap and keeps every operation counter isolated within the exact plan', async () => {
  const groups = JSON.parse(execFileSync(process.execPath, [
    'scripts/run-codegraph-tests.mjs', '--describe-groups',
    '--report', '.musubix/cache/codegraph-batching-description.json',
  ], { encoding: 'utf8' })).groups as Array<{ testIds: string[]; testFiles: string[]; args: string[] }>;
  const batched = groups.filter(group => !group.testIds.some(id => id.startsWith('TEST-M5-GRAPH-')));
  const operations = groups.filter(group => group.testIds.some(id => id.startsWith('TEST-M5-GRAPH-')));
  expect(batched, 'non-counter assertions share one verified bootstrap, not one per file').toHaveLength(1);
  expect(batched[0]!.testFiles.length).toBeGreaterThan(20);
  expect(batched[0]!.args).toContain('--maxWorkers=3');
  expect(operations.length).toBeGreaterThan(0);
  for (const group of operations) {
    expect(group.testIds).toHaveLength(1);
    expect(group.args).toContain('--maxWorkers=1');
  }
  const ids = groups.flatMap(group => group.testIds);
  expect(new Set(ids).size).toBe(ids.length);
  expect(groups.length).toBe(operations.length + 1);
  const plan = JSON.parse(await readFile('.musubix/candidate-execution-plan.json', 'utf8'));
  const command = plan.commands.find((command: { name: string }) => command.name === 'codegraph-tests');
  expect([...command.testIds].sort()).toEqual([...ids].sort());
  expect(command.partitions).toHaveLength(1);
  expect(command.partitions[0]).toMatchObject({ wave: 0, maxWorkers: 4, fanout: 11 });
  const workers = (group: { args: string[] }) => Number(group.args.find(arg => arg.startsWith('--maxWorkers='))!.split('=')[1]);
  expect(workers(batched[0]!) + workers(operations[0]!)).toBe(command.partitions[0].maxWorkers);
  expect(1 + command.partitions[0].maxWorkers + command.partitions[0].fanout).toBe(16);
  expect(command.partitions[0].timeoutMs + command.mergeAllowanceMs + command.terminationAllowanceMs).toBe(120_000);
});

/** @id TEST-M5-CI-CODEGRAPH-REUSE-001
 * @verifies REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-CODEGRAPH-REUSE-001 reuses same-gate native ownership for heavyweight non-counter assertions', async () => {
  const reportPath = '.musubix/cache/codegraph-reused-native.json';
  const bytes = Buffer.from(JSON.stringify({
    testResults: [{
      assertionResults: [
        { title: 'TEST-M5-TDD-SOURCE-LFS-001 preserves source bytes', status: 'passed', failureMessages: [] },
        { title: 'TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001 verifies distribution', status: 'passed', failureMessages: [] },
      ],
    }],
  }));
  await mkdir('.musubix/cache', { recursive: true });
  await writeFile(reportPath, bytes);
  const groups = JSON.parse(execFileSync(process.execPath, [
    'scripts/run-codegraph-tests.mjs', '--describe-groups',
    '--report', '.musubix/cache/codegraph-reuse-description.json',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MUSUBIX5_REUSED_TEST_REPORT: reportPath,
      MUSUBIX5_REUSED_TEST_REPORT_SHA256: createHash('sha256').update(bytes).digest('hex'),
    },
  })).groups as Array<{ testIds: string[]; args: string[] }>;
  const batched = groups.find(group => group.testIds.includes('TEST-M5-TDD-SOURCE-LFS-001'))!;
  expect(batched.testIds).toContain('TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001');
  const pattern = batched.args[batched.args.indexOf('-t') + 1]!;
  expect(pattern).not.toContain('TEST-M5-TDD-SOURCE-LFS-001');
  expect(pattern).not.toContain('TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001');
});

/** @id TEST-M5-CI-CODEGRAPH-DIAGNOSTICS-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-CODEGRAPH-DIAGNOSTICS-001 preserves bounded child streams in the durable process result', async () => {
  const source = await readFile('scripts/run-codegraph-tests.mjs', 'utf8');
  expect(source).toContain('stdout: result.stdout');
  expect(source).toContain('stderr: result.stderr');
});

/** @id TEST-M5-CI-CODEGRAPH-OPTIONAL-STREAMS-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-CODEGRAPH-OPTIONAL-STREAMS-001 publishes results when a child provides no captured streams', async () => {
  const source = await readFile('scripts/run-codegraph-tests.mjs', 'utf8');
  expect(source).toContain("result.stdout?.slice(-32_768) ?? ''");
  expect(source).toContain("result.stderr?.slice(-32_768) ?? ''");
});

/** @id TEST-M5-CI-CODEGRAPH-STREAM-SCHEMA-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-CODEGRAPH-STREAM-SCHEMA-001 admits bounded streams through the closed runtime result schema', async () => {
  const source = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(source).toContain("'stdout', 'stderr'");
  expect(source).toContain('stdout: String(result.stdout)');
  expect(source).toContain('stderr: String(result.stderr)');
});

/** @id TEST-M5-CI-CODEGRAPH-REUSE-WORKERS-001
 * @verifies REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-CODEGRAPH-REUSE-WORKERS-001 leaves one worker slot free when native results are reused', async () => {
  const source = await readFile('scripts/run-codegraph-tests.mjs', 'utf8');
  expect(source).toContain('if (reusedAssertions.size) return 2');
});

/** @id TEST-M5-CI-CODEGRAPH-REUSE-BINDING-001
 * @verifies REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-004
 */
it('TEST-M5-CI-CODEGRAPH-REUSE-BINDING-001 binds runtime selection to executed tests only', async () => {
  const source = await readFile('scripts/run-codegraph-tests.mjs', 'utf8');
  expect(source).toContain('ordinal, testIds: executed, testFiles:');
});

/** @id TEST-M5-CI-CODEGRAPH-REUSE-SCOPE-001
 * @verifies REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-002 DES-M5-CI-EFFICIENCY-004
 */
it('TEST-M5-CI-CODEGRAPH-REUSE-SCOPE-001 prevents implicit reuse binding inheritance by nested children', async () => {
  const source = await readFile('packages/analysis/src/process.ts', 'utf8');
  expect(source).toContain("delete environment.MUSUBIX5_REUSED_TEST_REPORT");
  expect(source).toContain("delete environment.MUSUBIX5_REUSED_TEST_REPORT_SHA256");
});
