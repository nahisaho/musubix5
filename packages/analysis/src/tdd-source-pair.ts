import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalBytes, sha256 } from './canonical.js';
import { mapWithConcurrency } from './files.js';
import { runProcess } from './process.js';
import type { CommandConfig } from './config.js';
import { adapterInvocation, mergeAdapterArgs, normalizeAdapterReport } from './adapters.js';
import { parseMusubixTestReport } from './test-report.js';
import { sourceAdmissionFailure, type spliceCanonicalTestBlock } from './tdd-source-review.js';
import { captureSourceSnapshot, sourceOutputs, type CapturedSourceSnapshot, type SourceSnapshotEntry } from './tdd-source-snapshot.js';
import { readSourceBlob, storeSourceBlob } from './tdd-source-storage.js';
import type { SourcePair, SourceRun } from './tdd-source-types.js';
import { sourcePath } from './tdd-source-ledger.js';
import { SourceOperationError } from './tdd-source-diagnostics.js';

const execute = promisify(execFile);
interface InventoryEntry { path: string; mode: string; sha256: string }
const hash = (value: unknown): string => sha256(canonicalBytes(value));

async function inventory(root: string): Promise<InventoryEntry[]> {
  const paths: Array<{ path: string; symlink: boolean }> = [];
  const walk = async (path: string): Promise<void> => {
    for (const child of await readdir(resolve(root, path), { withFileTypes: true })) {
      const relative = path ? `${path}/${child.name}` : child.name;
      if (child.isDirectory()) await walk(relative);
      else if (child.isSymbolicLink() || child.isFile()) paths.push({ path: relative, symlink: child.isSymbolicLink() });
      else sourceAdmissionFailure('snapshot-unverifiable');
    }
  };
  await walk('');
  const entries = await mapWithConcurrency(paths, 32, async ({ path, symlink }): Promise<InventoryEntry> => {
    const absolute = resolve(root, path);
    if (symlink) return { path, mode: '120000', sha256: sha256(Buffer.from(await readlink(absolute))) };
    const stat = await lstat(absolute);
    return { path, mode: stat.mode & 0o111 ? '100755' : '100644', sha256: sha256(await readFile(absolute)) };
  });
  return entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}

function output(path: string): boolean {
  return sourceOutputs.some((entry) => path.startsWith(entry.path.slice(0, -2)));
}

async function verifyInputs(root: string, expected: SourceSnapshotEntry[]): Promise<{
  inputSha256: string; outputs: InventoryEntry[];
}> {
  const all = await inventory(root);
  const actual = new Map(all.map((entry) => [entry.path, entry]));
  for (const entry of expected) {
    const observed = actual.get(entry.path);
    if (entry.mode === 'missing') {
      if (observed) sourceAdmissionFailure('input-drift');
    } else if (!observed || observed.mode !== entry.mode || observed.sha256 !== entry.sha256) {
      sourceAdmissionFailure('input-drift');
    }
  }
  const paths = new Set(expected.map((entry) => entry.path));
  if (all.some((entry) => !paths.has(entry.path) && !output(entry.path))) sourceAdmissionFailure('snapshot-unverifiable');
  return { inputSha256: hash(expected), outputs: all.filter((entry) => output(entry.path) && !paths.has(entry.path)) };
}

async function materialize(root: string, blobs: string, entries: SourceSnapshotEntry[]): Promise<void> {
  await mkdir(root, { recursive: false });
  await mapWithConcurrency(entries, 32, async (entry) => {
    if (entry.mode === 'missing') return;
    const path = resolve(root, entry.path);
    await mkdir(dirname(path), { recursive: true });
    const bytes = await readSourceBlob(blobs, entry.sha256!);
    if (entry.mode === '120000') await symlink(bytes.toString('utf8'), path);
    else {
      await writeFile(path, bytes, { flag: 'wx' });
      await chmod(path, entry.mode === '100755' ? 0o755 : 0o644);
    }
  });
  for (const directory of ['home', 'config', 'cache', 'tmp', 'git-template']) {
    await mkdir(resolve(root, '.run-tmp', directory), { recursive: true });
  }
}

