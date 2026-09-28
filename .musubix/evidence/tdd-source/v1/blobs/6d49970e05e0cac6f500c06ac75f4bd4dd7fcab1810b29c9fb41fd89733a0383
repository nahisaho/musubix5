import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('parallel development', () => {
  /** @id TEST-M5-PARALLEL-PLAN-001
   * @verifies REQ-M5-PARALLEL-001 REQ-M5-PARALLEL-002 REQ-M5-PARALLEL-003 REQ-M5-PARALLEL-011 REQ-M5-PARALLEL-013
   */
  it('TEST-M5-PARALLEL-PLAN-001 validates and projects a deterministic bounded plan', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const plan = parallel.validateParallelPlan({
      schemaVersion: 1,
      provisionCommandNames: ['npm-ci'],
      integratorOwnedPaths: ['.musubix/**'],
      assignments: [
        {
          id: 'core',
          role: 'implementation',
          requirementIds: ['REQ-A'],
          dependsOn: [],
          ownedPaths: ['packages/core/**'],
          focusedCommands: [{ name: 'test', args: ['run', 'core'] }],
        },
        {
          id: 'cli',
          role: 'implementation',
          requirementIds: ['REQ-B'],
          dependsOn: ['core'],
          ownedPaths: ['packages/cli/**'],
          focusedCommands: [{ name: 'test', args: ['run', 'cli'] }],
        },
      ],
    }, {
      changeId: 'CHANGE-0003',
      generation: 5,
      baseCommit: 'a'.repeat(40),
      requirementIds: ['REQ-A', 'REQ-B'],
      requirementsApprovalSha256: 'b'.repeat(64),
      designApprovalSha256: 'c'.repeat(64),
      commandSetSha256: 'd'.repeat(64),
      configuredCommandNames: ['npm-ci', 'test'],
    }, 2);

    expect(plan.concurrency).toBe(2);
    expect(plan.planId).toMatch(/^parallel-plan:[a-f0-9]{64}$/);
    expect(parallel.stableTopologicalOrder(plan.assignments).map((item) => item.id)).toEqual(['core', 'cli']);
    expect(parallel.projectParallelStatus(plan, [])).toMatchObject({
      counts: { waiting: 1, queued: 1, running: 0, completed: 0, failed: 0, blocked: 0 },
      occupiedSlots: 0,
    });
    expect(() => parallel.validateParallelPlan({
      ...plan.authored,
      assignments: [
        { ...plan.assignments[0], ownedPaths: ['packages/**'] },
        { ...plan.assignments[1], dependsOn: [], ownedPaths: ['packages/cli/**'] },
      ],
    }, plan.binding)).toThrow('PARALLEL_PLAN_OWNERSHIP_OVERLAP');
  });

  /** @id TEST-M5-PARALLEL-OWNERSHIP-GLOB-OVERLAP-001
   * @verifies REQ-M5-PARALLEL-002
   */
  it('TEST-M5-PARALLEL-OWNERSHIP-GLOB-OVERLAP-001 rejects intersecting segment globs', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    expect(() => parallel.validateParallelPlan({
      schemaVersion: 1,
      provisionCommandNames: ['npm-ci'],
      integratorOwnedPaths: ['.musubix/**'],
      assignments: [
        {
          id: 'broad',
          role: 'implementation',
          requirementIds: ['REQ-A'],
          dependsOn: [],
          ownedPaths: ['packages/analysis/src/parallel*.ts'],
          focusedCommands: [{ name: 'test', args: ['run', 'broad'] }],
        },
        {
          id: 'specific',
          role: 'implementation',
          requirementIds: ['REQ-B'],
          dependsOn: [],
          ownedPaths: ['packages/analysis/src/parallel-runtime.ts'],
          focusedCommands: [{ name: 'test', args: ['run', 'specific'] }],
        },
      ],
    }, {
      changeId: 'CHANGE-0003',
      generation: 5,
      baseCommit: 'a'.repeat(40),
      requirementIds: ['REQ-A', 'REQ-B'],
      requirementsApprovalSha256: 'b'.repeat(64),
      designApprovalSha256: 'c'.repeat(64),
      commandSetSha256: 'd'.repeat(64),
      configuredCommandNames: ['npm-ci', 'test'],
    })).toThrow('PARALLEL_PLAN_OWNERSHIP_OVERLAP');
  });

  /** @id TEST-M5-PARALLEL-OWNERSHIP-DISJOINT-001
   * @verifies REQ-M5-PARALLEL-002
   */
  it('TEST-M5-PARALLEL-OWNERSHIP-DISJOINT-001 accepts disjoint sibling-prefix globs', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    expect(() => parallel.validateParallelPlan({
      schemaVersion: 1,
      provisionCommandNames: ['npm-ci'],
      integratorOwnedPaths: ['.musubix/**'],
      assignments: [
        {
          id: 'analysis',
          role: 'implementation',
          requirementIds: ['REQ-A'],
          dependsOn: [],
          ownedPaths: ['packages/analysis/**'],
          focusedCommands: [{ name: 'test', args: ['run', 'analysis'] }],
        },
        {
          id: 'analysis-x',
          role: 'implementation',
          requirementIds: ['REQ-B'],
          dependsOn: [],
          ownedPaths: ['packages/analysis-x/**'],
          focusedCommands: [{ name: 'test', args: ['run', 'analysis-x'] }],
        },
      ],
    }, {
      changeId: 'CHANGE-0003',
      generation: 5,
      baseCommit: 'a'.repeat(40),
      requirementIds: ['REQ-A', 'REQ-B'],
      requirementsApprovalSha256: 'b'.repeat(64),
      designApprovalSha256: 'c'.repeat(64),
      commandSetSha256: 'd'.repeat(64),
      configuredCommandNames: ['npm-ci', 'test'],
    })).not.toThrow();
  });

  /** @id TEST-M5-PARALLEL-OWNERSHIP-SUFFIX-DISJOINT-001
   * @verifies REQ-M5-PARALLEL-002
   */
  it('TEST-M5-PARALLEL-OWNERSHIP-SUFFIX-DISJOINT-001 accepts disjoint suffix globs', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    expect(() => parallel.validateParallelPlan({
      schemaVersion: 1,
      provisionCommandNames: ['npm-ci'],
      integratorOwnedPaths: ['.musubix/**'],
      assignments: [
        {
          id: 'typescript',
          role: 'implementation',
          requirementIds: ['REQ-A'],
          dependsOn: [],
          ownedPaths: ['src/*.ts'],
          focusedCommands: [{ name: 'test', args: ['run', 'typescript'] }],
        },
        {
          id: 'markdown',
          role: 'documentation',
          requirementIds: ['REQ-B'],
          dependsOn: [],
          ownedPaths: ['src/*.md'],
          focusedCommands: [{ name: 'test', args: ['run', 'markdown'] }],
        },
      ],
    }, {
      changeId: 'CHANGE-0003',
      generation: 5,
      baseCommit: 'a'.repeat(40),
      requirementIds: ['REQ-A', 'REQ-B'],
      requirementsApprovalSha256: 'b'.repeat(64),
      designApprovalSha256: 'c'.repeat(64),
      commandSetSha256: 'd'.repeat(64),
      configuredCommandNames: ['npm-ci', 'test'],
    })).not.toThrow();
  });

  /** @id TEST-M5-PARALLEL-ASSIGNMENT-001
   * @verifies REQ-M5-PARALLEL-004 REQ-M5-PARALLEL-005 REQ-M5-PARALLEL-006 REQ-M5-PARALLEL-007 REQ-M5-PARALLEL-008 REQ-M5-PARALLEL-015
   */
  it('TEST-M5-PARALLEL-ASSIGNMENT-001 isolates attempts and validates owned committed ranges', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const paths = parallel.parallelWorkspacePaths('/repo/.git', 'CHANGE-0003', 'parallel-plan:abc', 'core', 2);
    expect(paths.assignmentBranch).toBe('musubix5/CHANGE-0003/parallel-plan-abc/core/attempt-2');
    expect(paths.assignmentWorktree).toContain('/musubix5/workspaces/CHANGE-0003/parallel/parallel-plan-abc/assignments/core/attempt-2');
    expect(parallel.validateOwnedPaths(
      ['packages/core/a.ts', 'packages/core/b.ts'],
      ['packages/core/**'],
      ['.musubix/**'],
    )).toEqual([]);
    expect(() => parallel.validateOwnedPaths(
      ['packages/cli/main.ts'],
      ['packages/core/**'],
      ['.musubix/**'],
    )).toThrow('PARALLEL_RESULT_OWNERSHIP');
    expect(() => parallel.validateOwnedPaths(
      ['.musubix/evidence/tdd.json'],
      ['**'],
      ['.musubix/**'],
    )).toThrow('PARALLEL_RESULT_OWNERSHIP');
    expect(parallel.nextRetryAttempt([
      { assignmentId: 'core', attempt: 1, state: 'failed', reason: 'test failed' },
    ], 'core')).toBe(2);
  });

  /** @id TEST-M5-PARALLEL-INTEGRATION-001
   * @verifies REQ-M5-PARALLEL-009 REQ-M5-PARALLEL-010 REQ-M5-PARALLEL-012 REQ-M5-PARALLEL-016
   */
  it('TEST-M5-PARALLEL-INTEGRATION-001 binds deterministic provenance, handoff and cleanup', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    const provenance = parallel.buildIntegrationProvenance({
      planId: 'parallel-plan:abc',
      attempt: 1,
      integrationCommit: 'f'.repeat(40),
      assignments: [
        {
          assignmentId: 'core',
          attempt: 1,
          startCommit: 'a'.repeat(40),
          head: 'b'.repeat(40),
          commits: ['b'.repeat(40)],
        },
      ],
    });
    expect(provenance.status).toBe('provisional');
    expect(parallel.verifyIntegrationProvenance(provenance, 'f'.repeat(40)).status).toBe('verified');
    expect(parallel.classifyCandidateHandoff('a'.repeat(40), 'a'.repeat(40), true)).toBe('ready');
    expect(parallel.cleanupEligibility({
      state: 'completed',
      clean: true,
      consumedCount: 1,
      provenanceStatus: 'verified',
    })).toBe('remove');
    expect(parallel.cleanupEligibility({
      state: 'failed',
      clean: true,
      consumedCount: 0,
      provenanceStatus: 'verified',
    })).toBe('retain-failed');
  });

  /** @id TEST-M5-PARALLEL-SKILLS-001
   * @verifies REQ-M5-COMPAT-013 REQ-M5-TDD-003 REQ-M5-WORKTREE-001 REQ-M5-PARALLEL-014
   */
  it('TEST-M5-PARALLEL-SKILLS-001 registers additive CLI and three non-replacing Skills', async () => {
    const parallel = await import('../packages/analysis/src/parallel.js');
    expect(parallel.PARALLEL_DIAGNOSTICS).toContain('PARALLEL_PLAN_STALE');
    for (const skill of [
      'sdd-parallel-dispatch',
      'sdd-agent-assignment',
      'sdd-integration-verification',
    ]) {
      const path = resolve(`.github/skills/${skill}/SKILL.md`);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('workflow-record');
      expect(source).toContain('--change-id');
    }
  });
});
