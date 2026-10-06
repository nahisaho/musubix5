import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { loadConfig } from '../packages/analysis/src/config.js';
import { runProcess, type ProcessResult, type Runner } from '../packages/analysis/src/process.js';
import { runTestRuntimeCommand, testRuntimeExecutionContext } from '../packages/analysis/src/test-runtime.js';

/** @id TEST-M5-TEST-RUNTIME-INCOMPLETE-COMMAND-001
 * @verifies REQ-M5-COMPAT-013
 * @design DES-M5-015
 */
it('TEST-M5-TEST-RUNTIME-INCOMPLETE-COMMAND-001 reports a real configured-runner timeout before missing acknowledgment lookup', async () => {
  const root = process.cwd();
  const command = (await loadConfig(root)).commands.find((entry) => entry.name === 'test');
  if (!command) throw new Error('The configured test command is required.');
  let requestPath: string | undefined;
  let native: ProcessResult | undefined;
  const runner: Runner = async (executable, args, options) => {
    const result = await runProcess(executable, args, options);
    if (options.env?.MUSUBIX5_TEST_RUNTIME_REQUEST) {
      requestPath = options.env.MUSUBIX5_TEST_RUNTIME_REQUEST;
      native = result;
    }
    return result;
  };
  const context = await testRuntimeExecutionContext(root, 'command', runner);
  try {
    await expect(runTestRuntimeCommand(root, command,
      ['vitest', 'run', 'tests/cli-json-error-contract.test.ts', '--maxWorkers=1'],
      { cwd: root, timeoutMs: 1 }, runner, context))
      .rejects.toThrow(/^TEST_RUNTIME_BOOTSTRAP_INVALID: acknowledgment-binding: incomplete command command=test status=timeout exitCode=null durationMs=/);
    expect(native).toMatchObject({ status: 'timeout', exitCode: null });
    expect(requestPath).toBeDefined();
    if (!requestPath) throw new Error('The real configured invocation must have a request.');
    expect(JSON.parse(await readFile(requestPath, 'utf8'))).toMatchObject({
      kind: 'test-runtime-request-v1', commandName: 'test',
      selectedFiles: ['tests/cli-json-error-contract.test.ts'],
    });
    const transport = dirname(requestPath);
    await expect(access(join(transport, 'ack.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(transport, 'provenance.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    if (requestPath) await rm(dirname(requestPath), { recursive: true, force: true });
  }
}, 60_000);

/** @id TEST-M5-CI-INCOMPLETE-COMMAND-DIAG-001
 * @verifies REQ-M5-CI-008
 * @design DES-M5-CI-009
 */
it('TEST-M5-CI-INCOMPLETE-COMMAND-DIAG-001 formats only independently trusted runner fields and preserves incomplete precedence', async () => {
  const { formatIncompleteCommand } = await import('../packages/analysis/src/test-runtime.js');
  const prefix = 'acknowledgment-binding: incomplete command';
  const names = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke'];
  for (const name of names) {
    for (const status of ['completed', 'missing', 'timeout', 'error']) {
      expect(formatIncompleteCommand(name, { status, exitCode: null, durationMs: 0 }))
        .toBe(`${prefix} command=${name} status=${status} exitCode=null durationMs=0`);
    }
  }
  for (const exitCode of [0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
    expect(formatIncompleteCommand(undefined, { exitCode })).toBe(`${prefix} exitCode=${exitCode}`);
  }
  expect(formatIncompleteCommand('test', undefined)).toBe(prefix);
  expect(formatIncompleteCommand('foreign', { status: 'timeout', exitCode: null, durationMs: 42 }))
    .toBe(`${prefix} status=timeout exitCode=null durationMs=42`);
  for (const invalid of [undefined, 'attacker', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, {}]) {
    expect(formatIncompleteCommand(invalid, { status: invalid, exitCode: invalid, durationMs: invalid })).toBe(prefix);
  }
  expect(formatIncompleteCommand('test', { status: 'foreign', exitCode: null, durationMs: -1 }))
    .toBe(`${prefix} command=test exitCode=null`);
  expect(formatIncompleteCommand(null, { status: 'error', exitCode: '1', durationMs: 7 }))
    .toBe(`${prefix} status=error durationMs=7`);
  const root = process.cwd();
  const command = (await loadConfig(root)).commands.find(entry => entry.name === 'test')!;
  const context = await testRuntimeExecutionContext(root, 'command', runProcess);
  let transport: string | undefined;
  const runner: Runner = async (executable, args, options) => {
    const result = await runProcess(executable, args, options);
    if (options.env?.MUSUBIX5_TEST_RUNTIME_REQUEST) {
      transport = dirname(options.env.MUSUBIX5_TEST_RUNTIME_REQUEST);
      const path = join(transport, 'ack.json');
      const ack = JSON.parse(await readFile(path, 'utf8'));
      ack.complete = false;
      await writeFile(path, JSON.stringify(ack));
      return { ...result, status: 'completed', exitCode: 13, durationMs: 17 };
    }
    return result;
  };
  try {
    await expect(runTestRuntimeCommand(root, command,
      ['vitest', 'run', 'tests/cli-json-error-contract.test.ts', '--maxWorkers=1'],
      { cwd: root, timeoutMs: 60_000 }, runner, context))
      .rejects.toThrow(`${prefix} command=test status=completed exitCode=13 durationMs=17`);
  } finally {
    if (transport) await rm(transport, { recursive: true, force: true });
  }
  const { normalizeCandidateGateReport } = await import('../packages/analysis/src/candidate-gate-runner.js');
  const base = join(root, '.test-work', 'g50-incomplete');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(base, { recursive: true });
  const stdout = JSON.stringify({ error: { code: 'TEST_RUNTIME_BOOTSTRAP_INVALID', message: `${prefix} command=test status=timeout exitCode=null durationMs=42` } });
  const { createHash } = await import('node:crypto');
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const stdoutPath = join(base, 'stdout'), stderrPath = join(base, 'stderr');
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, '');
  try {
    const normalized = await normalizeCandidateGateReport({
      stdoutPath, stderrPath, stdoutTail: stdout, stderrTail: '', stdoutSha256: sha(stdout), stderrSha256: sha(''),
      tailsDropped: false, resultTextDropped: false, drainTruncated: false, streamCapTerminated: false,
      exitCode: 1, signal: null, timedOut: false, spawned: true, childErrorMessage: null,
    }, { resultPath: join(base, 'result.json'), secrets: [], context: {
      repositoryId: 'repository:' + 'a'.repeat(64), changeId: 'CHANGE-0017', generation: 50,
      candidateCommit: 'b'.repeat(40), gateInputFingerprint: 'c'.repeat(64), job: { os: 'ubuntu', nodeMajor: 24 },
    } });
    expect(normalized.status).toBe('fail');
    expect(normalized.matchedCauses).toEqual(['cli-error', 'non-zero-exit', 'incomplete-runtime-acknowledgment']);
    expect(normalized.error?.case).toBe('cli-error');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}, 180_000);

/** @id TEST-M5-CI-PARTITION-FAILURE-PRECEDENCE-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-PARTITION-FAILURE-PRECEDENCE-001 preserves scheduler failure before a missing manifest lookup', async () => {
  const source = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(source).toContain('const manifestAvailable = await exists(manifestPath)');
  expect(source).toContain("if (!manifestAvailable && execution.status === 'completed' && execution.exitCode === 0)");
});

/** @id TEST-M5-CI-PARTITION-MISSING-DIAGNOSTIC-001
 * @verifies REQ-M5-CI-EFFICIENCY-004
 * @design DES-M5-CI-EFFICIENCY-006
 */
it('TEST-M5-CI-PARTITION-MISSING-DIAGNOSTIC-001 identifies missing partition acknowledgments and results', async () => {
  const source = await readFile('packages/analysis/src/test-runtime.ts', 'utf8');
  expect(source).toContain("partition manifest missing: ${missingPartitions.join(',')}");
});