/** @id CODE-M5-SOURCE-RUNNER-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function sourceRunInvocation(command: CommandConfig, node: { id: string; path: string }): {
  args: string[]; reportPath: string;
} {
  if (!['node', 'npm', 'npx'].includes(command.command) || (command.cwd && command.cwd !== '.')
    || (!command.adapter && (!command.tddArgs?.length || !command.tddReport))) {
    sourceAdmissionFailure('snapshot-unverifiable');
  }
  const adapter = command.adapter ? adapterInvocation(command.adapter, command.name, node.id, node.path) : null;
  const render = (value: string, report = ''): string => value
    .replaceAll('{testId}', node.id).replaceAll('{testPath}', node.path).replaceAll('{reportPath}', report);
  const reportPath = command.tddReport ? render(command.tddReport.path) : adapter?.reportPath;
  if (!reportPath || !sourcePath(reportPath) || !reportPath.startsWith('.musubix/cache/')) {
    sourceAdmissionFailure('snapshot-unverifiable');
  }
  const configured = command.args.map((value) => render(value, reportPath));
  const targeted = command.tddArgs?.map((value) => render(value, reportPath)) ?? adapter!.args;
  return { reportPath, args: command.adapter
    ? mergeAdapterArgs(command.adapter, configured, targeted) : [...configured, ...targeted] };
}

/** @id CODE-M5-SOURCE-PAIR-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
async function executeSourceVariants(
  sourceRoot: string, blobRoot: string, snapshot: CapturedSourceSnapshot, command: CommandConfig,
  node: { id: string; path: string; line: number },
  variants: Array<{ name: 'old' | 'new'; file: string; fingerprint: string }>,
): Promise<{ runs: SourceRun[]; built: InventoryEntry[][] }> {
  const common = (await execute('git', ['-C', sourceRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'])).stdout.trim();
  const invocationId = randomUUID();
  const scratch = join(common, 'musubix5/scratch/tdd-source', hash({ node, snapshot: snapshot.binding }), invocationId);
  await mkdir(scratch, { recursive: true });
  const runs: SourceRun[] = [];
  const built: InventoryEntry[][] = [];
  const initialBinding = snapshot.binding.stateSha256;
  try {
    for (const variant of variants) {
      const beforeSnapshot = await captureSourceSnapshot(sourceRoot, command, node.path);
      if (beforeSnapshot.binding.stateSha256 !== initialBinding) sourceAdmissionFailure('input-drift');
      const root = join(scratch, variant.name);
      const sourceSha256 = await storeSourceBlob(blobRoot, Buffer.from(variant.file));
      const entries = snapshot.manifest.entries.map((entry) => entry.path === node.path
        ? { ...entry, sha256: sourceSha256 } : entry);
      await materialize(root, blobRoot, entries);
      const before = await verifyInputs(root, entries);
      if (before.outputs.length) sourceAdmissionFailure('pair-mismatch');
      const { reportPath, args } = sourceRunInvocation(command, node);
      const env = Object.fromEntries(Object.entries(snapshot.manifest.environment)
        .map(([key, value]) => [key, value.replaceAll('$ROOT', root)]));
      const startedAt = new Date().toISOString();
      const execution = await runProcess(resolve(root, '.musubix-runtime/bin', command.command), args,
        { cwd: root, env, timeoutMs: command.timeoutMs });
      const completedAt = new Date().toISOString();
      if (execution.status !== 'completed' || execution.exitCode === null) {
        throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute', undefined, { stage: `${variant.name}-run` });
      }
      if (execution.exitCode !== 0) sourceAdmissionFailure('selected-run-failed');
      const raw = await readFile(resolve(root, reportPath), 'utf8');
      const report = command.tddReport ? parseMusubixTestReport(raw)
        : normalizeAdapterReport(command.adapter!, raw, node.id);
      if (report.tests.length !== 1 || report.tests[0]?.id !== node.id || report.tests[0].status !== 'passed') {
        sourceAdmissionFailure('selected-run-failed');
      }
      const after = await verifyInputs(root, entries);
      const build = after.outputs.filter((entry) => entry.path.startsWith('dist/'));
      if (!build.length || !build.some((entry) => entry.path === 'dist/packages/cli/src/main.js')) {
        sourceAdmissionFailure('pair-mismatch');
      }
      built.push(build);
      const reportSha256 = await storeSourceBlob(blobRoot, canonicalBytes(report));
      const fingerprint = variant.fingerprint;
      const outputs = {
        beforeSha256: await storeSourceBlob(blobRoot, canonicalBytes(before.outputs)),
        afterBuildSha256: await storeSourceBlob(blobRoot, canonicalBytes(build)),
        afterSha256: await storeSourceBlob(blobRoot, canonicalBytes(after.outputs)),
      };
      runs.push({
        invocationId: randomUUID(), testId: node.id, command: command.name, startedAt, completedAt,
        exitCode: execution.exitCode, runnerSha256: snapshot.binding.runnerSha256,
        configSha256: snapshot.binding.configSha256, environmentSha256: snapshot.binding.environmentSha256,
        reportSha256, preSourceSha256: fingerprint, postSourceSha256: fingerprint,
        preProductionSha256: snapshot.binding.productionSha256, postProductionSha256: snapshot.binding.productionSha256,
        preInputManifestSha256: before.inputSha256, postInputManifestSha256: after.inputSha256, outputs,
      });
      const afterSnapshot = await captureSourceSnapshot(sourceRoot, command, node.path);
      if (afterSnapshot.binding.stateSha256 !== initialBinding) sourceAdmissionFailure('input-drift');
    }
    return { runs, built };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function verifySyntheticPair(
  sourceRoot: string, blobRoot: string, snapshot: CapturedSourceSnapshot, command: CommandConfig,
  node: { id: string; path: string; line: number }, splice: ReturnType<typeof spliceCanonicalTestBlock>,
): Promise<SourcePair> {
  const { runs, built } = await executeSourceVariants(sourceRoot, blobRoot, snapshot, command, node, [
    { name: 'old', file: splice.oldFile, fingerprint: splice.oldFingerprint },
    { name: 'new', file: splice.prefix + splice.newBlock + splice.suffix, fingerprint: splice.newFingerprint },
  ]);
  if (hash(built[0]) !== hash(built[1])) sourceAdmissionFailure('pair-mismatch');
  const manifest = {
    schemaVersion: 1, kind: 'tdd-source-pair', nodeId: node.id, path: node.path,
    annotationStart: splice.annotationStart, oldStatementEnd: splice.oldStatementEnd, newStatementEnd: splice.statementEnd,
    oldBlockSha256: await storeSourceBlob(blobRoot, Buffer.from(splice.oldBlock)),
    newBlockSha256: await storeSourceBlob(blobRoot, Buffer.from(splice.newBlock)),
    oldFingerprint: splice.oldFingerprint, newFingerprint: splice.newFingerprint,
    prefix: { sha256: await storeSourceBlob(blobRoot, Buffer.from(splice.prefix)), length: Buffer.byteLength(splice.prefix) },
    suffix: { sha256: await storeSourceBlob(blobRoot, Buffer.from(splice.suffix)), length: Buffer.byteLength(splice.suffix) },
  };
  return {
    manifestSha256: await storeSourceBlob(blobRoot, canonicalBytes(manifest)),
    oldReportSha256: runs[0]!.reportSha256, newReportSha256: runs[1]!.reportSha256,
    oldRun: runs[0]!, newRun: runs[1]!,
  };
}

export async function verifySourceExecution(
  sourceRoot: string, blobRoot: string, snapshot: CapturedSourceSnapshot, command: CommandConfig,
  node: { id: string; path: string; line: number }, file: string, fingerprint: string,
): Promise<SourceRun> {
  return (await executeSourceVariants(sourceRoot, blobRoot, snapshot, command, node,
    [{ name: 'new', file, fingerprint }])).runs[0]!;
}
