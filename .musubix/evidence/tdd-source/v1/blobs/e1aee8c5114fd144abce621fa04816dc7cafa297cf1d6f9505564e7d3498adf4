import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  replaceCandidateRegistry,
  type CandidateRegistry,
} from '../packages/analysis/src/candidate-state.js';

const roots: string[] = [];

function fixtureRoot(name: string): string {
  const root = join(process.cwd(), `.candidate-state-${name}-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function registry(worktreePath: string): CandidateRegistry {
  return {
    schemaVersion: 1,
    repositoryId: `repository:${'1'.repeat(64)}`,
    candidates: [{
      schemaVersion: 1,
      candidateId: `candidate:${'2'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 3,
      repositoryId: `repository:${'1'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit: '3'.repeat(40),
      candidateCommit: '4'.repeat(40),
      branch: 'musubix5/CHANGE-0014/candidate',
      worktreePath,
      state: 'active',
      preparedOrder: 1,
      activeOrder: 2,
      dependencyIds: [],
    }],
    integrations: [],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('candidate execution context', () => {
  /** @id TEST-M5-CANDIDATE-CONTEXT-E2E-001
   * @verifies REQ-M5-MULTI-CHANGE-002
   */
  it('TEST-M5-CANDIDATE-CONTEXT-E2E-001 resolves selector, change ID, and registered cwd exactly', async () => {
    const controlRoot = fixtureRoot('context');
    const managedRoot = fixtureRoot('managed');
    const candidateRoot = join(managedRoot, 'candidate-0014');
    mkdirSync(candidateRoot);
    const value = registry('candidate-0014');
    await replaceCandidateRegistry(controlRoot, value);
    const api = await import('../packages/analysis/src/candidate-state.js') as typeof import(
      '../packages/analysis/src/candidate-state.js'
    ) & {
      resolveCandidateExecutionContext(
        root: string,
        options: {
          selector?: string;
          changeId?: string;
          cwd?: string;
          managedRoot?: string;
          repositoryId: string;
          activeGeneration: number;
        },
      ): Promise<{
        kind: 'candidate';
        sourceRoot: string;
        controlRoot: string;
        projectionRoot: string;
        binding: { candidateId: string; changeId: string; generation: number };
      }>;
    };

    const bySelector = await api.resolveCandidateExecutionContext(controlRoot, {
      selector: value.candidates[0]!.candidateId,
      repositoryId: value.repositoryId,
      activeGeneration: 3,
      managedRoot,
    });
    const byChange = await api.resolveCandidateExecutionContext(controlRoot, {
      changeId: 'CHANGE-0014',
      repositoryId: value.repositoryId,
      activeGeneration: 3,
      managedRoot,
    });
    const byCwd = await api.resolveCandidateExecutionContext(controlRoot, {
      cwd: join(candidateRoot, 'nested'),
      repositoryId: value.repositoryId,
      activeGeneration: 3,
      managedRoot,
    });

    expect(bySelector).toEqual(byChange);
    expect(byCwd).toEqual(bySelector);
    expect(bySelector).toMatchObject({
      kind: 'candidate',
      sourceRoot: resolve(candidateRoot),
      controlRoot: resolve(controlRoot),
      binding: {
        candidateId: value.candidates[0]!.candidateId,
        changeId: 'CHANGE-0014',
        generation: 3,
      },
    });

    await expect(api.resolveCandidateExecutionContext(controlRoot, {
      selector: value.candidates[0]!.candidateId,
      changeId: 'CHANGE-0099',
      repositoryId: value.repositoryId,
      activeGeneration: 3,
      managedRoot,
    })).rejects.toThrow('CANDIDATE_WORKSPACE_SELECTOR_MISMATCH');
    await expect(api.resolveCandidateExecutionContext(controlRoot, {
      changeId: 'CHANGE-0014',
      repositoryId: `repository:${'9'.repeat(64)}`,
      activeGeneration: 3,
      managedRoot,
    })).rejects.toThrow('CANDIDATE_WORKSPACE_REPOSITORY_MISMATCH');
    await expect(api.resolveCandidateExecutionContext(controlRoot, {
      changeId: 'CHANGE-0014',
      repositoryId: value.repositoryId,
      activeGeneration: 4,
      managedRoot,
    })).rejects.toThrow('CANDIDATE_WORKSPACE_GENERATION_MISMATCH');
    await expect(api.resolveCandidateExecutionContext(controlRoot, {
      selector: 'candidate:not-a-digest',
      repositoryId: value.repositoryId,
      activeGeneration: 3,
      managedRoot,
    })).rejects.toThrow('CLI_ERROR');
  });
});
