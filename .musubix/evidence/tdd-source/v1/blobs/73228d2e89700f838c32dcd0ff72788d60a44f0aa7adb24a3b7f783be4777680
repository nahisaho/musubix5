import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeMixedRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-context-'));
  temporaryDirectories.push(root);
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/musubix5.git');
  writeFileSync(join(root, 'tracked.txt'), 'baseline\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  mkdirSync(join(root, '.musubix', 'changes'), { recursive: true });
  mkdirSync(join(root, '.musubix', 'evidence'), { recursive: true });
  for (const changeId of ['CHANGE-0007', 'CHANGE-0008']) {
    writeFileSync(join(root, '.musubix', 'changes', `${changeId}.md`), [
      '---',
      'status: active',
      '---',
      `# ${changeId}`,
      '',
    ].join('\n'));
  }
  writeFileSync(join(root, '.musubix', 'evidence', 'changes.json'), JSON.stringify({
    schemaVersion: 1,
    changes: [
      { changeId: 'CHANGE-0007', activeGeneration: 4, requirementIds: ['REQ-ONE'] },
      { changeId: 'CHANGE-0008', activeGeneration: 2, requirementIds: ['REQ-TWO'] },
    ],
  }));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'active changes');
  return root;
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate workspace explicit context', () => {
  /** @id TEST-M5-MULTI-CHANGE-CONTEXT-001
   * @verifies REQ-M5-MULTI-CHANGE-002
   */
  it('TEST-M5-MULTI-CHANGE-CONTEXT-001 creates and reads one explicit candidate in a mixed repository', async () => {
    const root = initializeMixedRepository();
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { createProgram } = await import('../packages/cli/src/main.js');

    await createProgram().parseAsync([
      'node',
      'musubix5',
      'candidate-workspace',
      'create',
      '--change-id',
      'CHANGE-0007',
      '--root',
      root,
      '--json',
    ]);
    const created = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      candidateId: string;
      changeId: string;
      generation: number;
    };

    await createProgram().parseAsync([
      'node',
      'musubix5',
      'candidate-workspace',
      'show',
      created.candidateId,
      '--root',
      root,
      '--json',
    ]);
    const shown = JSON.parse(String(stdout.mock.calls.at(-1)?.[0]));

    expect(process.exitCode).toBeUndefined();
    expect(created).toMatchObject({
      candidateId: expect.stringMatching(/^candidate:[a-f0-9]{64}$/),
      changeId: 'CHANGE-0007',
      generation: 4,
    });
    expect(shown).toMatchObject({
      candidateId: created.candidateId,
      changeId: 'CHANGE-0007',
      generation: 4,
      state: 'active',
    });
  });
});
