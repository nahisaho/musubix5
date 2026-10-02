import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import * as storage from '../packages/analysis/src/tdd-source-storage.js';
import * as workspace from '../packages/analysis/src/workspace-manager.js';
// Generation-19 chronology replay marker; no executable tokens changed.

const prefix = '.musubix/evidence/tdd-source/v1/blobs/';
const realDigest = '7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c';
const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'LFS fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'LFS fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
}).trim();
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pointer = (digest: string, size: number) =>
  Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${digest}\nsize ${size}\n`);
const attributes = (digests: string[]) => [
  '* text=auto eol=lf',
  `${prefix}* -text !filter !eol !working-tree-encoding !ident`,
  ...digests.sort().map((digest) =>
    `${prefix}${digest} filter=lfs diff=lfs merge=lfs -text !eol !working-tree-encoding !ident`),
  '',
].join('\n');
async function fixture(): Promise<string> {
  await mkdir('.test-work', { recursive: true });
  const root = await mkdtemp(resolve('.test-work/g13-lfs-'));
  git(root, ['init', '--initial-branch=main']);
  git(root, ['lfs', 'install', '--local', '--skip-repo']);
  await writeFile(resolve(root, '.gitattributes'), attributes([]));
  git(root, ['add', '.gitattributes']);
  git(root, ['commit', '-m', 'protected baseline']);
  return root;
}
async function zeros(root: string, size: number): Promise<{ bytes: Buffer; digest: string }> {
  const bytes = Buffer.alloc(size);
  const digest = hash(bytes);
  await mkdir(resolve(root, prefix), { recursive: true });
  return { bytes, digest };
}
async function logicalDigest(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}

/** @id TEST-M5-TDD-SOURCE-LFS-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013 REQ-M5-RELEASE-002
 * @design DES-M5-023 DES-M5-012
 */
it('TEST-M5-TDD-SOURCE-LFS-001 preserves logical identity and verifies canonical LFS bytes before use', async () => {
  const root = await fixture();
  const output = resolve(root, 'materialized');
  try {
    for (const bytes of [Buffer.alloc(0), Buffer.from('raw source')]) {
      const digest = await storage.publishSourceBlob(root, bytes);
      expect(digest).toBe(hash(bytes));
      expect(await storage.readSourceBlob(root, digest)).toEqual(bytes);
    }
    for (const size of [99_999_999, 100_000_000, 100_000_001]) {
      const { bytes, digest } = await zeros(root, size);
      await writeFile(resolve(root, '.gitattributes'), attributes(size >= 100_000_000 ? [digest] : []));
      expect(await storage.publishSourceBlob(root, bytes)).toBe(digest);
      git(root, ['add', '.gitattributes', prefix + digest]);
      git(root, ['commit', '-m', `boundary ${size}`]);
      const commit = git(root, ['rev-parse', 'HEAD']);
      const raw = execFileSync('git', ['-C', root, 'show', `${commit}:${prefix}${digest}`], {
        maxBuffer: 101_000_000,
      });
      expect(raw).toEqual(size >= 100_000_000 ? pointer(digest, size) : bytes);
      let observed = 0;
      await storage.readSourceBlobStream(root, digest, (chunk) => { observed += chunk.length; }, { commit });
      expect(observed).toBe(size);
      if (size < 100_000_000) continue;
      const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
      const cache = resolve(common, 'lfs/objects', digest.slice(0, 2), digest.slice(2, 4), digest);
      await writeFile(resolve(root, prefix + digest), pointer(digest, size));
      expect(await storage.readSourceBlob(root, digest)).toEqual(bytes);
      await mkdir(output, { recursive: true });
      await storage.materializeSourceEntry(root, digest, resolve(output, 'runner'), '100755', { commit });
      expect(await logicalDigest(resolve(output, 'runner'))).toBe(digest);
      expect((await lstat(resolve(output, 'runner'))).mode & 0o777).toBe(0o755);
      await rm(resolve(output, 'runner'));
      for (const malformed of [
        Buffer.from(pointer(digest, size).toString().replaceAll('\n', '\r\n')),
        Buffer.from(pointer(digest, size).toString().replace(`size ${size}`, `size 0${size}`)),
        Buffer.concat([pointer(digest, size), Buffer.from('ext-0-test sha256:abc\n')]),
        pointer('0'.repeat(64), size),
        pointer(digest, 99_999_999),
        pointer(digest, 1_073_741_825),
      ]) {
        expect(() => storage.parseSourceLfsPointer(malformed, digest)).toThrow(/TDD_SOURCE_LFS_INVALID/);
      }
      expect(storage.parseSourceLfsPointer(pointer(digest, size), digest)).toEqual({ oid: digest, size });
      const handle = await open(cache, 'r+');
      await handle.write(Buffer.from('x'), 0, 1, 0);
      await handle.close();
      await expect(storage.materializeSourceEntry(root, digest, resolve(output, 'runner'), '100755', { commit }))
        .rejects.toThrow(/TDD_SOURCE_LFS_INVALID.*cache-integrity/);
      expect(await readdir(output)).toEqual([]);
      await writeFile(cache, bytes);
      await writeFile(resolve(root, prefix + digest), Buffer.from('corrupt hydration'));
      await expect(storage.readSourceBlob(root, digest)).rejects.toThrow(/worktree-integrity/);
      await writeFile(resolve(root, prefix + digest), bytes);
      await chmod(resolve(root, prefix + digest), 0o755);
      await expect(storage.readSourceBlob(root, digest)).rejects.toThrow(/TDD_SOURCE_LFS_INVALID.*mode/);
      await chmod(resolve(root, prefix + digest), 0o644);
      await rm(cache);
      await expect(storage.readSourceBlob(root, digest)).rejects.toThrow(/TDD_SOURCE_LFS_UNAVAILABLE.*remote-object-missing/);
      await writeFile(cache, bytes);
      git(root, ['config', 'lfs.url', 'http://127.0.0.1:1234/private']);
      await expect(storage.readSourceBlob(root, digest)).rejects.toThrow(/TDD_SOURCE_LFS_INVALID.*attributes/);
      git(root, ['config', '--unset', 'lfs.url']);
      git(root, ['config', 'lfs.customtransfer.fixture.path', '/bin/true']);
      await expect(storage.readSourceBlob(root, digest)).rejects.toThrow(/attributes/);
      git(root, ['config', '--unset', 'lfs.customtransfer.fixture.path']);
      await writeFile(resolve(root, '.git/info/attributes'), `${prefix}${digest} filter=arbitrary\n`);
      await expect(storage.verifySourceBlobGitAttributes(root, [digest])).rejects
        .toThrow(/TDD_SOURCE_ADMISSION_INVALID.*snapshot-unverifiable/);
      await rm(resolve(root, '.git/info/attributes'));
      const fence = storage.sourceBlobVerification(root);
      await fence.read(digest);
      await fence.verifyGitAttributes();
      await writeFile(resolve(root, prefix + digest), Buffer.from('post-gate tamper'));
      await expect(fence.recheck()).rejects.toThrow(/worktree-integrity/);
      await writeFile(resolve(root, prefix + digest), bytes);
    }
    expect(() => storage.validateSourceLfsVersion('git-lfs/3.4.0')).toThrow(/version-unsupported/);
    expect(() => storage.validateSourceLfsVersion('')).toThrow(/tool-missing/);
    expect(storage.validateSourceLfsVersion('git-lfs/3.4.1 (fixture)')).toBe('3.4.1');
    const rawPointer = pointer('1'.repeat(64), 100_000_000);
    const rawDigest = await storage.storeSourceBlob(root, rawPointer);
    expect(await storage.readSourceBlob(root, rawDigest)).toEqual(rawPointer);
    const realPath = resolve(prefix + realDigest);
    expect((await lstat(realPath)).size).toBe(126_595_440);
    expect(await logicalDigest(realPath)).toBe(realDigest);
    await writeFile(resolve(root, '.gitattributes'), attributes([realDigest]));
    await copyFile(realPath, resolve(root, prefix + realDigest));
    git(root, ['add', '.gitattributes', prefix + realDigest]);
    git(root, ['commit', '-m', 'real executable']);
    await storage.materializeSourceEntry(root, realDigest, resolve(output, 'real-runner'), '100755');
    expect((await lstat(resolve(output, 'real-runner'))).size).toBe(126_595_440);
    expect(await logicalDigest(resolve(output, 'real-runner'))).toBe(realDigest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);

/** @id TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001
 * @verifies REQ-M5-LIFECYCLE-006 REQ-M5-COMPAT-013 REQ-M5-RELEASE-002 REQ-M5-RELEASE-003 REQ-M5-RELEASE-004
 * @design DES-M5-012 DES-M5-023 DES-M5-019 DES-M5-020 DES-M5-021
 */
it('TEST-M5-CANDIDATE-GIT-DISTRIBUTION-001 rejects raw reachable history and verifies every distribution surface', async () => {
  let checkouts = 0;
  for (const name of ['candidate-gate', 'release', 'npm-publish']) {
    const text = await readFile(`.github/workflows/${name}.yml`, 'utf8');
    const workflow = parse(text);
    for (const job of Object.values(workflow.jobs) as Array<{
      steps: Array<{ uses?: string; run?: string; with: Record<string, unknown> }>;
    }>) {
      const firstCheckout = job.steps.findIndex((step) => step.uses === 'actions/checkout@v4');
      expect(job.steps.slice(0, firstCheckout).some((step) =>
        typeof step.run === 'string' && step.run.includes('check-lfs-tool.mjs'))).toBe(true);
      for (const step of job.steps.filter((step) => step.uses === 'actions/checkout@v4')) {
        ++checkouts;
        expect(step.with.lfs).toBe(true);
        expect(step.with['fetch-depth']).toBe(0);
        if (name === 'candidate-gate') expect(step.with['persist-credentials']).toBe(false);
      }
    }
    expect(text).toContain('verify-lfs-checkout.mjs');
    if (name === 'candidate-gate') expect(text).toContain('verifyCandidateLfsClosure');
    if (name === 'npm-publish') expect(text).toMatch(/verify-lfs-checkout\.mjs release-evidence/);
  }
  expect(checkouts).toBe(9);
  const root = await fixture();
  try {
    const protectedCommit = git(root, ['rev-parse', 'HEAD']);
    await expect(workspace.verifyCandidateReachableObjectSizes(root, '--all')).rejects
      .toThrow(/CANDIDATE_GIT_REF_INVALID/);
    const { bytes, digest } = await zeros(root, 100_000_000);
    await writeFile(resolve(root, prefix + digest), bytes);
    git(root, ['add', prefix + digest]);
    git(root, ['commit', '-m', 'oversized raw']);
    const sourceTip = git(root, ['rev-parse', 'HEAD']);
    await expect(workspace.verifyCandidateReachableObjectSizes(root, sourceTip)).rejects
      .toThrow(/CANDIDATE_GIT_TREE_OVERSIZE/);
    await writeFile(resolve(root, '.gitattributes'), attributes([digest]));
    git(root, ['add', '.gitattributes']);
    git(root, ['add', '--renormalize', prefix + digest]);
    git(root, ['commit', '-m', 'pointer tip does not repair history']);
    await expect(workspace.verifyCandidateReachableObjectSizes(root, 'HEAD')).rejects
      .toThrow(/CANDIDATE_GIT_HISTORY_OVERSIZE/);
    git(root, ['checkout', '-b', 'migration-fixture', protectedCommit]);
    await writeFile(resolve(root, '.gitattributes'), attributes([digest]));
    await mkdir(resolve(root, prefix), { recursive: true });
    await writeFile(resolve(root, prefix + digest), bytes);
    git(root, ['add', '.gitattributes', prefix + digest]);
    git(root, ['commit', '-m', 'ordinary protected descendant pointer']);
    const candidate = git(root, ['rev-parse', 'HEAD']);
    expect(await workspace.verifyCandidateReachableObjectSizes(root, candidate)).toMatchObject({ commit: candidate });
    expect(await workspace.verifyCandidateLfsClosure(root, candidate, 'local')).toMatchObject({ commit: candidate, objects: 1 });
    const entries = await workspace.listCandidateEntries(root, candidate);
    const entry = entries.find((value) => value.nfcPath === prefix + digest)!;
    expect(await workspace.readCandidateBlob(root, candidate, entry.objectId)).toEqual(pointer(digest, bytes.length));
    let observed = 0;
    await workspace.readCandidateSourceBlobStream(root, candidate, prefix + digest, digest,
      (chunk) => { observed += chunk.length; });
    expect(observed).toBe(bytes.length);
    git(root, ['rm', prefix + digest]);
    git(root, ['commit', '-m', 'historical pointer still requires media']);
    const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const cache = resolve(common, 'lfs/objects', digest.slice(0, 2), digest.slice(2, 4), digest);
    await rm(cache);
    await expect(workspace.verifyCandidateLfsClosure(root, 'HEAD', 'local')).rejects
      .toThrow(/remote-object-missing/);
    await writeFile(cache, bytes);
    await writeFile(resolve(root, '.git/shallow'), candidate + '\n');
    await expect(workspace.verifyCandidateReachableObjectSizes(root, 'HEAD')).rejects
      .toThrow(/CANDIDATE_GIT_OBJECT_SCAN_FAILED/);
    await rm(resolve(root, '.git/shallow'));
    const request = {
      changeId: 'CHANGE-0017', generation: 13, operationId: 'fixture-lfs',
      actor: 'fixture', sourceTip, protectedRefs: [{ ref: 'refs/heads/published', commit: protectedCommit }],
      migrationRef: 'refs/heads/owned-migration', paths: [{ path: prefix + digest, digest, size: bytes.length }],
      mapPath: 'owned-map.csv',
    };
    const plan = await workspace.planSourceLfsMigration(root, request);
    expect(plan.args).toEqual([
      'lfs', 'migrate', 'import', `--include=${prefix}${digest}`,
      '--include-ref=refs/heads/owned-migration', '--exclude-ref=refs/heads/published',
      '--object-map=owned-map.csv',
    ]);
    expect(plan).toMatchObject({ credit: false, sourceTip, generation: 13 });
    await expect(workspace.planSourceLfsMigration(root, { ...request, paths: [{ ...request.paths[0], path: '*' }] }))
      .rejects.toThrow(/TDD_SOURCE_LFS_MIGRATION_CONFLICT/);
    expect(git(root, ['merge-base', '--is-ancestor', protectedCommit, candidate])).toBe('');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);
