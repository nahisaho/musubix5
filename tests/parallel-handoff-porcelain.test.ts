import { afterEach, describe, expect, it } from 'vitest';

import { appendJournalRecord } from '../packages/analysis/src/journal.js';
import { verifyIntegrationProvenance } from '../packages/analysis/src/parallel.js';
import { parsePorcelainV1Z } from '../packages/analysis/src/git-status.js';
import {
  commitAll,
  createParallelFixture,
  git,
  readParallelStore,
  type ParallelFixture,
  writeFixtureFile,
  writeParallelStore,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

function completeRunningAttempt(root: string, planId: string, head: string): void {
  const store = readParallelStore(root);
  const attempts = store.attempts as Array<Record<string, unknown>>;
  const running = attempts.filter((entry) =>
    entry.planId === planId && entry.assignmentId === 'core' && entry.state === 'running').at(-1)!;
  const order = Number(store.nextOrder);
  attempts.push({
    ...running,
    state: 'completed',
    order,
    head,
    commits: git(root, ['rev-list', '--reverse', `${String(running.startCommit)}..${head}`])
      .split(/\r?\n/).filter(Boolean),
    tdd: [],
  });
  store.nextOrder = order + 1;
  writeParallelStore(root, store);
}

async function prepareVerifiedIntegration(): Promise<{
  fixture: ParallelFixture;
  planId: string;
}> {
  const fixture = await createParallelFixture();
  fixtures.push(fixture);
  const runtime = await import('../packages/analysis/src/parallel-runtime.js');
  const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
  await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
  const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
  writeFixtureFile(String(instruction.worktree), 'packages/core/value.txt', 'integrated\n');
  const head = commitAll(String(instruction.worktree), 'complete assignment');
  completeRunningAttempt(fixture.root, plan.planId, head);
  const integration = await runtime.startParallelIntegration(fixture.root, plan.planId);
  const provenance = verifyIntegrationProvenance(
    integration.provenance!,
    integration.provenance!.integrationCommit,
  );
  await appendJournalRecord(fixture.root, {
    stream: 'normal',
    changeId: 'CHANGE-0003',
    kind: 'parallel-transition',
    idempotencyKey: `fixture:${plan.planId}:integration:verified:porcelain`,
    payload: {
      ...integration,
      state: 'verified',
      provenance,
      order: integration.order + 1,
    },
  });
  return { fixture, planId: plan.planId };
}

describe('parallel handoff porcelain parsing', () => {
  /** @id TEST-M5-WAVE0-HANDOFF-PORCELAIN-001
   * @verifies REQ-M5-WAVE0-HANDOFF-001
   */
  it('TEST-M5-WAVE0-HANDOFF-PORCELAIN-001 preserves leading status bytes, pair paths, spaces, and non-ASCII', () => {
    expect(parsePorcelainV1Z([
      ' M packages/owned-first.ts',
      'R  packages/renamed new.ts',
      'packages/renamed old.ts',
      'C  packages/copied new.ts',
      'packages/copied old.ts',
      '?? packages/日本語 file.ts',
      '',
    ].join('\0'))).toEqual([
      { status: ' M', path: 'packages/owned-first.ts' },
      {
        status: 'R ',
        path: 'packages/renamed new.ts',
        originalPath: 'packages/renamed old.ts',
      },
      {
        status: 'C ',
        path: 'packages/copied new.ts',
        originalPath: 'packages/copied old.ts',
      },
      { status: '??', path: 'packages/日本語 file.ts' },
    ]);
  });

  /** @id TEST-M5-WAVE0-HANDOFF-PORCELAIN-OWNED-001
   * @verifies REQ-M5-WAVE0-HANDOFF-001
   */
  it('TEST-M5-WAVE0-HANDOFF-PORCELAIN-OWNED-001 permits a first unstaged integrator-owned record', async () => {
    const { fixture, planId } = await prepareVerifiedIntegration();
    writeFixtureFile(fixture.root, '.musubix/changes/CHANGE-0003.md', 'unstaged integrator update\n');
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.handoffParallelPlan(fixture.root, planId))
      .resolves.toMatchObject({ candidateCommit: expect.any(String) });
  });

  /** @id TEST-M5-WAVE0-HANDOFF-PORCELAIN-OUTSIDE-001
   * @verifies REQ-M5-WAVE0-HANDOFF-001
   */
  it('TEST-M5-WAVE0-HANDOFF-PORCELAIN-OUTSIDE-001 rejects a first unstaged outside-owned record', async () => {
    const { fixture, planId } = await prepareVerifiedIntegration();
    writeFixtureFile(fixture.root, 'packages/core/value.txt', 'unstaged outside-owned update\n');
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.handoffParallelPlan(fixture.root, planId))
      .rejects.toThrow(/PARALLEL_CANDIDATE_DIVERGED/);
  });
});
