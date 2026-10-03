import { access, readFile, rm } from 'node:fs/promises';
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
      .rejects.toThrow(/^TEST_RUNTIME_BOOTSTRAP_INVALID: acknowledgment-binding: incomplete command \(timeout\)/);
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
