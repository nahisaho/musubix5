import {
  mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  pendingTddRepair,
  recordedAtIntegrityDiagnostics,
  validateChangeCompleteness,
  validateTddRepairLedger,
  type TddEvidence,
  type TddRepairJournalPayload,
} from '../packages/analysis/src/index.js';
import {
  authoritativeParallelTddAttemptKeys,
  classifyParallelTddIntegrationContext,
  supersededParallelTddCycles,
  selectParallelIntegrationEvidenceRoot,
} from '../packages/analysis/src/parallel-tdd-evidence.js';
import type { TddCycle } from '../packages/analysis/src/index.js';

function write(root: string, path: string, value: string | object): void {
  const destination = join(root, path);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@localhost',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@localhost',
    },
  }).trim();
}

function parallelCycle(input: {
  cycleId: string;
  testId: string;
  attempt: number;
  redOrder: number;
  greenOrder?: number;
}): TddCycle {
  const phase = (name: 'red' | 'green', order: number) => ({
    phase: name,
    valid: true,
    scoped: true,
    resultObserved: true,
    testStatus: name === 'red' ? 'failed' as const : 'passed' as const,
    reportSha256: name.repeat(64).slice(0, 64),
    commandSha256: 'c'.repeat(64),
    outputSha256: name.repeat(64).slice(0, 64),
    exitCode: name === 'red' ? 1 : 0,
    durationMs: 1,
    testFingerprint: 'f'.repeat(64),
    sourceFingerprint: `${order}`.repeat(64).slice(0, 64),
    executionId: `${input.cycleId}-${name}`,
    order,
    recordedAt: `2026-09-26T00:00:${String(order).padStart(2, '0')}.000Z`,
    diagnostics: [],
  });
  return {
    cycleId: input.cycleId,
    changeId: 'CHANGE-0015',
    generation: 3,
    requirementId: 'REQ-M5-WAVE1-TDD-001',
    testId: input.testId,
    testPath: 'tests/tdd-repair-safety.test.ts',
    commandName: 'test',
    parallel: {
      planId: `parallel-plan:${'a'.repeat(64)}`,
      assignmentId: 'issue-35-tdd-repair',
      attempt: input.attempt,
      worktree: `/assignment-${input.attempt}`,
      startCommit: `${input.attempt}`.repeat(40),
    },
    red: phase('red', input.redOrder),
    ...(input.greenOrder === undefined ? {} : { green: phase('green', input.greenOrder) }),
  };
}

