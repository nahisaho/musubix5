import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeEvidence, ChangeFingerprints } from '../packages/analysis/src/change-evidence.js';

describe('candidate worktree Red checkpoints', () => {
  /**
   * @id TEST-M5-CANDIDATE-WORKSPACE-RED-CHECKPOINT-001
   * @verifies REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
   */
  it('TEST-M5-CANDIDATE-WORKSPACE-RED-CHECKPOINT-001 records source-root Red fingerprints only in control state', async () => {
    const { recordChangePhaseFromWorkspace } = await import('../packages/analysis/src/tdd.js');
    const controlRoot = resolve('repository', 'control');
    const sourceRoot = resolve('repository', 'assignment');
    const designFingerprints: ChangeFingerprints = {
      impact: 'impact',
      requirements: 'requirements',
      design: 'design',
      implementation: 'implementation',
      tests: 'tests-before',
      tdd: 'tdd-before',
    };
    const redFingerprints: ChangeFingerprints = {
      ...designFingerprints,
      tests: 'tests-after',
      tdd: 'tdd-red',
    };
    const evidence: ChangeEvidence = {
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0014',
        generation: 1,
        activeGeneration: 1,
        requirementIds: ['REQ-M5-MULTI-CHANGE-003', 'REQ-M5-MULTI-CHANGE-008'],
        phases: {
          design: {
            phase: 'design',
            recordedAt: '2026-09-26T00:00:00.000Z',
            order: 1,
            fingerprints: designFingerprints,
          },
        },
        tddBatches: [],
      }],
    };
    const write = vi.fn(async (_root: string, _path: string, _value: unknown) => undefined);
    const result = await recordChangePhaseFromWorkspace(
      controlRoot,
      sourceRoot,
      'CHANGE-0014',
      'red',
      ['REQ-M5-MULTI-CHANGE-008'],
      {
        verifyRepository: vi.fn(async () => undefined),
        loadChangeEvidence: vi.fn(async () => evidence),
        currentFingerprints: vi.fn(async (control, source) => {
          expect(control).toBe(controlRoot);
          expect(source).toBe(sourceRoot);
          return redFingerprints;
        }),
        appendEvidenceOrder: vi.fn(async (root, input) => {
          expect(root).toBe(controlRoot);
          expect(input.phase).toMatch(/^g1:red:/);
          return { sequence: 2 };
        }),
        writeJson: write,
      },
    );
    expect(result.changes[0]!.tddBatches).toHaveLength(1);
    expect(result.changes[0]!.tddBatches![0]!.red?.fingerprints).toEqual(redFingerprints);
    expect(result.changes[0]!.tddBatches![0]!.implementation).toBeUndefined();
    expect(write).toHaveBeenCalledWith(
      controlRoot,
      '.musubix/evidence/changes.json',
      evidence,
    );
    expect(write.mock.calls.some(([root]) => root === sourceRoot)).toBe(false);
  });
});
