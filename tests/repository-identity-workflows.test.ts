import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('repository identity workflow wiring', () => {
  const root = resolve(import.meta.dirname, '..');

  /**
   * @id TEST-M5-WORKTREE-REPOSITORY-IDENTITY-004
   * @verifies REQ-M5-WORKTREE-001
   */
  it('TEST-M5-WORKTREE-REPOSITORY-IDENTITY-004 derives matrix identity from the checkout', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/candidate-gate.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      "import { canonicalRepositoryIdentity } from './dist/packages/analysis/src/canonical.js';",
    );
    expect(workflow).toContain("['config', '--get-all', 'remote.origin.url']");
    expect(workflow).toContain("['rev-parse', '--show-toplevel']");
  });

  /**
   * @id TEST-M5-CANDIDATE-GATE-PRE-APPROVAL-001
   * @verifies REQ-M5-PARALLEL-010
   */
  it('TEST-M5-CANDIDATE-GATE-PRE-APPROVAL-001 accepts required commands before release approval', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/candidate-gate.yml'),
      'utf8',
    );
    expect(workflow).toContain('const commandsPassed = failedChecks.length === 0');
    expect(workflow).not.toContain("const commandsPassed = report.status === 'pass'");
  });

  /**
   * @id TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-003
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-003 seals the canonical digest in release context', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      "await import('./build-a/dist/packages/analysis/src/canonical.js');",
    );
    expect(workflow).toContain('repository: canonicalRepositoryIdentity(');
    expect(workflow).toContain(
      'release evidence producers must use the credential-free GitHub HTTPS origin.',
    );
  });

  /**
   * @id TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-003
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-003 verifies publication against a local digest', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/npm-publish.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      "await import('./candidate/dist/packages/analysis/src/canonical.js');",
    );
    expect(workflow).toContain(
      'context.repository !== canonicalRepositoryIdentity(',
    );
    expect(workflow).toContain(
      'release evidence producers must use the credential-free GitHub HTTPS origin.',
    );
  });
});
