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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release review fixes', () => {
  /**
   * @id TEST-M5-RELEASE-003-REMOTE-PREFERENCE-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-REMOTE-PREFERENCE-001 accepts a valid remote ref beside a stale local ref', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-stale-local-'));
    temporaryDirectories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test User');
    git(root, 'remote', 'add', 'origin', 'https://github.com/example/musubix5.git');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'candidate');
    git(root, 'branch', '-M', 'change/CHANGE-9002');

    const {
      persistCandidateSnapshot,
      resolveCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const persisted = await persistCandidateSnapshot(root, 'CHANGE-9002');
    git(
      root,
      'update-ref',
      'refs/remotes/origin/change/CHANGE-9002',
      persisted.commit,
    );
    const emptyTree = execFileSync('git', ['mktree'], {
      cwd: root,
      encoding: 'utf8',
      input: '',
    }).trim();
    const unrelated = execFileSync('git', ['commit-tree', emptyTree, '-m', 'unrelated'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test User',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test User',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    }).trim();
    git(root, 'switch', '--detach', '--quiet', persisted.commit);
    git(root, 'update-ref', 'refs/heads/change/CHANGE-9002', unrelated);

    await expect(resolveCandidateSnapshot(root, 'CHANGE-9002')).resolves.toMatchObject({
      commit: persisted.commit,
    });
  });

  /**
   * @id TEST-M5-RELEASE-004-REVIEW-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REVIEW-001 builds before helper use and preserves registry outcomes', () => {
    const text = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{
            id?: string;
            name?: string;
            env?: Record<string, string>;
            run?: string;
          }>;
        };
      };
    };
    const steps = workflow.jobs.publish.steps;
    const buildIndex = steps.findIndex((step) =>
      step.name === 'Install and build candidate validator');
    const identityIndex = steps.findIndex((step) => step.id === 'identity');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeLessThan(identityIndex);

    const registry = steps.find((step) => step.id === 'registry_integrity')!;
    expect(registry.run).toContain('(( SECONDS + 15 <= deadline )) || break');
    expect(registry.run).toContain(
      'timeout --signal=TERM --kill-after=5s 240s bash',
    );
    expect(registry.run).toContain(
      'timeout --signal=TERM --kill-after=2s 15s npm view',
    );
    expect(registry.run).toContain('registry_visible=true');
    expect(registry.run).toContain('integrity_matched=false');
    expect(registry.run).toContain('registry_visible=false');

    const outcome = steps.find((step) =>
      step.name === 'Record terminal publish outcome and summary')!;
    expect(outcome.env).toMatchObject({
      REGISTRY_VISIBLE: '${{ steps.registry_integrity.outputs.registry_visible }}',
      INTEGRITY_MATCHED: '${{ steps.registry_integrity.outputs.integrity_matched }}',
    });
    expect(outcome.run).toContain("process.env.REGISTRY_VISIBLE === 'true'");
    expect(outcome.run).toContain("process.env.INTEGRITY_MATCHED === 'true'");
    expect(outcome.run).toContain(
      "const publicationMayHaveOccurred = ['success', 'failure'].includes(",
    );
    expect(outcome.run).toContain(
      'manualReconciliationRequired: publicationMayHaveOccurred && !integrityMatched',
    );
  });

  /**
   * @id TEST-M5-RELEASE-003-FETCHED-REF-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-FETCHED-REF-001 accepts a candidate reachable only from another fetched ref', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-fetched-ref-'));
    temporaryDirectories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test User');
    git(root, 'remote', 'add', 'origin', 'https://github.com/example/musubix5.git');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'candidate');
    git(root, 'branch', '-M', 'change/CHANGE-9003');

    const {
      persistCandidateSnapshot,
      resolveCandidateSnapshot,
    } = await import('../packages/analysis/src/workspace-manager.js');
    const persisted = await persistCandidateSnapshot(root, 'CHANGE-9003');
    git(root, 'update-ref', 'refs/remotes/origin/main', persisted.commit);
    git(root, 'switch', '--detach', '--quiet', persisted.commit);
    git(root, 'branch', '-D', 'change/CHANGE-9003');

    await expect(resolveCandidateSnapshot(root, 'CHANGE-9003')).resolves.toMatchObject({
      commit: persisted.commit,
    });
  });

  /**
   * @id TEST-M5-RELEASE-004-CHECKSUM-PATH-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-CHECKSUM-PATH-001 accepts the checksum paths emitted by release packaging', async () => {
    const { validateReleaseAssetManifest } =
      await import('../packages/analysis/src/release-workflow.js');
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
        `${checksum}  ./musubix5-0.1.1.tgz`,
        `${checksum}  sbom.cdx.json`,
        `${checksum}  release-context.json`,
      ].join('\n'),
    )).toMatchObject({ tarball: 'musubix5-0.1.1.tgz', version: '0.1.1' });
  });

  /**
   * @id TEST-M5-RELEASE-004-WORKFLOW-ORDER-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-WORKFLOW-ORDER-001 validates before replay and keeps registry verification bounded', () => {
    const text = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{
            id?: string;
            name?: string;
            run?: string;
          }>;
        };
      };
    };
    const steps = workflow.jobs.publish.steps;
    const downloadIndex = steps.findIndex((step) =>
      step.name === 'Download authenticated GitHub Release assets');
    const verifyIndex = steps.findIndex((step) => step.id === 'verify_assets');
    const authIndex = steps.findIndex((step) => step.id === 'npm_auth');
    expect(downloadIndex).toBeGreaterThanOrEqual(0);
    expect(downloadIndex).toBeLessThan(verifyIndex);
    expect(verifyIndex).toBeLessThan(authIndex);

    const verify = steps[verifyIndex]!.run!;
    expect(verify.indexOf('release-operation validate')).toBeGreaterThanOrEqual(0);
    expect(verify.indexOf('npm view "musubix5@$version" version --json'))
      .toBeGreaterThan(verify.indexOf('release-operation validate'));

    const registry = steps.find((step) => step.id === 'registry_integrity')!.run!;
    expect(registry).toContain('timeout --signal=TERM --kill-after=5s 240s bash');
    expect(registry).toContain(
      'timeout --signal=TERM --kill-after=2s 15s npm view',
    );
  });

  /**
   * @id TEST-M5-RELEASE-004-POLICY-BINDING-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-POLICY-BINDING-001 binds workflow limits to the code policy', async () => {
    const { npmPublishTransportPolicy } =
      await import('../packages/analysis/src/release-workflow.js');
    const policy = npmPublishTransportPolicy();
    const text = readFileSync(resolve(policy.workflow), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{ id?: string; name?: string; run?: string }>;
        };
      };
    };
    const steps = workflow.jobs.publish.steps;
    const pin = steps.find((step) => step.name === 'Pin npm')!.run!;
    const registry = steps.find((step) => step.id === 'registry_integrity')!.run!;
    const outcome = steps.find((step) =>
      step.name === 'Record terminal publish outcome and summary')!.run!;

    expect(pin).toContain(`npm@${policy.npmVersion}`);
    expect(registry).toContain(
      `for attempt in ${Array.from(
        { length: policy.registryAttempts },
        (_, index) => index + 1,
      ).join(' ')}`,
    );
    expect(registry).toContain(
      `timeout --signal=TERM --kill-after=${policy.registryDeadlineKillAfterSeconds}s `
      + `${policy.registryDeadlineSeconds}s bash`,
    );
    expect(registry).toContain(
      `timeout --signal=TERM --kill-after=${policy.registryQueryKillAfterSeconds}s `
      + `${policy.registryQueryTimeoutSeconds}s npm view`,
    );
    expect(registry).toContain('export REGISTRY_STATUS="$registry_status"');
    if (policy.reconcileFailedPublication) {
      expect(outcome).toContain('manualReconciliationRequired');
    }
  });

  /**
   * @id TEST-M5-RELEASE-004-SHELL-FAILURE-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-SHELL-FAILURE-001 preserves validator command failures', () => {
    const text = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{ id?: string; run?: string }>;
        };
      };
    };
    const verify = workflow.jobs.publish.steps.find(
      (step) => step.id === 'verify_assets',
    )!.run!;
    for (const name of [
      'RELEASE_CONTEXT_SHA',
      'CHECKSUMS_SHA',
      'RELEASE_EVIDENCE_COMMIT',
      'RELEASE_APPROVAL_AT_RELEASE',
      'RELEASE_APPROVAL_AT_PUBLISH',
    ]) {
      expect(verify).not.toContain(`export ${name}="$(`);
      expect(verify).toContain(`${name}="$(`);
      expect(verify).toContain(`export ${name}`);
    }
  });

  /**
   * @id TEST-M5-RELEASE-004-REGISTRY-CLASSIFICATION-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REGISTRY-CLASSIFICATION-001 shares explicit E404 classification', () => {
    const text = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{ id?: string; run?: string }>;
        };
      };
    };
    const registry = workflow.jobs.publish.steps.find(
      (step) => step.id === 'registry_integrity',
    )!.run!;
    expect(registry).toContain('classifyNpmRegistryQuery');
    expect(registry).toContain('export REGISTRY_STATUS="$registry_status"');
    expect(registry).not.toContain('response?.error?.code');
  });

  /**
   * @id TEST-M5-RELEASE-003-SHELL-FAILURE-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-SHELL-FAILURE-001 preserves release digest command failures', () => {
    const text = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: Record<string, { steps?: Array<{ run?: string }> }>;
    };
    const runs = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');

    for (const name of ['CHECKSUMS_SHA', 'RELEASE_CONTEXT_SHA']) {
      expect(runs).not.toContain(`export ${name}="$(`);
      expect(runs).toContain(`${name}="$(`);
      expect(runs).toContain(`export ${name}`);
    }
  });

  /**
   * @id TEST-M5-RELEASE-004-CANCELLATION-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-CANCELLATION-001 reconciles a cancelled publish attempt', () => {
    const text = readFileSync(resolve('.github/workflows/npm-publish.yml'), 'utf8');
    const workflow = parse(text) as {
      jobs: {
        publish: {
          steps: Array<{ name?: string; run?: string }>;
        };
      };
    };
    const outcome = workflow.jobs.publish.steps.find((step) =>
      step.name === 'Record terminal publish outcome and summary')!.run!;
    expect(outcome).toContain("process.env.PUBLISH_OUTCOME === 'cancelled'");
    expect(outcome).toContain(
      'manualReconciliationRequired: publicationMayHaveOccurred && !integrityMatched',
    );
  });
});
