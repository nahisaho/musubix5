import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { readSourceBlobStream, parseSourceLfsPointer, verifySourceLfsPolicy, sourceBlobAttributes,
  fetchSourceLfsClosure } from './tdd-source-lfs.js';
import { SourceOperationError, type SourceReason } from './tdd-source-diagnostics.js';

const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const sourcePrefix = '.musubix/evidence/tdd-source/v1/blobs/';
const scanFailure = () => new Error('CANDIDATE_GIT_OBJECT_SCAN_FAILED: incomplete object scan.');
function lfsFailure(code: 'INVALID', reason: SourceReason<'TDD_SOURCE_LFS_INVALID'>): SourceOperationError;
function lfsFailure(code: 'UNAVAILABLE', reason: SourceReason<'TDD_SOURCE_LFS_UNAVAILABLE'>): SourceOperationError;
function lfsFailure(code: 'INVALID' | 'UNAVAILABLE', reason: SourceReason<'TDD_SOURCE_LFS_INVALID'> |
  SourceReason<'TDD_SOURCE_LFS_UNAVAILABLE'>): SourceOperationError {
  return code === 'INVALID'
    ? new SourceOperationError('TDD_SOURCE_LFS_INVALID', reason as SourceReason<'TDD_SOURCE_LFS_INVALID'>)
    : new SourceOperationError('TDD_SOURCE_LFS_UNAVAILABLE', reason as SourceReason<'TDD_SOURCE_LFS_UNAVAILABLE'>);
}

export function candidateGitEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return { ...env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
}

class Scan {
  private readonly children = new Set<ChildProcessWithoutNullStreams>();
  private readonly deadline = performance.now() + 120_000;
  private readonly timer = setTimeout(() => this.abort(), 120_000);
  private aborted = false;
  constructor(readonly root: string) { this.timer.unref(); }
  check(): void { if (this.aborted || performance.now() >= this.deadline) throw scanFailure(); }
  abort(): void { this.aborted = true; for (const child of this.children) child.kill(); }
  close(): void { clearTimeout(this.timer); for (const child of this.children) child.kill(); }
  child(args: string[]): { process: ChildProcessWithoutNullStreams; done: Promise<void> } {
    this.check();
    const process = spawn('git', ['-C', resolve(this.root), ...args], {
      shell: false, env: candidateGitEnvironment(), stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.add(process);
    let tail = Buffer.alloc(0);
    process.stderr.on('data', (bytes: Buffer) => {
      tail = Buffer.concat([tail, bytes.subarray(-8192)]).subarray(-8192);
    });
    const done = new Promise<void>((accept, reject) => {
      process.once('error', () => reject(scanFailure()));
      process.once('close', (code) => {
        this.children.delete(process);
        if (code === 0 && !this.aborted) accept(); else reject(scanFailure());
      });
    });
    void done.catch(() => {});
    process.stdin.on('error', () => {});
    return { process, done };
  }
  async small(args: string[], limit = 4096): Promise<Buffer> {
    const { process, done } = this.child(args);
    process.stdin.end();
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of process.stdout) {
      this.check();
      length += (chunk as Buffer).length;
      if (length > limit) { this.abort(); throw scanFailure(); }
      chunks.push(chunk as Buffer);
    }
    await done;
    this.check();
    return Buffer.concat(chunks);
  }
}

async function* records(stream: NodeJS.ReadableStream, separator: number, limit: number): AsyncGenerator<Buffer> {
  let pending = Buffer.alloc(0);
  for await (const bytes of stream) {
    let chunk = bytes as Buffer;
    for (;;) {
      const end = chunk.indexOf(separator);
      if (end < 0) {
        if (pending.length + chunk.length > limit) throw scanFailure();
        pending = Buffer.concat([pending, chunk]);
        break;
      }
      if (pending.length + end > limit) throw scanFailure();
      yield Buffer.concat([pending, chunk.subarray(0, end)]);
      pending = Buffer.alloc(0);
      chunk = chunk.subarray(end + 1);
    }
  }
  if (pending.length) throw scanFailure();
}

function validRef(ref: string): boolean {
  return ref === 'HEAD' || oidPattern.test(ref) ||
    /^refs\/(?:heads|tags|remotes)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)
    && !ref.includes('..') && !ref.includes('//') && !ref.endsWith('/') && !ref.endsWith('.lock');
}

