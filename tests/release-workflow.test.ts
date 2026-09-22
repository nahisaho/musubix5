import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release workflow', () => {
  /**
   * @id TEST-M5-RELEASE-003
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003 binds versions, evidence, artifacts, and side effects', async () => {
    const {
      releaseTransportPolicy,
      validateReleaseVersions,
    } = await import('../packages/analysis/src/release-workflow.js');
    const root = resolve(import.meta.dirname, '..');
    const versions = await validateReleaseVersions(root, 'v0.1.0');
    expect(versions).toMatchObject({
      releaseTag: 'v0.1.0',
      version: '0.1.0',
      valid: true,
    });
    expect(versions.paths).toEqual(expect.arrayContaining([
      'package.json',
      'packages/analysis/package.json',
      'packages/cli/package.json',
      'packages/domain/package.json',
      'plugin.json',
      '.github/plugin/marketplace.json#metadata',
      '.github/plugin/marketplace.json#plugins[0]',
    ]));

    expect(releaseTransportPolicy()).toMatchObject({
      workflow: '.github/workflows/release.yml',
      maxAgeSeconds: 2_592_000,
      maxFutureSkewSeconds: 60,
      runner: 'ubuntu-24.04',
      npmVersion: '11.5.1',
    });

    const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
    expect(workflow).toContain('tags:');
    expect(workflow).toContain("- 'v*'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('evidence_commit:');
    expect(workflow).toContain('release_operation_id:');
    expect(workflow).toContain('publish_operation_id:');
    expect(workflow).toContain('environment: npm-publish');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('npm publish --access public');
    expect(workflow).toContain('npm publish --provenance --access public');
    expect(workflow).toContain('RELEASE_PACKAGE_DIGEST_MISMATCH');
    expect(workflow).toContain('RELEASE_REGISTRY_INTEGRITY_MISMATCH');
  });
});
