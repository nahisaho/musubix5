import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, unknown>;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release 0.2.0', () => {
  /**
   * @id TEST-M5-REL020-VERSION-001
   * @verifies REQ-M5-REL020-001
   */
  it('TEST-M5-REL020-VERSION-001 binds every release version surface to 0.2.0', async () => {
    const expectedVersion = '0.2.0';
    const packagePaths = [
      'package.json',
      ...readdirSync(resolve(root, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`)
        .sort(),
      'plugin.json',
    ];
    for (const path of packagePaths) {
      expect(json(path).version, path).toBe(expectedVersion);
    }

    const lock = json('package-lock.json');
    expect(lock.version).toBe(expectedVersion);
    const lockPackages = lock.packages as Record<string, { version?: string }>;
    for (const path of ['', 'packages/analysis', 'packages/cli', 'packages/domain']) {
      expect(lockPackages[path]?.version, `package-lock.json#packages[${path}]`).toBe(expectedVersion);
    }

    const marketplace = json('.github/plugin/marketplace.json');
    expect((marketplace.metadata as { version?: string }).version).toBe(expectedVersion);
    expect((marketplace.plugins as Array<{ version?: string }>)[0]?.version).toBe(expectedVersion);

    const { createProgram } = await import('../packages/cli/src/main.js');
    expect(createProgram().version()).toBe(expectedVersion);

    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
    expect(readme).toContain(`**${expectedVersion} ·`);
    expect(readme).toContain(`The \`upgrade\` command is included in musubix5 ${expectedVersion}.`);
    const readmeJa = readFileSync(resolve(root, 'README-ja.md'), 'utf8');
    expect(readmeJa).toContain(`**${expectedVersion} ·`);
    expect(readmeJa).toContain(`\`upgrade\` commandはmusubix5 ${expectedVersion}に含まれます。`);
    const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toMatch(/^## 0\.2\.0$/m);
    expect(changelog).toMatch(/^## 0\.1\.1$/m);

    const { validateReleaseVersions } = await import('../packages/analysis/src/release-workflow.js');
    await expect(validateReleaseVersions(root, 'v0.2.0')).resolves.toMatchObject({
      releaseTag: 'v0.2.0',
      version: expectedVersion,
      valid: true,
    });
  });

  /**
   * @id TEST-M5-REL020-RELEASE-001
   * @verifies REQ-M5-REL020-002
   */
  it('TEST-M5-REL020-RELEASE-001 keeps the v0.2.0 GitHub Release fail closed', async () => {
    const { validateReleaseVersions, classifyReleaseTargetLookup } =
      await import('../packages/analysis/src/release-workflow.js');
    await expect(validateReleaseVersions(root, 'v0.2.0')).resolves.toMatchObject({
      releaseTag: 'v0.2.0',
      version: '0.2.0',
      valid: true,
    });

    const {
      authorizeReleaseOperation,
      validateReleaseOperationAuthorization,
    } = await import('../packages/analysis/src/release-operation-guard.js');
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'musubix5-release-020-'));
    temporaryDirectories.push(evidenceRoot);
    const candidateCommit = 'a'.repeat(40);
    const releaseApprovalSha256 = 'b'.repeat(64);
    for (const scope of ['tag', 'push', 'release'] as const) {
      await authorizeReleaseOperation(evidenceRoot, {
        operationId: `release-020-${scope}`,
        scope,
        candidateCommit,
        releaseApprovalSha256,
        releaseTag: 'v0.2.0',
        authorizer: '@nahisaho',
        confirm: true,
      });
    }
    await expect(validateReleaseOperationAuthorization(
      evidenceRoot,
      'release-020-release',
      { scope: 'release', candidateCommit, releaseTag: 'v0.2.0' },
      { readReleaseApprovalDigest: async () => releaseApprovalSha256 },
    )).resolves.toMatchObject({
      status: 'authorized',
      scope: 'release',
      candidateCommit,
      releaseTag: 'v0.2.0',
      verifiedReleaseApprovalSha256: releaseApprovalSha256,
    });
    await expect(validateReleaseOperationAuthorization(
      evidenceRoot,
      'release-020-release',
      { scope: 'release', candidateCommit, releaseTag: 'v0.2.1' },
      { readReleaseApprovalDigest: async () => releaseApprovalSha256 },
    )).rejects.toThrow('RELEASE_OPERATION_NOT_AUTHORIZED');

    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: { complete: true, releases: [] },
    })).toBe('absent');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 404 },
      enumeration: {
        complete: true,
        releases: [{ tagName: 'v0.2.0', draft: true, prerelease: false }],
      },
    })).toBe('present-draft-or-prerelease');
    expect(classifyReleaseTargetLookup({
      exact: { exitCode: 1, statusCode: 500 },
      enumeration: { complete: true, releases: [] },
    })).toBe('lookup-failed');
  });

  /**
   * @id TEST-M5-REL020-PUBLISH-001
   * @verifies REQ-M5-REL020-003
   */
  it('TEST-M5-REL020-PUBLISH-001 publishes only the exact verified v0.2.0 tarball', async () => {
    const {
      classifyNpmRegistryQuery,
      validateReleaseAssetManifest,
      validateReleaseVersions,
    } = await import('../packages/analysis/src/release-workflow.js');
    await expect(validateReleaseVersions(root, 'v0.2.0')).resolves.toMatchObject({
      releaseTag: 'v0.2.0',
      version: '0.2.0',
      valid: true,
    });

    const {
      authorizeReleaseOperation,
      validateReleaseOperationAuthorization,
    } = await import('../packages/analysis/src/release-operation-guard.js');
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'musubix5-publish-020-'));
    temporaryDirectories.push(evidenceRoot);
    const candidateCommit = 'a'.repeat(40);
    const releaseApprovalSha256 = 'b'.repeat(64);
    await authorizeReleaseOperation(evidenceRoot, {
      operationId: 'publish-020',
      scope: 'publish',
      candidateCommit,
      releaseApprovalSha256,
      releaseTag: 'v0.2.0',
      authorizer: '@nahisaho',
      confirm: true,
    });
    await expect(validateReleaseOperationAuthorization(
      evidenceRoot,
      'publish-020',
      { scope: 'publish', candidateCommit, releaseTag: 'v0.2.0' },
      { readReleaseApprovalDigest: async () => releaseApprovalSha256 },
    )).resolves.toMatchObject({
      status: 'authorized',
      scope: 'publish',
      releaseTag: 'v0.2.0',
      verifiedReleaseApprovalSha256: releaseApprovalSha256,
    });

    const downloadedTarball = Buffer.from('sealed-musubix5-0.2.0');
    const submittedTarball = Buffer.from(downloadedTarball);
    const tarballSha256 = sha256(downloadedTarball);
    expect(sha256(submittedTarball)).toBe(tarballSha256);
    expect(validateReleaseAssetManifest(
      'v0.2.0',
      [
        'musubix5-0.2.0.tgz',
        'sbom.cdx.json',
        'release-context.json',
        'SHA256SUMS',
        'attestation.json',
        'attestation-public.pem',
      ],
      [
        `${tarballSha256}  musubix5-0.2.0.tgz`,
        `${'c'.repeat(64)}  sbom.cdx.json`,
        `${'d'.repeat(64)}  release-context.json`,
      ].join('\n'),
    )).toMatchObject({
      releaseTag: 'v0.2.0',
      version: '0.2.0',
      tarball: 'musubix5-0.2.0.tgz',
    });

    expect(classifyNpmRegistryQuery(1, JSON.stringify({
      error: { code: 'E404' },
    }))).toEqual({ status: 'missing' });
    expect(classifyNpmRegistryQuery(0, JSON.stringify('0.2.0'))).toEqual({
      status: 'found',
      value: '0.2.0',
    });
  });
});
