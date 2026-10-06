import { readFile, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

/** @id TEST-M5-CI-RESOURCE-PLAN-001
 * @verifies REQ-M5-CI-EFFICIENCY-001
 */
it('TEST-M5-CI-RESOURCE-PLAN-001 validates closed ownership, waves, worker/fanout accounting and digest direction', async () => {
  const api = await import('../packages/analysis/src/candidate-execution-plan.js');
  const names = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke'];
  const commands = names.map((name) => ({
    name, executable: 'node', args: [`scripts/${name}.mjs`], timeoutMs: 60_000,
    include: name === 'test' || name === 'compatibility' ? ['tests/example.test.ts'] : [],
    exclude: [], testIds: name === 'test' || name === 'compatibility' ? ['TEST-EXAMPLE-001'] : [],
    partitions: name === 'test' || name === 'compatibility' ? [{
      id: `${name}-regular`, ordinal: 0, wave: 0, pool: 'forks', maxWorkers: 8,
      fanout: 7, files: ['tests/example.test.ts'], testIds: ['TEST-EXAMPLE-001'],
      timeoutMs: 50_000,
    }] : [],
    mergeAllowanceMs: 1_000, terminationAllowanceMs: 1_000,
  }));
  const plan = {
    schemaVersion: 1, retries: 0, maxExecutionSlots: 16, commands,
    runtimeInputs: ['scripts/test-runtime/counted-launcher.mjs'],
    formalTimeoutMs: 12_000, calibrationDigest: null,
  };
  const inventories = new Map(names.map((name) => [name, name === 'test' || name === 'compatibility' ? ['TEST-EXAMPLE-001'] : []]));
  const result = api.validateCandidateExecutionPlan(plan, inventories);
  expect(result.candidatePlannedExecutionSlots).toBe(16);
  expect(result.plan.commands.map((command) => command.name)).toEqual(names);
  const digest = api.candidateExecutionPlanDigest(result.plan);
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  const shape = api.candidateExecutionPolicyProjection(result.plan);
  expect(api.candidateExecutionPolicyProjection({ ...result.plan, calibrationDigest: 'a'.repeat(64),
    commands: result.plan.commands.map((command) => ({ ...command, timeoutMs: command.timeoutMs + 1 })) })).toEqual(shape);
  expect(api.candidateExecutionPlanDigest({ ...result.plan, retries: 1 } as never)).not.toBe(digest);
  for (const changed of [
    { ...plan, retries: 1 }, { ...plan, commands: commands.slice(1) },
    { ...plan, commands: [...commands].reverse() }, { ...plan, maxExecutionSlots: 17 },
    { ...plan, foreign: true },
    { ...plan, commands: commands.map((command) => command.name !== 'test' ? command : ({
      ...command, partitions: [{ ...command.partitions[0]!, fanout: 8 }],
    })) },
    { ...plan, commands: commands.map((command) => command.name !== 'test' ? command : ({
      ...command, partitions: [...command.partitions, { ...command.partitions[0]!, id: 'duplicate', ordinal: 1 }],
    })) },
    { ...plan, commands: commands.map((command) => command.name !== 'test' ? command : ({
      ...command, testIds: ['TEST-UNPLANNED-001'],
    })) },
    { ...plan, commands: commands.map((command) => command.name !== 'test' ? command : ({
      ...command, timeoutMs: 51_999,
    })) },
  ]) expect(() => api.validateCandidateExecutionPlan(changed, inventories)).toThrow();
  const parallel = structuredClone(plan);
  const test = parallel.commands.find((command) => command.name === 'test')!;
  test.testIds.push('TEST-EXAMPLE-002');
  test.partitions[0]!.maxWorkers = 2;
  test.partitions[0]!.fanout = 1;
  test.partitions.push({ ...test.partitions[0]!, id: 'second', ordinal: 1,
    files: ['tests/second.test.ts'], testIds: ['TEST-EXAMPLE-002'] });
  const parallelInventory = new Map(inventories);
  parallelInventory.set('test', test.testIds);
  expect(api.validateCandidateExecutionPlan(parallel, parallelInventory).candidatePlannedExecutionSlots).toBe(16);
  if (process.env.MUSUBIX_OPERATION_REPORT) await writeFile(process.env.MUSUBIX_OPERATION_REPORT, JSON.stringify({
    candidatePlannedExecutionSlots: result.candidatePlannedExecutionSlots,
  }));
});

/** @id TEST-M5-CI-PARTITION-TIMEOUT-HEADROOM-001
 * @verifies REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
 * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-004
 */
it('TEST-M5-CI-PARTITION-TIMEOUT-HEADROOM-001 preserves the command cap while moving headroom to the measured slow partition', async () => {
  const plan = JSON.parse(await readFile('.musubix/candidate-execution-plan.json', 'utf8'));
  const test = plan.commands.find((command: { name: string }) => command.name === 'test');
  expect(test.partitions.map((partition: { timeoutMs: number }) => partition.timeoutMs)).toEqual([343600, 254400]);
  expect(test.partitions.reduce((sum: number, partition: { timeoutMs: number }) => sum + partition.timeoutMs, 0)
    + test.mergeAllowanceMs + test.terminationAllowanceMs).toBe(test.timeoutMs);
});

/** @id TEST-M5-CI-NATIVE-FANOUT-001
 * @verifies REQ-M5-CI-EFFICIENCY-001
 * @design DES-M5-CI-EFFICIENCY-002
 */
it('TEST-M5-CI-NATIVE-FANOUT-001 reserves ten child slots for nested CLI execution without exceeding sixteen slots', async () => {
  const plan = JSON.parse(await readFile('.musubix/candidate-execution-plan.json', 'utf8'));
  const command = plan.commands.find((entry: { name: string }) => entry.name === 'test');
  expect(command.partitions[1]).toMatchObject({ maxWorkers: 5, fanout: 10 });
  expect(1 + command.partitions[1].maxWorkers + command.partitions[1].fanout).toBe(16);
});

/** @id TEST-M5-LINUX-CALIBRATION-ISOLATED-WORKERS-001
 * @verifies REQ-M5-LINUX-DELIVERY-002
 * @design DES-M5-LINUX-DELIVERY-002
 */
it('TEST-M5-LINUX-CALIBRATION-ISOLATED-WORKERS-001 assigns three workers without exceeding sixteen slots', async () => {
  const plan = JSON.parse(await readFile('.musubix/candidate-execution-plan.json', 'utf8'));
  const command = plan.commands.find((entry: { name: string }) => entry.name === 'test');
  expect(command.partitions[0]).toMatchObject({ maxWorkers: 3, fanout: 12 });
  expect(1 + command.partitions[0].maxWorkers + command.partitions[0].fanout).toBe(16);
});
