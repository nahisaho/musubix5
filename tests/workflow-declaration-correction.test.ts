import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { digest } from '../packages/analysis/src/files.js';
import {
  resolvePortableNpmInvocation,
  resolveProcessCommand,
} from '../packages/analysis/src/process.js';
import {
  validateLoadedWorkflow,
  type WorkflowEvent,
  type WorkflowManifest,
} from '../packages/analysis/src/workflow.js';

const temporaryDirectories: string[] = [];

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('workflow declaration correction', () => {
  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-COMPAT-013
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-001 supersedes only the later accidental duplicate', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-correction-'));
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
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0003',
        generation: 5,
        activeGeneration: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phases: {},
      }],
    }));
    const base = {
      skill: 'sdd-quality',
      version: '0.1.8',
      provenance: 'self-reported' as const,
      changeId: 'CHANGE-0003',
      generation: 5,
      requirementIds: ['REQ-M5-EVIDENCE-006'],
      phase: 'complete',
      status: 'completed' as const,
    };
    const events: WorkflowEvent[] = [
      { ...base, recordedAt: '2026-09-23T00:00:02.000Z' },
      { ...base, recordedAt: '2026-09-23T00:00:03.000Z' },
    ];
    const workflow: WorkflowManifest = {
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
    };
    write(root, '.musubix/evidence/workflow.json', JSON.stringify(workflow));
    const before = readFileSync(join(root, '.musubix/evidence/workflow.json'), 'utf8');
    const raw = await validateLoadedWorkflow(root, workflow, { mode: 'compatible' }, null);
    expect(raw.diagnostics.map((diagnostic) => diagnostic.code)).toContain('WORKFLOW_INVOCATION_REUSED');

    const workflowModule = await import('../packages/analysis/src/workflow.js') as typeof import('../packages/analysis/src/workflow.js') & {
      recordWorkflowDeclarationCorrection: (
        root: string,
        request: {
          skill: string;
          phase: string;
          recordedAt: string;
          approver: string;
          reason: string;
          confirm: boolean;
        },
      ) => Promise<unknown>;
    };
    await workflowModule.recordWorkflowDeclarationCorrection(root, {
      skill: 'sdd-quality',
      phase: 'complete',
      recordedAt: '2026-09-23T00:00:03.000Z',
      approver: 'reviewer',
      reason: 'Accidental duplicate declaration for the same completed invocation.',
      confirm: true,
    });

    const corrected = await validateLoadedWorkflow(root, workflow, { mode: 'compatible' }, null);
    expect(corrected.verified).toBe(true);
    expect(corrected.diagnostics).toEqual([
      expect.objectContaining({
        code: 'WORKFLOW_DECLARATION_SUPERSEDED',
        severity: 'warning',
        index: 1,
      }),
    ]);
    expect(readFileSync(join(root, '.musubix/evidence/workflow.json'), 'utf8')).toBe(before);
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-COMPAT-013
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-CLI-001 records a correction with JSON exit 0', () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-correction-cli-'));
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
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0003',
        generation: 5,
        activeGeneration: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phases: {},
      }],
    }));
    const events: WorkflowEvent[] = [
      {
        skill: 'sdd-quality',
        version: '0.1.8',
        provenance: 'self-reported',
        changeId: 'CHANGE-0003',
        generation: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phase: 'complete',
        status: 'completed',
        recordedAt: '2026-09-23T00:00:02.000Z',
      },
      {
        skill: 'sdd-quality',
        version: '0.1.8',
        provenance: 'self-reported',
        changeId: 'CHANGE-0003',
        generation: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phase: 'complete',
        status: 'completed',
        recordedAt: '2026-09-23T00:00:03.000Z',
      },
    ];
    write(root, '.musubix/evidence/workflow.json', JSON.stringify({
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
    }));
    const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
    expect(resolveProcessCommand('NPM', 'win32')).toBe('npm.cmd');
    const npm = resolvePortableNpmInvocation(['run', 'build'], 'Windows');
    expect(npm.command).toBe(process.execPath);
    execFileSync(npm.command, npm.args, {
      cwd: repositoryRoot,
      stdio: 'pipe',
    });
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'workflow',
      'declaration',
      'supersede',
      'WORKFLOW_INVOCATION_REUSED',
      '--skill',
      'sdd-quality',
      '--phase',
      'complete',
      '--recorded-at',
      '2026-09-23T00:00:03.000Z',
      '--approver',
      'reviewer',
      '--reason',
      'Accidental duplicate declaration.',
      '--confirm',
      '--root',
      root,
      '--json',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      recorded: true,
      canonicalIndex: 0,
      targetIndex: 1,
    }));
    expect(result.stderr).toBe('');

    const malformedSkill = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'dist/packages/cli/src/main.js'),
      'workflow',
      'declaration',
      'supersede',
      'WORKFLOW_INVOCATION_REUSED',
      '--skill',
      'INVALID',
      '--phase',
      'complete',
      '--recorded-at',
      '2026-09-23T00:00:03.000Z',
      '--approver',
      'reviewer',
      '--reason',
      'Accidental duplicate declaration.',
      '--confirm',
      '--root',
      root,
      '--json',
    ], { encoding: 'utf8' });
    expect(malformedSkill.status).toBe(2);
    expect(JSON.parse(malformedSkill.stdout)).toEqual({
      error: expect.objectContaining({ code: 'CLI_ERROR' }),
    });
  });

  /**
   * @id TEST-M5-WORKFLOW-DECLARATION-CORRECTION-SCHEMA-001
   * @verifies REQ-M5-EVIDENCE-006 REQ-M5-COMPAT-013
   */
  it('TEST-M5-WORKFLOW-DECLARATION-CORRECTION-SCHEMA-001 permits stale waivers and persists the exact correction schema', async () => {
    const root = mkdtempSync(join(tmpdir(), 'musubix5-workflow-correction-schema-'));
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
    write(root, '.musubix/evidence/changes.json', JSON.stringify({
      schemaVersion: 1,
      changes: [{
        changeId: 'CHANGE-0003',
        generation: 5,
        activeGeneration: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phases: {},
      }],
    }));
    const events: WorkflowEvent[] = [
      {
        skill: 'sdd-quality',
        version: '0.1.8',
        provenance: 'self-reported',
        changeId: 'CHANGE-0003',
        generation: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phase: 'complete',
        status: 'completed',
        recordedAt: '2026-09-23T00:00:02.000Z',
      },
      {
        skill: 'sdd-quality',
        version: '0.1.8',
        provenance: 'self-reported',
        changeId: 'CHANGE-0003',
        generation: 5,
        requirementIds: ['REQ-M5-EVIDENCE-006'],
        phase: 'complete',
        status: 'completed',
        recordedAt: '2026-09-23T00:00:03.000Z',
      },
    ];
    const workflow: WorkflowManifest = {
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
    };
    write(root, '.musubix/evidence/workflow.json', JSON.stringify(workflow));
    write(root, '.musubix/evidence/workflow-waivers.json', JSON.stringify({
      schemaVersion: 1,
      waivers: [{
        skill: 'sdd-quality',
        phase: 'complete',
        declarationRecordedAt: '2026-09-23T00:00:03.000Z',
        code: 'WORKFLOW_INVOCATION_REUSED',
        approver: 'reviewer',
        reason: 'Historical waiver.',
        waiverRecordedAt: '2026-09-23T00:00:05.000Z',
        sequence: 1,
        snapshotVersion: 1,
        snapshotHash: '0'.repeat(64),
        previousSha256: '0'.repeat(64),
        payloadSha256: '1'.repeat(64),
      }],
    }));
    const workflowModule = await import('../packages/analysis/src/workflow.js') as typeof import('../packages/analysis/src/workflow.js') & {
      recordWorkflowDeclarationCorrection: (
        root: string,
        request: {
          skill: string;
          phase: string;
          recordedAt: string;
          approver: string;
          reason: string;
          confirm: boolean;
        },
      ) => Promise<Record<string, unknown>>;
    };
    const request = {
      skill: 'sdd-quality',
      phase: 'complete',
      recordedAt: '2026-09-23T00:00:03.000Z',
      approver: 'reviewer',
      reason: 'Accidental duplicate declaration.',
      confirm: true,
    };
    const recorded = await workflowModule.recordWorkflowDeclarationCorrection(root, request);
    const replay = await workflowModule.recordWorkflowDeclarationCorrection(root, request);
    const projection = JSON.parse(readFileSync(
      join(root, '.musubix/evidence/workflow-declaration-corrections.json'),
      'utf8',
    )) as { schemaVersion: number; corrections: Array<Record<string, unknown>> };

    expect(recorded).toEqual(expect.objectContaining({
      schemaVersion: 1,
      idempotentReplay: false,
      correctionEvidenceHead: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(replay).toEqual(expect.objectContaining({
      idempotentReplay: true,
      correctionId: recorded.correctionId,
      order: recorded.order,
    }));
    expect(projection.schemaVersion).toBe(1);
    expect(projection.corrections).toHaveLength(1);
    expect(projection.corrections[0]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      correctionId: recorded.correctionId,
      previousSha256: '0'.repeat(64),
    }));
    expect(projection.corrections[0]).not.toHaveProperty('payloadSha256');
    expect(projection.corrections[0]).not.toHaveProperty('fencingToken');
  });
});
