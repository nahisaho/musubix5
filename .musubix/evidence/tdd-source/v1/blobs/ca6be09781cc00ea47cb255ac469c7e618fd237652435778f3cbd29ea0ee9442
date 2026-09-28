import {
  mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalTestFingerprintText,
  loadTddEvidence,
  migrateTddFingerprint,
  validateTddEvidence,
  voidTddCycle,
  type TddChainPhase,
  type TddChainRecord,
  type TddCycle,
  type TddPhaseEvidence,
} from '../packages/analysis/src/tdd.js';

const roots: string[] = [];

function write(root: string, path: string, content: unknown): void {
  const destination = join(root, path);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function phase(name: 'red' | 'green', order: number, testFingerprint = 'f'.repeat(64)): TddPhaseEvidence {
  return {
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
    testFingerprint,
    sourceFingerprint: name === 'red' ? '1'.repeat(64) : '2'.repeat(64),
    executionId: `${name}-execution`,
    order,
    recordedAt: `2026-09-22T00:00:0${order}.000Z`,
    diagnostics: [],
  };
}

function orderRecords(entries: Array<{ cycleId: string; phase: TddChainPhase; testId?: string }>): unknown[] {
  let previousSha256: string | null = null;
  return entries.map((entry, index) => {
    const payload = {
      sequence: index + 1,
      kind: 'tdd' as const,
      entityId: entry.cycleId,
      phase: entry.phase,
      ...(entry.testId === undefined ? {} : { testId: entry.testId }),
      previousSha256,
    };
    const recordSha256 = sha256(JSON.stringify(payload));
    previousSha256 = recordSha256;
    return { ...payload, recordSha256 };
  });
}

function chainRecords(cycles: TddCycle[]): TddChainRecord[] {
  const records: TddChainRecord[] = [];
  for (const cycle of cycles) {
    for (const phaseName of ['red', 'green', 'refactor', 'migrate', 'void'] as const) {
      const phaseEvidence = cycle[phaseName];
      if (!phaseEvidence || !cycle.cycleId) continue;
      const payload = {
        sequence: records.length + 1,
        cycleId: cycle.cycleId,
        ...(cycle.changeId ? { changeId: cycle.changeId, generation: cycle.generation } : {}),
        requirementId: cycle.requirementId,
        testId: cycle.testId,
        testPath: cycle.testPath,
        commandName: cycle.commandName,
        phase: phaseName,
        phaseEvidenceSha256: sha256(JSON.stringify(phaseEvidence)),
        previousSha256: records.at(-1)?.recordSha256 ?? null,
      };
      records.push({ ...payload, recordSha256: sha256(JSON.stringify(payload)) });
    }
  }
  return records;
}

function companionRoot(name: string): string {
  const root = resolve('.test-work', `${name}-${process.pid}-${roots.length}`);
  roots.push(root);
  rmSync(root, { recursive: true, force: true });
  return root;
}

function testBlock(testId: string, requirementId = 'REQ-SCOPE-ACTIVE-001', value = 'true'): string {
  return [
    '/**',
    ` * @id ${testId}`,
    ` * @verifies ${requirementId}`,
    ' */',
    `export const ${testId.toLowerCase().replaceAll('-', '_')} = ${value};`,
  ].join('\n');
}

function testFile(...blocks: string[]): string {
  return `${blocks.join('\n\n')}\n`;
}

function testBlockFingerprint(block: string): string {
  return sha256(canonicalTestFingerprintText(block).trim());
}

function withoutGreen(cycle: TddCycle): Omit<TddCycle, 'green'> {
  const { green, ...rest } = cycle;
  void green;
  return rest;
}

function withoutChangeId(cycle: TddCycle): Omit<TddCycle, 'changeId'> {
  const { changeId, ...rest } = cycle;
  void changeId;
  return rest;
}

function withoutCycleId(cycle: TddCycle): Omit<TddCycle, 'cycleId'> {
  const { cycleId, ...rest } = cycle;
  void cycleId;
  return rest;
}

function writeRequirements(root: string, ...requirementIds: string[]): void {
  write(root, '.musubix/features/sample/requirements.md', requirementIds.flatMap((requirementId) => [
    `## ${requirementId}: Companion requirement`,
    'Priority: must',
    'Type: functional',
    'Statement: The system shall validate companion TDD behavior.',
    'Acceptance: Companion TDD behavior is deterministic.',
    '',
  ]).join('\n'));
}

function writeChange(
  root: string,
  requirementIds = ['REQ-SCOPE-ACTIVE-001'],
  activeGeneration: number | null = 2,
): void {
  write(root, '.musubix/evidence/changes.json', {
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0099',
      generation: 2,
      activeGeneration,
      requirementIds,
      ...(activeGeneration === null ? {
        phases: {},
        abandonment: {
          reason: 'maintenance mode',
          approver: 'human',
          abandonedAt: '2026-09-22T00:00:00.000Z',
        },
      } : {}),
    }],
  });
}

