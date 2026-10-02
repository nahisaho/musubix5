import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type Stats } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { SourceOperationError } from './tdd-source-diagnostics.js';

export const sourceLfsThreshold = 100_000_000;
export const sourceLogicalLimit = 1_073_741_824;
export const sourceBlobPrefix = '.musubix/evidence/tdd-source/v1/blobs/';
const digestPattern = /^[a-f0-9]{64}$/;
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const attributes = ['text', 'filter', 'diff', 'merge', 'eol', 'working-tree-encoding', 'ident'];
export type SourceBlobSink = (bytes: Buffer) => void | Promise<void>;
export interface SourceLfsPointer { oid: string; size: number }
export interface SourceReadOptions {
  commit?: string;
  verifyWorktree?: boolean;
  historicalAttributes?: boolean;
  dependencies?: SourceLfsDependencies;
}
export interface SourceLfsDependencies {
  /** Explicit isolated-fixture seam; no environment/config switch enables it. */
  admitTestOrigin?: (origin: string) => boolean;
  toolVersion?: (root: string) => Promise<string>;
}
type InvalidCause = 'pointer-schema' | 'pointer-path-digest' | 'pointer-size' | 'logical-size' |
  'logical-digest' | 'mode' | 'attributes' | 'cache-integrity' | 'worktree-integrity' | 'download-integrity';
const invalid = (cause: InvalidCause, digest?: string, size?: number) =>
  new SourceOperationError('TDD_SOURCE_LFS_INVALID', cause, undefined,
    { ...(digest ? { path: sourceBlobPrefix + digest, digest } : {}), ...(size !== undefined ? { size } : {}) });
const errno = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;

export async function sourceGit(
  root: string, args: string[], input?: Buffer, env: NodeJS.ProcessEnv = process.env, limit = 1024 * 1024,
): Promise<Buffer> {
  return new Promise((accept, reject) => {
    const child = execFile('git', ['-C', resolve(root), ...args], {
      encoding: 'buffer', shell: false, env, timeout: 120_000, maxBuffer: limit,
    }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stderr })) : accept(stdout));
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}

