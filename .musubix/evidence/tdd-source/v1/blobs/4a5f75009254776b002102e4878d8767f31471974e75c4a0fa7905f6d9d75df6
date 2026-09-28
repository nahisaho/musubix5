import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultConfig } from '../packages/analysis/src/config.js';
import { canonicalBytes, sha256 } from '../packages/analysis/src/canonical.js';
import { digest } from '../packages/analysis/src/files.js';
import {
  recordWorkflowDeclarationCorrection,
  recordWorkflowWaiver,
  validateLoadedWorkflow,
  type WorkflowEvent,
  type WorkflowManifest,
} from '../packages/analysis/src/workflow.js';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, value: unknown): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, typeof value === 'string' ? value : JSON.stringify(value));
}

function event(
  recordedAt: string,
  owner: { changeId: string; generation: number } = { changeId: 'CHANGE-0003', generation: 5 },
): WorkflowEvent {
  return {
    skill: 'sdd-quality',
    version: '0.1.8',
    provenance: 'self-reported',
    ...owner,
    requirementIds: ['REQ-M5-EVIDENCE-006'],
    phase: 'complete',
    status: 'completed',
    recordedAt,
  };
}

function fixture(events: WorkflowEvent[]): string {
  const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-correction-regression-'));
  temporaryDirectories.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  write(root, '.musubix/changes/CHANGE-0003.md', [
    '---',
    'schemaVersion: 1',
    'id: CHANGE-0003',
    'status: active',
    '---',
    '# CHANGE-0003',
    '',
    'Requirements: REQ-M5-EVIDENCE-006',
    '',
  ].join('\n'));
  write(root, '.musubix/evidence/changes.json', {
    schemaVersion: 1,
    changes: [{
      changeId: 'CHANGE-0003',
      generation: 5,
      activeGeneration: 5,
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phases: {},
    }],
  });
  write(root, '.musubix/config.json', defaultConfig);
  write(root, '.musubix/evidence/workflow.json', {
    schemaVersion: 1,
    events,
    verification: {
      mode: 'compatible',
      sourceSha256: 'a'.repeat(64),
      eventsSha256: digest(JSON.stringify(events)),
      verifiedAt: '2026-09-23T00:00:04.000Z',
      invocations: [{
        skill: 'sdd-quality',
        toolCallId: 'call-quality',
        invokedAt: '2026-09-23T00:00:00.000Z',
        completedAt: '2026-09-23T00:00:01.000Z',
        status: 'completed',
      }],
    },
  });
  return root;
}

