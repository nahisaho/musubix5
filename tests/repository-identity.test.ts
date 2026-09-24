import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('repository identity canonicalization', () => {
  /**
   * @id TEST-M5-WORKTREE-REPOSITORY-IDENTITY-002
   * @verifies REQ-M5-WORKTREE-001
   */
  it('TEST-M5-WORKTREE-REPOSITORY-IDENTITY-002 canonicalizes only approved GitHub HTTPS spelling differences', async () => {
    const { canonicalRepositoryIdentity } =
      await import('../packages/analysis/src/canonical.js');
    const root = '/tmp/example';
    const expected = canonicalRepositoryIdentity(
      'https://github.com/Owner/Repo',
      root,
    );

    expect(canonicalRepositoryIdentity(
      '  https://github.com/Owner/Repo.git///  ',
      root,
    )).toBe(expected);
    expect(canonicalRepositoryIdentity(
      'https://github.com/owner/Repo',
      root,
    )).not.toBe(expected);
    expect(canonicalRepositoryIdentity(
      'git@github.com:Owner/Repo.git',
      root,
    )).not.toBe(expected);
    expect(canonicalRepositoryIdentity(' \t\r\n', root)).toBe(
      canonicalRepositoryIdentity('', root),
    );
  });

  /**
   * @id TEST-M5-WORKTREE-REPOSITORY-IDENTITY-005
   * @verifies REQ-M5-WORKTREE-001
   */
  it('TEST-M5-WORKTREE-REPOSITORY-IDENTITY-005 uses the absolute local repository root', async () => {
    const { canonicalRepositoryIdentity } =
      await import('../packages/analysis/src/canonical.js');

    expect(canonicalRepositoryIdentity(undefined, '.')).toBe(
      canonicalRepositoryIdentity(undefined, resolve('.')),
    );
  });

  /**
   * @id TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-001 accepts an Actions checkout of the approved release repository', async () => {
    const { canonicalRepositoryIdentity } =
      await import('../packages/analysis/src/canonical.js');
    const persisted = canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5.git',
      '/candidate',
    );
    const detachedCheckout = canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5',
      '/evidence',
    );

    expect(detachedCheckout).toBe(persisted);
    expect(canonicalRepositoryIdentity(
      'https://github.com/another-owner/musubix5',
      '/evidence',
    )).not.toBe(persisted);
  });

  /**
   * @id TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-001 preserves the publish authorization repository boundary', async () => {
    const { canonicalRepositoryIdentity } =
      await import('../packages/analysis/src/canonical.js');
    const releaseEvidence = canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5.git/',
      '/release-evidence',
    );

    expect(canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5/',
      '/publish-evidence',
    )).toBe(releaseEvidence);
    expect(canonicalRepositoryIdentity(
      'https://GitHub.com/nahisaho/musubix5',
      '/publish-evidence',
    )).not.toBe(releaseEvidence);
    expect(canonicalRepositoryIdentity(
      'https://token@github.com/nahisaho/musubix5',
      '/publish-evidence',
    )).not.toBe(releaseEvidence);
  });
});