/** @id CODE-M5-LFS-CANONICAL-POINTER-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export function parseSourceLfsPointer(bytes: Uint8Array, digest: string): SourceLfsPointer {
  if (bytes.length > 1024 || !digestPattern.test(digest)) throw invalid('pointer-schema');
  const text = Buffer.from(bytes);
  if (text.some((byte) => byte > 127)) throw invalid('pointer-schema', digest);
  const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([a-f0-9]{64})\nsize (0|[1-9][0-9]*)\n$/
    .exec(text.toString('ascii'));
  if (!match) throw invalid('pointer-schema', digest);
  if (match[1] !== digest) throw invalid('pointer-path-digest', digest);
  const size = Number(match[2]);
  if (!Number.isSafeInteger(size) || size < sourceLfsThreshold || size > sourceLogicalLimit) {
    throw invalid('pointer-size', digest);
  }
  return { oid: digest, size };
}

export function sourceLfsPointerBytes(digest: string, size: number): Buffer {
  const bytes = Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${digest}\nsize ${size}\n`);
  parseSourceLfsPointer(bytes, digest);
  return bytes;
}

export function validateSourceLfsVersion(text: string): string {
  if (!text) throw new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE', 'tool-missing');
  const match = /^git-lfs\/([0-9]+)\.([0-9]+)\.([0-9]+)(?:\s|$)/.exec(text);
  if (!match || Number(match[1]) < 3 || Number(match[1]) === 3 &&
    (Number(match[2]) < 4 || Number(match[2]) === 4 && Number(match[3]) < 1)) {
    throw new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE', 'version-unsupported');
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/** @id CODE-M5-LFS-TRANSPORT-POLICY-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export async function verifySourceLfsPolicy(root: string, dependencies: SourceLfsDependencies = {}): Promise<string> {
  let version: string;
  try {
    version = await (dependencies.toolVersion ? dependencies.toolVersion(root)
      : sourceGit(root, ['lfs', 'version']).then((bytes) => bytes.toString()));
  } catch { throw new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE', 'tool-missing'); }
  const verifiedVersion = validateSourceLfsVersion(version);
  let output: Buffer;
  try { output = await sourceGit(root, ['config', '--null', '--list']); }
  catch { throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute'); }
  const config = new Map<string, string>();
  for (const entry of output.toString('utf8').split('\0').filter(Boolean)) {
    const split = entry.indexOf('\n');
    const key = (split < 0 ? entry : entry.slice(0, split)).toLowerCase();
    const value = split < 0 ? '' : entry.slice(split + 1);
    if (/^(?:lfs\.(?:url|pushurl|standalonetransferagent|customtransfer\.|skipdownloaderrors|extension\.)|remote\..*\.lfs(?:url|pushurl)|url\..*\.(?:insteadof|pushinsteadof))/.test(key)) {
      throw invalid('attributes');
    }
    config.set(key, value);
  }
  for (const [key, value] of Object.entries({
    'filter.lfs.process': 'git-lfs filter-process',
    'filter.lfs.clean': 'git-lfs clean -- %f',
    'filter.lfs.smudge': 'git-lfs smudge -- %f',
    'filter.lfs.required': 'true',
  })) if (config.get(key) !== value) throw invalid('attributes');
  if (process.env.GIT_LFS_SKIP_SMUDGE || process.env.GIT_LFS_SKIP_DOWNLOAD_ERRORS ||
    process.env.GIT_SSL_NO_VERIFY || config.get('http.sslverify') === 'false') throw invalid('attributes');
  const origin = config.get('remote.origin.url');
  if (origin && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(origin) &&
    !dependencies.admitTestOrigin?.(origin)) throw invalid('attributes');
  try {
    if ((await lstat(resolve(root, '.lfsconfig'))).isSymbolicLink()) throw invalid('attributes');
    const file = (await readFile(resolve(root, '.lfsconfig'))).toString('utf8');
    if (file.trim()) throw invalid('attributes');
  } catch (error) { if (errno(error) !== 'ENOENT') throw error; }
  return verifiedVersion;
}

/** @id CODE-M5-LFS-EXACT-CLOSURE-FETCH-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013 REQ-M5-RELEASE-002
 * @design DES-M5-012 DES-M5-023
 */
export async function fetchSourceLfsClosure(
  root: string, commit: string, dependencies: SourceLfsDependencies = {},
): Promise<void> {
  if (!oidPattern.test(commit)) throw invalid('pointer-schema');
  await verifySourceLfsPolicy(root, dependencies);
  try {
    await sourceGit(root, ['-c', 'lfs.fetchrecentalways=false', 'lfs', 'fetch', '--all', 'origin', commit],
      undefined, { ...process.env, GIT_TERMINAL_PROMPT: '0' }, 8192);
  } catch (error) {
    const text = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).slice(-8192) : '';
    if (/checksum|digest mismatch|hash mismatch|expected.*(?:oid|size)|incorrect size|does not match.*(?:size|oid)/i.test(text)) {
      throw invalid('download-integrity');
    }
    throw new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE',
      /quota|bandwidth|storage limit/i.test(text) ? 'quota'
        : /\b(?:401|403)\b|authentication|authorization|credentials/i.test(text) ? 'authentication'
          : /\b404\b|object.*(?:missing|not found)/i.test(text) ? 'remote-object-missing' : 'network');
  }
}

const pendingPathStats = new Map<string, Promise<Stats>>();
function pathStat(path: string): Promise<Stats> {
  const pending = pendingPathStats.get(path);
  if (pending) return pending;
  const current = lstat(path);
  pendingPathStats.set(path, current);
  const release = () => {
    if (pendingPathStats.get(path) === current) pendingPathStats.delete(path);
  };
  void current.then(release, release);
  return current;
}

