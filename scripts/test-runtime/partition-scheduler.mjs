import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launchCountedProcess } from './counted-launcher.mjs';

export async function writePartitionManifest(groups, path) {
  const { canonicalBytes, sha256 } = await import('../../dist/packages/analysis/src/canonical.js');
  const acknowledgments = [];
  for (const group of groups) {
    const ackPath = resolve(dirname(group.env.MUSUBIX5_TEST_RUNTIME_REQUEST), 'ack.json');
    let ack, result;
    try { [ack, result] = await Promise.all([readFile(ackPath), readFile(group.resultPath)]); }
    catch { throw new Error(`CANDIDATE_PARTITION_INVALID: partition-${group.ordinal}: missing acknowledgment or result`); }
    const processResult = JSON.parse(result);
    acknowledgments.push({ ordinal: group.ordinal, ackPath, ackDigest: sha256(ack),
      resultPath: group.resultPath, resultDigest: sha256(result),
      startedAt: processResult.startedAt, completedAt: processResult.completedAt });
  }
  await writeFile(path, canonicalBytes({ schemaVersion: 1, acknowledgments }), { flag: 'wx', mode: 0o600 });
}

/** @id CODE-M5-CI-PARTITION-SCHEDULER-001
 * @implements REQ-M5-CI-EFFICIENCY-001 REQ-M5-CI-EFFICIENCY-002
 * @design DES-M5-CI-EFFICIENCY-002
 */
export async function runPartitionScheduler(commandName) {
  const { loadCandidateExecutionPlan } = await import('../../dist/packages/analysis/src/candidate-execution-plan.js');
  const option = name => {
    const index = process.argv.indexOf(name);
    if (index >= 0) return process.argv[index + 1];
    return process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  };
  const reportPath = resolve(option('--report') ?? option('--outputFile') ?? `.musubix/cache/test-results/${commandName}.json`);
  const { plan } = await loadCandidateExecutionPlan(process.cwd());
  const command = plan.commands.find(command => command.name === commandName);
  if (!command?.partitions.length) throw new Error('CANDIDATE_PARTITION_INVENTORY_MISSING');
  const groups = command.partitions.map(partition => ({
    ordinal: partition.ordinal, testIds: partition.testIds, testFiles: partition.files, command: process.execPath,
    args: [resolve('node_modules/vitest/vitest.mjs'), 'run', ...partition.files,
      `--pool=${partition.pool}`, `--maxWorkers=${partition.maxWorkers}`, '--reporter=json',
      `--outputFile=${resolve(dirname(reportPath), `partition-${partition.id}.json`)}`],
  }));
  if (process.argv.includes('--describe-groups')) {
    console.log(JSON.stringify({ schemaVersion: 1, groups }));
    return;
  }
  const dispatch = JSON.parse(await readFile(option('--runtime-dispatch'), 'utf8'));
  if (dispatch.schemaVersion !== 1 || dispatch.groups.length !== groups.length) throw new Error('CANDIDATE_PARTITION_DISPATCH_INVALID');
  await mkdir(dirname(reportPath), { recursive: true });
  let failed = false;
  const waves = [...new Set(command.partitions.map(p => p.wave))].sort((a,b) => a-b);
  for (const wave of waves) {
    await Promise.all(command.partitions.filter(p => p.wave === wave).map(async partition => {
      const group = dispatch.groups[partition.ordinal];
      if (group.ordinal !== partition.ordinal || group.command !== process.execPath) throw new Error(`CANDIDATE_PARTITION_DISPATCH_INVALID: ${partition.id}`);
      const startedAt = Number(process.hrtime.bigint()) / 1_000_000;
      const result = await launchCountedProcess(group.command, group.args, {
        env: group.env, partition: partition.id, maxWorkers: partition.maxWorkers,
        timeoutMs: partition.timeoutMs, captureBytes: 4096,
      });
      const path = resolve(dirname(reportPath), `partition-${partition.id}.json`);
      let nativeReportBase64 = null;
      try { nativeReportBase64 = (await readFile(path)).toString('base64'); } catch {}
      await writeFile(group.resultPath, `${JSON.stringify({ status: result.status, exitCode: result.exitCode,
        durationMs: result.durationMs, nativeReportBase64, stdoutTail: result.stdoutTail,
        stderrTail: result.stderrTail, childErrorMessage: result.error?.message ?? null, startedAt,
        completedAt: Number(process.hrtime.bigint()) / 1_000_000 })}\n`, { flag: 'wx', mode: 0o600 });
      failed ||= result.status !== 'completed' || result.exitCode !== 0;
    }));
  }
  await writePartitionManifest(dispatch.groups, process.env.MUSUBIX5_CANDIDATE_PARTITION_MANIFEST);
  if (failed) process.exitCode = 1;
}
