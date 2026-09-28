import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { link, lstat, mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sha256 } from './canonical.js';
import { sourceHash, sourcePath } from './tdd-source-ledger.js';
import { SourceOperationError, sourceIoFailure } from './tdd-source-diagnostics.js';
import { mapWithConcurrency } from './files.js';

export const sourceEvidencePrefix = '.musubix/evidence/tdd-source/v1';
const executeGit = promisify(execFile);

/** @id CODE-M5-SOURCE-BLOB-ATTRIBUTE-ADMISSION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-023
 */
export async function verifySourceBlobGitAttributes(root: string, digests: readonly string[]): Promise<void> {
  if (digests.some((digest) => !sourceHash(digest))) {
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
  }
  const attributes = ['text', 'filter', 'working-tree-encoding', 'ident'];
  const paths = [...new Set(digests)].map((digest) => `${sourceEvidencePrefix}/blobs/${digest}`);
  for (let start = 0; start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
    let stdout: string;
    try {
      ({ stdout } = await executeGit('git', ['-C', resolve(root), 'check-attr', '-z', ...attributes, '--', ...batch],
        { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 }));
    } catch {
      throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute', undefined, { path: root });
    }
    const fields = stdout.split('\0');
    if (fields.pop() !== '' || fields.length !== batch.length * attributes.length * 3) {
      throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'snapshot-unverifiable', undefined, { path: root });
    }
    for (const [index, path] of batch.entries()) {
      for (const [offset, attribute] of attributes.entries()) {
        const cursor = (index * attributes.length + offset) * 3;
        const value = fields[cursor + 2];
        if (fields[cursor] !== path || fields[cursor + 1] !== attribute
          || (attribute === 'text' ? value !== 'unset' : value !== 'unset' && value !== 'unspecified')) {
          throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'snapshot-unverifiable', undefined, { path });
        }
      }
    }
  }
}

export async function publishSourceBlob(root: string, bytes: Uint8Array): Promise<string> {
  const digest = sha256(bytes);
  await verifySourceBlobGitAttributes(root, [digest]);
  await publishSourceFile(root, `${sourceEvidencePrefix}/blobs/${digest}`, bytes,
    () => verifySourceBlobGitAttributes(root, [digest]));
  return digest;
}

function errno(cause: unknown): string | undefined {
  return cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : undefined;
}

export async function sourceSafePath(root: string, path: string): Promise<string> {
  if (!sourcePath(path) || !path.startsWith(`${sourceEvidencePrefix}/`)) {
    throw new Error('CLI_ERROR: unsafe-path');
  }
  let current = resolve(root);
  if ((await lstat(current).catch((cause: unknown) => sourceIoFailure(cause, 'read', undefined, { path })))
    .isSymbolicLink()) throw new Error('CLI_ERROR: unsafe-path');
  for (const part of path.split('/')) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('CLI_ERROR: unsafe-path');
    } catch (cause) {
      if (errno(cause) !== 'ENOENT') sourceIoFailure(cause, 'read', undefined, { path });
    }
  }
  return current;
}

export async function syncSourceDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (cause) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EBADF'].includes(errno(cause) ?? '')) {
      sourceIoFailure(cause, 'fsync', undefined, { path });
    }
  } finally {
    await handle?.close();
  }
}

/** @id CODE-M5-SOURCE-PUBLICATION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-023
 */
export async function publishSourceFile(
  root: string, path: string, bytes: Uint8Array, authorize: () => Promise<void> = async () => {},
): Promise<void> {
  const target = await sourceSafePath(root, path);
  await authorize();
  try {
    if (!Buffer.from(bytes).equals(await readFile(target))) {
      throw new Error('TDD_SOURCE_REPLAY_INVALID: request-mismatch');
    }
    return;
  } catch (cause) {
    if (errno(cause) !== 'ENOENT') sourceIoFailure(cause, 'read', undefined, { path });
  }
  await mkdir(dirname(target), { recursive: true })
    .catch((cause: unknown) => sourceIoFailure(cause, 'atomic-replace', undefined, { path }));
  await sourceSafePath(root, path);
  const staging = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await open(staging, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync().catch((cause: unknown) => sourceIoFailure(cause, 'fsync', undefined, { path }));
    }
    finally { await handle.close(); }
    await authorize();
    await sourceSafePath(root, path);
    try {
      await link(staging, target);
    } catch (cause) {
      if (errno(cause) !== 'EEXIST') throw cause;
      await sourceSafePath(root, path);
      if (!Buffer.from(bytes).equals(await readFile(target))) {
        throw new Error('TDD_SOURCE_REPLAY_INVALID: request-mismatch');
      }
    }
    await syncSourceDirectory(dirname(target));
  } catch (cause) {
    sourceIoFailure(cause, 'atomic-replace', undefined, { path });
  } finally {
    await rm(staging, { force: true })
      .catch((cause: unknown) => sourceIoFailure(cause, 'atomic-replace', undefined, { path }));
  }
}

export async function storeSourceBlob(root: string, bytes: Uint8Array): Promise<string> {
  const digest = sha256(bytes);
  await publishSourceFile(root, `${sourceEvidencePrefix}/blobs/${digest}`, bytes);
  return digest;
}

export async function readSourceBlob(root: string, digest: string): Promise<Buffer> {
  if (!sourceHash(digest)) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
  const path = await sourceSafePath(root, `${sourceEvidencePrefix}/blobs/${digest}`);
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch (cause) {
    if (errno(cause) === 'ENOENT') throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', undefined, { path: `${sourceEvidencePrefix}/blobs/${digest}` });
  }
  if (sha256(bytes) !== digest) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
  return bytes;
}

export type SourceBlobReader = (digest: string) => Promise<Buffer>;

/** @id CODE-M5-SOURCE-READ-FENCE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-007 DES-M5-023
 */
export function sourceBlobVerification(root: string): {
  read: SourceBlobReader; recheck: () => Promise<void>; verifyGitAttributes: () => Promise<void>;
} {
  const stamps = new Map<string, string>();
  let attributesAdmitted = false;
  const verifyGitAttributes = async (): Promise<void> => {
    await verifySourceBlobGitAttributes(root, [...stamps.keys()]);
    attributesAdmitted = true;
  };
  const stamp = async (digest: string): Promise<string> => {
    let value;
    try { value = await lstat(resolve(root, sourceEvidencePrefix, 'blobs', digest), { bigint: true }); }
    catch (cause) {
      if (errno(cause) === 'ENOENT') throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
      sourceIoFailure(cause, 'read', undefined, { path: `${sourceEvidencePrefix}/blobs/${digest}` });
    }
    if (!value.isFile() || value.isSymbolicLink()) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    return [value.dev, value.ino, value.mode, value.size, value.mtimeNs, value.ctimeNs].join(':');
  };
  const read: SourceBlobReader = async (digest) => {
    if (!sourceHash(digest)) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    const before = await stamp(digest);
    const bytes = await readSourceBlob(root, digest);
    const after = await stamp(digest);
    if (after !== before) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    stamps.set(digest, after);
    return bytes;
  };
  return { read, verifyGitAttributes, recheck: async () => {
    if (!stamps.size) return;
    if (attributesAdmitted) await verifyGitAttributes();
    await sourceSafePath(root, `${sourceEvidencePrefix}/blobs`);
    await mapWithConcurrency([...stamps], 32, async ([digest, previous]) => {
      if (await stamp(digest) !== previous) await read(digest);
    });
  } };
}
