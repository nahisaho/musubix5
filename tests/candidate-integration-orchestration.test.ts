import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceCandidateRegistry } from '../packages/analysis/src/candidate-state.js';
import type {
  ClosedIntegrationVerification,
  IntegrationOrchestrationResult,
} from '../packages/analysis/src/candidate-integration.js';

const roots: string[] = [];
const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

function commitFile(root: string, path: string, content: string, message: string): string {
  writeFileSync(resolve(root, path), content);
  git(root, 'add', path);
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function createFixture(secondPath = 'second.txt') {
  const root = resolve('.test-work', `candidate-integration-${randomUUID()}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Integration Test');
  git(root, 'config', 'user.email', 'integration@example.invalid');
  const baseCommit = commitFile(root, 'base.txt', 'base\n', 'base');

  const common = resolve(root, '.git');
  const firstWorktree = resolve(common, 'musubix5/workspaces/candidates/first');
  const secondWorktree = resolve(common, 'musubix5/workspaces/candidates/second');
  mkdirSync(resolve(common, 'musubix5/workspaces/candidates'), { recursive: true });
  git(root, 'branch', 'candidate-first', baseCommit);
  git(root, 'branch', 'candidate-second', baseCommit);
  git(root, 'worktree', 'add', firstWorktree, 'candidate-first');
  git(root, 'worktree', 'add', secondWorktree, 'candidate-second');
  const firstCommit = commitFile(firstWorktree, 'first.txt', 'first\n', 'first');
  const secondCommit = commitFile(secondWorktree, secondPath, 'second\n', 'second');

  const repositoryId = `repository:${'f'.repeat(64)}`;
  const firstId = `candidate:${'a'.repeat(64)}`;
  const secondId = `candidate:${'b'.repeat(64)}`;
  await replaceCandidateRegistry(root, {
    schemaVersion: 1,
    repositoryId,
    candidates: [
      {
        schemaVersion: 1,
        candidateId: firstId,
        changeId: 'CHANGE-0014',
        generation: 1,
        repositoryId,
        creationEpoch: 1,
        baseCommit,
        candidateCommit: firstCommit,
        branch: 'candidate-first',
        worktreePath: 'musubix5/workspaces/candidates/first',
        state: 'ready',
        preparedOrder: 1,
        activeOrder: 2,
        dependencyIds: [],
      },
      {
        schemaVersion: 1,
        candidateId: secondId,
        changeId: 'CHANGE-0015',
        generation: 1,
        repositoryId,
        creationEpoch: 2,
        baseCommit,
        candidateCommit: secondCommit,
        branch: 'candidate-second',
        worktreePath: 'musubix5/workspaces/candidates/second',
        state: 'ready',
        preparedOrder: 3,
        activeOrder: 4,
        dependencyIds: [firstId],
      },
    ],
    integrations: [],
  });
  return { root, baseCommit, firstId, secondId };
}

const verification: ClosedIntegrationVerification = {
  requiredCommands: [{ name: 'test', status: 'passed' }],
  requiredChecks: [{ name: 'trace', status: 'passed', diagnostics: [] }],
  status: { exitCode: 0, ready: false },
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('candidate integration orchestration', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-005
   * @verifies REQ-M5-MULTI-CHANGE-005
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-005 validates ready registry candidates before creating a worktree', async () => {
    const { root, firstId, secondId } = await createFixture('first.txt');
    const module = await import('../packages/analysis/src/candidate-integration.js');
    await expect(module.orchestrateCandidateIntegration({
      controlRoot: root,
      selectors: [firstId, secondId],
      verify: async () => verification,
    })).rejects.toThrow('CANDIDATE_OWNERSHIP_CONFLICT');
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain('/integrations/');
  });

  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-006
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-006 applies and verifies candidates before atomic finalization', async () => {
    const { root, baseCommit, firstId, secondId } = await createFixture();
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const integrated = await module.orchestrateCandidateIntegration({
      controlRoot: root,
      selectors: [secondId, firstId],
      verify: async (context) => {
        expect(readFileSync(resolve(context.worktreePath, 'first.txt'), 'utf8')).toBe('first\n');
        expect(readFileSync(resolve(context.worktreePath, 'second.txt'), 'utf8')).toBe('second\n');
        return verification;
      },
    });

    expect(integrated.state).toBe('verified');
    expect(integrated.applyOrder).toEqual([firstId, secondId]);
    expect(integrated.sourceManifest.kind).toBe('integration-source-manifest-v1');
    expect(git(root, 'rev-parse', 'main')).toBe(baseCommit);

    const finalized = await module.finalizeCandidateIntegration({
      controlRoot: root,
      integrationId: integrated.integrationId,
    });
    expect(finalized.state).toBe('integrated');
    expect(git(root, 'rev-parse', 'main')).toBe(finalized.integrationCommit);
    expect(readFileSync(resolve(root, 'first.txt'), 'utf8')).toBe('first\n');
    expect(readFileSync(resolve(root, 'second.txt'), 'utf8')).toBe('second\n');
  });

  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-007
   * @verifies REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-ORCHESTRATION-007 resumes the same set and safely tombstones cleanup', async () => {
    const { root, firstId, secondId } = await createFixture();
    const module = await import('../packages/analysis/src/candidate-integration.js');
    const integrated = await module.orchestrateCandidateIntegration({
      controlRoot: root,
      selectors: [firstId, secondId],
      verify: async () => verification,
    });
    await module.finalizeCandidateIntegration({
      controlRoot: root,
      integrationId: integrated.integrationId,
    });
    const resumed: IntegrationOrchestrationResult = await module.resumeCandidateIntegration({
      controlRoot: root,
      selectors: [firstId, secondId],
      verify: async () => verification,
    });
    expect(resumed.integrationId).toBe(integrated.integrationId);
    expect(resumed.state).toBe('integrated');
    expect(resumed.resumed).toBe(true);

    const cleaned = await module.cleanupCandidateIntegration({
      controlRoot: root,
      integrationId: integrated.integrationId,
      deletedBy: 'integration-test',
    });
    expect(cleaned.state).toBe('deleted');
    expect(cleaned.tombstone.deletedBy).toBe('integration-test');
    expect(git(root, 'worktree', 'list', '--porcelain')
      .includes(integrated.worktreePath)).toBe(false);
  });
});
