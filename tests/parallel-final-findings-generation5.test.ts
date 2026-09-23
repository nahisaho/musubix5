import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { recordChangePhase } from '../packages/analysis/src/change.js';
import { approvalManifest } from '../packages/analysis/src/approval.js';
import type { ProcessResult, Runner } from '../packages/analysis/src/process.js';
import { runTddPhase } from '../packages/analysis/src/tdd.js';
import {
  commitAll,
  createParallelFixture,
  git,
  readParallelStore,
  repositoryRoot,
  type ParallelFixture,
  writeFixtureFile,
} from './fixtures/parallel-runtime-fixture.js';

const fixtures: ParallelFixture[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function write(root: string, path: string, content: string | object): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

function tddRunner(statuses: Array<'failed' | 'passed'>): Runner {
  let call = 0;
  return async (_command, args, options): Promise<ProcessResult> => {
    const testId = args.at(-2)!;
    const reportPath = args.at(-1)!;
    const status = statuses[call++]!;
    write(options.cwd, reportPath, {
      schemaVersion: 1,
      tests: [{ id: testId, status }],
    });
    return {
      status: 'completed',
      exitCode: status === 'failed' ? 1 : 0,
      stdout: '',
      stderr: '',
      durationMs: 1,
    };
  };
}

async function createSplitRootLifecycleFixture(options: { stubCli?: boolean } = {}): Promise<{
  fixture: ParallelFixture;
  commandLog: string;
}> {
  const fixture = await createParallelFixture({
    consumerDesignPath: '.musubix/features/consumer/design.md',
    plan: {
      schemaVersion: 1,
      concurrency: 1,
      provisionCommandNames: [],
      integratorOwnedPaths: ['.musubix/**'],
      assignments: [{
        id: 'core',
        role: 'implementation',
        requirementIds: ['REQ-M5-PARALLEL-004'],
        dependsOn: [],
        ownedPaths: ['packages/core/**', 'tests/**'],
        focusedCommands: [{ name: 'workspace-check', args: [] }],
      }],
    },
  });
  fixtures.push(fixture);
  writeFixtureFile(fixture.root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
    'Requirements: REQ-M5-PARALLEL-004',
    '',
  ].join('\n'));
  const changeEvidencePath = join(fixture.root, '.musubix/evidence/changes.json');
  const changeEvidence = JSON.parse(readFileSync(changeEvidencePath, 'utf8')) as {
    changes: Array<{ requirementIds: string[] }>;
  };
  changeEvidence.changes[0]!.requirementIds = ['REQ-M5-PARALLEL-004'];
  writeFixtureFile(fixture.root, '.musubix/evidence/changes.json', changeEvidence);
  const commandLog = join(fixture.root, 'split-root-command-log.jsonl');
  const requirementPath = '.musubix/features/consumer/requirements.md';
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'impact',
    ['REQ-M5-PARALLEL-004'],
  );
  const requirements = [
    '# Consumer requirements',
    '',
    '## REQ-M5-PARALLEL-004: Isolate assignment source',
    'Priority: must',
    'Type: functional',
    'Statement: The system shall isolate assignment source.',
    'Acceptance: The focused source check passes.',
    '',
  ].join('\n');
  writeFixtureFile(fixture.root, requirementPath, requirements);
  writeFixtureFile(
    fixture.root,
    '.musubix/constitution.md',
    readFileSync(join(repositoryRoot(), 'assets/constitution.md'), 'utf8'),
  );
  writeFixtureFile(fixture.root, '.gitignore', [
    '.musubix/journal/',
    '.musubix/evidence/parallel.json',
    '.musubix/evidence/order.json',
    '.musubix/evidence/tdd.json',
    '.musubix/cache/',
    '.test-results/',
    'split-root-command-log.jsonl',
    '',
  ].join('\n'));
  writeFixtureFile(fixture.root, '.musubix/config.json', {
    schemaVersion: 1,
    language: 'auto',
    qualityProfile: 'custom',
    commands: [{
      name: 'workspace-check',
      command: process.execPath,
      args: ['scripts/check-workspace.mjs', commandLog],
      tddArgs: ['{testId}', '{reportPath}'],
      tddReport: { format: 'musubix-json', path: '.test-results/{testId}.json' },
      required: true,
      timeoutMs: 10_000,
    }],
    requiredChecks: [],
    thresholds: { design: 0, implementation: 0, tests: 0 },
    architecture: { forbidCycles: true, rules: [] },
    codeGraph: { mode: 'compatible' },
    formal: { solver: 'none', minModeledFraction: 0, timeoutMs: 1_000 },
    mutation: { mode: 'compatible' },
    tdd: { redPreflightCommands: [] },
    approval: { mode: 'compatible', domains: [] },
    workflow: { mode: 'compatible', maxAgeSeconds: 3_600, maxFutureSkewSeconds: 60 },
    attestation: {
      mode: 'local',
      maxAgeSeconds: 3_600,
      maxFutureSkewSeconds: 60,
      trustedPublicKeys: [],
      githubOidc: { mode: 'off' },
    },
  });
  writeFixtureFile(fixture.root, 'packages/core/value.ts', [
    '/** @id CODE-M5-PARALLEL-SPLIT-ROOT-FIXTURE-001',
    ' * @implements REQ-M5-PARALLEL-004',
    ' */',
    'export const value = "red";',
    '',
  ].join('\n'));
  writeFixtureFile(fixture.root, 'scripts/check-workspace.mjs', [
    "import { appendFileSync, readFileSync } from 'node:fs';",
    "const [log] = process.argv.slice(2);",
    "const source = readFileSync('packages/core/value.ts', 'utf8');",
    "appendFileSync(log, `${JSON.stringify({ kind: 'required', cwd: process.cwd() })}\\n`);",
    "process.exit(source.includes('green') ? 0 : 1);",
    '',
  ].join('\n'));
  if (options.stubCli !== false) {
    writeFixtureFile(fixture.root, 'dist/packages/cli/src/main.js', [
      "import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';",
      "import { resolve } from 'node:path';",
      `const controlRoot = ${JSON.stringify(fixture.root)};`,
      `const log = ${JSON.stringify(commandLog)};`,
      "const args = process.argv.slice(2);",
      "const rootIndex = args.indexOf('--root');",
      "const workspaceIndex = args.indexOf('--workspace');",
      "const root = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : null;",
      "const workspace = workspaceIndex >= 0 ? resolve(args[workspaceIndex + 1]) : null;",
      "appendFileSync(log, `${JSON.stringify({ kind: 'check', args, cwd: process.cwd(), root, workspace })}\\n`);",
      "const evidence = root && existsSync(resolve(root, '.musubix/evidence/tdd.json'));",
      "const green = workspace && readFileSync(resolve(workspace, 'packages/core/value.ts'), 'utf8').includes('green');",
      "const samePath = (left, right) => left && right && realpathSync(left) === realpathSync(right);",
      "if (args[0] === 'status') console.log(JSON.stringify({ initialized: true, gate: { status: 'fail', ready: false } }));",
      "process.exit(samePath(root, controlRoot) && samePath(workspace, process.cwd()) && evidence && green ? 0 : 1);",
      '',
    ].join('\n'));
  }
  const requirementsApproval = await approvalManifest(fixture.root, 'requirements');
  writeFixtureFile(fixture.root, '.musubix/evidence/approvals/requirements.json', {
    ...requirementsApproval,
    approver: 'fixture-owner',
    approvedAt: '2026-09-23T00:00:00.000Z',
  });
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'requirements',
    ['REQ-M5-PARALLEL-004'],
  );
  const designPath = '.musubix/features/consumer/design.md';
  const design = [
    readFileSync(join(fixture.root, designPath), 'utf8').trimEnd(),
    '',
    '## DES-M5-PARALLEL-SPLIT-ROOT-FIXTURE-001: Split-root fixture design',
    'Responsibilities: Verify integrated source using control-root evidence.',
    'Interfaces: The integration verification command accepts a control root and workspace.',
    'Constraints: Assignment worktrees do not modify control-root evidence.',
    'Requirements: REQ-M5-PARALLEL-004',
    'ADRs: ADR-0099',
    'Depends-On: none',
    '',
  ].join('\n');
  writeFixtureFile(fixture.root, designPath, design);
  writeFixtureFile(fixture.root, '.musubix/decisions/ADR-0099.md', [
    '---',
    'status: accepted',
    '---',
    '# ADR-0099: Split-root integration fixture',
    '',
    '## Context / 背景',
    'Integration verification must evaluate assignment source with control-root evidence.',
    '',
    '## Decision / 決定',
    'Use the split-root verification contract in this fixture.',
    '',
    '## Consequences / 結果',
    'The real CLI gate can validate provisional assignment provenance.',
    '',
  ].join('\n'));
  const designApproval = await approvalManifest(fixture.root, 'design');
  writeFixtureFile(fixture.root, '.musubix/evidence/approvals/design.json', {
    ...designApproval,
    approver: 'fixture-owner',
    approvedAt: '2026-09-23T00:00:00.000Z',
  });
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'design',
    ['REQ-M5-PARALLEL-004'],
  );
  commitAll(fixture.root, 'approved split-root baseline');
  git(fixture.root, [
    'update-index',
    '--assume-unchanged',
    '.musubix/evidence/changes.json',
    '.musubix/features/consumer/trace.json',
  ]);
  return { fixture, commandLog };
}

