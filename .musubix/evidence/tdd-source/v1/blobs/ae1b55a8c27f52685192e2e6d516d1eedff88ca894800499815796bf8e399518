import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function releaseDocuments(version: string): {
  readme: string;
  readmeJa: string;
  changelog: string;
} {
  return {
    readme: [
      '# musubix5',
      '',
      `**${version} · GitHub Copilot CLI only**`,
      '',
      '## Upgrade',
      '',
      `The \`upgrade\` command is included in musubix5 ${version}. Its contract is stable.`,
      '',
    ].join('\n'),
    readmeJa: [
      '# musubix5',
      '',
      `**${version} · GitHub Copilot CLI 専用**`,
      '',
      '## アップグレード',
      '',
      `\`upgrade\` commandはmusubix5 ${version}に含まれます。互換性契約は安定しています。`,
      '',
    ].join('\n'),
    changelog: [
      '# Changelog',
      '',
      `## ${version}`,
      '',
      '- Release validation.',
      '',
    ].join('\n'),
  };
}

function writeReleaseDocuments(root: string, version: string): void {
  const documents = releaseDocuments(version);
  writeFileSync(join(root, 'README.md'), documents.readme);
  writeFileSync(join(root, 'README-ja.md'), documents.readmeJa);
  writeFileSync(join(root, 'CHANGELOG.md'), documents.changelog);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release generation 5', () => {
  /**
   * @id TEST-M5-RELEASE-003-DETACHED-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-DETACHED-001 resolves a candidate through a remote-tracking ref', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-detached-candidate-'));
    temporaryDirectories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test User');
    git(root, 'remote', 'add', 'origin', 'https://github.com/example/musubix5.git');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'fixture');
    git(root, 'branch', '-M', 'change/CHANGE-9001');

    const {
      persistCandidateSnapshot,
      resolveCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const persisted = await persistCandidateSnapshot(root, 'CHANGE-9001');
    git(
      root,
      'update-ref',
      'refs/remotes/origin/change/CHANGE-9001',
      persisted.commit,
    );
    git(root, 'switch', '--detach', '--quiet', persisted.commit);
    git(root, 'branch', '-D', 'change/CHANGE-9001');

    await expect(resolveCandidateSnapshot(root, 'CHANGE-9001')).resolves.toMatchObject({
      branch: 'change/CHANGE-9001',
      commit: persisted.commit,
    });
  });

  /**
   * @id TEST-M5-RELEASE-003-GEN5-001
   * @verifies REQ-M5-RELEASE-003 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-RELEASE-003-GEN5-001 creates only a sealed GitHub Release for v0.2.0', async () => {
    const {
      releaseContextBytes,
      releaseContextDigest,
      validateReleaseContext,
      validateReleaseVersions,
    } = await import('../packages/analysis/src/release-workflow.js');
    const root = resolve(import.meta.dirname, '..');
    const versions = await validateReleaseVersions(root, 'v0.2.0');
    expect(versions.version).toBe('0.2.0');

    const context = {
      schemaVersion: 'release-context-v1' as const,
      mode: 'dispatch' as const,
      repository: `repository:${'a'.repeat(64)}`,
      candidateCommit: '1'.repeat(40),
      workflow: '.github/workflows/release.yml' as const,
      releaseTag: 'v0.1.1',
      evidenceCommit: '2'.repeat(40),
      verifiedReleaseApprovalSha256: '3'.repeat(64),
    };
    expect(validateReleaseContext(context)).toEqual(context);
    expect(releaseContextDigest(context)).toMatch(/^[a-f0-9]{64}$/);
    expect(releaseContextBytes(context).toString('utf8')).toBe(
      `{"candidateCommit":"${'1'.repeat(40)}","evidenceCommit":"${'2'.repeat(40)}",`
      + `"mode":"dispatch","releaseTag":"v0.1.1","repository":"repository:${'a'.repeat(64)}",`
      + `"schemaVersion":"release-context-v1","verifiedReleaseApprovalSha256":"${'3'.repeat(64)}",`
      + '"workflow":".github/workflows/release.yml"}\n',
    );

    const workflowText = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
    const workflow = parse(workflowText) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } };
      jobs: Record<string, {
        permissions?: Record<string, string>;
        steps: Array<{ name?: string; run?: string }>;
      }>;
    };
    expect(Object.keys(workflow.on.workflow_dispatch.inputs).sort()).toEqual([
      'evidence_commit',
      'release_operation_id',
      'release_tag',
    ]);
    expect(workflow.jobs.publish).toBeUndefined();
    expect(workflowText).not.toContain('npm publish');
    expect(workflowText).toContain('release-context.json');
    expect(workflowText).toContain('--scope release');
    expect(workflow.jobs.release?.permissions).toEqual({ contents: 'write' });
  });

  /**
   * @id TEST-M5-RELEASE-003-DOCS-001
   * @verifies REQ-M5-RELEASE-003 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-RELEASE-003-DOCS-001 validates release documentation version surfaces', async () => {
    const {
      validateReleaseDocumentation,
      validateReleaseVersions,
    } = await import('../packages/analysis/src/release-workflow.js');
    const documents = releaseDocuments('0.1.1');
    expect(validateReleaseDocumentation(documents, '0.1.1')).toEqual({
      valid: true,
      version: '0.1.1',
    });

    for (const invalid of [
      { ...documents, readme: documents.readme.replace('**0.1.1 ·', '**Unreleased 0.1.1 candidate ·') },
      { ...documents, readmeJa: documents.readmeJa.replace('0.1.1に含まれます。', '0.1.1 candidateに含まれます。') },
      { ...documents, changelog: documents.changelog.replace('## 0.1.1', '## Unreleased') },
      { ...documents, changelog: `${documents.changelog}\n\`\`\`text\n## ignored\n` },
    ]) {
      expect(() => validateReleaseDocumentation(invalid, '0.1.1'))
        .toThrow(/RELEASE_VERSION_MISMATCH/);
    }

    await expect(validateReleaseVersions(
      resolve(import.meta.dirname, '..'),
      'v0.2.0',
    )).resolves.toMatchObject({ valid: true, version: '0.2.0' });
  });

  /**
   * @id TEST-M5-RELEASE-004-DOCS-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-DOCS-001 validates exact tarball release documents', async () => {
    const {
      extractPackagedReleasePackage,
      npmCliInvocation,
    } = await import('../packages/analysis/src/release-workflow.js');
    const npmInvocation = npmCliInvocation(
      process.env.npm_execpath,
      process.platform,
      process.execPath,
    );
    const fixture = mkdtempSync(join(tmpdir(), 'musubix5-release-docs-'));
    temporaryDirectories.push(fixture);
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'musubix5',
      version: '0.1.1',
    }));
    writeReleaseDocuments(fixture, '0.1.1');
    execFileSync(npmInvocation.command, [
      ...npmInvocation.args,
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      fixture,
    ], { cwd: fixture, stdio: 'pipe' });
    const extracted = extractPackagedReleasePackage(
      readFileSync(join(fixture, 'musubix5-0.1.1.tgz')),
    );
    expect(extracted.version).toBe('0.1.1');
    expect(extracted.documents).toEqual(releaseDocuments('0.1.1'));

    const missing = mkdtempSync(join(tmpdir(), 'musubix5-release-docs-missing-'));
    temporaryDirectories.push(missing);
    writeFileSync(join(missing, 'package.json'), JSON.stringify({
      name: 'musubix5',
      version: '0.1.1',
    }));
    execFileSync(npmInvocation.command, [
      ...npmInvocation.args,
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      missing,
    ], { cwd: missing, stdio: 'pipe' });
    expect(() => extractPackagedReleasePackage(
      readFileSync(join(missing, 'musubix5-0.1.1.tgz')),
    )).toThrow(/RELEASE_VERSION_MISMATCH/);
  });

  /**
   * @id TEST-M5-RELEASE-004-001
   * @verifies REQ-M5-RELEASE-004 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-RELEASE-004-001 publishes the exact verified GitHub Release tarball', async () => {
    const releaseWorkflow = await import('../packages/analysis/src/release-workflow.js');
    const {
      computeTarballIntegrity,
      extractPackagedVersion,
      npmCliInvocation,
      validateReleaseAssetManifest,
    } = releaseWorkflow;
    expect(npmCliInvocation(
      undefined,
      'win32',
      'C:\\Program Files\\nodejs\\node.exe',
    )).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],
    });
    expect(() => npmCliInvocation(
      'C:\\Program Files\\nodejs\\npm.cmd',
      'win32',
      'C:\\Program Files\\nodejs\\node.exe',
    )).toThrow(/npm CLI path is not a JavaScript entrypoint/);
    const npmInvocation = npmCliInvocation(
      process.env.npm_execpath,
      process.platform,
      process.execPath,
    );
    const root = resolve(import.meta.dirname, '..');
    const fixture = mkdtempSync(join(tmpdir(), 'musubix5-release-tarball-'));
    temporaryDirectories.push(fixture);
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'musubix5',
      version: '0.1.1',
    }));
    writeReleaseDocuments(fixture, '0.1.1');
    execFileSync(npmInvocation.command, [
      ...npmInvocation.args,
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      fixture,
    ], { cwd: fixture, stdio: 'pipe' });
    const tarball = readFileSync(join(fixture, 'musubix5-0.1.1.tgz'));
    expect(extractPackagedVersion(tarball)).toBe('0.1.1');
    expect(computeTarballIntegrity(tarball)).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);

    const checksum = 'a'.repeat(64);
    expect(validateReleaseAssetManifest(
      'v0.1.1',
      [
        'musubix5-0.1.1.tgz',
        'sbom.cdx.json',
        'release-context.json',
        'SHA256SUMS',
        'attestation.json',
      ],
      [
        `${checksum}  musubix5-0.1.1.tgz`,
        `${checksum}  sbom.cdx.json`,
        `${checksum}  release-context.json`,
      ].join('\n'),
    )).toMatchObject({ tarball: 'musubix5-0.1.1.tgz', version: '0.1.1' });

    const workflowText = readFileSync(
      resolve(root, '.github/workflows/npm-publish.yml'),
      'utf8',
    );
    const workflow = parse(workflowText) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } };
      jobs: Record<string, {
        environment?: string;
        permissions?: Record<string, string>;
        concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
        env?: Record<string, string>;
        steps: Array<{
          id?: string;
          name?: string;
          env?: Record<string, string>;
          run?: string;
        }>;
      }>;
    };
    expect(Object.keys(workflow.on.workflow_dispatch.inputs).sort()).toEqual([
      'evidence_commit',
      'publish_operation_id',
      'release_tag',
    ]);
    const publish = workflow.jobs.publish!;
    expect(publish.environment).toBe('npm-publish');
    expect(publish.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(publish.concurrency).toEqual({
      group: 'publish-${{ inputs.release_tag }}',
      'cancel-in-progress': false,
    });
    expect(publish.env?.NPM_TOKEN).toBeUndefined();
    expect(workflowText).toContain('npm@11.6.0');
    expect(workflowText).toContain('gh release download');
    expect(workflowText).toContain('npm whoami');
    expect(workflowText).toContain('sha256sum --check SHA256SUMS');
    expect(workflowText).toContain('--scope publish');
    expect(workflowText).toContain('npm publish "$TARBALL" --provenance --access public --ignore-scripts');
    expect(workflowText).toContain('classifyNpmRegistryQuery');
    expect(workflowText).toContain('RELEASE_PUBLISH_INTEGRITY_MISMATCH');
    expect(workflowText).toContain(
      './candidate/scripts/verify-npm-registry-integrity.mjs',
    );
    expect(workflowText).toContain(
      'timeout --signal=TERM --kill-after=5s 260s node',
    );
    expect(workflowText).toContain('--inner-deadline-seconds 240');
    expect(workflowText).toContain('manualReconciliationRequired');
  });
});
