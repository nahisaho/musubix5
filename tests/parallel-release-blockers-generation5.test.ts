import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { appendJournalRecord } from '../packages/analysis/src/journal.js';
import { canonicalRepositoryIdentity } from '../packages/analysis/src/canonical.js';
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
  it('TEST-M5-PARALLEL-INTEGRATION-GATE-001 tolerates only the complete pre-release diagnostic pair', async () => {
    const { integrationGateAcceptable } = await import('../packages/analysis/src/parallel-runtime.js');
    const result = (checks: unknown[]): ProcessResult => ({
      status: 'completed',
      exitCode: 1,
      stdout: JSON.stringify({ status: 'fail', checks }),
      stderr: '',
      durationMs: 1,
    });
    const changeHistory = {
      name: 'change-history',
      required: true,
      status: 'fail',
      diagnostics: [
        { code: 'CHANGE_GENERATION_INCOMPLETE', severity: 'error' },
        { code: 'CHANGE_PHASE_MISSING', severity: 'error', detail: 'phase:quality' },
      ],
    };
    expect(integrationGateAcceptable(result([
      changeHistory,
      {
        name: 'approval',
        required: true,
        status: 'fail',
        diagnostics: [{ code: 'APPROVAL_CANDIDATE_MISSING', severity: 'error' }],
      },
    ]), { releaseApproval: 'absent' })).toBe(true);
    expect(integrationGateAcceptable(result([{
      name: 'change-history',
      required: true,
      status: 'fail',
      diagnostics: [{ code: 'CHANGE_PHASE_ORDER', severity: 'error' }],
    }]), { releaseApproval: 'absent' })).toBe(false);
    expect(integrationGateAcceptable(result([
      changeHistory,
      {
        name: 'approval',
        required: true,
        status: 'fail',
        diagnostics: [{ code: 'APPROVAL_SCHEMA', severity: 'error' }],
      },
    ]), { releaseApproval: 'absent' })).toBe(false);
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-001
   * @verifies REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-001 accepts only the bound pre-release gate boundary', async () => {
    const { integrationGateAcceptable } = await import('../packages/analysis/src/parallel-runtime.js');
    const result = (exitCode: number, checks: unknown[]): ProcessResult => ({
      status: 'completed',
      exitCode,
      stdout: JSON.stringify({ status: exitCode === 0 ? 'pass' : 'fail', checks }),
      stderr: '',
      durationMs: 1,
    });
    const pass = { name: 'commands', required: true, status: 'pass', diagnostics: [] };
    const optionalSkip = { name: 'mutation', required: false, status: 'skipped', diagnostics: [] };
    const changeHistory = {
      name: 'change-history',
      required: true,
      status: 'fail',
      diagnostics: [
        { code: 'CHANGE_GENERATION_INCOMPLETE', severity: 'error' },
        { code: 'CHANGE_PHASE_MISSING', severity: 'error', detail: 'phase:quality' },
        { code: 'CHANGE_RECORDEDAT_OUT_OF_ORDER', severity: 'warning' },
      ],
    };
    const approval = (code: string) => ({
      name: 'approval',
      required: true,
      status: 'fail',
      diagnostics: [{ code, severity: 'error' }],
    });

    expect(integrationGateAcceptable(
      result(0, [pass, optionalSkip]),
      { releaseApproval: 'absent' },
    )).toBe(true);
    expect(integrationGateAcceptable(
      result(0, [{ ...pass, status: 'fail' }, optionalSkip]),
      { releaseApproval: 'absent' },
    )).toBe(false);
    expect(integrationGateAcceptable(
      result(1, [pass, optionalSkip, changeHistory, approval('APPROVAL_CANDIDATE_MISSING')]),
      { releaseApproval: 'absent' },
    )).toBe(true);
    expect(integrationGateAcceptable(
      result(1, [pass, changeHistory, approval('CHANGE_GENERATION_INCOMPLETE')]),
      { releaseApproval: 'absent' },
    )).toBe(false);
    expect(integrationGateAcceptable(
      result(1, [pass, changeHistory, approval('CHANGE_GENERATION_INCOMPLETE')]),
      { releaseApproval: 'foreign-completed' },
    )).toBe(true);
    expect(integrationGateAcceptable(
      result(1, [pass, changeHistory, approval('APPROVAL_CANDIDATE_UNAVAILABLE')]),
      { releaseApproval: 'foreign-completed' },
    )).toBe(false);
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-POLICY-002
   * @verifies REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-POLICY-002 enforces the complete pre-release gate and status contract', async () => {
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const { integrationGateAcceptable } = runtime;
    const integrationStatusAcceptable = (
      runtime as unknown as Record<string, unknown>
    ).integrationStatusAcceptable as ((result: ProcessResult) => boolean) | undefined;
    const result = (exitCode: number, checks: unknown[]): ProcessResult => ({
      status: 'completed',
      exitCode,
      stdout: JSON.stringify({ status: exitCode === 0 ? 'pass' : 'fail', checks }),
      stderr: '',
      durationMs: 1,
    });
    const pass = { name: 'commands', required: true, status: 'pass', diagnostics: [] };
    const optional = (status: string) => ({
      name: 'formal',
      required: false,
      status,
      diagnostics: [{ code: 'FORMAL_OPTIONAL', severity: 'unexpected', arbitrary: true }],
    });
    const changeHistory = (phaseSeverity: string, waiver?: unknown) => ({
      name: 'change-history',
      required: true,
      status: 'fail',
      diagnostics: [
        { code: 'CHANGE_GENERATION_INCOMPLETE', severity: 'error' },
        {
          code: 'CHANGE_PHASE_MISSING',
          severity: phaseSeverity,
          detail: 'phase:quality',
          ...(waiver === undefined ? {} : { waiver }),
        },
      ],
    });
    const approval = (code = 'APPROVAL_CANDIDATE_MISSING') => ({
      name: 'approval',
      required: true,
      status: 'fail',
      diagnostics: [{ code, severity: 'error' }],
    });

    expect(integrationGateAcceptable(result(0, [pass, optional('fail')]))).toBe(true);
    expect(integrationGateAcceptable(result(1, [
      pass,
      changeHistory('error'),
      optional('future-status'),
    ]), { releaseApproval: 'absent' })).toBe(true);
    expect(integrationGateAcceptable(result(1, [
      pass,
      approval(),
      optional('fail'),
    ]), { releaseApproval: 'absent' })).toBe(true);
    expect(integrationGateAcceptable(result(1, [
      pass,
      changeHistory('warning', {
        approver: 'fixture-owner',
        reason: 'quality is intentionally pending until integration completes',
        recordedAt: '2026-09-25T00:00:00.000Z',
      }),
    ]), { releaseApproval: 'absent' })).toBe(true);
    expect(integrationGateAcceptable(result(1, [{
      ...changeHistory('error'),
      diagnostics: [
        { code: 'CHANGE_GENERATION_INCOMPLETE', severity: 'fatal' },
        { code: 'CHANGE_PHASE_MISSING', severity: 'error', detail: 'phase:quality' },
      ],
    }]), { releaseApproval: 'absent' })).toBe(false);
    expect(integrationGateAcceptable(result(1, [
      changeHistory('warning', {
        approver: 'fixture-owner',
        recordedAt: '2026-09-25T00:00:00.000Z',
      }),
    ]), { releaseApproval: 'absent' })).toBe(false);
    expect(integrationStatusAcceptable).toBeTypeOf('function');
    expect(integrationStatusAcceptable?.({
      status: 'completed',
      exitCode: 0,
      stdout: JSON.stringify({ initialized: true, gate: { status: 'pass', ready: true } }),
      stderr: '',
      durationMs: 1,
    })).toBe(false);
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-CONTEXT-001
   * @verifies REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-INTEGRATION-PRE-RELEASE-CONTEXT-001 resolves only authoritative pre-release evidence', async () => {
    const { resolveIntegrationPreReleaseContext } =
      await import('../packages/analysis/src/parallel-runtime.js');
    const binding = { changeId: 'CHANGE-0003', generation: 5 };
    const fixture = async (): Promise<ParallelFixture> => {
      const created = await createParallelFixture();
      fixtures.push(created);
      return created;
    };
    const writeReleaseApproval = (root: string, changeId: string, generation: number): void => {
      writeFixtureFile(root, '.musubix/evidence/approvals/release.json', {
        schemaVersion: 1,
        stage: 'release',
        changeId,
        generation,
        approver: 'fixture-owner',
        approvedAt: '2026-09-25T00:00:00.000Z',
        artifactSha256: 'a'.repeat(64),
        artifacts: {},
      });
    };
    const addForeignCompletedChange = (root: string): void => {
      const path = `${root}/.musubix/evidence/changes.json`;
      const evidence = JSON.parse(readFileSync(path, 'utf8')) as {
        changes: Array<Record<string, unknown>>;
      };
      evidence.changes.push({
        changeId: 'CHANGE-0002',
        generation: 2,
        activeGeneration: null,
        requirementIds: ['REQ-M5-PARALLEL-010'],
        phases: { quality: { order: 10 } },
      });
      writeFixtureFile(root, '.musubix/evidence/changes.json', evidence);
      writeFixtureFile(root, '.musubix/changes/CHANGE-0002.md', [
        '---',
        'status: completed',
        '---',
        '# CHANGE-0002',
        '',
        'Requirements: REQ-M5-PARALLEL-010',
        '',
      ].join('\n'));
    };

    const absent = await fixture();
    await expect(resolveIntegrationPreReleaseContext(absent.root, binding))
      .resolves.toEqual({ releaseApproval: 'absent' });

    const foreign = await fixture();
    addForeignCompletedChange(foreign.root);
    writeReleaseApproval(foreign.root, 'CHANGE-0002', 2);
    await expect(resolveIntegrationPreReleaseContext(foreign.root, binding))
      .resolves.toEqual({ releaseApproval: 'foreign-completed' });

    const sameChange = await fixture();
    writeReleaseApproval(sameChange.root, 'CHANGE-0003', 5);
    await expect(resolveIntegrationPreReleaseContext(sameChange.root, binding))
      .resolves.toBeNull();

    for (const legacy of [false, true]) {
      const candidate = await fixture();
      const repositoryId = canonicalRepositoryIdentity(undefined, candidate.root);
      await appendJournalRecord(candidate.root, {
        stream: 'normal',
        changeId: 'CHANGE-0003',
        kind: 'workspace-candidate-snapshot',
        idempotencyKey: `fixture:candidate:${legacy ? 'legacy' : 'live'}`,
        payload: {
          ...(legacy ? {} : {
            recordVersion: 1,
            generation: 5,
            artifactManifestDigest: 'b'.repeat(64),
            createdAt: '2026-09-25T00:00:00.000Z',
          }),
          repositoryId,
          branch: git(candidate.root, ['branch', '--show-current']),
          commit: candidate.baseCommit,
        },
      });
      await expect(resolveIntegrationPreReleaseContext(candidate.root, binding))
        .resolves.toBeNull();
    }

    const multipleActive = await fixture();
    const multiplePath = `${multipleActive.root}/.musubix/evidence/changes.json`;
    const multipleEvidence = JSON.parse(readFileSync(multiplePath, 'utf8')) as {
      changes: Array<Record<string, unknown>>;
    };
    multipleEvidence.changes.push({
      changeId: 'CHANGE-0004',
      generation: 1,
      activeGeneration: 1,
      requirementIds: ['REQ-M5-PARALLEL-010'],
      phases: {},
    });
    writeFixtureFile(multipleActive.root, '.musubix/evidence/changes.json', multipleEvidence);
    writeFixtureFile(multipleActive.root, '.musubix/changes/CHANGE-0004.md', [
      '---',
      'status: active',
      '---',
      '# CHANGE-0004',
      '',
      'Requirements: REQ-M5-PARALLEL-010',
      '',
    ].join('\n'));
    await expect(resolveIntegrationPreReleaseContext(multipleActive.root, binding))
      .resolves.toBeNull();

    const malformedRelease = await fixture();
    writeFixtureFile(malformedRelease.root, '.musubix/evidence/approvals/release.json', {
      schemaVersion: 1,
      stage: 'release',
      changeId: 'not-a-change',
    });
    await expect(resolveIntegrationPreReleaseContext(malformedRelease.root, binding))
      .resolves.toBeNull();
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
  it('TEST-M5-PARALLEL-WORKSPACE-PARTIAL-COPY-001 canonicalizes workspace aliases and restores state after overlay copy failure', async () => {
    const fixture = await createParallelFixture();
    fixtures.push(fixture);
    const alias = `${fixture.root}-alias`;
    symlinkSync(fixture.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const aliasResult = spawnSync(process.execPath, [
      resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'),
      'graph',
      'gate',
      '--root',
      fixture.root,
      '--workspace',
      alias,
      '--json',
    ], { encoding: 'utf8' });
    rmSync(alias, { force: true });
    expect(aliasResult.status, aliasResult.stderr || aliasResult.stdout).toBe(0);
    const missingWorkspace = `${fixture.root}-missing`;
    const missingResult = spawnSync(process.execPath, [
      resolve(repositoryRoot(), 'dist/packages/cli/src/main.js'),
      'graph',
      'gate',
      '--root',
      fixture.root,
      '--workspace',
      missingWorkspace,
      '--json',
    ], { encoding: 'utf8' });
    rmSync(missingWorkspace, { recursive: true, force: true });
    expect(missingResult.status, missingResult.stderr || missingResult.stdout).toBe(0);
    if (process.platform === 'win32') return;

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