async function freeze(scan: Scan, ref: string): Promise<string> {
  if (typeof ref !== 'string' || !validRef(ref)) throw new Error('CANDIDATE_GIT_REF_INVALID: invalid candidate ref.');
  let commit: string;
  try { commit = (await scan.small(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).toString().trim(); }
  catch { throw new Error('CANDIDATE_GIT_REF_INVALID: candidate ref cannot be resolved.'); }
  if (!oidPattern.test(commit)) throw new Error('CANDIDATE_GIT_REF_INVALID: invalid candidate commit.');
  const common = (await scan.small(['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString().trim();
  for (const name of ['shallow', 'info/grafts']) {
    if (await lstat(resolve(common, name)).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false; throw scanFailure();
    })) throw scanFailure();
  }
  const config = (await scan.small(['config', '--local', '--list'], 1024 * 1024)).toString();
  if (/^(?:extensions\.partialclone|remote\..*\.(?:promisor|partialclonefilter))=/mi.test(config)) throw scanFailure();
  const packs = await readdir(resolve(common, 'objects/pack')).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw scanFailure();
  });
  if (packs.some((name) => name.endsWith('.promisor'))) {
    throw scanFailure();
  }
  return commit;
}

interface TreeEntry { mode: string; type: string; oid: string; size: number | null; path: string }
async function* tree(scan: Scan, commit: string): AsyncGenerator<TreeEntry> {
  const treeOid = (await scan.small(['rev-parse', '--verify', `${commit}^{tree}`])).toString().trim();
  if (!oidPattern.test(treeOid)) throw scanFailure();
  const child = scan.child(['ls-tree', '--full-tree', '-r', '-l', '-z', treeOid]);
  child.process.stdin.end();
  for await (const record of records(child.process.stdout, 0, 65536)) {
    scan.check();
    const tab = record.indexOf(9);
    if (tab < 0) throw scanFailure();
    const fields = record.subarray(0, tab).toString('ascii').trim().split(/\s+/);
    const [mode, type, oid, sizeText] = fields;
    if (!mode || !type || !oid || !oidPattern.test(oid) || !sizeText ||
      !['blob', 'commit'].includes(type) || !/^(?:[0-9]+|-)$/.test(sizeText)) throw scanFailure();
    const size = sizeText === '-' ? null : Number(sizeText);
    if (size !== null && (!Number.isSafeInteger(size) || size < 0) || type === 'blob' && size === null) throw scanFailure();
    let path: string;
    try { path = new TextDecoder('utf-8', { fatal: true }).decode(record.subarray(tab + 1)); }
    catch { throw scanFailure(); }
    yield { mode, type, oid, size, path };
  }
  await child.done;
}

/** @id CODE-M5-CANDIDATE-BOUNDED-GIT-CLOSURE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-RELEASE-002
 * @design DES-M5-012
 */
