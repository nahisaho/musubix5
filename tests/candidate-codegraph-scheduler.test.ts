import { spawn } from './fixtures/counted-process.js';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
interface Group {
    ordinal: number;
    testIds: string[];
    testFiles: string[];
    command: string;
    args: string[];
}
const authoritativeFiles = [
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
const expectedIds = [
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
async function runWrapper(root: string, args: string[]) {
    const wrapper = resolve('scripts/run-codegraph-tests.mjs');
    return await new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
    }>((resolveResult, reject) => {
        const child = spawn(process.execPath, [wrapper, ...args], {
            cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
        child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
        child.on('error', reject);
        child.on('close', (code) => { resolveResult({ code, stdout, stderr }); });
    });
}
/** @id TEST-M5-CI-CODEGRAPH-SCHEDULER-001
 * @verifies REQ-M5-CI-004
 * @design DES-M5-CI-004
 */
it('TEST-M5-CI-CODEGRAPH-SCHEDULER-001 bounds real wrapper scheduling without losing native ownership or counters', async () => {
    const fixtureParent = resolve('.test-work');
    await mkdir(fixtureParent, { recursive: true });
    const root = await mkdtemp(join(fixtureParent, 'codegraph-scheduler-unit-'));
    try {
        const fileById = new Map<string, string>();
        for (const file of authoritativeFiles) {
            const source = await readFile(file, 'utf8');
            const ids = [...source.matchAll(/@id\s+(TEST-[A-Z0-9-]+)/g)]
                .map((match) => match[1]!).filter((id) => expectedIds.includes(id));
            for (const id of ids) {
                expect(fileById.has(id)).toBe(false);
                fileById.set(id, file);
            }
            await mkdir(dirname(join(root, file)), { recursive: true });
            await writeFile(join(root, file), ids.map((id) => `/** @id ${id} */`).join('\n'));
        }
        expect([...fileById.keys()].sort()).toEqual([...expectedIds].sort());
        expect(expectedIds.filter((id) => id.includes('LINUX-') && id.includes('OWNERSHIP')))
          .toHaveLength(4);
        const report = join(root, 'reports', 'wrapper.json');
        const descriptionArgs = ['--report', report, '--describe-groups'];
        const first = await runWrapper(root, descriptionArgs);
        const second = await runWrapper(root, descriptionArgs);
        expect(first.code, first.stderr).toBe(0);
        expect(second).toEqual(first);
        const description = JSON.parse(first.stdout) as {
            schemaVersion: number;
            groups: Group[];
        };
        expect(description.schemaVersion).toBe(1);
        const groups = description.groups;
        const nonGraph = groups.filter((group) => !group.testIds[0]!.startsWith('TEST-M5-GRAPH-'));
        const graph = groups.filter((group) => group.testIds[0]!.startsWith('TEST-M5-GRAPH-'));
        const expectedNonGraphFiles = [...new Set(expectedIds
                .filter((id) => !id.startsWith('TEST-M5-GRAPH-')).map((id) => fileById.get(id)))];
        expect(nonGraph.map((group) => group.testFiles)).toEqual([expectedNonGraphFiles]);
        expect(groups.flatMap((group) => group.testIds).sort()).toEqual([...expectedIds].sort());
        expect(graph.map((group) => group.testIds)).toEqual(expectedIds
            .filter((id) => id.startsWith('TEST-M5-GRAPH-')).map((id) => [id]));
        expect(new Set(groups.map((group) => group.args.at(-1))).size).toBe(groups.length);
        for (const [ordinal, group] of groups.entries()) {
            expect(group.ordinal).toBe(ordinal);
            expect(group.command).toBe(process.execPath);
            expect(group.args.filter((arg) => arg === `--maxWorkers=${group.testIds[0]!.startsWith('TEST-M5-GRAPH-') ? 1 : 3}`)).toHaveLength(1);
            expect(group.testFiles).toEqual([...new Set(group.testIds.map((id) => fileById.get(id)))]);
            expect(group.args.slice(2, 2 + group.testFiles.length)).toEqual(group.testFiles);
            expect(group.args[group.args.indexOf('-t') + 1]).toBe(group.testIds.map((id) => `${id}(?: |$)`).join('|'));
        }
        await mkdir(join(root, 'events'));
        await mkdir(join(root, 'reports'));
        // These controlled child processes are orchestration unit fixtures, not budget evidence.
        const worker = join(root, 'worker.mjs');
        await writeFile(worker, `
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const expression = process.argv[process.argv.indexOf('-t') + 1];
const group = process.env.FIXTURE_GROUP ? JSON.parse(process.env.FIXTURE_GROUP)
  : JSON.parse(await readFile(join(process.cwd(), 'groups.json'), 'utf8'))
    .find((entry) => entry.testIds.map((id) => id + '(?: |$)').join('|') === expression);
const events = process.env.FIXTURE_EVENTS ?? join(process.cwd(), 'events');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await writeFile(join(events, group.ordinal + '.start'), String(process.hrtime.bigint()));
await writeFile(join(events, group.ordinal + '.pid'), String(process.pid));
if (group.ordinal < 2) {
  const peer = join(events, (1 - group.ordinal) + '.start');
  let found = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { await readFile(peer); found = true; break; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await sleep(20);
  }
  if (!found) throw new Error('Scheduler did not overlap the first two children');
}
await sleep(process.env.FIXTURE_MALFORMED === 'yes' && group.ordinal === 1 ? 1500
  : group.ordinal % 2 === 0 ? 100 : 25);
const nativePath = process.argv.find((arg) => arg.startsWith('--outputFile=')).slice(13);
const failed = process.env.FIXTURE_FAIL === String(group.ordinal);
const bytes = '  ' + JSON.stringify({ testResults: [{ assertionResults: group.testIds.map((title) => ({
  title, status: failed ? 'failed' : 'passed', failureMessages: failed ? ['fixture failure'] : [],
})) }] }) + '\\n\\n';
await writeFile(nativePath, process.env.FIXTURE_MALFORMED === 'yes' && group.ordinal === 0 ? '{bad JSON' : bytes);
await writeFile(join(events, group.ordinal + '.native'), bytes);
if (group.testIds[0].startsWith('TEST-M5-GRAPH-')) {
  await writeFile(process.env.MUSUBIX_OPERATION_REPORT, JSON.stringify({ fixtureCounter: group.ordinal + 1 }));
}
console.log('fixture stdout ' + group.ordinal);
console.error('fixture stderr ' + group.ordinal);
await writeFile(join(events, group.ordinal + '.end'), String(process.hrtime.bigint()));
if (failed) process.exitCode = 1;
`);
        await writeFile(join(root, 'groups.json'), JSON.stringify(groups));
        await mkdir(join(root, 'node_modules', 'vitest'), { recursive: true });
        await writeFile(join(root, 'node_modules', 'vitest', 'vitest.mjs'), await readFile(worker));
        const direct = await runWrapper(root, ['--report', report]);
        expect(direct.code, direct.stderr).toBe(0);
        const directReport = await readFile(report, 'utf8');
        const dispatch = {
            schemaVersion: 1,
            groups: groups.map((group) => ({
                ordinal: group.ordinal, command: group.command,
                args: [worker, ...group.args.slice(1)],
                env: {
                    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [
                        string,
                        string
                    ] => typeof entry[1] === 'string')),
                    FIXTURE_GROUP: JSON.stringify(group), FIXTURE_EVENTS: join(root, 'events'),
                } as Record<string, string>,
                resultPath: join(root, 'reports', `${group.ordinal}.result.json`),
            })),
        };
        const dispatchPath = join(root, 'dispatch.json');
        await writeFile(dispatchPath, JSON.stringify(dispatch));
        const executed = await runWrapper(root, ['--report', report, '--runtime-dispatch', dispatchPath]);
        expect(executed.code, executed.stderr).toBe(0);
        const aggregate = JSON.parse(await readFile(report, 'utf8'));
        expect(await readFile(report, 'utf8')).toBe(directReport);
        expect(aggregate.tests).toEqual(groups.flatMap((group) => group.testIds.map((id) => ({
            id, status: 'passed',
            ...(id.startsWith('TEST-M5-GRAPH-') ? { operations: { fixtureCounter: group.ordinal + 1 } } : {}),
        }))));
        const boundaries: Array<{
            time: bigint;
            delta: number;
        }> = [];
        for (const group of groups) {
            const started = BigInt(await readFile(join(root, 'events', `${group.ordinal}.start`), 'utf8'));
            const ended = BigInt(await readFile(join(root, 'events', `${group.ordinal}.end`), 'utf8'));
            expect(ended > started).toBe(true);
            boundaries.push({ time: started, delta: 1 }, { time: ended, delta: -1 });
            expect(executed.stdout).toContain(`fixture stdout ${group.ordinal}`);
            expect(executed.stderr).toContain(`fixture stderr ${group.ordinal}`);
            const result = JSON.parse(await readFile(dispatch.groups[group.ordinal]!.resultPath, 'utf8'));
            expect(result).toMatchObject({ status: 'completed', exitCode: 0 });
            expect(result.durationMs).toBeGreaterThan(0);
            const native = await readFile(join(root, 'events', `${group.ordinal}.native`));
            expect(result.nativeReportBase64).toBe(native.toString('base64'));
        }
        boundaries.sort((left, right) => left.time < right.time ? -1 : left.time > right.time ? 1 : left.delta - right.delta);
        let active = 0;
        let maximum = 0;
        for (const boundary of boundaries) {
            active += boundary.delta;
            expect(active).toBeLessThanOrEqual(2);
            maximum = Math.max(maximum, active);
        }
        expect(active).toBe(0);
        expect(maximum).toBe(2);
        expect((await readdir(join(root, 'reports'))).filter((file) => file.startsWith('.'))).toEqual([]);
        // A failed child remains a failure; all other children still close and report.
        for (const group of dispatch.groups) {
            await rm(group.resultPath);
            group.env = { ...group.env, FIXTURE_FAIL: '1' };
        }
        await writeFile(dispatchPath, JSON.stringify(dispatch));
        const failed = await runWrapper(root, ['--report', report, '--runtime-dispatch', dispatchPath]);
        expect(failed.code).toBe(1);
        expect(failed.stderr).toContain('fixture failure');
        expect(JSON.parse(await readFile(report, 'utf8')).tests).toEqual(groups.flatMap((group) => group.testIds.map((id) => ({
            id, status: group.ordinal === 1 ? 'failed' : 'passed',
            ...(id.startsWith('TEST-M5-GRAPH-') ? { operations: { fixtureCounter: group.ordinal + 1 } } : {}),
        }))));
        for (const group of groups) {
            expect(JSON.parse(await readFile(dispatch.groups[group.ordinal]!.resultPath, 'utf8')))
                .toMatchObject({ status: 'completed', exitCode: group.ordinal === 1 ? 1 : 0 });
        }
        dispatch.groups[1]!.command = 'not-authorized';
        await writeFile(dispatchPath, JSON.stringify(dispatch));
        const invalid = await runWrapper(root, ['--report', report, '--runtime-dispatch', dispatchPath]);
        expect(invalid.code).not.toBe(0);
        expect(invalid.stderr).toContain('TEST_RUNTIME_BOOTSTRAP_INVALID: augmentation-binding: supplied group');
        expect((await readdir(join(root, 'reports'))).filter((file) => file.startsWith('.'))).toEqual([]);
        await rm(join(root, 'events'), { recursive: true });
        await mkdir(join(root, 'events'));
        dispatch.groups[1]!.command = process.execPath;
        for (const group of dispatch.groups) {
            await rm(group.resultPath);
            group.env.FIXTURE_FAIL = '-1';
            group.env.FIXTURE_MALFORMED = 'yes';
        }
        await writeFile(dispatchPath, JSON.stringify(dispatch));
        const malformed = await runWrapper(root, ['--report', report, '--runtime-dispatch', dispatchPath]);
        expect(malformed.code).not.toBe(0);
        expect(malformed.stderr).toMatch(/JSON|SyntaxError/);
        for (const file of (await readdir(join(root, 'events'))).filter((file) => file.endsWith('.pid'))) {
            const pid = Number(await readFile(join(root, 'events', file), 'utf8'));
            expect(() => process.kill(pid, 0)).toThrow();
        }
        expect((await readdir(join(root, 'reports'))).filter((file) => file.startsWith('.'))).toEqual([]);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
}, 60000);
