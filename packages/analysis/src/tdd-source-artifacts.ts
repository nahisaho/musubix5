import { posix } from 'node:path';
import ts from 'typescript';
import { canonicalBytes, sha256 } from './canonical.js';
import { defaultConfig, parseConfig } from './config.js';
import { mapWithConcurrency } from './files.js';
import { SourceOperationError } from './tdd-source-diagnostics.js';
import { sourceHash, sourceObject, sourcePath, validateSourceReview } from './tdd-source-ledger.js';
import { sourceOutputs, sourceSnapshotExclusions, sourceEnvironment, sourceEnvironmentFiles,
  type SourceSnapshotManifest } from './tdd-source-snapshot.js';
import { readSourceBlob, sourceBlobVerification, type SourceBlobReader } from './tdd-source-storage.js';
import type { SourceSnapshotBinding, SourceReview, SourceRun } from './tdd-source-types.js';
import { sourceAdmissionFailure, sourceReviewHunks, spliceCanonicalTestBlock } from './tdd-source-review.js';
import { parseMusubixTestReport } from './test-report.js';
import { testFingerprintFromText, testStatements } from './tdd-test-source.js';

const text = (value: unknown): value is string => typeof value === 'string';
const same = (left: unknown, right: unknown): boolean => canonicalBytes(left).equals(canonicalBytes(right));
const literal = (...values: unknown[]) => (value: unknown): boolean => values.includes(value);
const array = (guard: (value: unknown) => boolean) => (value: unknown): boolean => Array.isArray(value) && value.every(guard);
const nullable = (guard: (value: unknown) => boolean) => (value: unknown): boolean => value === null || guard(value);
const dictionary = (guard: (value: unknown) => boolean) => (value: unknown): boolean =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(guard);
const entryGuard = sourceObject({ path: sourcePath, mode: literal('100644', '100755', '120000', 'missing'),
  sha256: nullable(sourceHash), role: literal('test', 'dependency', 'helper', 'runner', 'config', 'production', 'environment') });