export async function verifyCandidateReachableObjectSizes(
  root: string, ref: string, maxExclusiveBytes = 100_000_000,
): Promise<{ commit: string; objects: number; blobs: number }> {
  const scan = new Scan(root);
  try {
    if (!Number.isSafeInteger(maxExclusiveBytes) || maxExclusiveBytes <= 0) {
      throw new Error('CANDIDATE_GIT_REF_INVALID: invalid size limit.');
    }
    const commit = await freeze(scan, ref);
    let oversized: { oid: string; size: number } | undefined;
    for await (const entry of tree(scan, commit)) {
      if (entry.type === 'blob' && entry.size! >= maxExclusiveBytes && (!oversized || entry.oid < oversized.oid)) {
        oversized = { oid: entry.oid, size: entry.size! };
      }
    }
    const treeOversized = oversized;
    oversized = undefined;
    const listing = scan.child(['rev-list', '--objects', '--no-object-names', '--missing=error', commit, '--']);
    const checker = scan.child(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)']);
    listing.process.stdin.end();
    const pending: string[] = [];
    let wake: (() => void) | undefined;
    let objects = 0;
    let blobs = 0;
    const writer = (async () => {
      for await (const line of records(listing.process.stdout, 10, 4096)) {
        scan.check();
        const oid = line.toString('ascii');
        if (!oidPattern.test(oid)) throw scanFailure();
        while (pending.length >= 1024) await Promise.race([
          new Promise<void>((accept) => { wake = accept; }),
          checker.done.then(() => { throw scanFailure(); }),
        ]);
        scan.check();
        pending.push(oid);
        if (!checker.process.stdin.write(`${oid}\n`)) await once(checker.process.stdin, 'drain');
      }
      await listing.done;
      checker.process.stdin.end();
    })();
    void writer.catch(() => { scan.abort(); wake?.(); });
    for await (const line of records(checker.process.stdout, 10, 4096)) {
      scan.check();
      const match = /^([a-f0-9]+) (blob|tree|commit|tag) (0|[1-9][0-9]*)$/.exec(line.toString('ascii'));
      const expected = pending.shift();
      wake?.(); wake = undefined;
      if (!match || match[1] !== expected || !Number.isSafeInteger(Number(match[3]))) throw scanFailure();
      objects++;
      if (match[2] === 'blob') {
        blobs++;
        const size = Number(match[3]);
        if (size >= maxExclusiveBytes && (!oversized || match[1]! < oversized.oid)) oversized = { oid: match[1]!, size };
      }
    }
    if (pending.length) { scan.abort(); wake?.(); throw scanFailure(); }
    await writer;
    await checker.done;
    if (pending.length || !objects) throw scanFailure();
    scan.check();
    if (await freeze(scan, ref) !== commit) throw new Error('CANDIDATE_GIT_REF_INVALID: candidate ref changed.');
    if (treeOversized) throw new Error(`CANDIDATE_GIT_TREE_OVERSIZE: ${treeOversized.oid} ${treeOversized.size}`);
    if (oversized) throw new Error(`CANDIDATE_GIT_HISTORY_OVERSIZE: ${oversized.oid} ${oversized.size}`);
    return { commit, objects, blobs };
  } catch (error) {
    if (error instanceof Error && /^CANDIDATE_GIT_(?:REF_INVALID|TREE_OVERSIZE|HISTORY_OVERSIZE|OBJECT_SCAN_FAILED):/.test(error.message)) throw error;
    throw scanFailure();
  } finally { scan.close(); }
}

/** @id CODE-M5-CANDIDATE-LOGICAL-SOURCE-STREAM-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-RELEASE-002
 * @design DES-M5-012 DES-M5-023
 */
export async function readCandidateSourceBlobStream(
  root: string, commit: string, path: string, digest: string,
  sink: (bytes: Buffer) => void | Promise<void>,
  options: { historicalAttributes?: boolean; dependencies?: import('./tdd-source-lfs.js').SourceLfsDependencies } = {},
): Promise<void> {
  if (!oidPattern.test(commit) || !/^[a-f0-9]{64}$/.test(digest) || path !== sourcePrefix + digest) {
    throw lfsFailure('INVALID', 'pointer-path-digest');
  }
  await readSourceBlobStream(root, digest, sink, { ...options, commit, verifyWorktree: false });
}

export interface CandidateLfsClosureDependencies {
  /** Must return an independent repository, with no alternates/shared cache. The supplied cache starts empty. */
  prepareRemote?: (root: string, commit: string, emptyCache: string) => Promise<string>;
  /** Test-only policy seam for a credential-free, isolated loopback LFS service. */
  verifyPolicy?: (root: string) => Promise<void>;
  sourceDependencies?: import('./tdd-source-lfs.js').SourceLfsDependencies;
}