const request = {
  skill: 'sdd-quality',
  phase: 'complete',
  recordedAt: '2026-09-23T00:00:03.000Z',
  approver: 'reviewer',
  reason: 'Accidental duplicate declaration.',
  confirm: true,
} as const;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('workflow declaration correction regressions', () => {
  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-WAIVER-001
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-WAIVER-001 rejects a current non-stale waiver', async () => {
    const root = fixture([
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:03.000Z'),
    ]);
    await recordWorkflowWaiver(
      root,
      'WORKFLOW_INVOCATION_REUSED',
      'sdd-quality',
      'complete',
      '2026-09-23T00:00:03.000Z',
      undefined,
      'reviewer',
      'Reviewed current waiver.',
    );

    await expect(recordWorkflowDeclarationCorrection(root, request))
      .rejects.toThrow(/WORKFLOW_DECLARATION_CORRECTION_INVALID/);
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-SCOPE-001
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-SCOPE-001 ignores foreign declarations when binding the canonical invocation', async () => {
    const root = fixture([
      event('2026-09-23T00:00:01.500Z', { changeId: 'CHANGE-0002', generation: 1 }),
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:03.000Z'),
    ]);

    await expect(recordWorkflowDeclarationCorrection(root, request))
      .resolves.toEqual(expect.objectContaining({
        canonicalIndex: 1,
        targetIndex: 2,
        idempotentReplay: false,
      }));
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-POLICY-001
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-POLICY-001 rejects verification that fails the current strict policy', async () => {
    const root = fixture([
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:03.000Z'),
    ]);
    write(root, '.musubix/config.json', {
      ...defaultConfig,
      workflow: { ...defaultConfig.workflow, mode: 'strict' },
    });

    await expect(recordWorkflowDeclarationCorrection(root, request))
      .rejects.toThrow(/WORKFLOW_DECLARATION_CORRECTION_INVALID/);
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-RECOVERY-001
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-RECOVERY-001 restores a missing projection from the authoritative journal', async () => {
    const root = fixture([
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:03.000Z'),
    ]);
    const recorded = await recordWorkflowDeclarationCorrection(root, request);
    unlinkSync(join(root, '.musubix/evidence/workflow-declaration-corrections.json'));

    await expect(recordWorkflowDeclarationCorrection(root, request))
      .resolves.toEqual(expect.objectContaining({
        correctionId: recorded.correctionId,
        order: recorded.order,
        idempotentReplay: true,
      }));
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-WAIVER-002
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-WAIVER-002 rejects a waiver for a corrected target with the correction diagnostic', async () => {
    const root = fixture([
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:03.000Z'),
    ]);
    await recordWorkflowDeclarationCorrection(root, request);

    await expect(recordWorkflowWaiver(
      root,
      'WORKFLOW_INVOCATION_REUSED',
      'sdd-quality',
      'complete',
      '2026-09-23T00:00:03.000Z',
      undefined,
      'reviewer',
      'Conflicting waiver.',
    )).rejects.toThrow(/WORKFLOW_DECLARATION_CORRECTION_INVALID/);
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-VALIDATION-001
   * @verifies REQ-M5-EVIDENCE-006
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-VALIDATION-001 rejects a forged non-lowest canonical declaration', async () => {
    const events = [
      event('2026-09-23T00:00:02.000Z'),
      event('2026-09-23T00:00:02.500Z'),
      event('2026-09-23T00:00:03.000Z'),
    ];
    const root = fixture(events);
    await recordWorkflowDeclarationCorrection(root, request);
    const projectionPath = join(root, '.musubix/evidence/workflow-declaration-corrections.json');
    const projection = JSON.parse(readFileSync(projectionPath, 'utf8')) as {
      schemaVersion: 1;
      corrections: Array<Record<string, unknown>>;
    };
    const correction = projection.corrections[0]!;
    const target = correction.target as { position: number; declarationSha256: string };
    const canonical = {
      position: 1,
      declarationSha256: sha256(canonicalBytes(events[1])),
    };
    const idempotencyKey = sha256(canonicalBytes({
      changeId: correction.changeId,
      generation: correction.generation,
      target,
      canonical,
      diagnostic: 'WORKFLOW_INVOCATION_REUSED',
    }));
    correction.canonical = canonical;
    correction.idempotencyKey = idempotencyKey;
    writeFileSync(projectionPath, JSON.stringify(projection));

    const journalPath = join(root, '.musubix/journal/normal/000000000001.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Record<string, unknown>;
    const payload = journal.payload as {
      schemaVersion: 1;
      correction: Record<string, unknown>;
      fencingToken: number;
    };
    const { order: _order, ...journalCorrection } = correction;
    payload.correction = journalCorrection;
    journal.idempotencyKey = idempotencyKey;
    const { recordSha256: _recordSha256, ...recordPayload } = journal;
    journal.recordSha256 = sha256(canonicalBytes(recordPayload));
    writeFileSync(journalPath, canonicalBytes(journal));

    const workflow = JSON.parse(readFileSync(
      join(root, '.musubix/evidence/workflow.json'),
      'utf8',
    )) as WorkflowManifest;
    const validated = await validateLoadedWorkflow(root, workflow, defaultConfig.workflow, null);
    expect(validated.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'WORKFLOW_DECLARATION_CORRECTION_INVALID' }),
    ]));
  });
});