async function completeAssignmentTdd(
  fixture: ParallelFixture,
  planId: string,
  instruction: Record<string, unknown>,
): Promise<string> {
  const worktree = String(instruction.worktree);
  const testId = 'TEST-M5-PARALLEL-FULL-SUCCESS-001';
  const testSource = [
    '/**',
    ` * @id ${testId}`,
    ' * @verifies REQ-M5-PARALLEL-004',
    ' */',
    'export const splitRootAssignmentTest = true;',
    '',
  ].join('\n');
  writeFixtureFile(worktree, 'tests/split-root-assignment.test.ts', testSource);
  writeFixtureFile(fixture.root, 'tests/split-root-assignment.test.ts', testSource);
  const parallel = {
    planId,
    assignmentId: 'core',
    attempt: 1,
    worktree,
    startCommit: String(instruction.startCommit),
  };
  const runner = tddRunner(['failed', 'passed']);
  await expect(runTddPhase(
    fixture.root,
    'red',
    testId,
    'REQ-M5-PARALLEL-004',
    'workspace-check',
    runner,
    worktree,
    parallel,
  )).resolves.toMatchObject({ valid: true, testStatus: 'failed' });
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'red',
    ['REQ-M5-PARALLEL-004'],
  );
  const greenSource = [
    '/** @id CODE-M5-PARALLEL-SPLIT-ROOT-FIXTURE-001',
    ' * @implements REQ-M5-PARALLEL-004',
    ' */',
    'export const value = "green";',
    '',
  ].join('\n');
  writeFixtureFile(worktree, 'packages/core/value.ts', greenSource);
  writeFixtureFile(fixture.root, 'packages/core/value.ts', greenSource);
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'implementation',
    ['REQ-M5-PARALLEL-004'],
  );
  await expect(runTddPhase(
    fixture.root,
    'green',
    testId,
    'REQ-M5-PARALLEL-004',
    'workspace-check',
    runner,
    worktree,
    parallel,
  )).resolves.toMatchObject({ valid: true, testStatus: 'passed' });
  await recordChangePhase(
    fixture.root,
    'CHANGE-0003',
    'green',
    ['REQ-M5-PARALLEL-004'],
  );
  rmSync(join(fixture.root, 'tests/split-root-assignment.test.ts'));
  writeFixtureFile(fixture.root, 'packages/core/value.ts', [
    '/** @id CODE-M5-PARALLEL-SPLIT-ROOT-FIXTURE-001',
    ' * @implements REQ-M5-PARALLEL-004',
    ' */',
    'export const value = "red";',
    '',
  ].join('\n'));
  expect(git(fixture.root, ['status', '--porcelain'])).toBe('');
  return commitAll(worktree, 'complete split-root assignment');
}

