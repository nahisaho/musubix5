import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('approval manifest scope', () => {
  /**
   * @id TEST-M5-APPROVAL-007
   * @verifies REQ-M5-APPROVAL-007
   */
  it('TEST-M5-APPROVAL-007 applies stage projections and explicit release exclusions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-approval-scope-'));
    temporaryDirectories.push(root);
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    write(root, '.musubix/constitution.md', '# Constitution\n');
    write(root, '.musubix/features/sample/requirements.md', '# Requirements\n');
    write(root, '.musubix/features/sample/design.md', [
      '## DES-SAMPLE-001: Sample',
      'Responsibilities: Respond.',
      'Interfaces: `respond()`.',
      'Constraints: Deterministic.',
      'Requirements: REQ-SAMPLE-001',
      'ADRs: ADR-0001',
      '',
    ].join('\n'));
    write(root, '.musubix/features/sample/trace.json', '{}\n');
    write(root, '.musubix/decisions/ADR-0001.md', '# ADR\n');
    write(root, '.musubix/evidence/current.json', '{"changeId":"CHANGE-0002"}\n');
    write(root, '.musubix/evidence/foreign.json', '{"changeId":"CHANGE-9999"}\n');
    write(root, '.musubix/config.json', JSON.stringify({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
      commands: [],
      requiredChecks: ['requirements'],
      thresholds: { design: 1, implementation: 1, tests: 1 },
      architecture: { forbidCycles: true, rules: [] },
      codeGraph: { mode: 'compatible' },
      formal: { solver: 'none', minModeledFraction: 0, timeoutMs: 12000 },
      mutation: { mode: 'compatible' },
      tdd: { redPreflightCommands: [] },
      workflow: { mode: 'compatible' },
      attestation: { mode: 'off', trustedPublicKeys: [] },
      ignoredExtension: true,
    }));
    write(root, 'src/index.ts', 'export const value = 1;\n');
    write(root, 'docs/history/old.md', 'old\n');
    write(root, 'logs/run/output.txt', 'log\n');
    write(root, '.musubix/runs/output.json', '{}\n');
    write(root, 'archive.tgz', 'archive\n');
    const { prepareStageApproval } = await import('../packages/analysis/src/native-approval.js');

    const requirements = await prepareStageApproval(root, {
      stage: 'requirements',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(Object.keys(requirements.artifacts)).toEqual([
      '.musubix/constitution.md',
      '.musubix/features/sample/requirements.md',
    ]);
    expect(requirements.projection).toEqual({
      schemaVersion: 1,
      approval: { mode: 'required', domains: [] },
    });

    const design = await prepareStageApproval(root, {
      stage: 'design',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(Object.keys(design.artifacts)).toEqual([
      '.musubix/constitution.md',
      '.musubix/decisions/ADR-0001.md',
      '.musubix/features/sample/design.md',
      '.musubix/features/sample/requirements.md',
    ]);
    expect(Object.keys(design.projection as object)).toEqual([
      'schemaVersion',
      'commands',
      'requiredChecks',
      'thresholds',
      'architecture',
      'codeGraph',
      'formal',
      'mutation',
      'tdd',
      'workflow',
      'attestation',
    ]);

    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'candidate']);
    const { persistCandidateSnapshot } =
      await import('../packages/analysis/src/workspace-manager.js');
    await persistCandidateSnapshot(root, 'CHANGE-0002');
    const release = await prepareStageApproval(root, {
      stage: 'release',
      changeId: 'CHANGE-0002',
      runLocalPaths: [],
    });
    expect(Object.keys(release.artifacts)).toContain('src/index.ts');
    expect(release.exclusions.map((entry) => [entry.path, entry.reason])).toEqual(expect.arrayContaining([
      ['.musubix/features/sample/trace.json', 'generated-trace'],
      ['.musubix/evidence/foreign.json', 'foreign-change-evidence'],
      ['archive.tgz', 'package-archive'],
      ['docs/history/old.md', 'historical'],
      ['logs/run/output.txt', 'log-directory'],
      ['.musubix/runs/output.json', 'run-local'],
    ]));
  });
});
