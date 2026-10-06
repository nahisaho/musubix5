import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { checkLfsTool } from './check-lfs-tool.mjs';

// Dependency-free bootstrap: verification precedes npm install and candidate-built validators.
const root = resolve(process.argv[2] ?? '.');
const prefix = '.musubix/evidence/tdd-source/v1/blobs/';
const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const attributes = ['text', 'filter', 'diff', 'merge', 'eol', 'working-tree-encoding', 'ident'];
const invalid = (cause) => new Error(`TDD_SOURCE_LFS_INVALID: ${cause}`);
const unavailable = (cause) => new Error(`TDD_SOURCE_LFS_UNAVAILABLE: ${cause}`);
const scanFailed = () => new Error('CANDIDATE_GIT_OBJECT_SCAN_FAILED');
const children = new Set();
const deadlineIndex = process.argv.indexOf('--deadline');
const absoluteDeadline = deadlineIndex < 0 ? Date.now() + 120_000 : Number(process.argv[deadlineIndex + 1]);
function remaining() {
  const value = absoluteDeadline - Date.now();
  if (!Number.isSafeInteger(value) || value <= 0) throw scanFailed();
  return value;
}
const deadline = setTimeout(() => { for (const child of children) child.kill(); }, remaining());
let scanDeadline = Infinity;
function checkDeadline() { remaining(); if (performance.now() >= scanDeadline) throw scanFailed(); }
const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
const scanEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(scanEnv, { GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
function git(args, options = {}) {
  checkDeadline();
  try {
    return execFileSync('git', ['-C', root, ...args], {
      env, encoding: null, shell: false, timeout: remaining(), maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'], ...options,
    });
  } catch { throw scanFailed(); }
}
async function* records(args, separator = 10, limit = 4096) {
  const child = spawn('git', ['-C', root, ...args], { env: scanEnv, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stderr.resume();
  const completed = new Promise((accept, reject) => {
    child.once('error', () => reject(scanFailed()));
    child.once('close', (code) => code === 0 ? accept() : reject(scanFailed()));
  });
  void completed.catch(() => {});
  let pending = Buffer.alloc(0);
  try {
    for await (const bytes of child.stdout) {
      checkDeadline();
      let start = 0;
      for (;;) {
        const end = bytes.indexOf(separator, start);
        if (end < 0) {
          pending = Buffer.concat([pending, bytes.subarray(start)]);
          if (pending.length > limit) throw scanFailed();
          break;
        }
        const record = Buffer.concat([pending, bytes.subarray(start, end)]);
        checkDeadline();
        if (record.length > limit) throw scanFailed();
        yield record;
        pending = Buffer.alloc(0);
        start = end + 1;
      }
    }
    if (pending.length) throw scanFailed();
    await completed;
  } finally { child.kill(); children.delete(child); }
}
async function regular(path, cause) {
  for (let part = resolve(path);;) {
    const stat = await lstat(part).catch((error) => {
      if (error.code === 'ENOENT' && cause === 'cache-integrity') throw unavailable('remote-object-missing');
      throw invalid(cause);
    });
    if (stat.isSymbolicLink()) throw invalid(cause);
    const parent = dirname(part);
    if (parent === part) break;
    part = parent;
  }
  const stat = await lstat(path);
  if (!stat.isFile()) throw invalid(cause);
  return stat;
}
async function verify(path, digest, size, cause, mode) {
  const before = await regular(path, cause);
  if (before.size !== size) throw invalid(cause);
  if (mode && process.platform !== 'win32' && (before.mode & 0o111 ? '100755' : '100644') !== mode) throw invalid('mode');
  const hash = createHash('sha256');
  let observed = 0;
  for await (const bytes of createReadStream(path)) {
    checkDeadline();
    observed += bytes.length;
    if (observed > size) throw invalid(cause);
    hash.update(bytes);
  }
  const after = await lstat(path);
  if (observed !== size || hash.digest('hex') !== digest || before.ino !== after.ino ||
    before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw invalid(cause);
}
let scratch;
try {
  checkLfsTool();
  const commit = git(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], { env: scanEnv }).toString().trim();
  if (!oid.test(commit)) throw new Error('CANDIDATE_GIT_REF_INVALID');
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim();
  for (const path of ['shallow', 'info/grafts']) {
    if (await lstat(resolve(common, path)).then(() => true, (error) => {
      if (error.code === 'ENOENT') return false; throw scanFailed();
    })) throw scanFailed();
  }
  const configuration = git(['config', '--null', '--list']).toString();
  const config = new Map(configuration.split('\0').filter(Boolean).map((entry) => {
    const at = entry.indexOf('\n');
    return [entry.slice(0, at).toLowerCase(), entry.slice(at + 1)];
  }));
  for (const key of config.keys()) {
    if (/^(?:extensions\.partialclone|remote\..*\.(?:promisor|partialclonefilter)|lfs\.(?:url|pushurl|storage|customtransfer\.|standalonetransferagent|skipdownloaderrors|extension\.)|remote\..*\.lfs(?:url|pushurl)|url\..*\.(?:insteadof|pushinsteadof))/.test(key)) {
      throw invalid('attributes');
    }
  }
  const origin = config.get('remote.origin.url');
  if (!origin || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(origin) ||
    process.env.GIT_LFS_SKIP_SMUDGE || process.env.GIT_LFS_SKIP_DOWNLOAD_ERRORS) throw invalid('attributes');
  if (await lstat(resolve(root, '.lfsconfig')).then(() => true, (error) => {
    if (error.code === 'ENOENT') return false; throw invalid('attributes');
  })) throw invalid('attributes');
  for (const [key, value] of Object.entries({
    'filter.lfs.process': 'git-lfs filter-process', 'filter.lfs.clean': 'git-lfs clean -- %f',
    'filter.lfs.smudge': 'git-lfs smudge -- %f', 'filter.lfs.required': 'true',
  })) if (config.get(key) !== value) throw invalid('attributes');
  const hydrate = () => { if (!process.argv.includes('--verify-only')) {
    const transport = { ...env };
    if (process.env.GH_TOKEN) {
      // Step-scoped read authentication lives only in the fetch child's environment.
      transport.GIT_CONFIG_COUNT = '1';
      transport.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
      transport.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64')}`;
    }
    try {
      if (!process.argv.includes('--local-only')) execFileSync('git', ['-C', root, '-c', 'lfs.fetchrecentalways=false', 'lfs', 'fetch', '--all', 'origin', commit],
        { env: transport, shell: false, timeout: remaining(), maxBuffer: 8192, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      const stderr = String(error.stderr ?? '').slice(-8192);
      if (/checksum|digest mismatch|hash mismatch|expected.*(?:oid|size)|incorrect size|does not match.*(?:size|oid)/i.test(stderr)) {
        throw invalid('download-integrity');
      }
      throw unavailable(/quota|bandwidth|storage limit/i.test(stderr) ? 'quota'
        : /401|403|authentication|credentials/i.test(stderr) ? 'authentication'
          : /404|object.*(?:missing|not found)/i.test(stderr) ? 'remote-object-missing' : 'network');
    }
    try {
      execFileSync('git', ['-C', root, 'lfs', 'checkout', prefix + '*'],
        { env, shell: false, timeout: remaining(), maxBuffer: 8192, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { throw unavailable('remote-object-missing'); }
  } };
  scanDeadline = performance.now() + 120_000;
  let treeOversized;
  let oversized;
  const minimum = (previous, object, size) => !previous || object < previous.object ? { object, size } : previous;
  const currentTree = git(['rev-parse', '--verify', commit + '^{tree}'], { env: scanEnv }).toString().trim();
  if (!oid.test(currentTree)) throw scanFailed();
  for await (const entry of records(['ls-tree', '--full-tree', '-r', '-l', '-z', currentTree], 0, 65536)) {
    const tab = entry.indexOf(9);
    if (tab < 0) throw scanFailed();
    const [mode, type, object, length] = entry.subarray(0, tab).toString().trim().split(/\s+/);
    if (!oid.test(object) || !['100644', '100755', '120000', '160000'].includes(mode) ||
      !['blob', 'commit'].includes(type) || type === 'blob' &&
      (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(+length))) throw scanFailed();
    if (type === 'blob' && +length >= 100_000_000) treeOversized = minimum(treeOversized, object, +length);
  }
  let batch = [];
  const closureObjects = new Set(), closurePointers = new Map();
  const inspect = () => {
    if (!batch.length) return;
    const responses = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      { input: batch.join('\n') + '\n', env: scanEnv }).toString().split('\n');
    if (responses.pop() !== '' || responses.length !== batch.length) throw scanFailed();
    for (let index = 0; index < batch.length; index++) {
      const match = /^([a-f0-9]+) (blob|tree|commit|tag) (0|[1-9][0-9]*)$/.exec(responses[index]);
      if (!match || match[1] !== batch[index] || !Number.isSafeInteger(+match[3])) throw scanFailed();
      if (match[2] === 'blob' && +match[3] >= 100_000_000) oversized = minimum(oversized, match[1], +match[3]);
    }
    batch = [];
  };
  for await (const record of records(['rev-list', '--objects', '--no-object-names', '--missing=error', commit, '--'])) {
    const object = record.toString('ascii');
    if (!oid.test(object)) throw scanFailed();
    closureObjects.add(object);
    batch.push(object);
    if (batch.length === 512) inspect();
  }
  inspect();
  checkDeadline();
  if (treeOversized) throw new Error(`CANDIDATE_GIT_TREE_OVERSIZE: ${treeOversized.object} ${treeOversized.size}`);
  if (oversized) throw new Error(`CANDIDATE_GIT_HISTORY_OVERSIZE: ${oversized.object} ${oversized.size}`);
  scanDeadline = performance.now() + remaining();
  hydrate();
  scanDeadline = performance.now() + 120_000;
  const owner = resolve(common, 'musubix5/scratch/lfs-bootstrap');
  await mkdir(owner, { recursive: true });
  scratch = await mkdtemp(resolve(owner, 'verify-'));
  let missingObject;
  /** @id CODE-M5-CI-LFS-HISTORY-SCOPE-001
   * @implements REQ-M5-CI-EFFICIENCY-003 REQ-M5-CI-EFFICIENCY-005
   * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-004
   */
  /** @id CODE-M5-CI-LFS-HISTORY-ATTRIBUTES-001
   * @implements REQ-M5-CI-EFFICIENCY-002 REQ-M5-CI-EFFICIENCY-005
   * @design DES-M5-CI-EFFICIENCY-001 DES-M5-CI-EFFICIENCY-004
   */
  const historicalCommits = new Set([commit]);
   const collectHistoricalCommits = async (source) => {
     for await (const record of source) {
      const historical = record.toString();
      if (!oid.test(historical)) throw scanFailed();
      historicalCommits.add(historical);
    }
   };
   await collectHistoricalCommits(records(['rev-list', commit, '--', prefix]));
   await collectHistoricalCommits(records(['rev-list', commit, '--', '.gitattributes']));
   for (const historical of historicalCommits) {
    if (!oid.test(historical)) throw scanFailed();
    const indexEnv = { ...env, GIT_INDEX_FILE: resolve(scratch, 'index') };
    await rm(indexEnv.GIT_INDEX_FILE, { force: true });
    const tree = git(['rev-parse', '--verify', historical + '^{tree}'], { env: scanEnv }).toString().trim();
    git(['read-tree', tree], { env: indexEnv });
    let sources = [];
    const inspectSources = async () => {
      if (!sources.length) return;
      const fields = git(['check-attr', '-z', '--cached', '--stdin', ...attributes],
        { env: indexEnv, input: sources.map((source) => source.path + '\0').join('') }).toString().split('\0');
      if (fields.pop() !== '' || fields.length !== sources.length * 21) throw invalid('attributes');
      for (const [offset, { path, mode, object, length, digest }] of sources.entries()) {
        const values = new Map();
        for (let at = 0; at < 7; at++) {
          const cursor = offset * 21 + at * 3;
          if (fields[cursor] !== path || fields[cursor + 1] !== attributes[at]) throw invalid('attributes');
          values.set(attributes[at], fields[cursor + 2]);
        }
        if (values.get('filter') !== 'lfs') continue;
        if (values.get('text') !== 'unset' || !['filter', 'diff', 'merge'].every((name) => values.get(name) === 'lfs') ||
          !['working-tree-encoding', 'ident'].every((name) => values.get(name) === 'unspecified') ||
          !(values.get('eol') === 'unspecified' || historical !== commit && values.get('eol') === 'lf')) throw invalid('attributes');
        if (!Number.isSafeInteger(+length) || +length > 1024) throw invalid('pointer-schema');
        const bytes = git(['cat-file', 'blob', object], { maxBuffer: 1024 });
        const pointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([a-f0-9]{64})\nsize (0|[1-9][0-9]*)\n$/.exec(bytes.toString());
        if (!pointer || bytes.some((byte) => byte > 127)) throw invalid('pointer-schema');
        if (pointer[1] !== digest) throw invalid('pointer-path-digest');
        const size = +pointer[2];
        if (!Number.isSafeInteger(size) || size < 100_000_000 || size > 1_073_741_824) throw invalid('pointer-size');
        if (!closurePointers.has(path) || historical === commit) closurePointers.set(path, {
          path, oid: digest, size, sourceMode: mode, logicalSha256: digest,
        });
        try {
          await verify(resolve(common, 'lfs/objects', digest.slice(0, 2), digest.slice(2, 4), digest), digest, size, 'cache-integrity');
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith('TDD_SOURCE_LFS_UNAVAILABLE:')) throw error;
          missingObject ??= error;
        }
        if (historical === commit) await verify(resolve(root, path), digest, size, 'worktree-integrity', mode);
      }
      sources = [];
    };
    for await (const entry of records(['ls-tree', '--full-tree', '-r', '-l', '-z', tree], 0, 65536)) {
      const tab = entry.indexOf(9);
      if (tab < 0) throw scanFailed();
      const [mode, type, object, length] = entry.subarray(0, tab).toString().trim().split(/\s+/);
      const path = new TextDecoder('utf-8', { fatal: true }).decode(entry.subarray(tab + 1));
      if (!path.startsWith(prefix)) continue;
      const digest = path.slice(prefix.length);
      if (!/^[a-f0-9]{64}$/.test(digest) || type !== 'blob' || !['100644', '100755'].includes(mode)) throw invalid('mode');
      sources.push({ path, mode, object, length, digest });
      if (sources.length === 128) await inspectSources();
    }
    await inspectSources();
  }
  if (missingObject) throw missingObject;
  if (git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim() !== commit) {
    throw new Error('TDD_SOURCE_LFS_MIGRATION_CONFLICT: source-ref-drift');
  }
  if (process.env.RUNNER_TEMP && process.env.CANDIDATE_DISPATCH_NONCE) {
    const scriptDigest = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
    const configDigest = createHash('sha256').update(await readFile(resolve(root, '.musubix/config.json'))).digest('hex');
    const manifest = {
      schemaVersion: 1, nonce: process.env.CANDIDATE_DISPATCH_NONCE, runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), repositoryId: process.env.REPOSITORY_ID,
      candidateCommit: commit, jobTimingDigest: process.env.CANDIDATE_JOB_TIMING_DIGEST,
      scriptDigest, configDigest, objects: [...closureObjects].sort(),
      pointers: [...closurePointers.values()].sort((a,b) => Buffer.compare(Buffer.from(a.path),Buffer.from(b.path))),
    };
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => Buffer.compare(Buffer.from(a),Buffer.from(b))).map(([key,nested]) => [key,canonical(nested)])) : value;
    await writeFile(resolve(process.env.RUNNER_TEMP, 'candidate-lfs-closure.json'), `${JSON.stringify(canonical(manifest))}\n`, { flag: 'wx', mode: 0o600 });
  }
} catch (error) {
  console.error(error instanceof Error && /^(?:TDD_SOURCE_LFS_|CANDIDATE_GIT_)/.test(error.message)
    ? error.message : 'CANDIDATE_GIT_OBJECT_SCAN_FAILED');
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const child of children) child.kill();
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