const execute = promisify(execFile);
async function prepareIndependentRemote(root: string, commit: string, emptyCache: string): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env,
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  const run = async (directory: string, args: string[]) => {
    try {
      return (await execute('git', ['-C', directory, ...args], {
        env, shell: false, encoding: 'utf8', timeout: 120_000, maxBuffer: 8192,
      })).stdout.trim();
    } catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).slice(-8192) : '';
      const reason = /quota|bandwidth|storage limit/i.test(stderr) ? 'quota'
        : /\b(?:401|403)\b|authentication|authorization|credentials/i.test(stderr) ? 'authentication'
        : /\b404\b|object.*(?:not found|missing)/i.test(stderr) ? 'remote-object-missing' : 'network';
      throw lfsFailure('UNAVAILABLE', reason);
    }
  };
  const origin = await run(root, ['remote', 'get-url', 'origin']);
  let endpoint: URL;
  try { endpoint = new URL(origin); } catch { throw lfsFailure('INVALID', 'attributes'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    endpoint.hostname === 'localhost' || endpoint.hostname === '[::1]' ||
    /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(endpoint.hostname)) {
    throw lfsFailure('INVALID', 'attributes');
  }
  const repository = emptyCache;
  if ((await readdir(repository)).length !== 0) throw lfsFailure('INVALID', 'download-integrity');
  await run(repository, ['init', '--quiet']);
  // Local Git transport transfers only Git objects, never LFS media or an alternate cache.
  await run(repository, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', resolve(root), commit]);
  await run(repository, ['remote', 'add', 'origin', origin]);
  await run(repository, ['config', '--local', 'lfs.storage', 'lfs']);
  await run(repository, ['lfs', 'install', '--local', '--skip-repo']);
  await verifySourceLfsPolicy(repository);
  await fetchSourceLfsClosure(repository, commit);
  return repository;
}

async function* fileLines(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try { for await (const line of lines) yield line; }
  finally { lines.close(); stream.destroy(); }
}

async function mergeRuns(left: string, right: string, output: string): Promise<void> {
  const a = fileLines(left), b = fileLines(right);
  const handle = await open(output, 'wx', 0o600);
  try {
    let x = await a.next(), y = await b.next();
    while (!x.done || !y.done) {
      if (y.done || !x.done && x.value <= y.value) {
        await handle.write(`${x.value}\n`); x = await a.next();
      } else { await handle.write(`${y.value}\n`); y = await b.next(); }
    }
  } finally { await a.return(undefined); await b.return(undefined); await handle.close(); }
}

/** @id CODE-M5-CANDIDATE-HISTORICAL-LFS-CLOSURE-001
 * @implements REQ-M5-LIFECYCLE-006 REQ-M5-RELEASE-002
 * @design DES-M5-012 DES-M5-023
 */
export async function verifyCandidateLfsClosure(
  root: string, ref: string, availability: 'local' | 'remote',
  dependencies: CandidateLfsClosureDependencies = {},
): Promise<{ commit: string; objects: number }> {
  const scan = new Scan(root);
  let scratch: string | undefined;
  try {
    if (availability !== 'local' && availability !== 'remote') throw lfsFailure('INVALID', 'attributes');
    const commit = await freeze(scan, ref);
    const common = (await scan.small(['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString().trim();
    const owner = resolve(common, 'musubix5/lfs-verification');
    await mkdir(owner, { recursive: true });
    scratch = await mkdtemp(resolve(owner, 'closure-'));
    let runCount = 0;
    let batch: string[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await writeFile(resolve(scratch!, `0-${runCount++}`), batch.sort().join('\n') + '\n', { flag: 'wx', mode: 0o600 });
      batch = [];
    };
    const commits = scan.child(['rev-list', commit, '--']);
    commits.process.stdin.end();
    for await (const line of records(commits.process.stdout, 10, 4096)) {
      const historicalCommit = line.toString('ascii');
      if (!oidPattern.test(historicalCommit)) throw scanFailure();
      let sourceEntries: TreeEntry[] = [];
      const inventoryEntries = async () => {
        if (!sourceEntries.length) return;
        const values = await sourceBlobAttributes(root,
          sourceEntries.map((entry) => entry.path.slice(sourcePrefix.length)), historicalCommit);
        for (const entry of sourceEntries) {
          const digest = entry.path.slice(sourcePrefix.length);
          if (values.get(digest)?.get('filter') !== 'lfs') continue;
          if (entry.size! > 1024) throw lfsFailure('INVALID', 'pointer-schema');
          const pointer = parseSourceLfsPointer(await scan.small(['cat-file', 'blob', entry.oid], 1024), digest);
          batch.push(`${pointer.oid} ${pointer.size} ${historicalCommit}`);
          if (batch.length === 1024) await flush();
        }
        sourceEntries = [];
      };
      for await (const entry of tree(scan, historicalCommit)) {
        if (!entry.path.startsWith(sourcePrefix)) continue;
        const digest = entry.path.slice(sourcePrefix.length);
        if (!/^[a-f0-9]{64}$/.test(digest) || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
          throw lfsFailure('INVALID', 'mode');
        }
        sourceEntries.push(entry);
        if (sourceEntries.length === 128) await inventoryEntries();
      }
      await inventoryEntries();
    }
    await commits.done;
    await flush();
    if (runCount) await (dependencies.verifyPolicy ?? ((directory) =>
      verifySourceLfsPolicy(directory, dependencies.sourceDependencies)))(root);
    let round = 0;
    while (runCount > 1) {
      let nextCount = 0;
      for (let i = 0; i < runCount; i += 2) {
        const left = resolve(scratch, `${round}-${i}`);
        const output = resolve(scratch, `${round + 1}-${nextCount++}`);
        if (i + 1 < runCount) {
          const right = resolve(scratch, `${round}-${i + 1}`);
          await mergeRuns(left, right, output);
          await rm(left); await rm(right);
        } else { await rename(left, output); }
      }
      round++; runCount = nextCount;
    }
    let previousOid = '', previousSize = '', objects = 0;
    const inventory = resolve(scratch, `${round}-0`);
    let invalidObject: unknown, unavailableObject: unknown;
    if (runCount) for await (const line of fileLines(inventory)) {
      const [oid, size, historicalCommit] = line.split(' ');
      if (!oid || !size || !historicalCommit) throw scanFailure();
      if (oid === previousOid && size !== previousSize) throw lfsFailure('INVALID', 'pointer-size');
      if (oid !== previousOid) objects++;
      previousOid = oid; previousSize = size;
    }
    let verificationRoot = root;
    if (availability === 'remote' && runCount) {
      const cache = resolve(scratch, 'empty-cache');
      await mkdir(cache);
      verificationRoot = await (dependencies.prepareRemote ?? prepareIndependentRemote)(root, commit, cache);
      if (resolve(verificationRoot) === resolve(root)) throw lfsFailure('INVALID', 'download-integrity');
      const remoteScan = new Scan(verificationRoot);
      try {
        if (await freeze(remoteScan, commit) !== commit) throw lfsFailure('INVALID', 'download-integrity');
        const otherCommon = (await remoteScan.small(['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString().trim();
        if (otherCommon === common || await lstat(resolve(otherCommon, 'objects/info/alternates')).then(() => true, () => false)) {
          throw lfsFailure('INVALID', 'download-integrity');
        }
      } finally { remoteScan.close(); }
    }
    if (runCount) for await (const line of fileLines(inventory)) {
      const [oid, , historicalCommit] = line.split(' ');
      // Every historical binding is checked, even if its media was already verified.
      try {
        await readCandidateSourceBlobStream(verificationRoot, historicalCommit!, sourcePrefix + oid, oid!, () => {}, {
          historicalAttributes: historicalCommit !== commit,
          ...(dependencies.sourceDependencies ? { dependencies: dependencies.sourceDependencies } : {}),
        });
      } catch (error) {
        if (availability === 'remote' && error instanceof Error && /cache-integrity|worktree-integrity/.test(error.message)) {
          invalidObject ??= lfsFailure('INVALID', 'download-integrity');
          continue;
        }
        if (error instanceof SourceOperationError && error.code === 'TDD_SOURCE_LFS_INVALID') {
          invalidObject ??= error; continue;
        }
        if (error instanceof SourceOperationError && error.code === 'TDD_SOURCE_LFS_UNAVAILABLE') {
          unavailableObject ??= error; continue;
        }
        throw error;
      }
    }
    if (await freeze(scan, ref) !== commit) throw new Error('TDD_SOURCE_LFS_MIGRATION_CONFLICT: source-ref-drift');
    if (invalidObject) throw invalidObject;
    if (unavailableObject) throw unavailableObject;
    return { commit, objects };
  } finally {
    scan.close();
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}