const manifestGuard = sourceObject({
  schemaVersion: literal(1), kind: literal('tdd-source-snapshot'), entries: array(entryGuard),
  excludedPaths: (value) => same(value, sourceSnapshotExclusions), outputs: (value) => same(value, sourceOutputs),
  packages: array(sourceObject({ path: sourcePath, name: text, version: text, manifestSha256: sourceHash,
    lockfileSha256: nullable(sourceHash), integrity: nullable(text), resolved: nullable(text), treeSha256: sourceHash })),
  runtime: sourceObject({ node: text, versions: dictionary(text), platform: text, architecture: text,
    executables: array(sourceObject({ name: text, path: sourcePath, sha256: sourceHash })), npmVersion: text, gitVersion: text }),
  environment: (value) => same(value, sourceEnvironment),
});
const invalid = (): never => { throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash'); };

export async function readCanonicalSourceBlob(root: string, hash: string, reader?: SourceBlobReader): Promise<unknown> {
  const bytes = await (reader ? reader(hash) : readSourceBlob(root, hash));
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch (cause) { if (cause instanceof SyntaxError) return invalid(); throw cause; }
  if (!canonicalBytes(value).equals(bytes)) invalid();
  return value;
}

/** @id CODE-M5-SOURCE-REFERENCES-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export async function verifySourceSnapshotBlobs(root: string, binding: SourceSnapshotBinding,
  read?: SourceBlobReader): Promise<SourceSnapshotManifest> {
  const references = read ? null : sourceBlobVerification(root);
  read ??= references!.read;
  const value = await readCanonicalSourceBlob(root, binding.manifestSha256, read);
  if (!manifestGuard(value)) invalid();
  const manifest = value as SourceSnapshotManifest;
  const entries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  if (entries.size !== manifest.entries.length
    || !same(manifest.entries, [...manifest.entries].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))))) invalid();
  for (const path of sourceEnvironmentFiles) {
    const entry = entries.get(path);
    if (!entry || !same(entry, { path, mode: '100644', role: 'environment', sha256: sha256(Buffer.alloc(0)) })) invalid();
  }
  const links = new Map<string, string>();
  await mapWithConcurrency(manifest.entries, 32, async (entry) => {
    if ((entry.mode === 'missing') !== (entry.sha256 === null)) invalid();
    if (entry.sha256 === null) return;
    const bytes = await read(entry.sha256);
    if (entry.mode === '120000') {
      const target = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (posix.isAbsolute(target) || target.includes('\\')) invalid();
      const path = posix.normalize(posix.join(posix.dirname(entry.path), target));
      if (!sourcePath(path) || (!entries.has(path) && !manifest.entries.some((entry) => entry.path.startsWith(`${path}/`)))) invalid();
      links.set(entry.path, path);
    }
  });
  for (const [path, target] of links) {
    const seen = new Set([path]);
    for (let cursor: string | undefined = target; cursor; cursor = links.get(cursor)) {
      if (seen.has(cursor)) invalid();
      seen.add(cursor);
    }
  }
  for (const executable of manifest.runtime.executables) {
    if (entries.get(executable.path)?.sha256 !== executable.sha256) invalid();
  }
  for (const pkg of manifest.packages) {
    if (entries.get(pkg.path)?.sha256 !== pkg.manifestSha256
      || (pkg.lockfileSha256 !== null && entries.get('package-lock.json')?.sha256 !== pkg.lockfileSha256)) invalid();
    const directory = pkg.path === 'package.json' ? '' : posix.dirname(pkg.path);
    if (sha256(canonicalBytes(manifest.entries.filter((entry) => directory === '' || entry.path.startsWith(`${directory}/`))))
      !== pkg.treeSha256) invalid();
  }
  const [environment, runner, config, production] = await Promise.all([
    readCanonicalSourceBlob(root, binding.environmentSha256, read), readCanonicalSourceBlob(root, binding.runnerSha256, read),
    readCanonicalSourceBlob(root, binding.configSha256, read), readCanonicalSourceBlob(root, binding.productionSha256, read),
  ]);
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!object(runner) || !object(config)) return invalid();
  let command;
  try { command = parseConfig({ ...defaultConfig, commands: [runner.command] }).commands[0]; }
  catch (cause) { if (cause instanceof Error) return invalid(); throw cause; }
  if (!command || !same(command, runner.command)
    || !same(runner, { executable: manifest.runtime.executables[0], command, runtime: manifest.runtime })
    || !same(environment, manifest.environment)
    || !same(config, { command, entries: manifest.entries.filter((entry) => entry.role === 'config') })
    || !same(production, manifest.entries.filter((entry) => ['production', 'helper'].includes(entry.role)))) invalid();
  const { stateSha256, ...state } = binding;
  if (sha256(canonicalBytes({ schemaVersion: 1, ...state })) !== stateSha256) invalid();
  await references?.recheck();
  return manifest;
}

interface OutputEntry { path: string; mode: string; sha256: string }
const inventoryGuard = array(sourceObject({
  path: sourcePath, mode: literal('100644', '100755', '120000'), sha256: sourceHash,
}));

export async function verifySourceRunBlobs(root: string, run: SourceRun,
  read: SourceBlobReader = (hash) => readSourceBlob(root, hash)): Promise<void> {
  const value = await readCanonicalSourceBlob(root, run.reportSha256, read);
  let report;
  try { report = parseMusubixTestReport(JSON.stringify(value)); }
  catch (cause) { if (cause instanceof Error) sourceAdmissionFailure('report-invalid'); throw cause; }
  if (report.tests.length !== 1 || report.tests[0]?.id !== run.testId || report.tests[0].status !== 'passed') {
    sourceAdmissionFailure('report-invalid');
  }
  const inventories = await Promise.all([
    readCanonicalSourceBlob(root, run.outputs.beforeSha256, read),
    readCanonicalSourceBlob(root, run.outputs.afterBuildSha256, read),
    readCanonicalSourceBlob(root, run.outputs.afterSha256, read),
  ]);
  if (!inventories.every(inventoryGuard)) invalid();
  const [before, build, after] = inventories as [OutputEntry[], OutputEntry[], OutputEntry[]];
  for (const entries of [before, build, after]) {
    if (new Set(entries.map((entry) => entry.path)).size !== entries.length
      || !same(entries, [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))))
      || entries.some((entry) => !sourceOutputs.some((output) => entry.path.startsWith(output.path.slice(0, -2))))) invalid();
  }
  if (before.length || !build.length || !build.some((entry) => entry.path === 'dist/packages/cli/src/main.js')
    || build.some((entry) => !entry.path.startsWith('dist/'))
    || !same(build, after.filter((entry) => entry.path.startsWith('dist/')))) sourceAdmissionFailure('pair-mismatch');
}

/** @id CODE-M5-SOURCE-BOUNDARY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
function verifyArchivedSourceBoundary(review: SourceReview, file: Buffer, block: Buffer): void {
  const binding = review.source;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(file); }
  catch (cause) {
    if (cause instanceof TypeError && 'code' in cause && cause.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') invalid();
    throw cause;
  }
  if (binding.annotationStart !== 0 && file[binding.annotationStart - 1] !== 10) invalid();
  const prefix = file.subarray(0, binding.annotationStart).toString('utf8');
  const start = prefix.length;
  const source = ts.createSourceFile(review.scope.path, text, ts.ScriptTarget.Latest, true);
  const statement = testStatements(source).find((entry) => entry.getStart(source) >= start);
  const ids = [...block.toString('utf8').matchAll(/@id\s+(TEST-[A-Z0-9-]+)/g)].map((entry) => entry[1]);
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)
    || Buffer.byteLength(text.slice(0, statement.end)) !== binding.statementEnd
    || !same(ids, [review.scope.testId])
    || !block.toString('utf8').split('\n')[0]?.includes(`@id ${review.scope.testId}`)
    || ts.transpileModule(text, { fileName: review.scope.path, reportDiagnostics: true }).diagnostics?.length
    || testFingerprintFromText({ path: review.scope.path, line: prefix.split('\n').length }, text) !== binding.newFingerprint) {
    invalid();
  }
}

/** @id CODE-M5-SOURCE-ARTIFACT-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export async function verifySourcePairBlobs(
  root: string, review: SourceReview, snapshot: Pick<SourceSnapshotManifest, 'entries'>,
  read: SourceBlobReader = (hash) => readSourceBlob(root, hash),
): Promise<void> {
  if (!validateSourceReview(review).valid) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'review-schema');
  const source = review.source;
  if (snapshot.entries.find((entry) => entry.path === review.scope.path)?.sha256 !== source.currentFileSha256) invalid();
  const [file, newBlock] = await Promise.all([
    read(source.currentFileSha256), read(source.newBlockSha256),
  ]);
  if (!file.subarray(source.annotationStart, source.statementEnd).equals(newBlock)) invalid();
  verifyArchivedSourceBoundary(review, file, newBlock);
  if (review.mode === 'behavior-change') {
    if (source.oldBlockSha256) await read(source.oldBlockSha256);
    return;
  }
  const value = await readCanonicalSourceBlob(root, review.pair.manifestSha256, read);
  const natural = (value: unknown): boolean => Number.isSafeInteger(value) && Number(value) >= 0;
  const chunk = sourceObject({ sha256: sourceHash, length: natural });
  const shape = sourceObject({
    schemaVersion: literal(1), kind: literal('tdd-source-pair'), nodeId: text, path: sourcePath,
    annotationStart: natural, oldStatementEnd: natural, newStatementEnd: natural,
    oldBlockSha256: sourceHash, newBlockSha256: sourceHash, oldFingerprint: sourceHash, newFingerprint: sourceHash,
    prefix: chunk, suffix: chunk,
  });
  if (!shape(value)) invalid();
  const manifest = value as {
    prefix: { sha256: string; length: number }; suffix: { sha256: string; length: number };
  };
  const [prefix, suffix, oldBlock] = await Promise.all([
    read(manifest.prefix.sha256), read(manifest.suffix.sha256), read(source.oldBlockSha256!),
  ]);
  if (!same(value, {
    schemaVersion: 1, kind: 'tdd-source-pair', nodeId: review.scope.testId, path: review.scope.path,
    annotationStart: prefix.length, oldStatementEnd: prefix.length + oldBlock.length,
    newStatementEnd: prefix.length + newBlock.length, oldBlockSha256: source.oldBlockSha256,
    newBlockSha256: source.newBlockSha256, oldFingerprint: source.oldFingerprint, newFingerprint: source.newFingerprint,
    prefix: { sha256: manifest.prefix.sha256, length: prefix.length },
    suffix: { sha256: manifest.suffix.sha256, length: suffix.length },
  }) || !Buffer.concat([prefix, newBlock, suffix]).equals(file)
    || prefix.length !== source.annotationStart || (prefix.length && prefix.at(-1) !== 10)) invalid();
  const decode = (bytes: Buffer): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (cause) { if (cause instanceof TypeError) return invalid(); throw cause; }
  };
  const node = { id: review.scope.testId, path: review.scope.path, line: decode(prefix).split('\n').length };
  const splice = spliceCanonicalTestBlock(node, decode(file), decode(oldBlock), source.oldFingerprint);
  if (splice.annotationStart !== source.annotationStart || splice.statementEnd !== source.statementEnd
    || splice.newFingerprint !== source.newFingerprint || splice.newBlock !== decode(newBlock)) invalid();
  const coordinates = review.hunks.map(({ oldStart, oldLength, newStart, newLength }) => ({ oldStart, oldLength, newStart, newLength }));
  if (!same(coordinates, sourceReviewHunks(decode(oldBlock), decode(newBlock)))
    || review.hunks.some((hunk) => !hunk.requirementIds.includes(review.scope.requirementId))) {
    sourceAdmissionFailure('equivalence-unconfirmed');
  }
  await Promise.all(review.hunks.flatMap((hunk) => hunk.supportingBlobSha256s).map(read));
  for (const [run, bytes] of [[review.pair.oldRun, Buffer.from(splice.oldFile)], [review.pair.newRun, file]] as const) {
    const expected = snapshot.entries.map((entry) => entry.path === review.scope.path ? { ...entry, sha256: sha256(bytes) } : entry);
    if (run.preInputManifestSha256 !== sha256(canonicalBytes(expected))) invalid();
    await verifySourceRunBlobs(root, run, read);
  }
}

export async function verifySourceReviewBlobs(root: string, review: SourceReview,
  read: SourceBlobReader = (hash) => readSourceBlob(root, hash)): Promise<SourceSnapshotManifest> {
  const manifest = await verifySourceSnapshotBlobs(root, review.snapshot, read);
  await verifySourcePairBlobs(root, review, manifest, read);
  const runner = await readCanonicalSourceBlob(root, review.snapshot.runnerSha256, read);
  if (!runner || typeof runner !== 'object' || !('command' in runner)
    || !runner.command || typeof runner.command !== 'object' || !('name' in runner.command)
    || runner.command.name !== review.scope.command) invalid();
  return manifest;
}
