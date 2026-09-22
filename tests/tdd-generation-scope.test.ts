import {
  mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { validateTddEvidence, type TddPhaseEvidence } from '../packages/analysis/src/tdd.js';

const roots: string[] = [];

function write(root: string, path: string, content: unknown): void {
  const destination = join(root, path);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function phase(name: 'red' | 'green', order: number): TddPhaseEvidence {
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
    testFingerprint: 'f'.repeat(64),
    sourceFingerprint: name === 'red' ? '1'.repeat(64) : '2'.repeat(64),
    executionId: `${name}-execution`,
    order,
    recordedAt: `2026-09-22T00:00:0${order}.000Z`,
    diagnostics: [],
  };
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
});