async function noSymlinks(path: string, failure: () => Error, boundary?: string): Promise<void> {
  let current = resolve(path);
  for (;;) {
    try { if ((await pathStat(current)).isSymbolicLink()) throw failure(); }
    catch (error) { if (errno(error) !== 'ENOENT') throw error; }
    if (current === boundary) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

type DirectorySyncWaiter = { accept: () => void; reject: (cause: unknown) => void };
const directorySyncBatches = new Map<string, DirectorySyncWaiter[]>();

async function flushDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try { await directory.sync(); }
  catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EBADF'].includes(errno(error) ?? '')) throw error;
  } finally { await directory.close(); }
}

/** @id CODE-M5-SOURCE-DIRECTORY-SYNC-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-004 DES-M5-023
 */
export function syncSourceDirectory(path: string): Promise<void> {
  path = resolve(path);
  return new Promise<void>((accept, reject) => {
    let batch = directorySyncBatches.get(path);
    if (!batch || batch.length === 64) {
      batch = [];
      directorySyncBatches.set(path, batch);
      const selected = batch;
      setImmediate(() => {
        if (directorySyncBatches.get(path) === selected) directorySyncBatches.delete(path);
        // All members have already published their links before this flush starts.
        void flushDirectory(path).then(
          () => { for (const waiter of selected) waiter.accept(); },
          (cause: unknown) => { for (const waiter of selected) waiter.reject(cause); },
        );
      });
    }
    batch.push({ accept, reject });
  });
}

