import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release approval manifest scope', () => {
  /**
   * @id TEST-M5-RELEASE-MANIFEST-001
   * @verifies REQ-M5-APPROVAL-007 REQ-M5-EVIDENCE-004 REQ-M5-RELEASE-001
   */
  it('TEST-M5-RELEASE-MANIFEST-001 excludes historical and run-local artifacts', async () => {
    const { approvalManifest } = await import('../packages/analysis/src/approval.js');
    const root = mkdtempSync(join(tmpdir(), 'musubix5-release-manifest-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    for (const path of [
      'package.json',
      'src/index.ts',
      '.musubix/changes/CHANGE-0002.md',
      'docs/history/old-change.md',
      '.musubix/runs/CHANGE-0002/run-1/draft.json',
      '.musubix/features/example/trace.json',
      '.musubix/evidence/current.json',
      '.musubix/evidence/foreign.json',
      '.musubix/evidence/broken.json',
      '.musubix/evidence/quality.json',
      '.musubix/evidence/native/test/aggregate.json',
      'session-log/run/output.txt',
    ]) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      const content = path.endsWith('current.json')
        ? '{"metadata":{"changeId":"CHANGE-0002"}}'
        : path.endsWith('foreign.json')
          ? '{"changeId":"CHANGE-9999"}'
          : path.endsWith('broken.json')
            ? '{not json'
          : path;
      writeFileSync(join(root, path), content);
    }
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    await persistCandidateSnapshot(root, 'CHANGE-0002');

    const { formatApprovalManifestText } =
      await import('../packages/analysis/src/approval.js');
    const manifest = await approvalManifest(root, 'release');
    expect(Object.keys(manifest.artifacts)).toEqual([
      '.musubix/changes/CHANGE-0002.md',
      '.musubix/evidence/broken.json',
      '.musubix/evidence/current.json',
      'package.json',
      'src/index.ts',
    ]);
    expect(manifest.exclusions?.map(({ path, reason }) => [path, reason])).toEqual([
      ['.musubix/evidence/foreign.json', 'foreign-change-evidence'],
      ['.musubix/evidence/native/test/aggregate.json', 'gate-self-reference'],
      ['.musubix/evidence/quality.json', 'gate-self-reference'],
      ['.musubix/features/example/trace.json', 'generated-trace'],
      ['.musubix/runs/CHANGE-0002/run-1/draft.json', 'run-local'],
      ['docs/history/old-change.md', 'historical'],
      ['session-log/run/output.txt', 'log-directory'],
    ]);
    const displayed = formatApprovalManifestText(manifest);
    for (const [path, sha256] of Object.entries(manifest.artifacts)) {
      expect(displayed).toContain(`INCLUDED ${path} ${sha256}`);
    }
    for (const exclusion of manifest.exclusions ?? []) {
      expect(displayed).toContain(`EXCLUDED ${exclusion.path} ${exclusion.sha256} ${exclusion.reason}`);
    }
    writeFileSync(join(root, 'session-log/run/output.txt'), 'changed log content');
    expect((await approvalManifest(root, 'release')).artifactSha256).toBe(manifest.artifactSha256);

    const unscopedRoot = mkdtempSync(join(tmpdir(), 'musubix5-release-unscoped-'));
    temporaryDirectories.push(unscopedRoot);
    execFileSync('git', ['init', '--quiet', unscopedRoot]);
    execFileSync('git', ['-C', unscopedRoot, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', unscopedRoot, 'config', 'user.name', 'Test User']);
    writeFileSync(join(unscopedRoot, 'package.json'), '{}');
    mkdirSync(join(unscopedRoot, '.musubix/changes'), { recursive: true });
    writeFileSync(join(unscopedRoot, '.musubix/changes/CHANGE-0001.md'), 'one');
    writeFileSync(join(unscopedRoot, '.musubix/changes/CHANGE-0002.md'), 'two');
    execFileSync('git', ['-C', unscopedRoot, 'add', '.']);
    execFileSync('git', ['-C', unscopedRoot, 'commit', '--quiet', '-m', 'candidate']);
    await expect(approvalManifest(unscopedRoot, 'release'))
      .rejects.toThrow('APPROVAL_CANDIDATE_UNAVAILABLE');
    await persistCandidateSnapshot(unscopedRoot, 'CHANGE-0002');
    await expect(approvalManifest(unscopedRoot, 'release', undefined, 'CHANGE-0002')).resolves.toMatchObject({
      changeId: 'CHANGE-0002',
    });
  });
});
