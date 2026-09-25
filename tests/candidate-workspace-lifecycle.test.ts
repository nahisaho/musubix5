import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-candidate-workspace-'));
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
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('candidate workspace lifecycle', () => {
  /** @id TEST-M5-MULTI-CHANGE-CANDIDATE-001
   * @verifies REQ-M5-MULTI-CHANGE-001
   */
  it('TEST-M5-MULTI-CHANGE-CANDIDATE-001 creates isolated replayable candidates for two active changes', async () => {
    const root = initializeRepository();
    writeFileSync(join(root, 'untracked.txt'), 'preserve me\n');
    const before = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
    const {
      createRegisteredCandidateWorkspace,
      listRegisteredCandidateWorkspaces,
    } = await import('../packages/analysis/src/workspace-manager.js') as typeof import(
      '../packages/analysis/src/workspace-manager.js'
    ) & {
      createRegisteredCandidateWorkspace(root: string, changeId: string): Promise<{
        candidateId: string;
        changeId: string;
        generation: number;
        repositoryId: string;
        baseCommit: string;
        branch: string;
        worktreePath: string;
        state: string;
        replayed: boolean;
      }>;
      listRegisteredCandidateWorkspaces(root: string): Promise<Array<{
        candidateId: string;
        changeId: string;
        generation: number;
        baseCommit: string;
        branch: string;
        worktreePath: string;
        state: string;
      }>>;
    };

    const first = await createRegisteredCandidateWorkspace(root, 'CHANGE-0007');
    const second = await createRegisteredCandidateWorkspace(root, 'CHANGE-0008');
    const replayed = await createRegisteredCandidateWorkspace(root, 'CHANGE-0007');
    const listed = await listRegisteredCandidateWorkspaces(root);

    expect(first).toMatchObject({
      candidateId: expect.stringMatching(/^candidate:[a-f0-9]{64}$/),
      changeId: 'CHANGE-0007',
      generation: 4,
      repositoryId: expect.stringMatching(/^repository:[a-f0-9]{64}$/),
      baseCommit: expect.stringMatching(/^[a-f0-9]{40,64}$/),
      branch: expect.stringContaining('CHANGE-0007'),
      worktreePath: expect.any(String),
      state: 'active',
      replayed: false,
    });
    expect(second).toMatchObject({
      candidateId: expect.stringMatching(/^candidate:[a-f0-9]{64}$/),
      changeId: 'CHANGE-0008',
      generation: 2,
      baseCommit: first.baseCommit,
      state: 'active',
      replayed: false,
    });
    expect(second.candidateId).not.toBe(first.candidateId);
    expect(second.branch).not.toBe(first.branch);
    expect(second.worktreePath).not.toBe(first.worktreePath);
    expect(replayed).toEqual({ ...first, replayed: true });
    expect(listed).toEqual([
      expect.objectContaining({ candidateId: first.candidateId, changeId: first.changeId }),
      expect.objectContaining({ candidateId: second.candidateId, changeId: second.changeId }),
    ]);
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toContain(before);

    const registry = JSON.parse(readFileSync(
      join(root, '.musubix', 'candidates', 'registry.json'),
      'utf8',
    )) as { schemaVersion: number; candidates: unknown[] };
    expect(registry).toMatchObject({ schemaVersion: 1 });
    expect(registry.candidates).toHaveLength(2);
  });
});