describe('CHANGE-0003 generation 5 final parallel findings', () => {
  /** @id TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001
   * @verifies REQ-M5-TDD-003 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-REAL-GATE-SUCCESS-001 verifies provisional assignment TDD through the real integration gate', async () => {
    const { fixture } = await createSplitRootLifecycleFixture({ stubCli: false });
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const formatVerificationFailure = (
      runtime as unknown as Record<string, unknown>
    ).formatIntegrationVerificationFailure;
    expect(formatVerificationFailure).toBeTypeOf('function');
    expect((formatVerificationFailure as (
      name: string,
      command: string,
      args: string[],
      result: { stdout: string; stderr: string },
    ) => string)(
      'gate-changed',
      process.execPath,
      ['cli.js', 'gate'],
      { stdout: 'gate detail', stderr: '' },
    )).toContain('gate-changed: gate detail');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const head = await completeAssignmentTdd(fixture, plan.planId, instruction);
    await runtime.recordParallelAssignmentResult(fixture.root, plan.planId, 'core', 1, head);
    await recordChangePhase(fixture.root, 'CHANGE-0003', 'quality', ['REQ-M5-PARALLEL-004']);
    await runtime.startParallelIntegration(fixture.root, plan.planId);

    const outcome = await runtime.verifyParallelIntegration(fixture.root, plan.planId);
    expect(outcome).toMatchObject({
      integration: { state: 'verified' },
      verification: {
        checks: expect.arrayContaining([
          expect.objectContaining({ name: 'gate-changed' }),
        ]),
      },
    });
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-CONTROL-EVIDENCE-001
   * @verifies REQ-M5-TDD-003 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-INTEGRATION-CONTROL-EVIDENCE-001 verifies integration source against control-root evidence', async () => {
    const { fixture, commandLog } = await createSplitRootLifecycleFixture();
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const head = await completeAssignmentTdd(fixture, plan.planId, instruction);
    await expect(runtime.recordParallelAssignmentResult(
      fixture.root,
      plan.planId,
      'core',
      1,
      head,
    )).resolves.toMatchObject({ attempt: { state: 'completed', head } });
    const integration = await runtime.startParallelIntegration(fixture.root, plan.planId);

    await expect(runtime.verifyParallelIntegration(fixture.root, plan.planId))
      .resolves.toMatchObject({ integration: { state: 'verified' } });
    const records = readFileSync(commandLog, 'utf8').trim().split(/\r?\n/)
      .map((line) => JSON.parse(line) as { kind: string; cwd: string; root?: string; workspace?: string });
    expect(records.filter((record) => record.kind === 'required'))
      .toEqual(expect.arrayContaining([{ kind: 'required', cwd: integration.worktree }]));
    expect(records.filter((record) => record.kind === 'check')).toHaveLength(4);
    expect(records.filter((record) => record.kind === 'check')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root: fixture.root,
          workspace: integration.worktree,
          cwd: integration.worktree,
        }),
      ]),
    );
  });

  /** @id TEST-M5-PARALLEL-FULL-SUCCESS-001
   * @verifies REQ-M5-TDD-003 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-FULL-SUCCESS-001 completes real assignment TDD, detached result verification, integration, handoff and cleanup', async () => {
    const { fixture } = await createSplitRootLifecycleFixture();
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);
    const instruction = await runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, 'core');
    const head = await completeAssignmentTdd(fixture, plan.planId, instruction);
    await runtime.recordParallelAssignmentResult(fixture.root, plan.planId, 'core', 1, head);
    await runtime.startParallelIntegration(fixture.root, plan.planId);
    await expect(runtime.verifyParallelIntegration(fixture.root, plan.planId))
      .resolves.toMatchObject({ integration: { state: 'verified' } });
    await expect(runtime.handoffParallelPlan(fixture.root, plan.planId))
      .resolves.toMatchObject({ integrationEvidenceHead: expect.any(String) });
    await expect(runtime.cleanupParallelRuntime(fixture.root, { planId: plan.planId }))
      .resolves.toMatchObject({
        removed: expect.arrayContaining([String(instruction.worktree)]),
      });
  });

  /** @id TEST-M5-PARALLEL-RUNTIME-EIGHT-WRITERS-001
   * @verifies REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-015
   */
  it('TEST-M5-PARALLEL-RUNTIME-EIGHT-WRITERS-001 preserves eight concurrent idempotent runtime transitions', async () => {
    const assignments = Array.from({ length: 8 }, (_, index) => ({
      id: `batch-${index + 1}`,
      role: 'implementation',
      requirementIds: ['REQ-M5-PARALLEL-004'],
      dependsOn: [],
      ownedPaths: [`packages/batch-${index + 1}/**`],
      focusedCommands: [{ name: 'smoke', args: [] }],
    }));
    const fixture = await createParallelFixture({
      plan: {
        schemaVersion: 1,
        concurrency: 8,
        provisionCommandNames: [],
        integratorOwnedPaths: ['.musubix/**'],
        assignments: assignments as [
          typeof assignments[number],
          ...Array<typeof assignments[number]>,
        ],
      },
    });
    fixtures.push(fixture);
    for (const assignment of assignments) {
      writeFixtureFile(fixture.root, `packages/${assignment.id}/value.txt`, 'base\n');
    }
    commitAll(fixture.root, 'add eight assignment roots');
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const plan = await runtime.createParallelPlan(fixture.root, fixture.planFile);
    await runtime.prepareParallelPlanRuntime(fixture.root, plan.planId);

    await Promise.all(assignments.flatMap((assignment) => [
      runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, assignment.id),
      runtime.issueParallelAssignmentInstruction(fixture.root, plan.planId, assignment.id),
    ]));
    await expect(runtime.parallelRuntimeStatus(fixture.root, { planId: plan.planId }))
      .resolves.toMatchObject({
        counts: { running: 8, queued: 0 },
        occupiedSlots: 8,
      });
    await Promise.all(assignments.map((assignment) =>
      runtime.failParallelAssignment(fixture.root, plan.planId, assignment.id, 1, 'injected crash')));
    await Promise.all(assignments.map((assignment) =>
      runtime.failParallelAssignment(fixture.root, plan.planId, assignment.id, 1, 'repeated invocation')));

    const store = readParallelStore(fixture.root);
    const attempts = store.attempts as Array<{
      assignmentId: string;
      attempt: number;
      state: string;
      reason?: string;
    }>;
    expect(attempts.filter((attempt) => attempt.state === 'running')).toHaveLength(8);
    expect(attempts.filter((attempt) => attempt.state === 'failed')).toHaveLength(8);
    expect(new Set(
      attempts.filter((attempt) => attempt.state === 'failed')
        .map((attempt) => `${attempt.assignmentId}:${attempt.attempt}`),
    ).size).toBe(8);
    expect(attempts.filter((attempt) => attempt.state === 'failed')
      .every((attempt) => attempt.reason === 'injected crash')).toBe(true);
  });
});
