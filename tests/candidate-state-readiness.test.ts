import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readCandidateRegistry,
  replaceCandidateRegistry,
  type CandidateRegistry,
} from '../packages/analysis/src/candidate-state.js';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = join(process.cwd(), `.candidate-ready-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function registry(): CandidateRegistry {
  return {
    schemaVersion: 1,
    repositoryId: `repository:${'a'.repeat(64)}`,
    candidates: [{
      schemaVersion: 1,
      candidateId: `candidate:${'b'.repeat(64)}`,
      changeId: 'CHANGE-0014',
      generation: 1,
      repositoryId: `repository:${'a'.repeat(64)}`,
      creationEpoch: 1,
      baseCommit: 'c'.repeat(40),
      candidateCommit: 'd'.repeat(40),
      branch: 'musubix5/CHANGE-0014/candidate',
      worktreePath: 'candidate-0014',
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

describe('candidate readiness and resume', () => {
  /** @id TEST-M5-CANDIDATE-READY-RESUME-001
   * @verifies REQ-M5-MULTI-CHANGE-007
   */
  it('TEST-M5-CANDIDATE-READY-RESUME-001 revalidates readiness and resumes persisted identity', async () => {
    const root = fixtureRoot();
    const value = registry();
    await replaceCandidateRegistry(root, value);
    const api = await import('../packages/analysis/src/candidate-state.js') as typeof import(
      '../packages/analysis/src/candidate-state.js'
    ) & {
      markCandidateReady(
        root: string,
        selector: string,
        adapter: {
          approvals(): Promise<{ status: 'current'; fingerprint: string }>;
          tdd(): Promise<{ status: 'current'; fingerprint: string }>;
          quality(): Promise<{ status: 'current'; fingerprint: string }>;
          workspace(): Promise<{ status: 'current'; fingerprint: string }>;
          snapshot(): Promise<{ status: 'current'; fingerprint: string }>;
          gate(): Promise<{ status: 'current'; fingerprint: string }>;
        },
      ): Promise<{ candidate: { state: string }; bindings: Record<string, string> }>;
      resumeCandidate(root: string, selector: string): Promise<{
        candidateId: string;
        baseCommit: string;
        candidateCommit: string;
        branch: string;
        worktreePath: string;
        generation: number;
        state: string;
      }>;
    };
    const current = async () => ({ status: 'current' as const, fingerprint: 'current' });

    const ready = await api.markCandidateReady(root, 'CHANGE-0014', {
      approvals: current,
      tdd: current,
      quality: current,
      workspace: current,
      snapshot: current,
      gate: current,
    });
    expect(ready.candidate.state).toBe('ready');
    expect(Object.keys(ready.bindings).sort()).toEqual([
      'approvals',
      'gate',
      'quality',
      'snapshot',
      'tdd',
      'workspace',
    ]);

    const resumed = await api.resumeCandidate(root, value.candidates[0]!.candidateId);
    expect(resumed).toMatchObject({
      candidateId: value.candidates[0]!.candidateId,
      baseCommit: value.candidates[0]!.baseCommit,
      candidateCommit: value.candidates[0]!.candidateCommit,
      branch: value.candidates[0]!.branch,
      worktreePath: value.candidates[0]!.worktreePath,
      generation: 1,
      state: 'ready',
    });

    const persisted = await readCandidateRegistry(root);
    expect(persisted?.candidates[0]?.state).toBe('ready');
  });
});
