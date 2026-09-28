import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { appendJournalRecord } from '../packages/analysis/src/journal.js';
import {
  parallelWorkspacePaths,
  validateParallelPlan,
  verifyIntegrationProvenance,
  type AuthoredParallelPlan,
} from '../packages/analysis/src/parallel.js';
import {
  commitAll,
  createParallelFixture,
  fixtureParallelPolicy,
  git,
  readParallelStore,
  repositoryRoot,
  type ParallelFixture,
  writeFixtureFile,
  writeParallelStore,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

function twoAssignmentPlan(): AuthoredParallelPlan {
  return {
    schemaVersion: 1,
    concurrency: 1,
    provisionCommandNames: [],
    integratorOwnedPaths: ['.musubix/**'],
    assignments: [
      {
        id: 'core',
        role: 'implementation',
        requirementIds: ['REQ-M5-PARALLEL-004'],
        dependsOn: [],
        ownedPaths: ['packages/core/**'],
        focusedCommands: [{ name: 'smoke', args: [] }],
      },
      {
        id: 'cli',
        role: 'implementation',
        requirementIds: ['REQ-M5-PARALLEL-009'],
        dependsOn: [],
        ownedPaths: ['packages/cli/**'],
        focusedCommands: [{ name: 'smoke', args: [] }],
      },
    ],
  };
}

function commitAssignment(worktree: string, path: string, value: string): string {
  writeFixtureFile(worktree, path, value);
  return commitAll(worktree, `update ${path}`);
}

function seedCompletedAttempt(
  root: string,
  planId: string,
  assignmentId: string,
  attempt: number,
  head: string,
): void {
  const store = readParallelStore(root);
  const attempts = store.attempts as Array<Record<string, unknown>>;
  const running = attempts
    .filter((entry) => entry.planId === planId
      && entry.assignmentId === assignmentId
      && entry.attempt === attempt)
    .at(-1);
  if (!running) throw new Error(`missing running ${assignmentId} attempt ${attempt}`);
  const commits = git(root, ['rev-list', '--reverse', `${String(running.startCommit)}..${head}`])
    .split(/\r?\n/).filter(Boolean);
  const order = Number(store.nextOrder);
  attempts.push({
    ...running,
    state: 'completed',
    order,
    head,
    commits,
    tdd: [],
  });
  store.nextOrder = order + 1;
  writeParallelStore(root, store);
}

async function promoteIntegrationToVerified(
  root: string,
  planId: string,
  integration: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const provenance = verifyIntegrationProvenance(
    integration.provenance as Parameters<typeof verifyIntegrationProvenance>[0],
    String((integration.provenance as { integrationCommit: string }).integrationCommit),
  );
  const verified = {
    ...integration,
    state: 'verified',
    provenance,
    order: Number(integration.order) + 1,
  };
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: 'CHANGE-0003',
    kind: 'parallel-transition',
    idempotencyKey: `fixture:${planId}:integration:verified`,
    payload: verified,
  });
  return verified;
}

