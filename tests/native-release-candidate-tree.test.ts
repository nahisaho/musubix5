import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('native release candidate tree approval', () => {
  /**
   * @id TEST-M5-APPROVAL-NATIVE-CANDIDATE-TREE-001
   * @verifies REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013
   */
  it('TEST-M5-APPROVAL-NATIVE-CANDIDATE-TREE-001 shares schema and candidate identity across producers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-native-candidate-tree-'));
    temporaryDirectories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test User');
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    write(root, '.musubix/evidence/approvals/release.json', '{}\n');
    write(root, '.musubix/evidence/approvals/native/release.json', '{}\n');
    write(root, '.musubix/evidence/mutation.json', '{}\n');
    write(root, 'src/index.ts', 'export const value = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'candidate');

    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    const { prepareStageApproval } =
      await import('../packages/analysis/src/native-approval.js');
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    const compatibility = await approvalManifest(root, 'release');
    const native = await prepareStageApproval(root, {
      stage: 'release',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });

    expect(native.artifactSha256).toBe(compatibility.artifactSha256);
    expect(native.artifacts).toEqual(compatibility.artifacts);
    expect(native.projection).toBeNull();
    expect(native.exclusions.map(({ path, reason }) => [path, reason])).toEqual(
      compatibility.exclusions.map(({ path, reason }) => [path, reason]),
    );
  });
});