describe('TDD repair safety', () => {
  const attempt = (
    attemptNumber: number,
    state: string,
    startCommit: string,
    head: string,
  ) => ({
    planId: `parallel-plan:${'a'.repeat(64)}`,
    assignmentId: 'issue-35-tdd-repair',
    attempt: attemptNumber,
    state,
    startCommit,
    head,
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-DESIGN-001
   * @verifies REQ-M5-COMPAT-013 REQ-M5-WAVE1-TDD-001 REQ-M5-WAVE1-TDD-002
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-DESIGN-001 links retry lineage to approved design nodes', () => {
    const source = readFileSync(
      resolve('packages/analysis/src/parallel-tdd-evidence.ts'),
      'utf8',
    );
    const foundationDesign = readFileSync(
      resolve('.musubix/features/musubix5-clean-foundation/design.md'),
      'utf8',
    );
    const parallelDesign = readFileSync(
      resolve('.musubix/features/parallel-agent-development/design.md'),
      'utf8',
    );

    expect(source).toContain('@design DES-M5-PARALLEL-006 DES-M5-011');
    expect(source).not.toContain('DES-M5-WAVE1-TDD-001');
    expect(foundationDesign).toContain('## DES-M5-011: TDD cycle ledger');
    expect(parallelDesign).toContain('## DES-M5-PARALLEL-006: Provenance-gated TDD selector');
  });

  it('uses evidence order instead of parallel wall-clock order while rejecting malformed timestamps', () => {
    expect(recordedAtIntegrityDiagnostics('CHANGE-0015', [
      { label: 'red', order: 1, recordedAt: '2026-09-26T00:00:02.000Z' },
      { label: 'implementation', order: 2, recordedAt: '2026-09-26T00:00:01.000Z' },
    ])).toEqual([]);
    expect(recordedAtIntegrityDiagnostics('CHANGE-0015', [
      { label: 'green', order: 3, recordedAt: 'not-a-timestamp' },
    ])).toEqual([
      expect.objectContaining({
        code: 'CHANGE_RECORDEDAT_INVALID',
        severity: 'error',
      }),
    ]);
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-INHERITED-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-INHERITED-001 accepts completed cycles inherited by the consumed retry', async () => {
    const inheritedHead = '1'.repeat(40);
    const consumedStart = '2'.repeat(40);
    const consumedHead = '3'.repeat(40);
    const keys = await authoritativeParallelTddAttemptKeys(
      [
        attempt(1, 'completed', '0'.repeat(40), inheritedHead),
        attempt(2, 'completed', consumedStart, consumedHead),
      ],
      {
        assignmentId: 'issue-35-tdd-repair',
        attempt: 2,
        startCommit: consumedStart,
        head: consumedHead,
      },
      async (ancestor, descendant) =>
        ancestor === inheritedHead && descendant === consumedStart,
    );
    expect(keys).toEqual(new Set([
      'issue-35-tdd-repair:1',
      'issue-35-tdd-repair:2',
    ]));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-001
   * @verifies REQ-M5-WAVE1-TDD-001
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-001 excludes failed and divergent attempts', async () => {
    const inheritedHead = '1'.repeat(40);
    const failedHead = '4'.repeat(40);
    const divergentHead = '5'.repeat(40);
    const consumedStart = '2'.repeat(40);
    const consumedHead = '3'.repeat(40);
    const keys = await authoritativeParallelTddAttemptKeys(
      [
        attempt(1, 'completed', '0'.repeat(40), inheritedHead),
        attempt(2, 'failed', inheritedHead, failedHead),
        attempt(3, 'completed', failedHead, divergentHead),
        attempt(4, 'completed', consumedStart, consumedHead),
      ],
      {
        assignmentId: 'issue-35-tdd-repair',
        attempt: 4,
        startCommit: consumedStart,
        head: consumedHead,
      },
      async (ancestor, descendant) =>
        ancestor === inheritedHead && descendant === consumedStart,
    );
    expect(keys).toEqual(new Set([
      'issue-35-tdd-repair:1',
      'issue-35-tdd-repair:4',
    ]));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-A6-002
   * @verifies REQ-M5-WAVE1-TDD-001
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-A6-002 fails closed for conflicting completed retry identities', async () => {
    const inheritedHead = '1'.repeat(40);
    const divergentHead = '4'.repeat(40);
    const consumedStart = '2'.repeat(40);
    const consumedHead = '3'.repeat(40);
    const keys = await authoritativeParallelTddAttemptKeys(
      [
        attempt(1, 'completed', '0'.repeat(40), inheritedHead),
        attempt(1, 'completed', '0'.repeat(40), divergentHead),
        attempt(2, 'completed', consumedStart, consumedHead),
      ],
      {
        assignmentId: 'issue-35-tdd-repair',
        attempt: 2,
        startCommit: consumedStart,
        head: consumedHead,
      },
      async (ancestor, descendant) =>
        ancestor === inheritedHead && descendant === consumedStart,
    );
    expect(keys).toEqual(new Set(['issue-35-tdd-repair:2']));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-A6-003
   * @verifies REQ-M5-WAVE1-TDD-001
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-DIVERGENT-A6-003 excludes ancestry from another plan', async () => {
    const inheritedHead = '1'.repeat(40);
    const consumedStart = '2'.repeat(40);
    const consumedHead = '3'.repeat(40);
    const otherPlan = {
      ...attempt(1, 'completed', '0'.repeat(40), inheritedHead),
      planId: `parallel-plan:${'b'.repeat(64)}`,
    };
    const keys = await authoritativeParallelTddAttemptKeys(
      [
        otherPlan,
        attempt(2, 'completed', consumedStart, consumedHead),
      ],
      {
        planId: `parallel-plan:${'a'.repeat(64)}`,
        assignmentId: 'issue-35-tdd-repair',
        attempt: 2,
        startCommit: consumedStart,
        head: consumedHead,
      },
      async () => true,
    );
    expect(keys).toEqual(new Set(['issue-35-tdd-repair:2']));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-LINEAGE-LATEST-FAILURE-001
   * @verifies REQ-M5-WAVE1-TDD-002
   */
  it('TEST-M5-WAVE1-TDD-LINEAGE-LATEST-FAILURE-001 preserves the latest authoritative failure', () => {
    const earlierComplete = parallelCycle({
      cycleId: 'inherited-complete',
      testId: 'TEST-INHERITED-COMPLETE',
      attempt: 1,
      redOrder: 10,
      greenOrder: 12,
    });
    const latestFailure = parallelCycle({
      cycleId: 'inherited-latest-failure',
      testId: 'TEST-INHERITED-LATEST-FAILURE',
      attempt: 1,
      redOrder: 14,
    });
    const consumedComplete = parallelCycle({
      cycleId: 'consumed-complete',
      testId: 'TEST-CONSUMED-COMPLETE',
      attempt: 2,
      redOrder: 11,
      greenOrder: 13,
    });
    expect(supersededParallelTddCycles(
      [earlierComplete, latestFailure, consumedComplete],
      new Set(['inherited-complete', 'inherited-latest-failure', 'consumed-complete']),
    )).toEqual(new Set(['inherited-complete']));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-PROVENANCE-ATTEMPT-001
   * @verifies REQ-M5-COMPAT-013
   */
  it('TEST-M5-WAVE1-TDD-PROVENANCE-ATTEMPT-001 supersedes an unconsumed old assignment attempt', () => {
    const oldAttempt = parallelCycle({
      cycleId: 'old-attempt',
      testId: 'TEST-OLD-ATTEMPT',
      attempt: 1,
      redOrder: 1,
    });
    const consumedAttempt = parallelCycle({
      cycleId: 'consumed-attempt',
      testId: 'TEST-CONSUMED-ATTEMPT',
      attempt: 2,
      redOrder: 3,
      greenOrder: 5,
    });
    expect(supersededParallelTddCycles(
      [oldAttempt, consumedAttempt],
      new Set(['consumed-attempt']),
    )).toEqual(new Set(['old-attempt']));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-PROVENANCE-SUPERSESSION-001
   * @verifies REQ-M5-WAVE1-TDD-001
   */
  it('TEST-M5-WAVE1-TDD-PROVENANCE-SUPERSESSION-001 supersedes a same-attempt temporary test ID', () => {
    const temporary = parallelCycle({
      cycleId: 'temporary-cycle',
      testId: 'TEST-TEMPORARY-ID',
      attempt: 2,
      redOrder: 6,
    });
    const authoritative = parallelCycle({
      cycleId: 'authoritative-cycle',
      testId: 'TEST-AUTHORITATIVE-ID',
      attempt: 2,
      redOrder: 7,
      greenOrder: 9,
    });
    expect(supersededParallelTddCycles(
      [temporary, authoritative],
      new Set(['authoritative-cycle']),
    )).toEqual(new Set(['temporary-cycle']));
  });

  /**
   * @id TEST-M5-WAVE1-TDD-PROVENANCE-LATEST-FAILURE-001
   * @verifies REQ-M5-WAVE1-TDD-002
   */
  it('TEST-M5-WAVE1-TDD-PROVENANCE-LATEST-FAILURE-001 keeps the latest incomplete cycle visible', () => {
    const authoritative = parallelCycle({
      cycleId: 'earlier-complete',
      testId: 'TEST-EARLIER-COMPLETE',
      attempt: 2,
      redOrder: 10,
      greenOrder: 12,
    });
    const latestFailure = parallelCycle({
      cycleId: 'latest-failure',
      testId: 'TEST-LATEST-FAILURE',
      attempt: 2,
      redOrder: 13,
    });
    expect(supersededParallelTddCycles(
      [authoritative, latestFailure],
      new Set(['earlier-complete']),
    )).toEqual(new Set());
  });

  /**
   * @id TEST-M5-WAVE1-TDD-REPAIR-SAFETY-A4-001
   * @verifies REQ-M5-WAVE1-TDD-002
   */
  it('TEST-M5-WAVE1-TDD-REPAIR-SAFETY-A4-001 blocks writers and rejects broken repair linkage', () => {
    const payload: TddRepairJournalPayload = {
      schemaVersion: 'tdd-repair-v1',
      operationId: `tdd-repair:${'a'.repeat(64)}`,
      requestSha256: 'a'.repeat(64),
      request: {
        schemaVersion: 1,
        testId: 'TEST-M5-WAVE1-TDD-REPAIR-SAFETY-A4-001',
        targetCycleId: 'cycle-target',
        disposition: 'retirement',
        replacementCycleId: null,
        approver: 'reviewer',
        reason: 'stale assignment',
      },
      record: {
        operationId: `tdd-repair:${'a'.repeat(64)}`,
        requestSha256: 'a'.repeat(64),
        targetCycleId: 'cycle-target',
        testId: 'TEST-M5-WAVE1-TDD-REPAIR-SAFETY-A4-001',
        requirementId: 'REQ-M5-WAVE1-TDD-002',
        changeId: 'CHANGE-0015',
        generation: 3,
        parallel: {
          planId: `parallel-plan:${'b'.repeat(64)}`,
          assignmentId: 'issue-35-tdd-repair',
          attempt: 3,
          worktree: '/workspace',
          startCommit: 'cfc155601833d643c0e386a75075064e9814c491',
        },
        retired: true,
        fallbackCycleId: 'cycle-fallback',
        approver: 'reviewer',
        reason: 'stale assignment',
        order: 1,
        recordedAt: '2026-09-26T00:00:00.000Z',
      },
    };
    expect(pendingTddRepair([
      {
        schemaVersion: 1,
        stream: 'normal',
        changeId: 'CHANGE-0015',
        kind: 'tdd-repair-v1',
        idempotencyKey: payload.operationId,
        payload,
        order: 1,
        previousSha256: null,
        recordSha256: 'c'.repeat(64),
      },
    ], { schemaVersion: 1, cycles: [] })).toEqual({
      operationId: payload.operationId,
      testId: payload.record.testId,
      targetCycleId: payload.record.targetCycleId,
    });

    const invalid: TddEvidence = {
      schemaVersion: 1,
      cycles: [],
      repairs: [{ ...payload.record, requestSha256: 'd'.repeat(64) }],
    };
    expect(validateTddRepairLedger(invalid).valid).toBe(false);
  });

  it('uses control evidence only for the exact provisional integration commit', () => {
    const commit = 'a'.repeat(40);
    const controlRoot = resolve('/repo');
    const integrationWorktree = resolve('/repo/integration');
    const linkedWorktree = resolve('/repo/linked-worktree');
    const input = {
      status: 'provisional' as const,
      integrationWorktree,
      integrationCommit: commit,
    };
    expect(selectParallelIntegrationEvidenceRoot({
      ...input,
      controlRoot,
      evaluationRoot: integrationWorktree,
      currentCommit: commit,
    })).toBe(controlRoot);
    expect(selectParallelIntegrationEvidenceRoot({
      ...input,
      controlRoot,
      evaluationRoot: linkedWorktree,
      currentCommit: commit,
    })).toBe(linkedWorktree);
    expect(selectParallelIntegrationEvidenceRoot({
      ...input,
      controlRoot,
      evaluationRoot: integrationWorktree,
      currentCommit: 'b'.repeat(40),
    })).toBe(integrationWorktree);
  });

  it('accepts provisional evidence only at its exact integration commit', () => {
    const commit = 'a'.repeat(40);
    expect(classifyParallelTddIntegrationContext({
      consumed: true,
      status: 'provisional',
      purpose: 'readiness',
      evaluationRoot: '/repo/integration',
      integrationWorktree: '/repo/integration',
      currentCommit: commit,
      integrationCommit: commit,
    })).toBe('pass');
    expect(classifyParallelTddIntegrationContext({
      consumed: true,
      status: 'provisional',
      purpose: 'readiness',
      evaluationRoot: '/repo',
      integrationWorktree: '/repo/integration',
      currentCommit: commit,
      integrationCommit: commit,
    })).toBe('PARALLEL_TDD_UNCONSUMED');
    expect(classifyParallelTddIntegrationContext({
      consumed: true,
      status: 'provisional',
      purpose: 'readiness',
      evaluationRoot: '/repo/integration',
      integrationWorktree: '/repo/integration',
      currentCommit: 'b'.repeat(40),
      integrationCommit: commit,
    })).toBe('PARALLEL_TDD_UNCONSUMED');
  });

  it('resolves readiness evidence only for the managed exact-commit integration worktree', async () => {
    const fixture = resolve('.test-work', `change-readiness-integration-${process.pid}`);
    const controlRoot = join(fixture, 'control');
    const integrationWorktree = join(fixture, 'integration');
    const arbitraryWorktree = join(fixture, 'arbitrary');
    rmSync(fixture, { recursive: true, force: true });
    mkdirSync(controlRoot, { recursive: true });
    try {
      git(controlRoot, 'init', '--quiet');
      write(controlRoot, '.musubix/features/sample/requirements.md', [
        '## REQ-INTEGRATION-001: Integration evidence',
        'Priority: must',
        'Type: functional',
        'Statement: The system shall use managed integration evidence.',
        'Acceptance: The readiness check reports exact integration provenance.',
        '',
      ].join('\n'));
      write(controlRoot, '.musubix/features/sample/design.md', [
        '## DES-INTEGRATION-001: Integration design',
        'Requirements: REQ-INTEGRATION-001',
        'Responsibility: Resolve authoritative integration evidence.',
        'Interfaces: validateChangeCompleteness(root)',
        'Constraints: Exact provisional integration commit only.',
        '',
      ].join('\n'));
      write(controlRoot, '.musubix/decisions/ADR-0001.md', [
        '# ADR-0001: Integration evidence',
        'Status: accepted',
        'Decides: DES-INTEGRATION-001',
        '',
      ].join('\n'));
      write(controlRoot, '.musubix/changes/CHANGE-0001.md', [
        '# CHANGE-0001',
        'Requirements: REQ-INTEGRATION-001',
        '',
      ].join('\n'));
      write(controlRoot, 'src/integration.ts', [
        '/** @id CODE-INTEGRATION-001',
        ' * @implements REQ-INTEGRATION-001',
        ' * @design DES-INTEGRATION-001',
        ' */',
        'export const integrated = true;',
        '',
      ].join('\n'));
      write(controlRoot, 'tests/integration.test.ts', [
        '/** @id TEST-INTEGRATION-001',
        ' * @verifies REQ-INTEGRATION-001',
        ' */',
        'export const integrated = true;',
        '',
      ].join('\n'));
      git(controlRoot, 'add', '.');
      git(controlRoot, 'commit', '--quiet', '-m', 'fixture');
      const integrationCommit = git(controlRoot, 'rev-parse', 'HEAD');
      git(controlRoot, 'worktree', 'add', '--quiet', '--detach', integrationWorktree, integrationCommit);
      git(controlRoot, 'worktree', 'add', '--quiet', '--detach', arbitraryWorktree, integrationCommit);

      const phase = (order: number) => ({
        order,
        recordedAt: `2026-09-26T00:00:0${order}.000Z`,
        fingerprints: {
          requirements: 'a',
          design: 'b',
          implementation: `implementation-${order}`,
          tests: 'd',
          requirementImplementations: {
            'REQ-INTEGRATION-001': {
              paths: ['src/integration.ts'],
              fingerprints: { 'src/integration.ts': `source-${order}` },
            },
          },
        },
      });
      const planId = `parallel-plan:${'a'.repeat(64)}`;
      const cycleId = 'cycle-integration';
      write(controlRoot, '.musubix/evidence/changes.json', {
        schemaVersion: 1,
        changes: [{
          changeId: 'CHANGE-0001',
          generation: 1,
          activeGeneration: 1,
          requirementIds: ['REQ-INTEGRATION-001'],
          phases: {
            requirements: phase(1),
            design: phase(2),
          },
          tddBatches: [{
            scopeId: 'integration',
            requirementIds: ['REQ-INTEGRATION-001'],
            red: phase(3),
            implementation: phase(4),
            green: phase(6),
          }],
        }],
      });
      const cyclePhase = (name: 'red' | 'green', order: number) => ({
        phase: name,
        valid: true,
        scoped: true,
        resultObserved: true,
        testStatus: name === 'red' ? 'failed' : 'passed',
        reportSha256: name.repeat(64).slice(0, 64),
        commandSha256: 'c'.repeat(64),
        outputSha256: name.repeat(64).slice(0, 64),
        exitCode: name === 'red' ? 1 : 0,
        durationMs: 1,
        testFingerprint: 'f'.repeat(64),
        sourceFingerprint: name === 'red' ? '1'.repeat(64) : '2'.repeat(64),
        executionId: `${name}-execution`,
        order,
        recordedAt: `2026-09-26T00:00:0${order}.000Z`,
        diagnostics: [],
      });
      write(controlRoot, '.musubix/evidence/tdd.json', {
        schemaVersion: 1,
        cycles: [{
          cycleId,
          changeId: 'CHANGE-0001',
          generation: 1,
          requirementId: 'REQ-INTEGRATION-001',
          testId: 'TEST-INTEGRATION-001',
          testPath: 'tests/integration.test.ts',
          commandName: 'test',
          parallel: {
            planId,
            assignmentId: 'integration-assignment',
            attempt: 1,
            worktree: '/assignment',
            startCommit: integrationCommit,
          },
          red: cyclePhase('red', 3),
          green: cyclePhase('green', 5),
        }],
        chain: [],
      });
      write(controlRoot, '.musubix/evidence/parallel.json', {
        schemaVersion: 1,
        plans: [{
          planId,
          binding: { changeId: 'CHANGE-0001', generation: 1 },
        }],
        attempts: [{
          planId,
          assignmentId: 'integration-assignment',
          attempt: 1,
          state: 'completed',
          worktree: '/assignment',
          startCommit: integrationCommit,
          head: integrationCommit,
          tdd: [{ requirementId: 'REQ-INTEGRATION-001', cycleId }],
        }],
        integrations: [{
          planId,
          attempt: 1,
          worktree: integrationWorktree,
          provenance: {
            status: 'provisional',
            integrationCommit,
            assignments: [{
              assignmentId: 'integration-assignment',
              attempt: 1,
              startCommit: integrationCommit,
              head: integrationCommit,
            }],
          },
        }],
      });

      const integration = await validateChangeCompleteness(integrationWorktree);
      expect(integration.present).toBe(true);
      expect(integration.diagnostics.some((entry) => entry.code === 'PARALLEL_TDD_UNCONSUMED')).toBe(false);

      const control = await validateChangeCompleteness(controlRoot);
      expect(control.valid).toBe(false);
      expect(control.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PARALLEL_TDD_UNCONSUMED' }),
      ]));

      const arbitrary = await validateChangeCompleteness(arbitraryWorktree);
      expect(arbitrary.present).toBe(false);
      expect(arbitrary.changes).toEqual([]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
