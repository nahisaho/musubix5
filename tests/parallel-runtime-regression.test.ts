import {
  mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ParallelModule = typeof import('../packages/analysis/src/parallel.js');

function requiredFunction<T extends (...args: never[]) => unknown>(
  module: ParallelModule,
  name: string,
): T {
  const candidate = (module as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeTypeOf('function');
  return candidate as T;
}

describe('parallel runtime regressions', () => {
  /** @id TEST-M5-PARALLEL-CROSS-PLATFORM-WORKTREE-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012
   */
  it('TEST-M5-PARALLEL-CROSS-PLATFORM-WORKTREE-001 bounds managed paths and canonicalizes filesystem aliases', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const gitCommonDirectory = resolve(
      'C:/Users/runneradmin/AppData/Local/Temp/musubix5-parallel-runtime-abcdefgh/.git',
    );
    const planId = `parallel-plan:${'a'.repeat(64)}`;
    const assignment = parallel.parallelWorkspacePaths(
      gitCommonDirectory,
      'CHANGE-0003',
      planId,
      'assignment-with-long-name',
      1,
    );
    const verification = parallel.verificationWorkspaceIdentity({
      gitCommonDirectory,
      changeId: 'CHANGE-0003',
      planId,
      assignmentId: 'assignment-with-long-name',
      attempt: 1,
      reportedHead: 'b'.repeat(40),
      existing: 'missing',
    });
    expect(relative(gitCommonDirectory, assignment.assignmentWorktree).length)
      .toBeLessThanOrEqual(125);
    expect(relative(gitCommonDirectory, verification.path).length)
      .toBeLessThanOrEqual(145);
    expect(assignment.assignmentBranch.length).toBeLessThanOrEqual(100);

    const canonicalWorkspacePath = requiredFunction<
      (path: string) => Promise<string>
    >(parallel, 'canonicalWorkspacePath');
    const directory = mkdtempSync(resolve(tmpdir(), 'musubix5-path-alias-'));
    const actual = resolve(directory, 'actual');
    const alias = resolve(directory, 'alias');
    mkdirSync(actual);
    symlinkSync(actual, alias, 'dir');
    const file = resolve(actual, 'file');
    writeFileSync(file, 'not a directory\n');
    try {
      await expect(canonicalWorkspacePath(alias))
        .resolves.toBe(await canonicalWorkspacePath(actual));
      await expect(canonicalWorkspacePath(resolve(file, 'child')))
        .resolves.toBe(resolve(file, 'child'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /** @id TEST-M5-PARALLEL-RETRY-002
   * @verifies REQ-M5-PARALLEL-015
   */
  it('TEST-M5-PARALLEL-RETRY-002 uses the latest transition within the same attempt', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    expect(parallel.nextRetryAttempt([
      { assignmentId: 'core', attempt: 1, state: 'running' },
      { assignmentId: 'core', attempt: 1, state: 'failed', reason: 'focused test failed' },
    ], 'core')).toBe(2);
  });

  /** @id TEST-M5-PARALLEL-SPLIT-ROOT-001
   * @verifies REQ-M5-TDD-003 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-014
   */
  it('TEST-M5-PARALLEL-SPLIT-ROOT-001 builds assignment TDD commands with separate control and execution roots', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const buildAssignmentTddCommands = requiredFunction<
      (input: {
        controlRoot: string;
        worktree: string;
        changeId: string;
        requirementId: string;
        testId: string;
        commandName: string;
      }) => { red: string[]; implementation: string[]; green: string[] }
    >(parallel, 'buildAssignmentTddCommands');
    const commands = buildAssignmentTddCommands({
      controlRoot: '/control',
      worktree: '/worktree',
      changeId: 'CHANGE-0003',
      requirementId: 'REQ-A',
      testId: 'TEST-A',
      commandName: 'test',
    });
    for (const command of [commands.red, commands.green]) {
      expect(command).toContain('--root');
      expect(command).toContain('/control');
      expect(command).toContain('--workspace');
      expect(command).toContain('/worktree');
    }
    expect(commands.implementation).toEqual([
      'change-record', 'CHANGE-0003', 'implementation', '--requirement', 'REQ-A', '--root', '/control',
    ]);
  });

  /** @id TEST-M5-PARALLEL-DETACHED-VERIFY-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-007
   */
  it('TEST-M5-PARALLEL-DETACHED-VERIFY-001 derives a detached verification workspace distinct from the agent worktree', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const verificationWorkspacePath = requiredFunction<
      (gitCommonDirectory: string, changeId: string, planId: string, assignmentId: string, attempt: number) => string
    >(parallel, 'verificationWorkspacePath');
    const assignment = parallel.parallelWorkspacePaths(
      '/repo/.git',
      'CHANGE-0003',
      'parallel-plan:abc',
      'core',
      1,
    );
    const verification = verificationWorkspacePath(
      '/repo/.git',
      'CHANGE-0003',
      'parallel-plan:abc',
      'core',
      1,
    );
    expect(verification).not.toBe(assignment.assignmentWorktree);
    expect(verification).toContain('/verification/core/attempt-1');
  });

  /** @id TEST-M5-PARALLEL-FENCING-001
   * @verifies REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-011
   */
  it('TEST-M5-PARALLEL-FENCING-001 binds every transition to a deterministic idempotency key', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const parallelTransitionIdempotencyKey = requiredFunction<
      (input: {
        changeId: string;
        generation: number;
        planId: string;
        entity: string;
        attempt: number;
        transition: string;
      }) => string
    >(parallel, 'parallelTransitionIdempotencyKey');
    expect(parallelTransitionIdempotencyKey({
      changeId: 'CHANGE-0003',
      generation: 5,
      planId: 'parallel-plan:abc',
      entity: 'assignment:core',
      attempt: 2,
      transition: 'running',
    })).toBe('parallel:CHANGE-0003:5:parallel-plan:abc:assignment:core:2:running');
  });

  /** @id TEST-M5-PARALLEL-PROVENANCE-001
   * @verifies REQ-M5-TDD-003 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012
   */
  it('TEST-M5-PARALLEL-PROVENANCE-001 rejects unconsumed and provisional provenance outside integration verification', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const classifyParallelTddProvenance = requiredFunction<
      (input: { consumed: boolean; status: 'provisional' | 'verified'; purpose: string }) => string
    >(parallel, 'classifyParallelTddProvenance');
    expect(classifyParallelTddProvenance({
      consumed: false,
      status: 'provisional',
      purpose: 'integration-verification',
    })).toBe('PARALLEL_TDD_UNCONSUMED');
    expect(classifyParallelTddProvenance({
      consumed: true,
      status: 'provisional',
      purpose: 'readiness',
    })).toBe('PARALLEL_TDD_UNCONSUMED');
    expect(classifyParallelTddProvenance({
      consumed: true,
      status: 'provisional',
      purpose: 'integration-verification',
    })).toBe('pass');
    expect(classifyParallelTddProvenance({
      consumed: true,
      status: 'verified',
      purpose: 'readiness',
    })).toBe('pass');
  });

  /** @id TEST-M5-PARALLEL-STALE-CLEANUP-001
   * @verifies REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-012
   */
  it('TEST-M5-PARALLEL-STALE-CLEANUP-001 selects only stale plans for change-scoped cleanup', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const selectStaleParallelPlanIds = requiredFunction<
      (
        plans: Array<{ planId: string; changeId: string; generation: number }>,
        active: { changeId: string; generation: number } | null,
        changeId: string,
      ) => string[]
    >(parallel, 'selectStaleParallelPlanIds');
    expect(selectStaleParallelPlanIds([
      { planId: 'old', changeId: 'CHANGE-0003', generation: 4 },
      { planId: 'active', changeId: 'CHANGE-0003', generation: 5 },
      { planId: 'other', changeId: 'CHANGE-0002', generation: 9 },
    ], { changeId: 'CHANGE-0003', generation: 5 }, 'CHANGE-0003')).toEqual(['old']);
  });

  /** @id TEST-M5-PARALLEL-LIFECYCLE-MAPPING-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-LIFECYCLE-005 REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-013 REQ-M5-PARALLEL-017
   */
  it('TEST-M5-PARALLEL-LIFECYCLE-MAPPING-001 classifies lifecycle errors as domain failures rather than CLI syntax failures', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const parallelExitCode = requiredFunction<
      (code: string) => 0 | 1 | 2
    >(parallel, 'parallelExitCode');
    for (const code of [
      'PARALLEL_PLAN_STALE',
      'CHANGE_GENERATION_PHASE',
      'WORKFLOW_CHANGE_MISMATCH',
      'PARALLEL_LEASE_BUSY',
      'LEASE_FENCED',
    ]) {
      expect(parallelExitCode(code)).toBe(1);
    }
    expect(parallelExitCode('CLI_ERROR')).toBe(2);
  });

  /** @id TEST-M5-PARALLEL-WORKTREE-SAFETY-001
   * @verifies REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007
   */
  it('TEST-M5-PARALLEL-WORKTREE-SAFETY-001 rejects symlink and gitlink assignment result entries', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const validateParallelResultEntries = requiredFunction<
      (entries: Array<{ path: string; mode: string; type: string }>) => void
    >(parallel, 'validateParallelResultEntries');
    expect(() => validateParallelResultEntries([
      { path: 'packages/core/link', mode: '120000', type: 'blob' },
    ])).toThrow('PARALLEL_RESULT_UNVERIFIED');
    expect(() => validateParallelResultEntries([
      { path: 'vendor/submodule', mode: '160000', type: 'commit' },
    ])).toThrow('PARALLEL_RESULT_UNVERIFIED');
    expect(() => validateParallelResultEntries([
      { path: 'packages/core/a.ts', mode: '100644', type: 'blob' },
      { path: 'scripts/run.sh', mode: '100755', type: 'blob' },
    ])).not.toThrow();
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-SEMANTICS-002
   * @verifies REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-INTEGRATION-SEMANTICS-002 preserves provisional provenance for retryable environment failures', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const integrationFailureTransition = requiredFunction<
      (code: string) => { state: string; retainProvenance: boolean }
    >(parallel, 'integrationFailureTransition');
    expect(integrationFailureTransition('PARALLEL_VERIFICATION_ENVIRONMENT')).toEqual({
      state: 'provisional',
      retainProvenance: true,
    });
    expect(integrationFailureTransition('PARALLEL_INTEGRATION_VERIFICATION_FAILED')).toEqual({
      state: 'verification-failed',
      retainProvenance: true,
    });
  });

  /** @id TEST-M5-PARALLEL-RUNTIME-CONCURRENCY-001
   * @verifies REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-015
   */
  it.each([1, 3, 8])(
    'TEST-M5-PARALLEL-RUNTIME-CONCURRENCY-001 projects the configured %i-slot boundary without lost updates',
    async (concurrency) => {
      const parallel = await import('../packages/analysis/src/parallel.js');
      const assignments = Array.from({ length: 8 }, (_, index) => ({
        id: `batch-${index + 1}`,
        role: 'implementation',
        requirementIds: [`REQ-${index + 1}`],
        dependsOn: [],
        ownedPaths: [`packages/batch-${index + 1}/**`],
        focusedCommands: [{ name: 'test', args: [] }],
      })) as unknown as [
        {
          id: string;
          role: string;
          requirementIds: string[];
          dependsOn: string[];
          ownedPaths: string[];
          focusedCommands: Array<{ name: string; args: string[] }>;
        },
        ...Array<{
          id: string;
          role: string;
          requirementIds: string[];
          dependsOn: string[];
          ownedPaths: string[];
          focusedCommands: Array<{ name: string; args: string[] }>;
        }>,
      ];
      const plan = parallel.validateParallelPlan({
        schemaVersion: 1,
        concurrency,
        provisionCommandNames: [],
        integratorOwnedPaths: ['.musubix/**'],
        assignments,
      }, {
        changeId: 'CHANGE-0003',
        generation: 5,
        baseCommit: 'a'.repeat(40),
        requirementIds: assignments.flatMap((assignment) => assignment.requirementIds),
        requirementsApprovalSha256: 'b'.repeat(64),
        designApprovalSha256: 'c'.repeat(64),
        commandSetSha256: 'd'.repeat(64),
        configuredCommandNames: ['test'],
      });
      const transitions = assignments.slice(0, concurrency).map((assignment) => ({
        assignmentId: assignment.id,
        attempt: 1,
        state: 'running' as const,
      }));
      const status = parallel.projectParallelStatus(plan, transitions);
      expect(status.occupiedSlots).toBe(concurrency);
      expect(status.counts.running).toBe(concurrency);
      expect(status.counts.queued).toBe(8 - concurrency);
    },
  );
});
