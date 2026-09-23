import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { appendJournalRecord } from '../packages/analysis/src/journal.js';
import { batchFor } from '../packages/analysis/src/change-evidence.js';
import { verifyIntegrationProvenance } from '../packages/analysis/src/parallel.js';
import type { ProcessResult } from '../packages/analysis/src/process.js';
import {
  commitAll,
  createParallelFixture,
  git,
  readParallelStore,
  repositoryRoot,
  type ParallelFixture,
  writeFixtureFile,
  writeParallelStore,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];
const extraWorktrees: Array<{ root: string; path: string }> = [];

afterEach(() => {
  for (const worktree of extraWorktrees.splice(0)) {
    try {
      git(worktree.root, ['worktree', 'remove', '--force', worktree.path]);
    } catch {
      rmSync(worktree.path, { recursive: true, force: true });
    }
  }
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

async function promoteIntegration(root: string, planId: string, integration: Record<string, unknown>): Promise<void> {
  const provenance = verifyIntegrationProvenance(
    integration.provenance as Parameters<typeof verifyIntegrationProvenance>[0],
    String((integration.provenance as { integrationCommit: string }).integrationCommit),
  );
  await appendJournalRecord(root, {
    stream: 'normal',
    changeId: 'CHANGE-0003',
    kind: 'parallel-transition',
    idempotencyKey: `fixture:${planId}:integration:verified:dirty-control`,
    payload: {
      ...integration,
      state: 'verified',
      provenance,
      order: Number(integration.order) + 1,
    },
  });
}

describe('CHANGE-0003 generation 5 release blocker regressions', () => {
  /** @id TEST-M5-PARALLEL-LATEST-BATCH-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-015
   */
  it('TEST-M5-PARALLEL-LATEST-BATCH-001 selects the latest repeated requirement batch', () => {
    const older = { requirementIds: ['REQ-M5-PARALLEL-010'], red: { order: 1 } };
    const latest = { requirementIds: ['REQ-M5-PARALLEL-010'], red: { order: 10 } };
    expect(batchFor(
      [older, latest] as Parameters<typeof batchFor>[0],
      'REQ-M5-PARALLEL-010',
    )).toBe(latest);
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-GATE-001
   * @verifies REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-INTEGRATION-GATE-001 tolerates only pending release approval failures', async () => {
    const { integrationGateAcceptable } = await import('../packages/analysis/src/parallel-runtime.js');
    const result = (checks: unknown[]): ProcessResult => ({
      status: 'completed',
      exitCode: 1,
      stdout: JSON.stringify({ status: 'fail', checks }),
      stderr: '',
      durationMs: 1,
    });
    expect(integrationGateAcceptable(result([{
      name: 'approval',
      required: true,
      status: 'fail',
      diagnostics: [{ code: 'CHANGE_GENERATION_INCOMPLETE' }],
    }]))).toBe(true);
    expect(integrationGateAcceptable(result([{
      name: 'change-history',
      required: true,
      status: 'fail',
      diagnostics: [{ code: 'CHANGE_PHASE_ORDER' }],
    }]))).toBe(false);
    expect(integrationGateAcceptable(result([{
      name: 'approval',
      required: true,
      status: 'fail',
      diagnostics: [{ code: 'APPROVAL_SCHEMA' }],
    }]))).toBe(false);
  });

  /** @id TEST-M5-PARALLEL-WORKSPACE-OVERLAY-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-WORKSPACE-OVERLAY-001 restores workspace state when TMPDIR is on another filesystem', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const workspace = `${fixture.root}-overlay`;
    git(fixture.root, ['worktree', 'add', '--detach', workspace, fixture.baseCommit]);
    extraWorktrees.push({ root: fixture.root, path: workspace });
    writeFixtureFile(workspace, '.musubix/workspace-marker.txt', 'preserve\n');

    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'),
      'graph',
      'gate',
      '--root',
      fixture.root,
      '--workspace',
      workspace,
      '--json',
    ], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: existsSync('/dev/shm') ? '/dev/shm' : process.env.TMPDIR },
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(existsSync(resolve(workspace, '.musubix/workspace-marker.txt'))).toBe(true);
  });

  /** @id TEST-M5-PARALLEL-WORKSPACE-PARTIAL-COPY-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-WORKSPACE-PARTIAL-COPY-001 restores workspace state after overlay copy failure', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const workspace = `${fixture.root}-partial-overlay`;
    git(fixture.root, ['worktree', 'add', '--detach', workspace, fixture.baseCommit]);
    extraWorktrees.push({ root: fixture.root, path: workspace });
    writeFixtureFile(workspace, '.musubix/workspace-marker.txt', 'preserve\n');
    const socketPath = resolve(fixture.root, '.musubix/z-overlay-copy-failure.sock');
    const server = createServer();
    server.listen(socketPath);
    await once(server, 'listening');

    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'),
      'graph',
      'gate',
      '--root',
      fixture.root,
      '--workspace',
      workspace,
      '--json',
    ], { encoding: 'utf8' });
    server.close();
    await once(server, 'close');

    expect(result.status).not.toBe(0);
    expect(existsSync(resolve(workspace, '.musubix/workspace-marker.txt'))).toBe(true);
  });

  /** @id TEST-M5-PARALLEL-CONSUMER-CLI-001
   * @verifies REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-CONSUMER-CLI-001 uses the installed CLI when a consumer worktree has no self-hosted dist entry', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    writeFixtureFile(String(instruction.worktree), 'packages/core/value.txt', 'consumer\n');
    const head = commitAll(String(instruction.worktree), 'consumer assignment');
    completeRunningAttempt(fixture.root, plan.planId, head);
    const integration = await runtime.startParallelIntegration(fixture.root, plan.planId);

    await expect(runtime.verifyParallelIntegration(fixture.root, plan.planId)).rejects.toThrow();
    const store = readParallelStore(fixture.root);
    const persisted = (store.integrations as Array<Record<string, unknown>>)
      .find((entry) => entry.planId === plan.planId && entry.attempt === integration.attempt)!;
    const checks = (persisted.verification as { checks: Array<{ args: string[] }> }).checks;
    expect(checks[0]!.args[0]).toBe(resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'));
  });

  /** @id TEST-M5-PARALLEL-HANDOFF-EVIDENCE-DIRTY-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-HANDOFF-EVIDENCE-DIRTY-001 permits tracked control evidence while rejecting source divergence', async () => {
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
    await promoteIntegration(fixture.root, plan.planId, integration as unknown as Record<string, unknown>);
    writeFixtureFile(fixture.root, '.musubix/evidence/control-note.txt', 'pending evidence\n');

    await expect(runtime.handoffParallelPlan(fixture.root, plan.planId))
      .resolves.toMatchObject({ integrationEvidenceHead: expect.any(String) });
  });
});
