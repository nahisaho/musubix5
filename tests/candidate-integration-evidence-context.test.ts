import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceCandidateRegistry } from '../packages/analysis/src/candidate-state.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('integration evidence context loader', () => {
  /** @id TEST-M5-MULTI-CHANGE-INTEGRATION-EVIDENCE-CONTEXT-001
   * @verifies REQ-M5-MULTI-CHANGE-006
   */
  it('TEST-M5-MULTI-CHANGE-INTEGRATION-EVIDENCE-CONTEXT-001 validates persisted integration ownership and projects immutable evidence inputs', async () => {
    const root = resolve('.test-work', `integration-context-${randomUUID()}`);
    roots.push(root);
    const repositoryId = `repository:${'f'.repeat(64)}`;
    const integrationId = `integration:${'a'.repeat(64)}`;
    const firstId = `candidate:${'b'.repeat(64)}`;
    const secondId = `candidate:${'c'.repeat(64)}`;
    const firstCommit = '1'.repeat(40);
    const secondCommit = '2'.repeat(40);
    mkdirSync(root, { recursive: true });
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
          baseCommit: '0'.repeat(40),
          candidateCommit: firstCommit,
          branch: 'candidate-first',
          worktreePath: 'worktrees/first',
          state: 'verified',
          preparedOrder: 1,
          activeOrder: 2,
          dependencyIds: [],
        },
        {
          schemaVersion: 1,
          candidateId: secondId,
          changeId: 'CHANGE-0015',
          generation: 2,
          repositoryId,
          creationEpoch: 2,
          baseCommit: '0'.repeat(40),
          candidateCommit: secondCommit,
          branch: 'candidate-second',
          worktreePath: 'worktrees/second',
          state: 'verified',
          preparedOrder: 3,
          activeOrder: 4,
          dependencyIds: [firstId],
        },
      ],
      integrations: [{
        schemaVersion: 1,
        integrationId,
        repositoryId,
        changeIds: ['CHANGE-0014', 'CHANGE-0015'],
        candidateIds: [firstId, secondId],
        worktreePath: 'worktrees/integration',
        state: 'verified',
      }],
    });
    const path = resolve(
      root,
      '.musubix/candidates/integrations',
      integrationId,
      'integration.json',
    );
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1,
      integrationId,
      repositoryId,
      startingDefaultCommit: '0'.repeat(40),
      candidateIds: [firstId, secondId],
      inputCommits: [firstCommit, secondCommit],
      state: 'verified',
      changeIds: ['CHANGE-0014', 'CHANGE-0015'],
      applyOrder: [firstId, secondId],
      sourceManifest: {
        schemaVersion: 1,
        kind: 'integration-source-manifest-v1',
        entries: [],
        sha256: '3'.repeat(64),
      },
      worktreePath: 'worktrees/integration',
      releaseOwnerCandidateId: firstId,
      integrationCommit: '4'.repeat(40),
    }));

    const { loadIntegrationEvidenceContext } = await import(
      '../packages/analysis/src/candidate-integration.js'
    );
    expect(await loadIntegrationEvidenceContext(root, integrationId)).toEqual({
      repositoryId,
      integrationId,
      startingDefaultCommit: '0'.repeat(40),
      candidates: [
        {
          changeId: 'CHANGE-0014',
          generation: 1,
          candidateId: firstId,
          candidateCommit: firstCommit,
        },
        {
          changeId: 'CHANGE-0015',
          generation: 2,
          candidateId: secondId,
          candidateCommit: secondCommit,
        },
      ],
      applyOrder: [firstId, secondId],
      sourceManifestSha256: '3'.repeat(64),
      integrationCommit: '4'.repeat(40),
    });
    await expect(loadIntegrationEvidenceContext(root, `integration:${'9'.repeat(64)}`))
      .rejects.toThrow('CANDIDATE_WORKSPACE_NOT_FOUND');
    await expect(loadIntegrationEvidenceContext(root, 'malformed'))
      .rejects.toThrow('CLI_ERROR');
  });
});