function runCli(root: string, args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | null;
} {
  const result = spawnSync(process.execPath, [
    resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'),
    ...args,
    '--root',
    root,
    '--json',
  ], { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: result.stdout.trim() ? JSON.parse(result.stdout) as Record<string, unknown> : null,
  };
}

describe('CHANGE-0003 generation 5 real parallel runtime lifecycle', () => {
  /** @id TEST-M5-PARALLEL-RUNTIME-LIFECYCLE-001
   * @verifies REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-015
   */
  it('TEST-M5-PARALLEL-RUNTIME-LIFECYCLE-001 executes plan, prepare, instruction, heartbeat, fail, retry, status, integration verify and reopen', async () => {
    const fixture = await createParallelFixture({ plan: twoAssignmentPlan() });
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.validateParallelPlanFile(fixture.root, fixture.planFile))
      .resolves.toMatchObject({ concurrency: 1 });
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await expect(runtime.prepareParallelPlanRuntime(fixture.root, plan.planId))
      .resolves.toMatchObject({ planId: plan.planId });
    const first = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    await expect(runtime.recordParallelHeartbeat(fixture.root, plan.planId, 'core', 1))
      .resolves.toMatchObject({ assignmentId: 'core', attempt: 1 });
    await expect(runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'cli'))
      .rejects.toThrow(/^PARALLEL_CONCURRENCY_LIMIT:/);
    await expect(runtime.failParallelAssignment(fixture.root, plan.planId, 'core', 1, 'focused test failed'))
      .resolves.toMatchObject({ state: 'failed' });
    await expect(runtime.retryParallelAssignment(fixture.root, plan.planId, 'core'))
      .resolves.toMatchObject({ attempt: 2 });

    const retried = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    expect(retried.attempt).toBe(2);
    const coreHead = commitAssignment(String(retried.worktree), 'packages/core/value.txt', 'core complete\n');
    seedCompletedAttempt(fixture.root, plan.planId, 'core', 2, coreHead);
    const cliInstruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'cli');
    const cliHead = commitAssignment(String(cliInstruction.worktree), 'packages/cli/value.txt', 'cli complete\n');
    seedCompletedAttempt(fixture.root, plan.planId, 'cli', 1, cliHead);

    await expect(runtime.parallelRuntimeStatus(fixture.root, { planId: plan.planId }))
      .resolves.toMatchObject({ counts: { completed: 2 } });
    const integration = await runtime.startParallelIntegration(fixture.root, plan.planId);
    expect(integration.state).toBe('provisional');
    expect(integration.consumedAssignmentIds).toEqual(expect.arrayContaining(['core', 'cli']));
    await expect(runtime.handoffParallelPlan(fixture.root, plan.planId))
      .rejects.toThrow(/^PARALLEL_INTEGRATION_INCOMPLETE:/);
    await expect(runtime.cleanupParallelRuntime(fixture.root, { planId: plan.planId }))
      .rejects.toThrow(/^PARALLEL_INTEGRATION_INCOMPLETE:/);
    await expect(runtime.verifyParallelIntegration(fixture.root, plan.planId))
      .rejects.toThrow(/^PARALLEL_INTEGRATION_VERIFICATION_FAILED:/);
    await expect(runtime.reopenParallelIntegration(
      fixture.root,
      plan.planId,
      ['core', 'cli'],
      'integration verification failed',
    )).resolves.toMatchObject({ assignments: ['core', 'cli'] });

    expect(existsSync(String(first.worktree))).toBe(true);
  });

  /** @id TEST-M5-PARALLEL-RUNTIME-HANDOFF-CLEANUP-001
   * @verifies REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-RUNTIME-HANDOFF-CLEANUP-001 fast-forwards a verified integration and cleans real worktrees', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const assignmentHead = commitAssignment(String(instruction.worktree), 'packages/core/value.txt', 'integrated\n');
    seedCompletedAttempt(fixture.root, plan.planId, 'core', 1, assignmentHead);
    const provisional = await runtime.startParallelIntegration(fixture.root, plan.planId);
    await promoteIntegrationToVerified(fixture.root, plan.planId, provisional as unknown as Record<string, unknown>);

    const handoff = await runtime.handoffParallelPlan(fixture.root, plan.planId);
    expect(handoff).toMatchObject({
      candidateCommit: git(fixture.root, ['rev-parse', 'HEAD']),
      integrationEvidenceHead: (provisional.provenance as { integrationCommit: string }).integrationCommit,
    });
    const cleanup = await runtime.cleanupParallelRuntime(fixture.root, { planId: plan.planId });
    if (!('removed' in cleanup)) throw new Error('expected plan-scoped cleanup record');
    expect(cleanup.removed).toEqual(expect.arrayContaining([
      String(instruction.worktree),
      provisional.worktree,
    ]));
    expect(existsSync(String(instruction.worktree))).toBe(false);
    expect(existsSync(provisional.worktree)).toBe(false);
  });

  /** @id TEST-M5-PARALLEL-RUNTIME-DIAGNOSTICS-001
   * @verifies REQ-M5-COMPAT-003 REQ-M5-COMPAT-013 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-RUNTIME-DIAGNOSTICS-001 returns PLAN_INVALID, PLAN_EXISTS, STALE_WORKTREES_PRESENT and INTEGRATION_INCOMPLETE', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    writeFixtureFile(fixture.root, '.musubix/cache/invalid-plan.json', { schemaVersion: 1, unexpected: true });
    const invalid = runCli(fixture.root, ['parallel', 'plan', 'validate', '.musubix/cache/invalid-plan.json']);
    expect(invalid.status).toBe(1);
    expect(invalid.json).toMatchObject({ error: { code: 'PARALLEL_PLAN_INVALID' } });

    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    const duplicate = runCli(fixture.root, ['parallel', 'plan', 'create', fixture.planFile]);
    expect(duplicate.status).toBe(1);
    expect(duplicate.json).toMatchObject({ error: { code: 'PARALLEL_PLAN_EXISTS' } });
    await expect(runtime.startParallelIntegration(fixture.root, plan.planId))
      .rejects.toThrow(/^PARALLEL_INTEGRATION_INCOMPLETE:/);

    const staleFixture = await createParallelFixture();
    fixtures.push(staleFixture);
    const staleAuthored = twoAssignmentPlan();
    const stale = validateParallelPlan(staleAuthored, {
      changeId: 'CHANGE-0003',
      generation: 4,
      baseCommit: staleFixture.baseCommit,
      requirementIds: [
        'REQ-M5-PARALLEL-004',
        'REQ-M5-PARALLEL-009',
        'REQ-M5-PARALLEL-013',
      ],
      requirementsApprovalSha256: 'a'.repeat(64),
      designApprovalSha256: 'b'.repeat(64),
      commandSetSha256: 'c'.repeat(64),
      configuredCommandNames: ['smoke'],
    });
    const paths = parallelWorkspacePaths(
      join(staleFixture.root, '.git'),
      'CHANGE-0003',
      stale.planId,
      'core',
      1,
    );
    git(staleFixture.root, [
      'worktree', 'add', '--quiet', '-b',
      paths.assignmentBranch,
      paths.assignmentWorktree,
      staleFixture.baseCommit,
    ]);
    writeParallelStore(staleFixture.root, {
      schemaVersion: 1,
      nextOrder: 2,
      plans: [{ ...stale, policy: fixtureParallelPolicy, createdOrder: 1 }],
      prepared: [],
      attempts: [{
        planId: stale.planId,
        assignmentId: 'core',
        attempt: 1,
        state: 'running',
        order: 1,
        branch: paths.assignmentBranch,
        worktree: paths.assignmentWorktree,
        startCommit: staleFixture.baseCommit,
      }],
      retries: [],
      integrations: [],
      handoffs: [],
      cleanups: [],
      maintenance: [],
    });
    await expect(runtime.createParallelPlan(staleFixture.root, staleFixture.planFile))
      .rejects.toThrow(/^PARALLEL_STALE_WORKTREES_PRESENT:/);
  });

  /** @id TEST-M5-PARALLEL-CANDIDATE-DIVERGED-001
   * @verifies REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-013 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-CANDIDATE-DIVERGED-001 reports CANDIDATE_DIVERGED when the candidate advances before handoff', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const assignmentHead = commitAssignment(String(instruction.worktree), 'packages/core/value.txt', 'ready\n');
    seedCompletedAttempt(fixture.root, plan.planId, 'core', 1, assignmentHead);
    const provisional = await runtime.startParallelIntegration(fixture.root, plan.planId);
    await promoteIntegrationToVerified(fixture.root, plan.planId, provisional as unknown as Record<string, unknown>);
    writeFixtureFile(fixture.root, 'candidate-only.txt', 'diverged\n');
    commitAll(fixture.root, 'candidate diverged');

    await expect(runtime.handoffParallelPlan(fixture.root, plan.planId))
      .rejects.toThrow(/^PARALLEL_CANDIDATE_DIVERGED:/);
  });
});
