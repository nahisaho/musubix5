import { execFileSync, spawn as spawnProcess } from './fixtures/counted-process.js';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
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

/** @id TEST-M5-CI-PREPARATION-OFFLINE-001
 * @verifies REQ-M5-CI-EFFICIENCY-003
 * @design DES-M5-CI-EFFICIENCY-001
 */
it('TEST-M5-CI-PREPARATION-OFFLINE-001 keeps immutable installation within the approved preparation budget', async () => {
  const action = await readFile('.github/actions/prepare-candidate/action.yml', 'utf8');
  expect(action).toContain("run([npm, 'ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'])");
});

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
      const digest = hash(Buffer.from(`boundary-${size}`));
      await writeFile(resolve(root, '.gitattributes'), attributes(size >= 100_000_000 ? [digest] : []));
      await expect(storage.verifySourceBlobGitAttributes(root, [digest], new Map([[digest, size]]))).resolves.toBeUndefined();
    }
    for (const size of [99_999_999, 100_000_000]) {
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

/** @id TEST-M5-CI-CANDIDATE-HEAD-ATTRIBUTES-001
 * @verifies REQ-M5-CI-006 REQ-M5-CI-008
 * @design DES-M5-CI-006 DES-M5-CI-008
 */
it('TEST-M5-CI-CANDIDATE-HEAD-ATTRIBUTES-001 keeps candidate-head attributes strict before media deduplication', async () => {
  const { runCandidateGateWorkflow } = await import('../packages/analysis/src/candidate-gate-runner.js');
  const roots: string[] = [];
  const mediaSize = 100_000_000;
  const block = Buffer.alloc(1_000_000);
  const mediaHash = createHash('sha256');
  for (let index = 0; index < 100; index++) mediaHash.update(block);
  const digest = mediaHash.digest('hex');
  const sourcePath = prefix + digest;
  const invalidAttributes = attributes([digest]).replace(
    `${sourcePath} filter=lfs diff=lfs merge=lfs -text !eol`,
    `${sourcePath} filter=lfs diff=lfs merge=lfs -text eol=lf`,
  );
  const expectedMessage = `TDD_SOURCE_LFS_INVALID: attributes ${JSON.stringify({
    path: sourcePath, digest, operationId: null, scope: null, target: null, reason: 'attributes',
  })}`;
  const installMedia = async (root: string) => {
    const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const cache = resolve(common, 'lfs/objects', digest.slice(0, 2), digest.slice(2, 4), digest);
    await mkdir(resolve(cache, '..'), { recursive: true });
    await writeFile(cache, '');
    await truncate(cache, mediaSize);
  };
  const bind = async (root: string, selectedAttributes: string, message: string) => {
    await mkdir(resolve(root, prefix), { recursive: true });
    await writeFile(resolve(root, '.gitattributes'), selectedAttributes);
    const pointerOid = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], {
      input: pointer(digest, mediaSize), encoding: 'utf8',
    }).trim();
    git(root, ['add', '.gitattributes']);
    git(root, ['update-index', '--add', '--cacheinfo', '100644', pointerOid, sourcePath]);
    git(root, ['commit', '-m', message]);
    await installMedia(root);
    return git(root, ['rev-parse', 'HEAD']);
  };
  const sharedFixture = async (candidateSortsBeforeHistorical: boolean) => {
    const root = await fixture();
    roots.push(root);
    const historical = await bind(root, invalidAttributes, 'historical eol compatibility');
    for (let attempt = 0; attempt < 256; attempt++) {
      git(root, ['reset', '--hard', historical]);
      await writeFile(resolve(root, 'candidate-order'), `${attempt}\n`);
      git(root, ['add', 'candidate-order']);
      execFileSync('git', ['-C', root, 'commit', '-m', `candidate order ${attempt}`], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: 'LFS fixture',
          GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
          GIT_COMMITTER_NAME: 'LFS fixture',
          GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
          GIT_AUTHOR_DATE: `2001-01-01T00:${String(Math.floor(attempt / 60)).padStart(2, '0')}:${String(attempt % 60).padStart(2, '0')}Z`,
          GIT_COMMITTER_DATE: `2001-01-01T00:${String(Math.floor(attempt / 60)).padStart(2, '0')}:${String(attempt % 60).padStart(2, '0')}Z`,
        },
      });
      const candidate = git(root, ['rev-parse', 'HEAD']);
      if ((candidate < historical) === candidateSortsBeforeHistorical) return root;
    }
    throw new Error('Unable to construct deterministic commit ordering fixture.');
  };
  const run = async (root: string) => {
    let commandStarts = 0;
    let spawns = 0;
    const commit = git(root, ['rev-parse', 'HEAD']);
    const checks = ['typecheck', 'build', 'test', 'codegraph-tests', 'compatibility', 'pack-check', 'pack-smoke']
      .map((name) => ({ name: `command:${name}`, required: true, status: 'pass', summary: 'ok', exitCode: 0 }));
    const result = await runCandidateGateWorkflow({
      command: process.execPath,
      args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify({ checks }))})`],
      cwd: root,
      temporaryDirectory: root,
      timeoutMs: 75_107,
      resultPath: resolve(root, 'candidate-gate-result.json'),
      context: {
        repositoryId: 'repository:' + 'a'.repeat(64),
        changeId: 'CHANGE-0017',
        generation: 37,
        candidateCommit: commit,
        gateInputFingerprint: 'b'.repeat(64),
        job: { os: 'ubuntu', nodeMajor: 24 },
      },
      secrets: [],
      onCommandStart: () => { commandStarts++; },
      dependencies: {
        spawn: (command, args, options) => {
          spawns++;
          return spawnProcess(command, args, options);
        },
      },
      preconditions: {
        candidateCommit: async () => {},
        repositoryIdentity: async () => {},
        lfsClosure: async () => {
          await workspace.verifyCandidateLfsClosure(root, commit, 'local', {
            verifyPolicy: async () => {},
            sourceDependencies: { toolVersion: async () => 'git-lfs/3.4.1' },
          });
        },
        trackedTree: async () => true,
      },
    });
    return { result, commandStarts, spawns };
  };
  const expectRejected = async (root: string) => {
    const { result, commandStarts, spawns } = await run(root);
    expect(result).toMatchObject({
      status: 'fail',
      error: { code: 'CANDIDATE_GATE_REPORT_INVALID' },
      originalDomainCode: 'TDD_SOURCE_LFS_INVALID',
      originalDomainMessage: expectedMessage,
    });
    expect(commandStarts).toBe(0);
    expect(spawns).toBe(0);
  };
  try {
    const headOnly = await fixture();
    roots.push(headOnly);
    await bind(headOnly, invalidAttributes, 'invalid candidate head only');
    await expectRejected(headOnly);

    await expectRejected(await sharedFixture(true));
    await expectRejected(await sharedFixture(false));

    const validHead = await fixture();
    roots.push(validHead);
    await bind(validHead, invalidAttributes, 'historical eol compatibility');
    await writeFile(resolve(validHead, '.gitattributes'), attributes([digest]));
    git(validHead, ['add', '.gitattributes']);
    git(validHead, ['commit', '-m', 'strict candidate head']);
    const accepted = await run(validHead);
    expect(accepted.result.status).toBe('pass');
    expect(accepted.commandStarts).toBe(1);
    expect(accepted.spawns).toBe(1);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
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
      job.steps = job.steps.flatMap((step) => step.uses === './.github/actions/prepare-candidate'
        ? parse(readFileSync('.github/actions/prepare-candidate/action.yml', 'utf8')).runs.steps : [step]);
      const firstCheckout = job.steps.findIndex((step) => step.uses === 'actions/checkout@v4');
      if (name === 'candidate-gate') {
        const bootstrap = job.steps[0]!.run!;
        expect(bootstrap.indexOf("git(['lfs','version'])")).toBeGreaterThan(-1);
        expect(bootstrap.indexOf("git(['lfs','version'])")).toBeLessThan(bootstrap.indexOf("git(['checkout','--detach'"));
        expect(bootstrap).toContain('TDD_SOURCE_LFS_UNAVAILABLE: version-unsupported');
        expect(bootstrap).toContain("git(['lfs','install','--local'])");
        expect(bootstrap).toContain("git(['-c','lfs.fetchrecentalways=false','lfs','fetch','--all','origin',e.CANDIDATE_COMMIT]");
        expect(bootstrap).toContain("git(['checkout','--detach',e.CANDIDATE_COMMIT], {...e, GIT_LFS_SKIP_SMUDGE:'1'})");
        expect(bootstrap).not.toContain('persist-credentials');
        ++checkouts;
      } else expect(job.steps.slice(0, firstCheckout).some((step) =>
        typeof step.run === 'string' && step.run.includes('check-lfs-tool.mjs'))).toBe(true);
      for (const step of job.steps.filter((step) => step.uses === 'actions/checkout@v4')) {
        ++checkouts;
        expect(step.with.lfs).toBe(true);
        expect(step.with['fetch-depth']).toBe(0);
        if (name === 'candidate-gate') expect(step.with['persist-credentials']).toBe(false);
      }
    }
    const preparation = name === 'candidate-gate'
      ? await readFile('.github/actions/prepare-candidate/action.yml', 'utf8') : '';
    expect(text + preparation).toContain('verify-lfs-checkout.mjs');
    if (name === 'candidate-gate') {
      const wrapper = await readFile('.github/scripts/run-candidate-gate-wrapper.mjs', 'utf8');
      const runner = await readFile('packages/analysis/src/candidate-gate-runner.ts', 'utf8');
      const probe = await readFile('.github/scripts/run-candidate-precondition-probe.mjs', 'utf8');
      expect(text).toContain('node .github/scripts/run-candidate-gate-wrapper.mjs');
      expect(wrapper).toContain('runCandidateGateWorkflow');
      expect(runner).toContain('run-candidate-precondition-probe.mjs');
      expect(probe).toContain('verifyCandidateLfsClosure');
    }
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

/** @id TEST-M5-CI-CANDIDATE-PRECONDITION-EFFICIENCY-001
 * @verifies REQ-M5-CI-008
 * @design DES-M5-CI-008
 */
it('TEST-M5-CI-CANDIDATE-PRECONDITION-EFFICIENCY-001 validates every binding but streams duplicate LFS media once', async () => {
  const root = await fixture();
  const operations: string[] = [];
  const dependencies = {
    verifyPolicy: async () => {},
    sourceDependencies: { toolVersion: async () => 'git-lfs/3.4.1' },
    onOperation: (operation: string) => operations.push(operation),
  };
  try {
    const rawBytes = Buffer.from('historical raw source');
    const rawDigest = hash(rawBytes);
    await mkdir(resolve(root, prefix), { recursive: true });
    await writeFile(resolve(root, prefix + rawDigest), rawBytes);
    git(root, ['add', prefix + rawDigest]);
    git(root, ['commit', '-m', 'retain bounded raw source']);

    const block = Buffer.alloc(1_000_000);
    const mediaHash = createHash('sha256');
    for (let index = 0; index < 100; index++) mediaHash.update(block);
    const digest = mediaHash.digest('hex');
    const sourcePath = prefix + digest;
    const pointerBytes = pointer(digest, 100_000_000);
    await writeFile(resolve(root, '.gitattributes'), attributes([digest]));
    const pointerOid = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], {
      input: pointerBytes,
      encoding: 'utf8',
    }).trim();
    git(root, ['add', '.gitattributes']);
    git(root, ['update-index', '--add', '--cacheinfo', '100644', pointerOid, sourcePath]);
    git(root, ['commit', '-m', 'bind source pointer']);
    await writeFile(resolve(root, 'ordinary'), 'one\n');
    git(root, ['add', 'ordinary']);
    git(root, ['commit', '-m', 'retain pointer once']);
    await writeFile(resolve(root, 'ordinary'), 'two\n');
    git(root, ['add', 'ordinary']);
    git(root, ['commit', '-m', 'retain pointer twice']);
    const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const cache = resolve(common, 'lfs/objects', digest.slice(0, 2), digest.slice(2, 4), digest);
    await mkdir(resolve(cache, '..'), { recursive: true });
    await writeFile(cache, '');
    await truncate(cache, 100_000_000);

    expect(await workspace.verifyCandidateLfsClosure(root, 'HEAD', 'local', dependencies))
      .toMatchObject({ objects: 1 });
    expect(operations.filter((value) => value === 'tree-prefix').length).toBe(5);
    expect(operations.filter((value) => value === 'attribute-index').length).toBe(4);
    expect(operations.filter((value) => value === 'pointer-batch').length).toBe(1);
    expect(operations.filter((value) => value === 'media-stream').length).toBe(1);

    const info = resolve(root, git(root, ['rev-parse', '--git-path', 'info/attributes']));
    await mkdir(resolve(info, '..'), { recursive: true });
    await writeFile(info, `${sourcePath} -filter\n`);
    await expect(workspace.verifyCandidateLfsClosure(root, 'HEAD', 'local', dependencies))
      .rejects.toThrow(/TDD_SOURCE_LFS_INVALID.*attributes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);
