import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultConfig } from '../packages/analysis/src/config.js';
import type { ProcessResult, Runner } from '../packages/analysis/src/process.js';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: unknown): void {
  const destination = join(root, path);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function requiredFunction<T extends (...args: never[]) => unknown>(
  module: object,
  name: string,
): T {
  const candidate = (module as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeTypeOf('function');
  return candidate as T;
}

function tddRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  write(root, '.musubix/config.json', {
    ...defaultConfig,
    approval: { mode: 'compatible', domains: [] },
    commands: [{
      name: 'target',
      command: 'target',
      args: [],
      tddArgs: ['{testId}', '{reportPath}'],
      tddReport: { format: 'musubix-json', path: '.test-results/{testId}.json' },
      required: false,
      timeoutMs: 10_000,
    }],
  });
  write(root, '.musubix/features/sample/requirements.md', [
    '## REQ-M5-TDD-003: Select the latest complete cycle',
    'Priority: must',
    'Type: functional',
    'Statement: The system shall select current TDD evidence.',
    'Acceptance: A scoped Red-Green cycle is recorded.',
    '',
  ].join('\n'));
  return root;
}

function writeTargetTest(root: string): void {
  write(root, 'tests/target.test.ts', [
    '/**',
    ' * @id TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001',
    ' * @verifies REQ-M5-TDD-003',
    ' */',
    'export const target = true;',
    '',
  ].join('\n'));
}

function reportRunner(statuses: Array<'failed' | 'passed'>): Runner {
  let call = 0;
  return async (_command, args, options): Promise<ProcessResult> => {
    const testId = args[0]!;
    const reportPath = args[1]!;
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('continued CHANGE-0003 generation 5 review regressions', () => {
  /** @id TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001
   * @verifies REQ-M5-TDD-003 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-007
   */
  it('TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001 fingerprints Green source from the execution worktree', async () => {
    const controlRoot = tddRoot('musubix5-tdd-control-');
    const worktree = tddRoot('musubix5-tdd-worktree-');
    writeTargetTest(controlRoot);
    writeTargetTest(worktree);
    write(controlRoot, 'src/value.ts', 'export const value = 1;\n');
    write(worktree, 'src/value.ts', 'export const value = 1;\n');
    const { runTddPhase } = await import('../packages/analysis/src/tdd.js');
    const runner = reportRunner(['failed', 'passed']);

    const red = await runTddPhase(
      controlRoot,
      'red',
      'TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001',
      'REQ-M5-TDD-003',
      'target',
      runner,
      worktree,
    );
    expect(red.valid).toBe(true);

    write(worktree, 'src/value.ts', 'export const value = 2;\n');
    const green = await runTddPhase(
      controlRoot,
      'green',
      'TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001',
      'REQ-M5-TDD-003',
      'target',
      runner,
      worktree,
    );

    expect(green.valid).toBe(true);
    expect(green.sourceFingerprint).not.toBe(red.sourceFingerprint);
  });

  /** @id TEST-M5-PARALLEL-CLI-CONCURRENCY-002
   * @verifies REQ-M5-COMPAT-003 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-CLI-CONCURRENCY-002 reports CLI concurrency 9 as CLI_ERROR with exit 2', () => {
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'parallel',
      'plan',
      'create',
      'missing-plan.json',
      '--concurrency',
      '9',
      '--json',
    ], { cwd: repositoryRoot, encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: 'CLI_ERROR',
        message: 'PARALLEL_CONCURRENCY_INVALID: --concurrency must be an integer from 1 through 8.',
      },
    });
    expect(result.stderr).toBe('');
  });

  /** @id TEST-M5-PARALLEL-TDD-PROVENANCE-BINDING-001
   * @verifies REQ-M5-TDD-003 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-TDD-PROVENANCE-BINDING-001 binds readiness to the consuming plan assignment and attempt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-tdd-provenance-'));
    temporaryDirectories.push(root);
    const planId = `parallel-plan:${'a'.repeat(64)}`;
    write(root, '.musubix/evidence/parallel.json', {
      schemaVersion: 1,
      nextOrder: 1,
      plans: [{
        planId,
        binding: { changeId: 'CHANGE-0003', generation: 5 },
      }],
      attempts: [{
        planId,
        assignmentId: 'core',
        attempt: 1,
        state: 'completed',
        order: 1,
        startCommit: 'b'.repeat(40),
        head: 'c'.repeat(40),
        tdd: [{
          requirementId: 'REQ-A',
          cycleId: 'cycle-stolen',
          testId: 'TEST-A',
          batchTerminalOrder: 3,
        }],
      }],
      integrations: [{
        planId,
        attempt: 1,
        order: 2,
        state: 'verified',
        consumedAssignmentIds: ['core'],
        provenance: {
          planId,
          attempt: 1,
          integrationCommit: 'd'.repeat(40),
          status: 'verified',
          assignments: [{
            assignmentId: 'core',
            attempt: 1,
            startCommit: 'b'.repeat(40),
            head: 'c'.repeat(40),
            commits: ['c'.repeat(40)],
          }],
        },
      }],
    });
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');

    await expect(runtime.classifyStoredParallelTddCycle(root, {
      changeId: 'CHANGE-0003',
      generation: 5,
      planId,
      assignmentId: 'cli',
      attempt: 2,
      requirementId: 'REQ-A',
      cycleId: 'cycle-unconsumed',
      purpose: 'readiness',
    } as Parameters<typeof runtime.classifyStoredParallelTddCycle>[1]))
      .resolves.toBe('PARALLEL_TDD_UNCONSUMED');
    await expect(runtime.classifyStoredParallelTddCycle(root, {
      changeId: 'CHANGE-0003',
      generation: 5,
      planId,
      assignmentId: 'cli',
      attempt: 2,
      requirementId: 'REQ-A',
      cycleId: 'cycle-stolen',
      purpose: 'readiness',
    } as Parameters<typeof runtime.classifyStoredParallelTddCycle>[1]))
      .resolves.toBe('PARALLEL_TDD_UNCONSUMED');
  });

  /** @id TEST-M5-PARALLEL-VERIFY-WORKSPACE-IDENTITY-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-012
   */
  it('TEST-M5-PARALLEL-VERIFY-WORKSPACE-IDENTITY-001 includes reported head and permits stale cleanup recovery', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const verificationWorkspaceIdentity = requiredFunction<
      (input: {
        gitCommonDirectory: string;
        changeId: string;
        planId: string;
        assignmentId: string;
        attempt: number;
        reportedHead: string;
        existing: 'missing' | 'clean-stale' | 'dirty';
      }) => { path: string; recovery: 'create' | 'remove-and-create' | 'reject' }
    >(parallel, 'verificationWorkspaceIdentity');
    const base = {
      gitCommonDirectory: '/repo/.git',
      changeId: 'CHANGE-0003',
      planId: `parallel-plan:${'a'.repeat(64)}`,
      assignmentId: 'core',
      attempt: 1,
    };
    const first = verificationWorkspaceIdentity({
      ...base,
      reportedHead: 'b'.repeat(40),
      existing: 'clean-stale',
    });
    const second = verificationWorkspaceIdentity({
      ...base,
      reportedHead: 'c'.repeat(40),
      existing: 'missing',
    });
    expect(first.path).not.toBe(second.path);
    expect(first.recovery).toBe('remove-and-create');
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-REOPEN-003
   * @verifies REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010
   */
  it('TEST-M5-PARALLEL-INTEGRATION-REOPEN-003 rejects reopening a provisionally successful integration', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const assertIntegrationReopenable = requiredFunction<
      (state: string, reasonCode?: string) => void
    >(parallel, 'assertIntegrationReopenable');
    expect(() => assertIntegrationReopenable('provisional')).toThrow('PARALLEL_ASSIGNMENT_STATE');
    expect(() => assertIntegrationReopenable('conflict')).not.toThrow();
    expect(() => assertIntegrationReopenable('verification-failed')).not.toThrow();
  });

  /** @id TEST-M5-PARALLEL-DUPLICATE-COMMIT-001
   * @verifies REQ-M5-PARALLEL-009
   */
  it('TEST-M5-PARALLEL-DUPLICATE-COMMIT-001 rejects a commit consumed by two assignment ranges', async () => {
    const { buildIntegrationProvenance } = await import('../packages/analysis/src/parallel.js');
    const duplicate = 'd'.repeat(40);
    expect(() => buildIntegrationProvenance({
      planId: `parallel-plan:${'a'.repeat(64)}`,
      attempt: 1,
      integrationCommit: 'f'.repeat(40),
      assignments: [
        {
          assignmentId: 'core',
          attempt: 1,
          startCommit: 'b'.repeat(40),
          head: 'c'.repeat(40),
          commits: [duplicate],
        },
        {
          assignmentId: 'cli',
          attempt: 1,
          startCommit: 'c'.repeat(40),
          head: 'e'.repeat(40),
          commits: [duplicate],
        },
      ],
    })).toThrow('PARALLEL_INTEGRATION_CONFLICT');
  });

  /** @id TEST-M5-PARALLEL-JOURNAL-CRASH-001
   * @verifies REQ-M5-LIFECYCLE-002 REQ-M5-PARALLEL-011
   */
  it('TEST-M5-PARALLEL-JOURNAL-CRASH-001 replays an idempotent journal transition missing from the store', async () => {
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const reconcileParallelTransition = requiredFunction<
      (
        store: { attempts: unknown[] },
        record: { idempotencyKey: string; payload: unknown },
      ) => { attempts: unknown[] }
    >(runtime, 'reconcileParallelTransition');
    const transition = {
      idempotencyKey: 'parallel:CHANGE-0003:5:plan:assignment:core:1:completed',
      payload: { assignmentId: 'core', attempt: 1, state: 'completed' },
    };
    const recovered = reconcileParallelTransition({ attempts: [] }, transition);
    const retried = reconcileParallelTransition(recovered, transition);
    expect(recovered.attempts).toEqual([transition.payload]);
    expect(retried.attempts).toEqual([transition.payload]);
  });

  /** @id TEST-M5-PARALLEL-DETACHED-CLEANUP-ERROR-001
   * @verifies REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-012
   */
  it('TEST-M5-PARALLEL-DETACHED-CLEANUP-ERROR-001 preserves validation failure when detached cleanup also fails', async () => {
    const runtime = await import('../packages/analysis/src/parallel-runtime.js');
    const detachedVerificationFailure = requiredFunction<
      (validation: Error, cleanup: Error) => Error
    >(runtime, 'detachedVerificationFailure');
    const failure = detachedVerificationFailure(
      new Error('PARALLEL_RESULT_UNVERIFIED: focused test failed.'),
      new Error('PARALLEL_WORKTREE_CONFLICT: cleanup failed.'),
    );
    expect(failure.message).toContain('PARALLEL_RESULT_UNVERIFIED: focused test failed.');
    expect(failure.message).toContain('cleanup failed');
  });

  /** @id TEST-M5-TDD-NORMAL-ROOT-TRACE-001
   * @verifies REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-NORMAL-ROOT-TRACE-001 still persists trace artifacts for normal-root TDD', async () => {
    const root = tddRoot('musubix5-tdd-normal-root-');
    writeTargetTest(root);
    write(root, 'src/value.ts', 'export const value = 1;\n');
    const { runTddPhase } = await import('../packages/analysis/src/tdd.js');

    await runTddPhase(
      root,
      'red',
      'TEST-M5-TDD-SPLIT-ROOT-FINGERPRINT-001',
      'REQ-M5-TDD-003',
      'target',
      reportRunner(['failed']),
    );

    expect(existsSync(join(root, '.musubix/cache/trace.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, '.musubix/cache/trace.json'), 'utf8')))
      .toMatchObject({ schemaVersion: 2, kind: 'repository-trace-index' });
  });
});
