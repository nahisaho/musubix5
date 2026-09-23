import { createHash } from 'node:crypto';
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

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-tree-'));
  temporaryDirectories.push(root);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release candidate tree approval', () => {
  /**
   * @id TEST-M5-APPROVAL-CANDIDATE-TREE-001
   * @verifies REQ-M5-APPROVAL-007 REQ-M5-COMPAT-013
   */
  it('TEST-M5-APPROVAL-CANDIDATE-TREE-001 binds the persisted commit instead of worktree bytes', async () => {
    const root = initializeRepository();
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, '.musubix/features/sample/requirements.md', '# Requirements\n');
    write(root, '.musubix/features/sample/design.md', '# Design\n');
    write(root, '.musubix/features/sample/trace.json', '{}\n');
    write(root, '.musubix/decisions/ADR-0001.md', '# ADR\n');
    write(root, '.musubix/changes/CHANGE-0002.md', '# CHANGE-0002\n');
    write(root, '.musubix/evidence/approvals/release.json', '{}\n');
    write(root, '.musubix/evidence/approvals/native/release.json', '{}\n');
    write(root, 'src/index.ts', 'export const value = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'candidate');

    const workspace = await import('../packages/analysis/src/workspace-manager.js');
    const approval = await import('../packages/analysis/src/approval.js');
    const releaseCandidateChangeId = (
      approval as unknown as Record<string, unknown>
    ).releaseCandidateChangeId;
    expect(releaseCandidateChangeId).toBeTypeOf('function');
    expect((releaseCandidateChangeId as (
      requested: string | undefined,
      active: { changeId: string } | null,
    ) => string | undefined)(undefined, { changeId: 'CHANGE-0002' }))
      .toBe('CHANGE-0002');
    await workspace.persistCandidateSnapshot(root, 'CHANGE-0002');
    const manifest = await approval.approvalManifest(root, 'release');

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      stage: 'release',
      changeId: 'CHANGE-0002',
      projection: null,
    });
    expect(manifest.artifacts['src/index.ts']).toBe(
      createHash('sha256').update('export const value = 1;\n').digest('hex'),
    );
    expect(manifest.exclusions?.map(({ path, reason }) => [path, reason])).toEqual([
      ['.musubix/evidence/approvals/native/release.json', 'release-self-reference'],
      ['.musubix/evidence/approvals/release.json', 'release-self-reference'],
      ['.musubix/features/sample/trace.json', 'generated-trace'],
    ]);

    write(root, 'src/index.ts', 'export const value = 999;\n');
    write(root, 'logs/run/output.txt', 'worktree-only\n');
    expect((await approval.approvalManifest(root, 'release')).artifactSha256)
      .toBe(manifest.artifactSha256);
    expect((await approval.approvalManifest(root, 'release')).artifacts)
      .toEqual(manifest.artifacts);

    const missing = initializeRepository();
    write(missing, 'package.json', '{}\n');
    git(missing, 'add', '.');
    git(missing, 'commit', '--quiet', '-m', 'unbound');
    await expect(approval.approvalManifest(missing, 'release'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
  });
});