function writeTdd(
  root: string,
  cycles: TddCycle[],
  entries: Array<{ cycleId: string; phase: TddChainPhase; testId?: string }>,
  chain = chainRecords(cycles),
): void {
  write(root, '.musubix/evidence/order.json', {
    schemaVersion: 1,
    records: orderRecords(entries),
  });
  write(root, '.musubix/evidence/tdd.json', {
    schemaVersion: 1,
    cycles,
    chain,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('TDD validation generation scope', () => {
  it('requires mandatory coverage only for the active generation requirement subset', async () => {
    const root = resolve('.test-work', `tdd-generation-scope-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SCOPE-ACTIVE-001: Active requirement',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall validate the active requirement.',
      'Acceptance: The active requirement has a Red-Green cycle.',
      '',
      '## REQ-SCOPE-OTHER-001: Other requirement',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall preserve unrelated requirements.',
      'Acceptance: Global validation still requires its Red-Green cycle.',
      '',
    ].join('\n'));
    write(root, 'tests/sample.test.ts', [
      '/**',
      ' * @id TEST-SCOPE-ACTIVE-001',
      ' * @verifies REQ-SCOPE-ACTIVE-001',
      ' */',
      'export const active = true;',
      '/**',
      ' * @id TEST-SCOPE-OTHER-001',
      ' * @verifies REQ-SCOPE-OTHER-001',
      ' */',
      'export const other = true;',
      '',
    ].join('\n'));
    write(root, '.musubix/evidence/changes.json', {
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0099',
        generation: 3,
        activeGeneration: 3,
        requirementIds: ['REQ-SCOPE-ACTIVE-001'],
      }],
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [{
        cycleId: 'cycle-active',
        changeId: 'CHANGE-0099',
        generation: 3,
        requirementId: 'REQ-SCOPE-ACTIVE-001',
        testId: 'TEST-SCOPE-ACTIVE-001',
        testPath: 'tests/sample.test.ts',
        commandName: 'test',
        red: phase('red', 1),
        green: phase('green', 2),
      }],
    });

    const scoped = await validateTddEvidence(root);
    expect(scoped.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_REQUIREMENT_UNCOVERED')).toEqual([]);

    rmSync(join(root, '.musubix/evidence/changes.json'));
    const global = await validateTddEvidence(root);
    expect(global.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TDD_REQUIREMENT_UNCOVERED',
        message: expect.stringContaining('REQ-SCOPE-OTHER-001'),
      }),
    ]));
  });

  /** @id TEST-M5-TDD-EFFECTIVE-LATEST-001
   * @verifies REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-EFFECTIVE-LATEST-001 selects source currency by verified terminal order', async () => {
    const root = resolve('.test-work', `tdd-effective-latest-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SCOPE-ACTIVE-001: Active requirement',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall select current TDD source evidence.',
      'Acceptance: Verified terminal order determines the current fingerprint.',
      '',
    ].join('\n'));
    const testSource = [
      '/**',
      ' * @id TEST-SCOPE-CURRENCY-001',
      ' * @verifies REQ-SCOPE-ACTIVE-001',
      ' */',
      'export const current = true;',
      '',
    ].join('\n');
    write(root, 'tests/sample.test.ts', testSource);
    const currentFingerprint = sha256(canonicalTestFingerprintText(testSource).trim());
    const legacy: TddCycle = {
      cycleId: 'cycle-legacy',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, '0'.repeat(64)),
    };
    const scoped: TddCycle = {
      cycleId: 'cycle-scoped',
      changeId: 'CHANGE-0098',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 3),
      green: phase('green', 4, currentFingerprint),
    };
    write(root, '.musubix/evidence/changes.json', {
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0099',
        generation: 1,
        activeGeneration: 1,
        requirementIds: ['REQ-SCOPE-ACTIVE-001'],
      }],
    });
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: legacy.cycleId!, phase: 'red' },
        { cycleId: legacy.cycleId!, phase: 'green' },
        { cycleId: scoped.cycleId!, phase: 'red' },
        { cycleId: scoped.cycleId!, phase: 'green' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [scoped, legacy],
      chain: chainRecords([legacy, scoped]),
    });

    const result = await validateTddEvidence(root);

    expect(result.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);

    const activeCurrent: TddCycle = {
      cycleId: 'cycle-active-current',
      changeId: 'CHANGE-0099',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, currentFingerprint),
    };
    const invertedForeign: TddCycle = {
      cycleId: 'cycle-inverted-foreign',
      changeId: 'CHANGE-0098',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 4),
      green: phase('green', 3, '0'.repeat(64)),
    };
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: activeCurrent.cycleId!, phase: 'red' },
        { cycleId: activeCurrent.cycleId!, phase: 'green' },
        { cycleId: invertedForeign.cycleId!, phase: 'green' },
        { cycleId: invertedForeign.cycleId!, phase: 'red' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [activeCurrent, invertedForeign],
      chain: chainRecords([activeCurrent, invertedForeign]),
    });

    const inverted = await validateTddEvidence(root);
    expect(inverted.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);
  });

  it('reports genuine source drift for a verified current terminal', async () => {
    const root = resolve('.test-work', `tdd-current-drift-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SCOPE-ACTIVE-001: Active requirement',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall report stale TDD source evidence.',
      'Acceptance: Current-source drift emits TDD_TEST_STALE.',
      '',
    ].join('\n'));
    write(root, 'tests/sample.test.ts', [
      '/**',
      ' * @id TEST-SCOPE-CURRENCY-001',
      ' * @verifies REQ-SCOPE-ACTIVE-001',
      ' */',
      'export const current = false;',
      '',
    ].join('\n'));
    const cycle: TddCycle = {
      cycleId: 'cycle-current',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, '0'.repeat(64)),
    };
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: cycle.cycleId!, phase: 'red' },
        { cycleId: cycle.cycleId!, phase: 'green' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [cycle],
      chain: chainRecords([cycle]),
    });

    const result = await validateTddEvidence(root);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TDD_TEST_STALE',
        path: 'tests/sample.test.ts',
      }),
    ]));
  });

  it('diagnoses blank historical migration approvers without aborting validation', async () => {
    const root = resolve('.test-work', `tdd-migration-approver-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    write(root, '.musubix/features/sample/requirements.md', [
      '## REQ-SCOPE-ACTIVE-001: Active requirement',
      'Priority: must',
      'Type: functional',
      'Statement: The system shall diagnose malformed migration evidence.',
      'Acceptance: Blank approvers are non-pass.',
      '',
    ].join('\n'));
    write(root, 'tests/sample.test.ts', [
      '/**',
      ' * @id TEST-SCOPE-CURRENCY-001',
      ' * @verifies REQ-SCOPE-ACTIVE-001',
      ' */',
      'export const current = true;',
      '',
    ].join('\n'));
    const cycle: TddCycle = {
      cycleId: 'cycle-migration',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2),
      migrate: {
        phase: 'migrate',
        fromFingerprint: 'f'.repeat(64),
        toFingerprint: 'e'.repeat(64),
        approver: '   ',
        order: 3,
        recordedAt: '2026-09-22T00:00:03.000Z',
      },
    };
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: cycle.cycleId!, phase: 'red' },
        { cycleId: cycle.cycleId!, phase: 'green' },
        { cycleId: cycle.cycleId!, phase: 'migrate' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [cycle],
      chain: chainRecords([cycle]),
    });

    const result = await validateTddEvidence(root);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TDD_LEGACY_OR_UNSCOPED_EVIDENCE',
        message: expect.stringContaining('lacks a recorded human approver'),
      }),
    ]));
  });

  it('restricts migration and void maintenance to the active operation scope', async () => {
    const root = resolve('.test-work', `tdd-maintenance-scope-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    write(root, '.musubix/evidence/changes.json', {
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0099',
        generation: 1,
        activeGeneration: 1,
        requirementIds: ['REQ-SCOPE-ACTIVE-001'],
      }],
    });
    const fallback: TddCycle = {
      cycleId: 'cycle-fallback',
      changeId: 'CHANGE-0099',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2),
    };
    const dangling: TddCycle = {
      cycleId: 'cycle-dangling',
      changeId: 'CHANGE-0099',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 3),
    };
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: fallback.cycleId!, phase: 'red' },
        { cycleId: fallback.cycleId!, phase: 'green' },
        { cycleId: dangling.cycleId!, phase: 'red' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [fallback, dangling],
      chain: chainRecords([fallback, dangling]),
    });

    await expect(migrateTddFingerprint(root, 'TEST-FOREIGN-ONLY', 'human'))
      .rejects.toThrow('No TDD cycle found for TEST-FOREIGN-ONLY.');
    await expect(migrateTddFingerprint(root, 'TEST-SCOPE-CURRENCY-001', '   '))
      .rejects.toThrow('An approver is required to migrate TDD fingerprint evidence.');
    await expect(voidTddCycle(root, 'TEST-SCOPE-CURRENCY-001', 'human', 'abandon dangling work'))
      .resolves.toEqual(expect.objectContaining({
        voided: true,
        cycleId: 'cycle-dangling',
      }));
  });

  /** @id TEST-M5-TDD-MAINTENANCE-SCOPE-001
   * @verifies REQ-M5-TDD-003
   */
  it('TEST-M5-TDD-MAINTENANCE-SCOPE-001 never overwrites unverified void evidence', async () => {
    const root = resolve('.test-work', `tdd-unverified-void-${process.pid}`);
    roots.push(root);
    rmSync(root, { recursive: true, force: true });
    const cycle: TddCycle = {
      cycleId: 'cycle-unverified-void',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId: 'TEST-SCOPE-CURRENCY-001',
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2),
      void: {
        phase: 'void',
        approver: 'human',
        reason: 'malformed historical void',
        order: 3,
        recordedAt: '2026-09-22T00:00:03.000Z',
      },
    };
    write(root, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: orderRecords([
        { cycleId: cycle.cycleId!, phase: 'red' },
        { cycleId: cycle.cycleId!, phase: 'green' },
        { cycleId: cycle.cycleId!, phase: 'void' },
      ]),
    });
    write(root, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [cycle],
      chain: chainRecords([{
        ...cycle,
        void: undefined,
      } as unknown as TddCycle]),
    });

    await expect(voidTddCycle(root, cycle.testId, 'human', 'do not overwrite'))
      .resolves.toEqual({
        voided: false,
        testId: cycle.testId,
        reason: `${cycle.testId} has no verifiable dangling TDD cycle in the current operation scope.`,
      });
  });

  it('covers active-generation membership and active versus foreign work suppression', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const requirementId = 'REQ-SCOPE-ACTIVE-001';
    const block = testBlock(testId);
    const current = testBlockFingerprint(block);

    const membershipRoot = companionRoot('tdd-active-membership');
    writeRequirements(membershipRoot, requirementId);
    write(membershipRoot, 'tests/sample.test.ts', testFile(block));
    writeChange(membershipRoot);
    const foreign: TddCycle = {
      cycleId: 'cycle-foreign-generation',
      changeId: 'CHANGE-0099',
      generation: 1,
      requirementId,
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, current),
    };
    const active: TddCycle = {
      ...foreign,
      cycleId: 'cycle-active-generation',
      generation: 2,
      red: phase('red', 3),
      green: phase('green', 4, current),
    };
    writeTdd(membershipRoot, [foreign], [
      { cycleId: foreign.cycleId!, phase: 'red' },
      { cycleId: foreign.cycleId!, phase: 'green' },
    ]);
    expect((await validateTddEvidence(membershipRoot)).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TDD_REQUIREMENT_UNCOVERED' }),
    ]));
    writeTdd(membershipRoot, [foreign, active], [
      { cycleId: foreign.cycleId!, phase: 'red' },
      { cycleId: foreign.cycleId!, phase: 'green' },
      { cycleId: active.cycleId!, phase: 'red' },
      { cycleId: active.cycleId!, phase: 'green' },
    ]);
    expect((await validateTddEvidence(membershipRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_REQUIREMENT_UNCOVERED')).toEqual([]);

    const activeWorkRoot = companionRoot('tdd-active-work');
    writeRequirements(activeWorkRoot, requirementId);
    write(activeWorkRoot, 'tests/sample.test.ts', testFile(block));
    writeChange(activeWorkRoot);
    const staleTerminal: TddCycle = {
      ...active,
      cycleId: 'cycle-stale-terminal',
      red: phase('red', 1),
      green: phase('green', 2, '0'.repeat(64)),
    };
    const openRed: TddCycle = {
      ...withoutGreen(active),
      cycleId: 'cycle-open-red',
      red: phase('red', 3),
    };
    const nonPassingGreen: TddCycle = {
      ...active,
      cycleId: 'cycle-non-passing-green',
      red: phase('red', 4),
      green: {
        ...phase('green', 5),
        valid: false,
        testStatus: 'failed',
      },
    };
    writeTdd(activeWorkRoot, [staleTerminal, openRed], [
      { cycleId: staleTerminal.cycleId!, phase: 'red' },
      { cycleId: staleTerminal.cycleId!, phase: 'green' },
      { cycleId: openRed.cycleId!, phase: 'red' },
    ]);
    expect((await validateTddEvidence(activeWorkRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);
    writeTdd(activeWorkRoot, [staleTerminal, openRed, nonPassingGreen], [
      { cycleId: staleTerminal.cycleId!, phase: 'red' },
      { cycleId: staleTerminal.cycleId!, phase: 'green' },
      { cycleId: openRed.cycleId!, phase: 'red' },
      { cycleId: nonPassingGreen.cycleId!, phase: 'red' },
      { cycleId: nonPassingGreen.cycleId!, phase: 'green' },
    ]);
    expect((await validateTddEvidence(activeWorkRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);

    const foreignWorkRoot = companionRoot('tdd-foreign-work');
    writeRequirements(foreignWorkRoot, requirementId);
    write(foreignWorkRoot, 'tests/sample.test.ts', testFile(block));
    writeChange(foreignWorkRoot);
    const foreignWork: TddCycle = {
      ...openRed,
      cycleId: 'cycle-foreign-work',
      changeId: 'CHANGE-OTHER',
      red: phase('red', 3),
    };
    writeTdd(foreignWorkRoot, [staleTerminal, foreignWork], [
      { cycleId: staleTerminal.cycleId!, phase: 'red' },
      { cycleId: staleTerminal.cycleId!, phase: 'green' },
      { cycleId: foreignWork.cycleId!, phase: 'red' },
    ]);
    expect((await validateTddEvidence(foreignWorkRoot)).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TDD_TEST_STALE' }),
    ]));

    const noActiveRoot = companionRoot('tdd-no-active-work');
    writeRequirements(noActiveRoot, requirementId);
    write(noActiveRoot, 'tests/sample.test.ts', testFile(block));
    const selected: TddCycle = {
      ...staleTerminal,
      cycleId: 'cycle-selected-scope',
      changeId: 'CHANGE-SELECTED',
      generation: 7,
    };
    const otherScopedWork: TddCycle = {
      ...openRed,
      cycleId: 'cycle-other-scoped-work',
      changeId: 'CHANGE-OTHER',
      generation: 8,
    };
    writeTdd(noActiveRoot, [selected, otherScopedWork], [
      { cycleId: selected.cycleId!, phase: 'red' },
      { cycleId: selected.cycleId!, phase: 'green' },
      { cycleId: otherScopedWork.cycleId!, phase: 'red' },
    ]);
    expect((await validateTddEvidence(noActiveRoot)).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TDD_TEST_STALE' }),
    ]));
    const unscopedWork: TddCycle = {
      ...withoutChangeId(otherScopedWork),
      cycleId: 'cycle-unscoped-work',
      generation: 1,
      red: phase('red', 4),
    };
    writeTdd(noActiveRoot, [selected, otherScopedWork, unscopedWork], [
      { cycleId: selected.cycleId!, phase: 'red' },
      { cycleId: selected.cycleId!, phase: 'green' },
      { cycleId: otherScopedWork.cycleId!, phase: 'red' },
      { cycleId: unscopedWork.cycleId!, phase: 'red' },
    ]);
    expect((await validateTddEvidence(noActiveRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);
  });

  it('uses whole-terminal void bounds and Refactor or approved migration precedence', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const block = testBlock(testId);
    const current = testBlockFingerprint(block);

    const voidRoot = companionRoot('tdd-valid-void-bound');
    writeRequirements(voidRoot, 'REQ-SCOPE-ACTIVE-001');
    write(voidRoot, 'tests/sample.test.ts', testFile(block));
    const older: TddCycle = {
      cycleId: 'cycle-older',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, '0'.repeat(64)),
    };
    const excluded: TddCycle = {
      ...older,
      cycleId: 'cycle-excluded-terminal',
      red: phase('red', 3),
      green: phase('green', 4, current),
      refactor: {
        ...phase('green', 5, current),
        phase: 'refactor',
      },
      void: {
        phase: 'void',
        approver: 'human',
        reason: 'exclude the complete terminal',
        order: 6,
        recordedAt: '2026-09-22T00:00:06.000Z',
      },
    };
    writeTdd(voidRoot, [older, excluded], [
      { cycleId: older.cycleId!, phase: 'red' },
      { cycleId: older.cycleId!, phase: 'green' },
      { cycleId: excluded.cycleId!, phase: 'red' },
      { cycleId: excluded.cycleId!, phase: 'green' },
      { cycleId: excluded.cycleId!, phase: 'refactor' },
      { cycleId: excluded.cycleId!, phase: 'void', testId },
    ]);
    expect((await validateTddEvidence(voidRoot)).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TDD_TEST_STALE' }),
    ]));

    const refactorRoot = companionRoot('tdd-refactor-precedence');
    writeRequirements(refactorRoot, 'REQ-SCOPE-ACTIVE-001');
    write(refactorRoot, 'tests/sample.test.ts', testFile(block));
    const refactored: TddCycle = {
      ...older,
      cycleId: 'cycle-refactored',
      green: phase('green', 2, '0'.repeat(64)),
      refactor: {
        ...phase('green', 3, current),
        phase: 'refactor',
      },
    };
    writeTdd(refactorRoot, [refactored], [
      { cycleId: refactored.cycleId!, phase: 'red' },
      { cycleId: refactored.cycleId!, phase: 'green' },
      { cycleId: refactored.cycleId!, phase: 'refactor' },
    ]);
    expect((await validateTddEvidence(refactorRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);

    const migrationRoot = companionRoot('tdd-migration-precedence');
    writeRequirements(migrationRoot, 'REQ-SCOPE-ACTIVE-001');
    write(migrationRoot, 'tests/sample.test.ts', testFile(block));
    const migrated: TddCycle = {
      ...refactored,
      cycleId: 'cycle-migrated',
      migrate: {
        phase: 'migrate',
        fromFingerprint: '0'.repeat(64),
        toFingerprint: current,
        approver: '  human  ',
        order: 4,
        recordedAt: '2026-09-22T00:00:04.000Z',
      },
    };
    migrated.refactor = { ...migrated.refactor!, testFingerprint: '1'.repeat(64) };
    writeTdd(migrationRoot, [migrated], [
      { cycleId: migrated.cycleId!, phase: 'red' },
      { cycleId: migrated.cycleId!, phase: 'green' },
      { cycleId: migrated.cycleId!, phase: 'refactor' },
      { cycleId: migrated.cycleId!, phase: 'migrate' },
    ]);
    expect((await validateTddEvidence(migrationRoot)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);
  });

  it('rejects duplicate chain multiplicity, invalid order logs, and missing trace targets', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const block = testBlock(testId);
    const cycle: TddCycle = {
      cycleId: 'cycle-integrity',
      generation: 1,
      requirementId: 'REQ-SCOPE-ACTIVE-001',
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2, '0'.repeat(64)),
    };

    const duplicateRoot = companionRoot('tdd-duplicate-chain');
    writeRequirements(duplicateRoot, 'REQ-SCOPE-ACTIVE-001');
    write(duplicateRoot, 'tests/sample.test.ts', testFile(block));
    const duplicateChain = chainRecords([cycle]);
    duplicateChain.push({
      ...duplicateChain[1]!,
      sequence: 3,
      previousSha256: duplicateChain[1]!.recordSha256,
    });
    const { recordSha256: ignored, ...duplicatePayload } = duplicateChain[2]!;
    void ignored;
    duplicateChain[2]!.recordSha256 = sha256(JSON.stringify(duplicatePayload));
    writeTdd(duplicateRoot, [cycle], [
      { cycleId: cycle.cycleId!, phase: 'red' },
      { cycleId: cycle.cycleId!, phase: 'green' },
    ], duplicateChain);
    const duplicateDiagnostics = (await validateTddEvidence(duplicateRoot)).diagnostics;
    expect(duplicateDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TDD_CHAIN_PHASE_DUPLICATE' }),
    ]));
    expect(duplicateDiagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);

    const invalidOrderRoot = companionRoot('tdd-invalid-order');
    writeRequirements(invalidOrderRoot, 'REQ-SCOPE-ACTIVE-001');
    write(invalidOrderRoot, 'tests/sample.test.ts', testFile(block));
    writeTdd(invalidOrderRoot, [cycle], [
      { cycleId: cycle.cycleId!, phase: 'red' },
      { cycleId: cycle.cycleId!, phase: 'green' },
    ]);
    const invalidOrder = orderRecords([
      { cycleId: cycle.cycleId!, phase: 'red' },
      { cycleId: cycle.cycleId!, phase: 'green' },
    ]) as Array<Record<string, unknown>>;
    invalidOrder[1]!.recordSha256 = '0'.repeat(64);
    write(invalidOrderRoot, '.musubix/evidence/order.json', {
      schemaVersion: 1,
      records: invalidOrder,
    });
    const invalidOrderDiagnostics = (await validateTddEvidence(invalidOrderRoot)).diagnostics;
    expect(invalidOrderDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EVIDENCE_ORDER_HASH' }),
    ]));
    expect(invalidOrderDiagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);

    const missingTraceRoot = companionRoot('tdd-missing-trace');
    writeRequirements(missingTraceRoot, 'REQ-SCOPE-ACTIVE-001');
    write(missingTraceRoot, 'tests/sample.test.ts', 'export const no_annotation = true;\n');
    writeTdd(missingTraceRoot, [cycle], [
      { cycleId: cycle.cycleId!, phase: 'red' },
      { cycleId: cycle.cycleId!, phase: 'green' },
    ]);
    const missingTraceDiagnostics = (await validateTddEvidence(missingTraceRoot)).diagnostics;
    expect(missingTraceDiagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE')).toEqual([]);
  });

  it('isolates cached fingerprints for two test IDs sharing one source file', async () => {
    const firstId = 'TEST-SCOPE-CACHE-A-001';
    const secondId = 'TEST-SCOPE-CACHE-B-001';
    const firstBlock = testBlock(firstId, 'REQ-SCOPE-CACHE-A-001');
    const secondBlock = testBlock(secondId, 'REQ-SCOPE-CACHE-B-001');
    const root = companionRoot('tdd-per-test-cache');
    writeRequirements(root, 'REQ-SCOPE-CACHE-A-001', 'REQ-SCOPE-CACHE-B-001');
    write(root, 'tests/shared.test.ts', testFile(firstBlock, secondBlock));
    const first: TddCycle = {
      cycleId: 'cycle-cache-a',
      generation: 1,
      requirementId: 'REQ-SCOPE-CACHE-A-001',
      testId: firstId,
      testPath: 'tests/shared.test.ts',
      commandName: 'test',
      red: { ...phase('red', 1), reportSha256: 'a'.repeat(64) },
      green: { ...phase('green', 2, testBlockFingerprint(firstBlock)), reportSha256: 'b'.repeat(64) },
    };
    const second: TddCycle = {
      cycleId: 'cycle-cache-b',
      generation: 1,
      requirementId: 'REQ-SCOPE-CACHE-B-001',
      testId: secondId,
      testPath: 'tests/shared.test.ts',
      commandName: 'test',
      red: { ...phase('red', 3), reportSha256: 'c'.repeat(64) },
      green: { ...phase('green', 4, '0'.repeat(64)), reportSha256: 'd'.repeat(64) },
    };
    writeTdd(root, [first, second], [
      { cycleId: first.cycleId!, phase: 'red' },
      { cycleId: first.cycleId!, phase: 'green' },
      { cycleId: second.cycleId!, phase: 'red' },
      { cycleId: second.cycleId!, phase: 'green' },
    ]);

    const stale = (await validateTddEvidence(root)).diagnostics.filter((diagnostic) =>
      diagnostic.code === 'TDD_TEST_STALE');

    expect(stale).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(secondId),
        path: 'tests/shared.test.ts',
      }),
    ]);
  });

  it('covers migration active scope, open work, void bounds, malformed identity, and precedence', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const block = testBlock(testId);
    const current = testBlockFingerprint(block);
    const requirementId = 'REQ-SCOPE-ACTIVE-001';
    const baseCycle = (cycleId: string, redOrder: number, greenOrder: number): TddCycle => ({
      cycleId,
      changeId: 'CHANGE-0099',
      generation: 2,
      requirementId,
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', redOrder),
      green: phase('green', greenOrder, current),
    });

    const activeRoot = companionRoot('tdd-migrate-active');
    writeRequirements(activeRoot, requirementId);
    write(activeRoot, 'tests/sample.test.ts', testFile(block));
    writeChange(activeRoot);
    const active = baseCycle('cycle-active-migrate', 1, 2);
    const foreign = {
      ...baseCycle('cycle-foreign-migrate', 3, 4),
      changeId: 'CHANGE-OTHER',
      green: phase('green', 4, '0'.repeat(64)),
    };
    writeTdd(activeRoot, [active, foreign], [
      { cycleId: active.cycleId!, phase: 'red' },
      { cycleId: active.cycleId!, phase: 'green' },
      { cycleId: foreign.cycleId!, phase: 'red' },
      { cycleId: foreign.cycleId!, phase: 'green' },
    ]);
    await expect(migrateTddFingerprint(activeRoot, testId, '  human  ')).resolves.toEqual(
      expect.objectContaining({ migrated: true, fromFingerprint: current }),
    );
    expect((await loadTddEvidence(activeRoot))!.cycles[0]!.migrate?.approver).toBe('human');

    const openWorkRoot = companionRoot('tdd-migrate-open-work');
    writeRequirements(openWorkRoot, requirementId);
    write(openWorkRoot, 'tests/sample.test.ts', testFile(block));
    const terminal: TddCycle = {
      ...withoutChangeId(baseCycle('cycle-migrate-terminal', 1, 2)),
      generation: 1,
    };
    const openWork: TddCycle = {
      ...withoutGreen(terminal),
      cycleId: 'cycle-migrate-open',
      red: phase('red', 3),
    };
    writeTdd(openWorkRoot, [terminal, openWork], [
      { cycleId: terminal.cycleId!, phase: 'red' },
      { cycleId: terminal.cycleId!, phase: 'green' },
      { cycleId: openWork.cycleId!, phase: 'red' },
    ]);
    await expect(migrateTddFingerprint(openWorkRoot, testId, 'human'))
      .rejects.toThrow(`${testId} has no valid Green phase to migrate.`);

    const noIdRoot = companionRoot('tdd-migrate-no-cycle-id');
    writeRequirements(noIdRoot, requirementId);
    write(noIdRoot, 'tests/sample.test.ts', testFile(block));
    const noId = withoutCycleId(terminal);
    write(noIdRoot, '.musubix/evidence/order.json', { schemaVersion: 1, records: [] });
    write(noIdRoot, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [noId],
      chain: [],
    });
    await expect(migrateTddFingerprint(noIdRoot, testId, 'human'))
      .rejects.toThrow(`${testId} has no valid Green phase to migrate.`);

    const voidBoundRoot = companionRoot('tdd-migrate-void-bound');
    writeRequirements(voidBoundRoot, requirementId);
    write(voidBoundRoot, 'tests/sample.test.ts', testFile(block));
    const fallback = terminal;
    const voided: TddCycle = {
      ...terminal,
      cycleId: 'cycle-migrate-voided',
      red: phase('red', 3),
      green: {
        ...phase('green', 4),
        valid: false,
        testStatus: 'failed',
      },
      void: {
        phase: 'void',
        approver: 'human',
        reason: 'abandon failed Green',
        order: 5,
        recordedAt: '2026-09-22T00:00:05.000Z',
      },
    };
    writeTdd(voidBoundRoot, [fallback, voided], [
      { cycleId: fallback.cycleId!, phase: 'red' },
      { cycleId: fallback.cycleId!, phase: 'green' },
      { cycleId: voided.cycleId!, phase: 'red' },
      { cycleId: voided.cycleId!, phase: 'green' },
      { cycleId: voided.cycleId!, phase: 'void', testId },
    ]);
    await expect(migrateTddFingerprint(voidBoundRoot, testId, 'human')).resolves.toEqual(
      expect.objectContaining({ migrated: true, fromFingerprint: current }),
    );

    const migratedRoot = companionRoot('tdd-migrate-already');
    writeRequirements(migratedRoot, requirementId);
    write(migratedRoot, 'tests/sample.test.ts', testFile(block));
    const already: TddCycle = {
      ...terminal,
      cycleId: 'cycle-already-migrated',
      migrate: {
        phase: 'migrate',
        fromFingerprint: current,
        toFingerprint: current,
        approver: 'human',
        order: 3,
        recordedAt: '2026-09-22T00:00:03.000Z',
      },
    };
    writeTdd(migratedRoot, [already], [
      { cycleId: already.cycleId!, phase: 'red' },
      { cycleId: already.cycleId!, phase: 'green' },
      { cycleId: already.cycleId!, phase: 'migrate' },
    ]);
    await expect(migrateTddFingerprint(migratedRoot, testId, 'next-human'))
      .rejects.toThrow(`${testId} has already been migrated.`);
  });

  it('targets voids by verified order and enforces terminal, voided, and fallback rules', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const requirementId = 'REQ-SCOPE-ACTIVE-001';
    const fallbackCycle = (cycleId: string, changeId?: string): TddCycle => ({
      cycleId,
      ...(changeId ? { changeId, generation: 2 } : { generation: 1 }),
      requirementId,
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2),
    });

    const orderRoot = companionRoot('tdd-void-order-target');
    const fallback = fallbackCycle('cycle-void-fallback');
    const dangling: TddCycle = {
      ...withoutGreen(fallback),
      cycleId: 'cycle-void-dangling',
      red: phase('red', 3),
    };
    writeTdd(orderRoot, [dangling, fallback], [
      { cycleId: fallback.cycleId!, phase: 'red' },
      { cycleId: fallback.cycleId!, phase: 'green' },
      { cycleId: dangling.cycleId!, phase: 'red' },
    ], chainRecords([fallback, dangling]));
    await expect(voidTddCycle(orderRoot, testId, 'human', 'order wins'))
      .resolves.toEqual(expect.objectContaining({ voided: true, cycleId: dangling.cycleId }));

    const terminalRoot = companionRoot('tdd-void-terminal');
    writeTdd(terminalRoot, [fallback], [
      { cycleId: fallback.cycleId!, phase: 'red' },
      { cycleId: fallback.cycleId!, phase: 'green' },
    ]);
    await expect(voidTddCycle(terminalRoot, testId, 'human', 'not dangling'))
      .rejects.toThrow(`${testId}'s latest cycle has a valid Green phase; only a dangling cycle can be voided.`);

    const refactorTerminalRoot = companionRoot('tdd-void-refactor-terminal');
    const refactorTerminal: TddCycle = {
      ...fallback,
      cycleId: 'cycle-void-refactor-terminal',
      refactor: {
        ...phase('green', 3),
        phase: 'refactor',
      },
    };
    writeTdd(refactorTerminalRoot, [refactorTerminal], [
      { cycleId: refactorTerminal.cycleId!, phase: 'red' },
      { cycleId: refactorTerminal.cycleId!, phase: 'green' },
      { cycleId: refactorTerminal.cycleId!, phase: 'refactor' },
    ]);
    await expect(voidTddCycle(refactorTerminalRoot, testId, 'human', 'Refactor is terminal'))
      .rejects.toThrow(`${testId}'s latest cycle has a valid Green phase; only a dangling cycle can be voided.`);

    const migrationTerminalRoot = companionRoot('tdd-void-migration-terminal');
    const migrationTerminal: TddCycle = {
      ...fallback,
      cycleId: 'cycle-void-migration-terminal',
      migrate: {
        phase: 'migrate',
        fromFingerprint: 'f'.repeat(64),
        toFingerprint: 'e'.repeat(64),
        approver: 'human',
        order: 3,
        recordedAt: '2026-09-22T00:00:03.000Z',
      },
    };
    writeTdd(migrationTerminalRoot, [migrationTerminal], [
      { cycleId: migrationTerminal.cycleId!, phase: 'red' },
      { cycleId: migrationTerminal.cycleId!, phase: 'green' },
      { cycleId: migrationTerminal.cycleId!, phase: 'migrate' },
    ]);
    await expect(voidTddCycle(migrationTerminalRoot, testId, 'human', 'migration is terminal'))
      .rejects.toThrow(`${testId}'s latest cycle has a valid Green phase; only a dangling cycle can be voided.`);

    const alreadyRoot = companionRoot('tdd-void-already');
    const alreadyVoided: TddCycle = {
      ...dangling,
      void: {
        phase: 'void',
        approver: 'human',
        reason: 'already abandoned',
        order: 4,
        recordedAt: '2026-09-22T00:00:04.000Z',
      },
    };
    writeTdd(alreadyRoot, [fallback, alreadyVoided], [
      { cycleId: fallback.cycleId!, phase: 'red' },
      { cycleId: fallback.cycleId!, phase: 'green' },
      { cycleId: alreadyVoided.cycleId!, phase: 'red' },
      { cycleId: alreadyVoided.cycleId!, phase: 'void', testId },
    ]);
    await expect(voidTddCycle(alreadyRoot, testId, 'human', 'again'))
      .rejects.toThrow(`${testId}'s latest cycle is already voided.`);

    const failedGreenRoot = companionRoot('tdd-void-failed-green');
    const failedGreen: TddCycle = {
      ...dangling,
      cycleId: 'cycle-void-failed-green',
      green: {
        ...phase('green', 4),
        valid: false,
        testStatus: 'failed',
      },
    };
    writeTdd(failedGreenRoot, [fallback, failedGreen], [
      { cycleId: fallback.cycleId!, phase: 'red' },
      { cycleId: fallback.cycleId!, phase: 'green' },
      { cycleId: failedGreen.cycleId!, phase: 'red' },
      { cycleId: failedGreen.cycleId!, phase: 'green' },
    ]);
    await expect(voidTddCycle(failedGreenRoot, testId, 'human', 'failed Green is work'))
      .resolves.toEqual(expect.objectContaining({ voided: true, cycleId: failedGreen.cycleId }));

    const scopedRoot = companionRoot('tdd-void-scoped-fallback');
    writeChange(scopedRoot);
    const activeDangling = {
      ...dangling,
      cycleId: 'cycle-active-dangling',
      changeId: 'CHANGE-0099',
      generation: 2,
      red: phase('red', 3),
    };
    const foreignFallback = {
      ...fallbackCycle('cycle-foreign-fallback', 'CHANGE-OTHER'),
      red: phase('red', 1),
      green: phase('green', 2),
    };
    writeTdd(scopedRoot, [foreignFallback, activeDangling], [
      { cycleId: foreignFallback.cycleId!, phase: 'red' },
      { cycleId: foreignFallback.cycleId!, phase: 'green' },
      { cycleId: activeDangling.cycleId!, phase: 'red' },
    ]);
    await expect(voidTddCycle(scopedRoot, testId, 'human', 'no scoped fallback'))
      .resolves.toEqual(expect.objectContaining({
        voided: false,
        reason: expect.stringContaining('no earlier valid, non-voided Red-Green cycle'),
      }));

    const foreignOnlyRoot = companionRoot('tdd-void-foreign-only');
    writeChange(foreignOnlyRoot);
    writeTdd(foreignOnlyRoot, [foreignFallback], [
      { cycleId: foreignFallback.cycleId!, phase: 'red' },
      { cycleId: foreignFallback.cycleId!, phase: 'green' },
    ]);
    await expect(voidTddCycle(foreignOnlyRoot, testId, 'human', 'foreign only'))
      .resolves.toEqual(expect.objectContaining({
        voided: false,
        reason: expect.stringContaining('current operation scope'),
      }));
  });

  it('covers void structural guards and null-generation maintenance scope', async () => {
    const testId = 'TEST-SCOPE-CURRENCY-001';
    const requirementId = 'REQ-SCOPE-ACTIVE-001';
    const fallback: TddCycle = {
      cycleId: 'cycle-guard-fallback',
      generation: 1,
      requirementId,
      testId,
      testPath: 'tests/sample.test.ts',
      commandName: 'test',
      red: phase('red', 1),
      green: phase('green', 2),
    };
    const dangling: TddCycle = {
      ...withoutGreen(fallback),
      cycleId: 'cycle-guard-dangling',
      red: phase('red', 3),
    };

    const noIdRoot = companionRoot('tdd-void-no-id');
    write(noIdRoot, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [withoutCycleId(dangling)],
      chain: [],
    });
    await expect(voidTddCycle(noIdRoot, testId, 'human', 'missing ID'))
      .rejects.toThrow(`${testId} lacks a cycle ID; regenerate its evidence before voiding.`);

    const noChainRoot = companionRoot('tdd-void-no-chain');
    write(noChainRoot, '.musubix/evidence/tdd.json', {
      schemaVersion: 1,
      cycles: [fallback, dangling],
    });
    await expect(voidTddCycle(noChainRoot, testId, 'human', 'missing chain'))
      .rejects.toThrow('Existing TDD evidence lacks an append-only hash chain; regenerate it before recording new phases.');

    const nullGenerationRoot = companionRoot('tdd-void-null-generation');
    writeChange(nullGenerationRoot, [requirementId], null);
    const scopedFallback = {
      ...fallback,
      cycleId: 'cycle-null-fallback',
      changeId: 'CHANGE-HISTORICAL',
      generation: 4,
    };
    const scopedDangling = {
      ...dangling,
      cycleId: 'cycle-null-dangling',
      changeId: 'CHANGE-OTHER',
      generation: 5,
    };
    writeTdd(nullGenerationRoot, [scopedFallback, scopedDangling], [
      { cycleId: scopedFallback.cycleId!, phase: 'red' },
      { cycleId: scopedFallback.cycleId!, phase: 'green' },
      { cycleId: scopedDangling.cycleId!, phase: 'red' },
    ]);
    await expect(voidTddCycle(nullGenerationRoot, testId, 'human', 'maintenance recovery'))
      .resolves.toEqual(expect.objectContaining({
        voided: true,
        cycleId: scopedDangling.cycleId,
      }));
  });

  it('keeps the TDD source-currency compatibility registry and migration guide entries', () => {
    const design = readFileSync(
      resolve('.musubix/features/musubix5-clean-foundation/design.md'),
      'utf8',
    );
    const migrationGuide = readFileSync(resolve('docs/migration-guide.md'), 'utf8');

    expect(design).toContain('| TDD source-currency and maintenance selection |');
    expect(design).toContain(
      'Intentional behavioral correction governed by REQ-M5-TDD-003, REQ-M5-COMPAT-013, and ADR-0023',
    );
    expect(migrationGuide).toContain('### TDD source-currency chronology');
    expect(migrationGuide).toContain(
      'TDD source-currency validation, fingerprint migration, and void fallback use',
    );
  });
});
