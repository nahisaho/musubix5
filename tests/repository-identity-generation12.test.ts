import { describe, expect, it } from 'vitest';
import { canonicalRepositoryIdentity } from '../packages/analysis/src/canonical.js';

describe('generation 12 repository identity regression', () => {
  /**
   * @id TEST-M5-WORKTREE-REPOSITORY-IDENTITY-003
   * @verifies REQ-M5-WORKTREE-001
   */
  it('TEST-M5-WORKTREE-REPOSITORY-IDENTITY-003 removes only approved GitHub HTTPS suffixes', () => {
    const expected = canonicalRepositoryIdentity(
      'https://github.com/Owner/Repo',
      '/candidate',
    );

    expect(canonicalRepositoryIdentity(
      'https://github.com/Owner/Repo.git///',
      '/candidate',
    )).toBe(expected);
    expect(canonicalRepositoryIdentity(
      'https://github.com/owner/Repo',
      '/candidate',
    )).not.toBe(expected);
  });

  /**
   * @id TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-002
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-REPOSITORY-IDENTITY-002 equates candidate and Actions checkout origins', () => {
    expect(canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5.git',
      '/candidate',
    )).toBe(canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5',
      '/runner',
    ));
  });

  /**
   * @id TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-002
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-REPOSITORY-IDENTITY-002 rejects credentialed publish origins', () => {
    const releaseIdentity = canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5.git/',
      '/release',
    );

    expect(canonicalRepositoryIdentity(
      'https://github.com/nahisaho/musubix5/',
      '/publish',
    )).toBe(releaseIdentity);
    expect(canonicalRepositoryIdentity(
      'https://token@github.com/nahisaho/musubix5',
      '/publish',
    )).not.toBe(releaseIdentity);
  });
});
