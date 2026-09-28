import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate workspace CLI safety', () => {
  /**
   * @id TEST-M5-CANDIDATE-CLI-SAFETY-001
   * @verifies REQ-M5-MULTI-CHANGE-004 REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-CANDIDATE-CLI-SAFETY-001 resolves managed paths and detects live leases', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-cli-safety-'));
    temporaryDirectories.push(root);
    git(root, ['init', '--quiet']);
    const { managedWorkspacePath, candidateHasLiveLease } = await import(
      '../packages/cli/src/main.js'
    );
    const { tryAcquireChangeLease, releaseChangeLease } = await import(
      '../packages/analysis/src/journal.js'
    );

    expect(await managedWorkspacePath(root, 'musubix5/workspaces/CHANGE-0014/candidate'))
      .toBe(join(root, '.git', 'musubix5/workspaces/CHANGE-0014/candidate'));
    expect(await candidateHasLiveLease(root, 'CHANGE-0014')).toBe(false);
    expect(existsSync(join(
      root,
      '.git',
      'musubix5',
      'leases',
      'fencing',
      'change-CHANGE-0014.json',
    ))).toBe(false);

    const lease = await tryAcquireChangeLease(root, 'CHANGE-0014');
    expect(lease).not.toBeNull();
    expect(await candidateHasLiveLease(root, 'CHANGE-0014')).toBe(true);
    await releaseChangeLease(lease!);
  });
});
