import { spawnSync } from 'node:child_process';
import {
  appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

function approvalWorkspace(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  write(root, '.musubix/config.json', `${JSON.stringify({
    schemaVersion: 1,
    approval: { mode: 'required', domains: [] },
  })}\n`);
  write(root, '.musubix/constitution.md', [
    '---',
    'version: 1.0.0',
    '---',
    '# Constitution',
    '',
    '## PRINC-001: Evidence',
    '### RULE-001: Trace',
    'Metric: trace.errors',
    'Limit: 0',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-SAMPLE-001: Sample',
    'Priority: must',
    'Type: functional',
    'Pattern: ubiquitous',
    'Statement: The system shall respond.',
    'Acceptance: The response is observed.',
    '',
  ].join('\n'));
  write(root, '.musubix/features/sample/design.md', '# Design\n');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CLI JSON failure compatibility', () => {
  /**
   * @id TEST-M5-COMPAT-003
   * @verifies REQ-M5-COMPAT-003
   */
  it('TEST-M5-COMPAT-003 preserves the operational-error envelope', () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-json-error-'));
    temporaryDirectories.push(root);
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'config',
      'lint',
      '--root',
      root,
      '--json',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: 'CLI_ERROR',
        message: 'Missing .musubix/config.json; run musubix5 init.',
      },
    });
    expect(result.stderr).toBe('');
  });

  /**
   * @id TEST-M5-APPROVAL-GUIDANCE-001
   * @verifies REQ-M5-APPROVAL-010 REQ-M5-TDD-CURRENCY-001
   */
  it('TEST-M5-APPROVAL-GUIDANCE-001 names the published approval recovery command', async () => {
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    const staleRoot = approvalWorkspace('musubix5-stale-approval-guidance-');
    const { approvalManifest, requireApproval } =
      await import('../packages/analysis/src/approval.js');
    const { recordApproval } =
      await import('../packages/analysis/src/approval-record.js');
    const config = { mode: 'required' as const, domains: [] };
    const manifest = await approvalManifest(staleRoot, 'requirements');
    await recordApproval(
      staleRoot,
      'requirements',
      '@test',
      manifest.artifactSha256,
      config,
    );
    appendFileSync(
      join(staleRoot, '.musubix/features/sample/requirements.md'),
      '\n',
    );

    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'design',
      'validate',
      '.musubix/features/sample/design.md',
      '--root',
      staleRoot,
      '--json',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout) as {
      error: { code: string; message: string };
    };
    expect(payload.error.code).toBe('CLI_ERROR');
    expect(payload.error.message).toContain('musubix5 approval validate');
    expect(payload.error.message).not.toContain('musubix3');

    const missingRoot = approvalWorkspace('musubix5-missing-approval-guidance-');
    await expect(requireApproval(missingRoot, 'requirements', config))
      .rejects.toThrow('musubix5 approval validate');
  });
});