export async function sourceLfsMediaPath(root: string, digest: string): Promise<string> {
  if (!digestPattern.test(digest)) throw invalid('pointer-path-digest');
  let common: string;
  let override = '';
  try {
    common = (await sourceGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString().trim();
    try { override = (await sourceGit(root, ['config', '--get', 'lfs.storage'])).toString().trim(); }
    catch (error) { if (errno(error) !== '1') throw error; }
  } catch { throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute'); }
  const mediaRoot = override ? resolve(common, override) : resolve(common, 'lfs');
  const inside = relative(common, mediaRoot);
  if (inside.startsWith('..') || isAbsolute(inside)) throw invalid('attributes', digest);
  const path = resolve(mediaRoot, 'objects', digest.slice(0, 2), digest.slice(2, 4), digest);
  await noSymlinks(path, () => invalid('cache-integrity', digest));
  return path;
}

/** @id CODE-M5-LFS-EFFECTIVE-ATTRIBUTES-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export async function sourceBlobAttributes(
  root: string, digests: readonly string[], commit?: string, cachedIndex = false,
): Promise<Map<string, Map<string, string>>> {
  if (digests.some((digest) => !digestPattern.test(digest))) {
    throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
  }
  let scratch: string | undefined;
  let env = process.env;
  try {
    if (commit !== undefined) {
      if (!oidPattern.test(commit)) throw invalid('pointer-schema');
      const common = (await sourceGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString().trim();
      const owner = resolve(common, 'musubix5/scratch/lfs-attributes');
      await mkdir(owner, { recursive: true });
      scratch = await mkdtemp(resolve(owner, 'index-'));
      env = { ...process.env, GIT_INDEX_FILE: resolve(scratch, 'index'), GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' };
      const tree = (await sourceGit(root, ['rev-parse', '--verify', `${commit}^{tree}`], undefined, env)).toString().trim();
      if (!oidPattern.test(tree)) throw invalid('pointer-schema');
      await sourceGit(root, ['read-tree', tree], undefined, env);
    }
    const result = new Map<string, Map<string, string>>();
    const unique = [...new Set(digests)];
    for (let start = 0; start < unique.length; start += 512) {
      const batch = unique.slice(start, start + 512);
      const input = Buffer.from(batch.map((digest) => sourceBlobPrefix + digest + '\0').join(''));
      const output = await sourceGit(root, ['check-attr', '-z', ...(commit || cachedIndex ? ['--cached'] : []),
        '--stdin', ...attributes], input, env);
      const fields = output.toString().split('\0');
      if (fields.pop() !== '' || fields.length !== batch.length * 21) {
        throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'snapshot-unverifiable');
      }
      for (const [index, digest] of batch.entries()) {
        const selected = new Map<string, string>();
        for (const [offset, attribute] of attributes.entries()) {
          const cursor = index * 21 + offset * 3;
          if (fields[cursor] !== sourceBlobPrefix + digest || fields[cursor + 1] !== attribute ||
            typeof fields[cursor + 2] !== 'string') {
            throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'snapshot-unverifiable', undefined,
              { path: sourceBlobPrefix + digest, attribute });
          }
          selected.set(attribute, fields[cursor + 2]!);
        }
        result.set(digest, selected);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof SourceOperationError) throw error;
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute');
  } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
}

export function validateSourceAttributes(
  digest: string, values: Map<string, string>, lfs: boolean, options: { selected?: boolean; historical?: boolean } = {},
): void {
  const valid = values.get('text') === 'unset' &&
    (values.get('eol') === 'unspecified' || options.historical && values.get('eol') === 'lf') &&
    values.get('working-tree-encoding') === 'unspecified' && values.get('ident') === 'unspecified' &&
    (lfs ? ['filter', 'diff', 'merge'].every((name) => values.get(name) === 'lfs')
      : values.get('filter') === 'unspecified');
  if (!valid) {
    if (options.selected) throw invalid('attributes', digest);
    throw new SourceOperationError('TDD_SOURCE_ADMISSION_INVALID', 'snapshot-unverifiable', undefined,
      { path: sourceBlobPrefix + digest });
  }
}

async function streamRegularFile(
  path: string, digest: string, size: number | undefined, sink: SourceBlobSink,
  cause: 'cache-integrity' | 'worktree-integrity' | 'logical-digest', mode?: string,
  ancestorBoundary?: string,
): Promise<number> {
  await noSymlinks(path, () => invalid(cause, digest), ancestorBoundary);
  let stat;
  try { stat = await lstat(path, { bigint: true }); }
  catch (error) {
    if (errno(error) === 'ENOENT' && cause === 'cache-integrity') {
      throw new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE', 'remote-object-missing', undefined,
        { path: sourceBlobPrefix + digest, digest });
    }
    if (errno(error) === 'ENOENT' && cause === 'logical-digest') {
      throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    }
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', undefined, { path: sourceBlobPrefix + digest });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw invalid(cause, digest);
  if (mode && (stat.mode & 0o111n ? '100755' : '100644') !== mode) throw invalid('mode', digest);
  if (stat.size > BigInt(sourceLogicalLimit) || size !== undefined && stat.size !== BigInt(size)) throw invalid(cause, digest);
  const file = await open(path, 'r');
  const before = await file.stat({ bigint: true });
  const hash = createHash('sha256');
  let observed = 0;
  async function* chunks(): AsyncGenerator<Buffer> {
    if (before.size > 65_536n) {
      yield* file.createReadStream({ autoClose: false });
      return;
    }
    for (;;) {
      const bytes = Buffer.alloc(Math.max(1, Number(before.size) - observed + 1));
      const read = await file.read(bytes, 0, bytes.length, observed);
      if (!read.bytesRead) return;
      yield bytes.subarray(0, read.bytesRead);
    }
  }
  try {
    if (before.dev !== stat.dev || before.ino !== stat.ino) throw invalid(cause, digest);
    for await (const bytes of chunks()) {
      observed += bytes.length;
      if (observed > sourceLogicalLimit || size !== undefined && observed > size) throw invalid(cause, digest);
      hash.update(bytes);
      await sink(bytes);
    }
    const after = await file.stat({ bigint: true });
    if (observed !== Number(stat.size) || hash.digest('hex') !== digest ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      if (cause === 'logical-digest') throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
      throw invalid(cause, digest);
    }
    return observed;
  } finally { await file.close(); }
}

export interface SourceBlobBinding {
  digest: string;
  mode: string;
  objectId: string | null;
  size: number;
  pointer: SourceLfsPointer | null;
}

/** Resolve representation from attributes and immutable entry, never by sniffing raw bytes. */
export async function resolveSourceBlobBinding(root: string, digest: string, options: SourceReadOptions = {}): Promise<SourceBlobBinding> {
  if (!digestPattern.test(digest)) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
  const path = sourceBlobPrefix + digest;
  if (!options.commit) {
    const repositoryRoot = await lstat(resolve(root, '.git')).then(() => true, (error: unknown) => {
      if (errno(error) === 'ENOENT') return false;
      throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', undefined, { path });
    });
    if (!repositoryRoot) {
      const stat = await lstat(resolve(root, path));
      return { digest, mode: stat.mode & 0o111 ? '100755' : '100644', objectId: null, size: stat.size, pointer: null };
    }
  }
  let output: Buffer;
  try {
    output = await sourceGit(root, options.commit
      ? ['ls-tree', '-z', options.commit, '--', path] : ['ls-files', '--stage', '-z', '--', path]);
  } catch (error) {
    if (!options.commit && errno(error) === '128' && error && typeof error === 'object' &&
      'stderr' in error && /not a git repository/i.test(String(error.stderr))) {
      const stat = await lstat(resolve(root, path));
      return { digest, mode: stat.mode & 0o111 ? '100755' : '100644', objectId: null, size: stat.size, pointer: null };
    }
    throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute', undefined, { path });
  }
  if (!output.length) {
    if (options.commit) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    const stat = await lstat(resolve(root, path));
    return { digest, mode: stat.mode & 0o111 ? '100755' : '100644', objectId: null, size: stat.size, pointer: null };
  }
  const match = options.commit
    ? /^(100644|100755|120000) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(output.toString())
    : /^(100644|100755|120000) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([^\0]+)\0$/.exec(output.toString());
  if (!match || match[3] !== path) throw invalid('mode', digest);
  const mode = match[1]!, objectId = match[2]!;
  if (mode !== '100644' && mode !== '100755') throw invalid('mode', digest);
  const values = (await sourceBlobAttributes(root, [digest], options.commit, !options.commit)).get(digest)!;
  const lfs = values.get('filter') === 'lfs';
  validateSourceAttributes(digest, values, lfs, {
    selected: Boolean(options.commit), historical: options.historicalAttributes ?? (!lfs && !options.commit),
  });
  let size: number;
  try { size = Number((await sourceGit(root, ['cat-file', '-s', objectId])).toString().trim()); }
  catch { throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read', undefined, { path }); }
  if (!Number.isSafeInteger(size) || size < 0 || size > sourceLogicalLimit) throw invalid('logical-size', digest);
  if (!lfs) return { digest, mode, objectId, size, pointer: null };
  if (size > 1024) throw invalid('pointer-schema', digest);
  const bytes = await sourceGit(root, ['cat-file', 'blob', objectId], undefined, process.env, 1024);
  const pointer = parseSourceLfsPointer(bytes, digest);
  await verifySourceLfsPolicy(root, options.dependencies);
  return { digest, mode, objectId, size: pointer.size, pointer };
}

/** @id CODE-M5-LFS-VERIFIED-SOURCE-STREAM-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export async function readSourceBlobStream(
  root: string, digest: string, sink: SourceBlobSink, options: SourceReadOptions = {},
): Promise<void> {
  let binding: SourceBlobBinding;
  try { binding = await resolveSourceBlobBinding(root, digest, options); }
  catch (error) {
    if (errno(error) === 'ENOENT') throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    throw error;
  }
  await readBoundSourceBlobStream(root, digest, binding, sink, options);
}

async function readBoundSourceBlobStream(
  root: string, digest: string, binding: SourceBlobBinding, sink: SourceBlobSink, options: SourceReadOptions = {},
  rawAncestorBoundary?: string,
): Promise<void> {
  if (!binding.pointer) {
    if (options.commit && binding.objectId) {
      const { spawn } = await import('node:child_process');
      const child = spawn('git', ['-C', resolve(root), 'cat-file', 'blob', binding.objectId], {
        shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' },
      });
      child.stderr.resume();
      const completed = new Promise<void>((accept, reject) => {
        child.once('error', () => reject(new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read')));
        child.once('close', (code) => code === 0 ? accept()
          : reject(new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read')));
      });
      void completed.catch(() => {});
      const timer = setTimeout(() => child.kill(), 120_000);
      let size = 0;
      const hash = createHash('sha256');
      try {
        for await (const bytes of child.stdout) {
          size += bytes.length;
          if (size > binding.size) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
          hash.update(bytes);
          await sink(bytes);
        }
        await completed;
        if (size !== binding.size || hash.digest('hex') !== digest) {
          throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
        }
      } finally { clearTimeout(timer); child.kill(); }
    } else {
      await streamRegularFile(resolve(root, sourceBlobPrefix + digest), digest, binding.size, sink, 'logical-digest',
        undefined, rawAncestorBoundary);
    }
    return;
  }
  const cache = await sourceLfsMediaPath(root, digest);
  // Verify before exposing any bytes to a consumer; the second pass is also verified.
  await streamRegularFile(cache, digest, binding.size, () => {}, 'cache-integrity');
  if (options.verifyWorktree !== false) {
    const path = resolve(root, sourceBlobPrefix + digest);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw invalid('worktree-integrity', digest);
      if ((stat.mode & 0o111 ? '100755' : '100644') !== binding.mode) throw invalid('mode', digest);
      const isPointer = stat.size <= 1024 && (await readFile(path)).equals(sourceLfsPointerBytes(digest, binding.size));
      if (!isPointer) await streamRegularFile(path, digest, binding.size, () => {}, 'worktree-integrity', binding.mode);
    } catch (error) { if (errno(error) !== 'ENOENT') throw error; }
  }
  await streamRegularFile(cache, digest, binding.size, sink, 'cache-integrity');
}

/** @id CODE-M5-SOURCE-BATCHED-READ-FENCE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export function sourceBlobReadSession(root: string): {
  binding: (digest: string) => Promise<SourceBlobBinding>;
  stream: (digest: string, sink: SourceBlobSink) => Promise<void>;
  materialize: (digest: string, target: string, mode: string) => Promise<void>;
  recheck: () => Promise<void>;
} {
  const capture = async (frameOnly = false): Promise<{ fingerprint: string; bindings: Map<string, SourceBlobBinding> }> => {
    const bindings = new Map<string, SourceBlobBinding>();
    try { await lstat(resolve(root, '.git')); }
    catch (error) {
      if (errno(error) === 'ENOENT') return { fingerprint: 'archive', bindings };
      throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read');
    }
    const index = await sourceGit(root, ['ls-files', '--stage', '-z', '--', sourceBlobPrefix],
      undefined, process.env, 8 * 1024 * 1024);
    const entries = index.toString().split('\0').filter(Boolean).map((row) => {
      const match = /^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t\.musubix\/evidence\/tdd-source\/v1\/blobs\/([a-f0-9]{64})$/.exec(row);
      if (!match) throw invalid('mode');
      return { mode: match[1]!, objectId: match[2]!, digest: match[3]! };
    });
    const values = await sourceBlobAttributes(root, entries.map((entry) => entry.digest), undefined, true);
    const fingerprint = createHash('sha256').update(index);
    for (const entry of entries) fingerprint.update(JSON.stringify([entry.digest, [...values.get(entry.digest)!]]));
    if (frameOnly) return { fingerprint: fingerprint.digest('hex'), bindings };
    for (let start = 0; start < entries.length; start += 1024) {
      const batch = entries.slice(start, start + 1024);
      const sizes = (await sourceGit(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
        Buffer.from(batch.map((entry) => entry.objectId + '\n').join('')))).toString().trimEnd().split('\n');
      if (sizes.length !== batch.length) throw invalid('logical-size');
      for (const [offset, entry] of batch.entries()) {
        const attributes = values.get(entry.digest)!;
        const lfs = attributes.get('filter') === 'lfs';
        validateSourceAttributes(entry.digest, attributes, lfs, { historical: !lfs });
        const match = /^([a-f0-9]{40}|[a-f0-9]{64}) blob (0|[1-9][0-9]*)$/.exec(sizes[offset]!);
        const size = match ? Number(match[2]) : NaN;
        if (!match || match[1] !== entry.objectId || !Number.isSafeInteger(size) || size > sourceLogicalLimit) {
          throw invalid('logical-size', entry.digest);
        }
        let pointer: SourceLfsPointer | null = null;
        if (lfs) {
          if (size > 1024) throw invalid('pointer-schema', entry.digest);
          pointer = parseSourceLfsPointer(await sourceGit(root, ['cat-file', 'blob', entry.objectId],
            undefined, process.env, 1024), entry.digest);
          await verifySourceLfsPolicy(root);
        }
        bindings.set(entry.digest, { ...entry, size: pointer?.size ?? size, pointer });
      }
    }
    return { fingerprint: fingerprint.digest('hex'), bindings };
  };
  const safeCapture = async (frameOnly = false) => {
    try { return await capture(frameOnly); }
    catch (error) {
      if (error instanceof SourceOperationError) throw error;
      throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'execute');
    }
  };
  let snapshot: ReturnType<typeof capture> | undefined;
  const rawParents = resolve(root, sourceBlobPrefix);
  let admittedRawParents: Promise<void> | undefined;
  const binding = async (digest: string): Promise<SourceBlobBinding> => {
    if (!digestPattern.test(digest)) throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
    snapshot ??= safeCapture();
    const selected = (await snapshot).bindings.get(digest);
    if (selected) return selected;
    try {
      const stat = await lstat(resolve(root, sourceBlobPrefix + digest));
      return { digest, mode: stat.mode & 0o111 ? '100755' : '100644', objectId: null, size: stat.size, pointer: null };
    } catch (error) {
      if (errno(error) === 'ENOENT') throw new SourceOperationError('TDD_SOURCE_APPROVAL_INVALID', 'blob-hash');
      throw new SourceOperationError('TDD_SOURCE_IO_FAILED', 'read');
    }
  };
  const stream = async (digest: string, sink: SourceBlobSink): Promise<void> => {
    const selected = await binding(digest);
    if (selected.pointer === null) {
      admittedRawParents ??= noSymlinks(rawParents, () => invalid('logical-digest', digest));
      await admittedRawParents;
    }
    await readBoundSourceBlobStream(root, digest, selected, sink, {},
      selected.pointer === null ? rawParents : undefined);
  };
  return {
    binding,
    stream,
    materialize: (digest, target, mode) => materializeSourceBytes(digest, target, mode, (sink) => stream(digest, sink)),
    recheck: async () => {
      if (snapshot && (await snapshot).fingerprint !== (await safeCapture(true)).fingerprint) {
        throw invalid('pointer-schema');
      }
      if (snapshot && [...(await snapshot).bindings.values()].some((binding) => binding.pointer !== null)) {
        await verifySourceLfsPolicy(root);
      }
      if (admittedRawParents) await noSymlinks(rawParents, () => invalid('logical-digest'));
    },
  };
}

/** @id CODE-M5-LFS-ATOMIC-MATERIALIZATION-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013
 * @design DES-M5-023
 */
export async function materializeSourceEntry(
  root: string, digest: string, target: string, mode: string, options: SourceReadOptions = {},
): Promise<void> {
  return materializeSourceBytes(digest, target, mode, (sink) => readSourceBlobStream(root, digest, sink, options));
}

async function materializeSourceBytes(
  digest: string, target: string, mode: string, source: (sink: SourceBlobSink) => Promise<void>,
): Promise<void> {
  if (!['100644', '100755'].includes(mode)) throw invalid('mode', digest);
  await noSymlinks(target, () => invalid('mode', digest));
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await source(async (bytes) => { await handle.writeFile(bytes); });
    await handle.sync();
    await chmod(temporary, mode === '100755' ? 0o755 : 0o644);
    await handle.sync();
    await handle.close();
    await noSymlinks(target, () => invalid('mode', digest));
    await rename(temporary, target);
    await syncSourceDirectory(dirname(target));
  } finally {
    await handle.close();
    await rm(temporary, { force: true });
  }
}
