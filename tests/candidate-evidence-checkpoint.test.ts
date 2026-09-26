import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeEvidence } from '../packages/analysis/src/change-evidence.js';

describe('candidate worktree change checkpoints', () => {
  /**
   * @id TEST-M5-CANDIDATE-WORKSPACE-CHECKPOINT-001
   * @verifies REQ-M5-MULTI-CHANGE-003 REQ-M5-MULTI-CHANGE-008 REQ-M5-COMPAT-013
   */
  it('TEST-M5-CANDIDATE-WORKSPACE-CHECKPOINT-001 fingerprints source while persisting control evidence', async () => {
    const tdd = await import('../packages/analysis/src/tdd.js');
    const controlRoot = resolve('repository', 'control');
    const sourceRoot = resolve('repository', 'assignment');
    const redFingerprints = {
      impact: 'impact',
      requirements: 'requirements',
      design: 'design',
      implementation: 'before',
      tests: 'tests-before',
      tdd: 'tdd-red',
      requirementImplementations: {
        'REQ-M5-MULTI-CHANGE-003': {
          paths: ['packages/analysis/src/tdd.ts'],
          fingerprints: { 'packages/analysis/src/tdd.ts': 'before' },
        },
      },
    };
    const sourceFingerprints = {
      ...redFingerprints,
      implementation: 'after',
      tests: 'tests-after',
      tdd: 'tdd-green',
      requirementImplementations: {
        'REQ-M5-MULTI-CHANGE-003': {
          paths: ['packages/analysis/src/tdd.ts'],
          fingerprints: { 'packages/analysis/src/tdd.ts': 'after' },
        },
      },
    };
    const evidence: ChangeEvidence = {
      schemaVersion: 1 as const,
      changes: [{
        changeId: 'CHANGE-0014',
        generation: 1,
        activeGeneration: 1,
        requirementIds: ['REQ-M5-MULTI-CHANGE-003', 'REQ-M5-MULTI-CHANGE-008'],
        phases: {},
        tddBatches: [{
          scopeId: 'batch-1',
          requirementIds: ['REQ-M5-MULTI-CHANGE-003'],
          red: { phase: 'red', recordedAt: '2026-09-26T00:00:00.000Z', order: 1, fingerprints: redFingerprints },
        }],
      }],
    };
    const write = vi.fn(async (_root: string, _path: string, _value: unknown) => undefined);
    const result = await tdd.recordChangePhaseFromWorkspace(
      controlRoot,
      sourceRoot,
      'CHANGE-0014',
      'implementation',
      ['REQ-M5-MULTI-CHANGE-003'],
      {
        verifyRepository: vi.fn(async (control, source) => {
          expect(control).toBe(controlRoot);
          expect(source).toBe(sourceRoot);
        }),
        loadChangeEvidence: vi.fn(async (root) => {
          expect(root).toBe(controlRoot);
          return evidence;
        }),
        currentFingerprints: vi.fn(async (control, source, changeId, requirementIds) => {
          expect({ control, source, changeId, requirementIds }).toEqual({
            control: controlRoot,
            source: sourceRoot,
            changeId: 'CHANGE-0014',
            requirementIds: ['REQ-M5-MULTI-CHANGE-003'],
          });
          return sourceFingerprints;
        }),
        appendEvidenceOrder: vi.fn(async (root) => {
          expect(root).toBe(controlRoot);
          return { sequence: 2 };
        }),
        writeJson: write,
      },
    );
    expect(result.changes[0]!.tddBatches![0]!.implementation?.fingerprints)
      .toEqual(sourceFingerprints);
    expect(write).toHaveBeenCalledWith(
      controlRoot,
      '.musubix/evidence/changes.json',
      evidence,
    );
    expect(write.mock.calls.some(([root]) => root === sourceRoot)).toBe(false);
  });
});
