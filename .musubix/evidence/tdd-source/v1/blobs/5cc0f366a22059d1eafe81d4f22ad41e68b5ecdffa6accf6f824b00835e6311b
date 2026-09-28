import { afterEach, describe, expect, it } from 'vitest';

import {
  createParallelFixture,
  git,
  type ParallelFixture,
  writeFixtureFile,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

describe('CHANGE-0003 generation 5 ownership history', () => {
  /** @id TEST-M5-PARALLEL-OWNERSHIP-HISTORY-001
   * @verifies REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007
   */
  it('TEST-M5-PARALLEL-OWNERSHIP-HISTORY-001 rejects integrator-owned paths changed then reverted in the commit range', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const worktree = String(instruction.worktree);

    writeFixtureFile(worktree, '.musubix/forbidden.json', { changedBy: 'assignment' });
    git(worktree, ['add', '-f', '.musubix/forbidden.json']);
    git(worktree, ['commit', '-m', 'modify integrator-owned evidence', '--quiet']);
    git(worktree, ['rm', '--quiet', '.musubix/forbidden.json']);
    git(worktree, ['commit', '-m', 'revert integrator-owned evidence', '--quiet']);
    const head = git(worktree, ['rev-parse', 'HEAD']);

    await expect(runtime.recordParallelAssignmentResult(
      fixture.root,
      plan.planId,
      'core',
      1,
      head,
    )).rejects.toThrow(/^PARALLEL_RESULT_OWNERSHIP:/);
  });
});
